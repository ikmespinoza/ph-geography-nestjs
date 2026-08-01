import { getAltName, sanitizeProvinceName, stripAltName } from '@/common/text/string.util';
import { CLASSIFICATIONS } from '@/config/constants';
import type { ClassificationCode } from '@/config/constants';
import type { CityRow, ParseResult } from '@/ingestion/scraper-core/geo-source';
import {
  findTable,
  firstCell,
  loadDocument,
  mapDataRows,
} from '@/ingestion/scraper-core/html-parser';
import { districtCodeFor, isNcrProvinceCell } from '@/ingestion/sources/iso3166/ncr-districts';
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

/**
 * The cities & municipalities table: `City or municipality | Population | Area |
 * PD | Brgy. | Class | Province`. Column indexes 0, 5 and 6 are the ones the
 * legacy `CityScraper` read, and they still hold.
 *
 * Two things about this table are NOT as the legacy assumed:
 * - **there is no `#List` heading any more**, so the table is found by its
 *   header signature (see `html-parser.ts`);
 * - **the last row is a real municipality**, not a summary row. The legacy
 *   `array_key_last` skip silently dropped it. Rows are selected structurally
 *   instead, so a footer row — if one ever returns — is excluded by having no
 *   `<td>`, and a stray one would be rejected by the classification check.
 */
const LOCATOR = {
  anchorId: undefined,
  requiredHeaders: ['city or municipality', 'class', 'province'],
  context: 'the cities and municipalities table',
} as const;

const ROW_SPEC = {
  minCells: 7,
  context: 'the cities and municipalities table',
  // ~1,600 rows: tolerate a couple of genuinely odd ones, fail on wholesale drift.
  maxRejectionRatio: 0.02,
} as const;

const NAME_COLUMN = 0;
const CLASS_COLUMN = 5;
const PROVINCE_COLUMN = 6;

/**
 * Markers the source appends to a name, per its own legend: a dagger marks the
 * province's largest settlement and a double dagger the country's largest city.
 * Neither is part of the name — and neither means "capital" (see
 * {@link detectCapital}).
 */
const SETTLEMENT_MARKERS = /[†‡*]+\s*$/;

const CITY_CLASSIFICATIONS = new Set(
  CLASSIFICATIONS.filter((classification) => classification.kind === 'city').map(
    (classification) => classification.code,
  ),
);

const KNOWN_CLASSIFICATIONS = new Set<string>(
  CLASSIFICATIONS.map((classification) => classification.code),
);

export function parseCities(html: string): ParseResult<CityRow> {
  const $ = loadDocument(html);
  const table = findTable($, LOCATOR);

  return mapDataRows<CityRow>($, table, ROW_SPEC, ({ cell, row, $: doc, reject }) => {
    const rawName = cell(NAME_COLUMN).replace(SETTLEMENT_MARKERS, '').trim();
    const classificationCode = cell(CLASS_COLUMN);
    const provinceName = sanitizeProvinceName(cell(PROVINCE_COLUMN));

    if (rawName.length === 0) {
      return reject('the name cell is empty');
    }
    if (!KNOWN_CLASSIFICATIONS.has(classificationCode)) {
      return reject(`"${classificationCode}" is not a known classification code`);
    }
    if (provinceName.length === 0) {
      return reject(`${rawName} has an empty province cell`);
    }

    const name = stripAltName(rawName);
    const altName = getAltName(rawName);

    if (!isNcrProvinceCell(provinceName)) {
      return {
        name,
        altName,
        fullName: buildFullName(name, classificationCode),
        isCapital: detectCapital(doc, row),
        classificationCode,
        provinceName,
      };
    }

    // NCR: the province cell names no district, so the LGU is mapped to one of
    // the four seeded district provinces (OD-7).
    const ncrDistrictCode = districtCodeFor(name);
    if (ncrDistrictCode === null) {
      return reject(`${name} is filed under NCR but matches no known NCR district`);
    }

    return {
      name,
      altName,
      fullName: buildFullName(name, classificationCode),
      isCapital: detectCapital(doc, row),
      classificationCode,
      provinceName,
      ncrDistrictCode,
    };
  });
}

/**
 * `full_name` — the legacy `getCityFullName` rule, unchanged: a city-type
 * classification gets `" City"` appended unless the name already carries it;
 * municipalities keep their name.
 */
function buildFullName(name: string, classificationCode: string): string {
  if (!CITY_CLASSIFICATIONS.has(classificationCode as ClassificationCode)) {
    return name;
  }
  if (name.startsWith('City ') || name.endsWith(' City')) {
    return name;
  }
  return `${name} City`;
}

/**
 * `is_capital`, per the table's own legend:
 *
 * > "Cells with thick borders mark official (de jure) provincial capitals;
 * > cities or municipalities marked with a dagger (†) are the province's largest
 * > settlement; a double dagger (‡) marks the country's largest city; and a
 * > yellow cell marks the national capital."
 *
 * So the thick border — the legacy's `border-width` check — is the semantically
 * correct signal, and the dagger is **not** a capital marker (they agree on only
 * 46 of ~83 rows). Inline CSS is still a fragile carrier, so this stays one
 * named predicate with its own tests, and {@link countCapitals} lets the caller
 * sanity-check the total against the province count.
 */
export function detectCapital($: CheerioAPI, row: Element): boolean {
  const style = firstCell($, row).attr('style') ?? '';
  return style.includes('border-width');
}

/** How many rows the capital rule matched — used as a drift warning signal. */
export function countCapitals(rows: readonly CityRow[]): number {
  return rows.filter((row) => row.isCapital).length;
}
