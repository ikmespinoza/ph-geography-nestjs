import { getAltName, stripAltName } from '@/common/text/string.util';
import { findTable, loadDocument, mapDataRows } from '@/ingestion/scraper-core/html-parser';
import type { ParseResult, ProvinceRow } from '@/ingestion/scraper-core/geo-source';

/**
 * The ISO 3166-2:PH provinces table: `Code | Subdivision name (en) | Subdivision
 * name (tl) | In region`. The region column holds the bare suffix (`13`), which
 * the legacy `ProvinceScraper` prefixed with `PH-`; footnote markers such as
 * `09[a]` are already stripped by the shared `sanitize()`.
 */
const LOCATOR = {
  anchorId: 'Provinces',
  requiredHeaders: ['code', 'subdivision name (en)', 'in region'],
  context: 'the ISO 3166 provinces table',
} as const;

const ROW_SPEC = {
  minCells: 4,
  context: 'the ISO 3166 provinces table',
  maxRejectionRatio: 0,
} as const;

const PROVINCE_CODE = /^PH-[A-Z]{2,}$/;
const REGION_SUFFIX = /^[A-Z0-9]{2,}$/;

/**
 * `Samar (local variant: Western Samar)` — the ISO page's way of publishing an
 * alternate name. The shared `getAltName()` deliberately only accepts a purely
 * alphanumeric parenthetical, so the colon here makes it return `null` and the
 * whole string would become the province's `name`. That name then matches
 * nothing on the cities page, orphaning all 26 Samar LGUs.
 *
 * This is an ISO-page idiom, so it is reconciled here rather than by loosening
 * the parity-tested `string.util.ts` regex.
 */
const LOCAL_VARIANT = /^(.+?)\s*\(local variant:\s*(.+?)\)$/;

export function parseProvinces(html: string): ParseResult<ProvinceRow> {
  const $ = loadDocument(html);
  const table = findTable($, LOCATOR);

  return mapDataRows<ProvinceRow>($, table, ROW_SPEC, ({ cell, reject }) => {
    const code = cell(0);
    const rawName = cell(1);
    const nameTl = cell(2);
    const regionSuffix = cell(3);

    if (!PROVINCE_CODE.test(code)) {
      return reject(`"${code}" is not an ISO province code`);
    }
    if (!REGION_SUFFIX.test(regionSuffix)) {
      return reject(`province ${code} has an unreadable region column "${regionSuffix}"`);
    }

    const { name, altName } = splitName(rawName);
    if (name.length === 0) {
      return reject(`province ${code} has an empty name`);
    }

    return {
      code,
      name,
      altName,
      // The source leaves a Tagalog name blank for at least one province
      // (PH-COM, Davao de Oro). `name_tl` is non-null by contract, and an empty
      // string on the wire is the same wart PHG-010 removed from `alt_name`, so
      // the English name stands in. Rejecting the row instead would drop a real
      // province — and with it every city filed under it.
      nameTl: nameTl.length === 0 ? name : nameTl,
      regionCode: `PH-${regionSuffix}`,
    };
  });
}

/** Split a subdivision name into its name and alternate name. */
function splitName(rawName: string): { name: string; altName: string | null } {
  const localVariant = LOCAL_VARIANT.exec(rawName);
  const base = localVariant?.[1];
  const variant = localVariant?.[2];

  if (base !== undefined && variant !== undefined) {
    return { name: base.trim(), altName: variant.trim() };
  }

  return { name: stripAltName(rawName), altName: getAltName(rawName) };
}
