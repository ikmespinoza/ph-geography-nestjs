import { findTable, loadDocument, mapDataRows } from '@/ingestion/scraper-core/html-parser';
import type { ParseResult, RegionRow } from '@/ingestion/scraper-core/geo-source';

/**
 * The ISO 3166-2:PH regions table: `Code | Subdivision name (en) | Subdivision
 * name (tl) | Roman numeral or acronym`. Column order matches the legacy
 * `RegionScraper` (`childNodes(0..3)`); everything else about locating and
 * validating the table is new (see `html-parser.ts`).
 */
const LOCATOR = {
  anchorId: 'Regions',
  requiredHeaders: ['code', 'subdivision name (en)', 'roman numeral'],
  context: 'the ISO 3166 regions table',
} as const;

const ROW_SPEC = {
  minCells: 4,
  context: 'the ISO 3166 regions table',
  // 17 rows: a single unreadable row is already a layout problem.
  maxRejectionRatio: 0,
} as const;

/** Codes look like `PH-13` / `PH-00`. */
const REGION_CODE = /^PH-[A-Z0-9]{2,}$/;

export function parseRegions(html: string): ParseResult<RegionRow> {
  const $ = loadDocument(html);
  const table = findTable($, LOCATOR);

  return mapDataRows<RegionRow>($, table, ROW_SPEC, ({ cell, reject }) => {
    const code = cell(0);
    const name = cell(1);
    const nameTl = cell(2);
    const acronym = cell(3);

    if (!REGION_CODE.test(code)) {
      return reject(`"${code}" is not an ISO region code`);
    }
    if (name.length === 0 || nameTl.length === 0 || acronym.length === 0) {
      return reject(`region ${code} has an empty name, name_tl or acronym`);
    }

    return { code, name, nameTl, acronym };
  });
}
