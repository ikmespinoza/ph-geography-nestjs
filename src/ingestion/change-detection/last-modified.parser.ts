import { CHANGE_DETECTION_TOKENS } from '@/config/constants';
import { normalizeText } from '@/ingestion/scraper-core/html-parser';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';
import type { CheerioAPI } from 'cheerio';

/** The footer element MediaWiki renders the "last edited" line into. */
const FOOTER_SELECTOR = '#footer-info-lastmod';

/** `29 July 2025, at 13:25` — the shape left once the tokens are stripped. */
const LAST_EDITED = /^(\d{1,2}) ([A-Za-z]+) (\d{4}), at (\d{1,2}):(\d{2})$/;

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
});

/**
 * Read a source page's own "last edited" timestamp — the input to change
 * detection (OD-9). Ported from `HistoryTrait::isModified`, which stripped the
 * same two tokens (`config/constants.ts` `CHANGE_DETECTION_TOKENS`) plus the
 * non-breaking space before `(UTC)`.
 *
 * The footer states UTC explicitly, so the result is built with `Date.UTC` — the
 * legacy `Carbon::createFromFormat` parsed it in the app's local timezone, which
 * shifted the marker by the host's offset.
 *
 * Throws `ScrapeError('layout')` when the footer is missing or unparseable: a
 * silent "process anyway" would hide exactly the drift OD-8 asks us to surface.
 * `--force` bypasses change detection entirely, so a broken footer never blocks
 * a manual re-ingest.
 */
export function parseLastModified($: CheerioAPI, context: string): Date {
  const footer = $(FOOTER_SELECTOR);
  if (footer.length === 0) {
    throw new ScrapeError(
      'layout',
      `${context}: no ${FOOTER_SELECTOR} element — cannot read the page's last-edited date`,
    );
  }

  const text = normalizeText(footer.text())
    .replace(CHANGE_DETECTION_TOKENS.modifiedAtPrefix, '')
    .replace(CHANGE_DETECTION_TOKENS.utcSuffix, '')
    // The suffix token carries the trailing period; a page rendering "(UTC)"
    // without it would otherwise leave one behind.
    .replace(/\(UTC\)\.?$/, '')
    .trim();

  const match = LAST_EDITED.exec(text);
  if (match === null) {
    throw new ScrapeError(
      'layout',
      `${context}: could not read a last-edited date from "${text}" (expected e.g. "29 July 2025, at 13:25")`,
    );
  }

  const [, day = '', monthName = '', year = '', hour = '', minute = ''] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined) {
    throw new ScrapeError(
      'layout',
      `${context}: unknown month "${monthName}" in the last-edited date`,
    );
  }

  return new Date(Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute), 0, 0));
}
