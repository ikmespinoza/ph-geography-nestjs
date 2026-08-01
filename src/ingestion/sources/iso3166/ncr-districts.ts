/**
 * The National Capital Region's four legislative districts, modelled as
 * provinces so `region → province → city` stays uniform (OD-7).
 *
 * Why this data is hard-coded — the only hard-coded reference data in ingestion:
 * NCR has no ISO 3166-2 provinces, and the cities page files all 17 NCR LGUs
 * under a single `Metro Manila` cell that names no district. The source genuinely
 * does not express this tier. OD-7 chose synthetic district provinces over the
 * alternatives (nullable `region_id`, or NCR-only routes) precisely to keep the
 * read side free of special cases.
 *
 * Note the legacy scraper looked for a province cell starting with `"NCR"` and
 * skipped those rows; the cell reads `Metro Manila` today, so that check would
 * no longer match and every NCR row would raise "Could not find province".
 *
 * Codes are deliberately non-ISO (`PH-00-D1…D4`) so they can never be mistaken
 * for real ISO subdivisions. `nameTl` repeats the English name where no
 * established Tagalog form exists — the column is non-null by design and is not
 * weakened for this.
 */
export interface NcrDistrict {
  readonly code: string;
  readonly name: string;
  readonly altName: string;
  readonly nameTl: string;
  /** The LGUs filed under this district, exactly as the source names them. */
  readonly cities: readonly string[];
}

export const NCR_REGION_CODE = 'PH-00';

export const NCR_DISTRICTS: readonly NcrDistrict[] = Object.freeze([
  {
    code: 'PH-00-D1',
    name: 'Capital District',
    altName: 'City of Manila',
    nameTl: 'Distrito ng Kabisera',
    cities: ['Manila'],
  },
  {
    code: 'PH-00-D2',
    name: 'Eastern Manila District',
    altName: 'Eastern Manila',
    nameTl: 'Eastern Manila District',
    cities: ['Mandaluyong', 'Marikina', 'Pasig', 'Quezon City', 'San Juan'],
  },
  {
    code: 'PH-00-D3',
    name: 'Northern Manila District',
    altName: 'CAMANAVA',
    nameTl: 'Northern Manila District',
    cities: ['Caloocan', 'Malabon', 'Navotas', 'Valenzuela'],
  },
  {
    code: 'PH-00-D4',
    name: 'Southern Manila District',
    altName: 'Southern Manila',
    nameTl: 'Southern Manila District',
    cities: ['Las Piñas', 'Makati', 'Muntinlupa', 'Parañaque', 'Pasay', 'Pateros', 'Taguig'],
  },
]);

/** Every NCR LGU the districts account for — 16 cities plus Pateros. */
export const NCR_LGU_COUNT = NCR_DISTRICTS.reduce(
  (total, district) => total + district.cities.length,
  0,
);

const DISTRICT_BY_CITY: ReadonlyMap<string, string> = new Map(
  NCR_DISTRICTS.flatMap((district) =>
    district.cities.map((city) => [city.toLowerCase(), district.code] as const),
  ),
);

/** Province-cell values that mean "this LGU is in NCR". */
const NCR_PROVINCE_CELL = /^(metro manila|ncr\b)/i;

export function isNcrProvinceCell(provinceName: string): boolean {
  return NCR_PROVINCE_CELL.test(provinceName);
}

/** The district code for an NCR city, or `null` if the map doesn't know it. */
export function districtCodeFor(cityName: string): string | null {
  return DISTRICT_BY_CITY.get(cityName.toLowerCase()) ?? null;
}
