import type { ConfigService } from '@nestjs/config';

import { Iso3166Source } from '@/ingestion/sources/iso3166/iso3166.source';

const REGION_URL = 'https://example.test/iso-3166-2-ph';
const CITY_URL = 'https://example.test/list-of-cities';

describe('Iso3166Source', () => {
  const configService = {
    getOrThrow: jest.fn(() => ({
      iso3166: { name: 'ISO 3166', regionUrl: REGION_URL, cityUrl: CITY_URL },
    })),
  } as unknown as ConfigService;
  const source = new Iso3166Source(configService);

  it('resolves its name and both URLs from the sources config', () => {
    expect(source).toMatchObject({ name: 'ISO 3166', regionUrl: REGION_URL, cityUrl: CITY_URL });
  });

  it('maps regions and provinces to the shared page, cities to the other one', () => {
    // Regions and provinces live on the same page — which is why the orchestrator
    // fetches it once and reuses the HTML.
    expect(source.urlFor('region')).toBe(REGION_URL);
    expect(source.urlFor('province')).toBe(REGION_URL);
    expect(source.urlFor('city')).toBe(CITY_URL);
  });

  it('exposes a parser per resource', () => {
    const page = '<html><body><p>no tables here</p></body></html>';

    // Each one is wired and fails loudly on markup it does not recognise, rather
    // than quietly returning an empty result set.
    expect(() => source.parseRegions(page)).toThrow(/No table matching/);
    expect(() => source.parseProvinces(page)).toThrow(/No table matching/);
    expect(() => source.parseCities(page)).toThrow(/No table matching/);
  });
});
