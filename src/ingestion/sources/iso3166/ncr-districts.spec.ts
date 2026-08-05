import {
  NCR_DISTRICTS,
  NCR_LGU_COUNT,
  districtCodeFor,
  isNcrProvinceCell,
} from '@/ingestion/sources/iso3166/ncr-districts';

describe('NCR districts', () => {
  it('accounts for all 17 NCR LGUs — 16 cities plus Pateros', () => {
    expect(NCR_LGU_COUNT).toBe(17);
    expect(districtCodeFor('Pateros')).toBe('PH-00-D4');
  });

  it('files every LGU under exactly one district', () => {
    const all = NCR_DISTRICTS.flatMap((district) => district.cities);

    expect(new Set(all).size).toBe(all.length);
  });

  it('uses non-ISO codes, so a district can never be mistaken for a subdivision', () => {
    for (const district of NCR_DISTRICTS) {
      expect(district.code).toMatch(/^PH-00-D[1-4]$/);
      expect(district.nameTl.length).toBeGreaterThan(0);
    }
    expect(new Set(NCR_DISTRICTS.map((district) => district.code)).size).toBe(4);
  });

  it('matches the province cell the source actually writes today', () => {
    expect(isNcrProvinceCell('Metro Manila')).toBe(true);
    // The legacy only recognised an "NCR" prefix, which the page no longer uses.
    expect(isNcrProvinceCell('NCR, City of Manila')).toBe(true);
    expect(isNcrProvinceCell('Agusan del Norte')).toBe(false);
    expect(isNcrProvinceCell('Camarines Norte')).toBe(false);
  });

  it('maps a city name case-insensitively and reports an unknown one', () => {
    expect(districtCodeFor('quezon city')).toBe('PH-00-D2');
    expect(districtCodeFor('Manila')).toBe('PH-00-D1');
    expect(districtCodeFor('Cebu City')).toBeNull();
  });
});
