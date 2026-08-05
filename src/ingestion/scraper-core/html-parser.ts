import * as cheerio from 'cheerio';
import type { Cheerio, CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

import { sanitize } from '@/common/text/string.util';
import type { ParseResult, RowRejection } from '@/ingestion/scraper-core/geo-source';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';

/**
 * Pure `cheerio` helpers shared by the source parsers (OD-8). Three rules make
 * the difference against the legacy `php-simple-html-dom-parser` code:
 *
 * 1. **Tables are found by what they contain, not only by where they sit.** The
 *    legacy walked `next_sibling()` from a heading's parent; today Wikipedia
 *    wraps headings in `<div class="mw-heading">`, and the cities page has lost
 *    its `#List` anchor entirely. A header signature identifies a table even
 *    when the anchor moves or disappears.
 * 2. **Data rows are selected structurally** (a row with at least one `<td>`),
 *    not by "skip the first and last index". The cities table's last row is a
 *    real municipality — the legacy rule silently dropped it.
 * 3. **A row that doesn't match its declared shape is rejected and counted**,
 *    never read positionally into `undefined`; too many rejections abort the
 *    parse loudly rather than committing a partial dataset.
 */

/** How to find one table on a page. */
export interface TableLocator {
  /** Heading anchor to try first (`#Regions`). Optional — some pages have none. */
  readonly anchorId?: string;
  /**
   * Lower-cased fragments that must all appear in the table's header cells.
   * This is the real identity check, and it doubles as drift detection.
   */
  readonly requiredHeaders: readonly string[];
  /** Human label used in error messages. */
  readonly context: string;
}

/** How strictly to police the rows of one table. */
export interface RowSpec {
  /** Cells a row must have before the mapper may read it positionally. */
  readonly minCells: number;
  readonly context: string;
  /**
   * Share of data rows that may be rejected before the parse is treated as
   * layout drift. Small tables use 0 — one bad row out of 17 is a red flag.
   */
  readonly maxRejectionRatio: number;
}

/** Parse HTML into a queryable document. */
export function loadDocument(html: string): CheerioAPI {
  return cheerio.load(html);
}

/**
 * Cell/heading text, normalised: non-breaking spaces become plain spaces, runs
 * of whitespace collapse, then `sanitize()` strips footnote markers (`[a]`) and
 * decodes entities. NBSP handling lives here rather than in `string.util.ts` —
 * that module deliberately left U+00A0 alone and pointed at PHG-011.
 */
export function normalizeText(value: string): string {
  return sanitize(value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' '));
}

/**
 * Locate a table by heading anchor, falling back to a scan of every table on the
 * page, and verify its header signature either way.
 */
export function findTable($: CheerioAPI, locator: TableLocator): Cheerio<Element> {
  const candidates: Cheerio<Element>[] = [];

  if (locator.anchorId !== undefined) {
    const heading = $(`#${locator.anchorId}`);
    if (heading.length > 0) {
      // The anchor sits on the <h2>/<h3>; Wikipedia wraps that in .mw-heading.
      const container = heading.closest('.mw-heading');
      const from = container.length > 0 ? container : heading;
      const table = from.nextAll('table').first();
      if (table.length > 0) {
        candidates.push(table);
      }
    }
  }

  const scanned = $('table').toArray();
  candidates.push(...scanned.map((table) => $(table)));

  for (const candidate of candidates) {
    if (matchesHeaders($, candidate, locator.requiredHeaders)) {
      return candidate;
    }
  }

  throw new ScrapeError(
    'layout',
    `No table matching ${locator.context} was found (expected header cells containing: ${locator.requiredHeaders.join(', ')})`,
  );
}

/** Data rows: those carrying at least one `<td>`, so header rows drop out. */
export function dataRows($: CheerioAPI, table: Cheerio<Element>): Element[] {
  return table
    .find('tr')
    .toArray()
    .filter((row) => $(row).children('td').length > 0);
}

/** Normalised text of every cell in a row, `<th>` row headers included. */
export function cellTexts($: CheerioAPI, row: Element): string[] {
  return $(row)
    .children('th, td')
    .toArray()
    .map((cell) => normalizeText($(cell).text()));
}

/**
 * Map a table's data rows, rejecting anything that doesn't fit the declared
 * shape and failing loudly when too much of the table is unreadable.
 *
 * The mapper returns `null` to reject a row it understood the shape of but not
 * the content of (an unknown code, say) — the reason is taken from `reject()`.
 */
export function mapDataRows<TRow>(
  $: CheerioAPI,
  table: Cheerio<Element>,
  spec: RowSpec,
  mapper: (context: RowContext) => TRow | null,
): ParseResult<TRow> {
  const rows = dataRows($, table);
  const mapped: TRow[] = [];
  const rejections: RowRejection[] = [];

  rows.forEach((row, index) => {
    const cells = cellTexts($, row);

    if (cells.length < spec.minCells) {
      rejections.push({
        index,
        reason: `expected at least ${spec.minCells} cells, found ${cells.length}`,
        excerpt: excerpt(cells.join(' | ')),
      });
      return;
    }

    let rejection: string | null = null;
    const result = mapper({
      cells,
      cell: (position: number) => cells[position] ?? '',
      row,
      $,
      reject: (reason: string) => {
        rejection = reason;
        return null;
      },
    });

    if (result === null) {
      rejections.push({
        index,
        reason: rejection ?? 'rejected by the row mapper',
        excerpt: excerpt(cells.join(' | ')),
      });
      return;
    }

    mapped.push(result);
  });

  assertWithinRejectionBudget(rows.length, rejections, spec);

  return { rows: mapped, rejections };
}

/** What a row mapper is handed. */
export interface RowContext {
  /** Normalised text of every cell, in document order. */
  readonly cells: string[];
  /**
   * Text of one cell by position, `''` past the end. `minCells` has already been
   * checked, so a mapper reading a declared column always gets a real value —
   * this just spares every parser an index-safety dance.
   */
  readonly cell: (position: number) => string;
  /** The raw row, for attribute-level signals such as the capital marker. */
  readonly row: Element;
  readonly $: CheerioAPI;
  /** Reject this row with a reason; always returns `null` for a tidy `return`. */
  readonly reject: (reason: string) => null;
}

/** A row's first cell element (`<th scope="row">` on the cities table). */
export function firstCell($: CheerioAPI, row: Element): Cheerio<AnyNode> {
  return $(row).children('th, td').first();
}

function matchesHeaders(
  $: CheerioAPI,
  table: Cheerio<Element>,
  requiredHeaders: readonly string[],
): boolean {
  const headerText = table
    .find('tr')
    .toArray()
    .filter((row) => $(row).children('td').length === 0)
    .map((row) => cellTexts($, row).join(' | '))
    .join(' | ')
    .toLowerCase();

  return requiredHeaders.every((header) => headerText.includes(header.toLowerCase()));
}

function assertWithinRejectionBudget(
  total: number,
  rejections: readonly RowRejection[],
  spec: RowSpec,
): void {
  if (total === 0) {
    throw new ScrapeError('layout', `${spec.context}: the table has no data rows`);
  }

  const allowed = Math.floor(total * spec.maxRejectionRatio);
  if (rejections.length <= allowed) {
    return;
  }

  const sample = rejections
    .slice(0, 3)
    .map((rejection) => `row ${rejection.index}: ${rejection.reason} — "${rejection.excerpt}"`)
    .join('; ');

  throw new ScrapeError(
    'layout',
    `${spec.context}: rejected ${rejections.length} of ${total} rows, above the ${allowed} allowed. ` +
      `The source layout has probably changed. First rejections — ${sample}`,
  );
}

function excerpt(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}
