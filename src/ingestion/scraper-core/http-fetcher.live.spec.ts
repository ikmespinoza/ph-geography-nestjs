import type { ConfigService } from '@nestjs/config';

import { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { parseLastModified } from '@/ingestion/change-detection/last-modified.parser';
import { loadDocument } from '@/ingestion/scraper-core/html-parser';
import { parseCities } from '@/ingestion/sources/iso3166/city.parser';
import { parseProvinces } from '@/ingestion/sources/iso3166/province.parser';
import { parseRegions } from '@/ingestion/sources/iso3166/region.parser';

/**
 * The one test that touches the network — PHG-011's Definition of Done asks for a
 * real fetch, but a suite that depends on Wikipedia being up (and unchanged) would
 * be flaky in CI. So it is **opt-in**: `INGESTION_LIVE_TEST=1 pnpm test`.
 *
 * Its real value is drift detection. The fixture-based specs stay green forever
 * once captured, which means they cannot tell you the live page has moved on. Run
 * this before a release, or when ingestion starts rejecting rows in production.
 */
const REGION_URL = 'https://en.wikipedia.org/wiki/ISO_3166-2:PH';
const CITY_URL =
  'https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines';

const live = process.env.INGESTION_LIVE_TEST === '1';
const describeLive = live ? describe : describe.skip;

describeLive('HttpFetcher against the live sources (opt-in)', () => {
  const configService = {
    getOrThrow: (key: string) =>
      key === 'ingestion'
        ? {
            scheduleCron: '0 3 * * *',
            requestTimeoutMs: 30_000,
            userAgent: 'ph-geography-api/1.0 (+https://github.com/ikmespinoza/ph-geography-nestjs)',
            maxRetries: 2,
            retryBackoffMs: 500,
            enableSchedule: false,
          }
        : { iso3166: { name: 'ISO 3166', regionUrl: REGION_URL, cityUrl: CITY_URL } },
  } as unknown as ConfigService;

  const fetcher = new HttpFetcher(configService);

  it('fetches the regions page and still parses it', async () => {
    const html = await fetcher.fetchHtml(REGION_URL);

    expect(parseRegions(html).rows.length).toBeGreaterThanOrEqual(17);
    expect(parseProvinces(html).rows.length).toBeGreaterThanOrEqual(80);
    expect(parseLastModified(loadDocument(html), REGION_URL)).toBeInstanceOf(Date);
  }, 60_000);

  it('fetches the cities page and still parses it', async () => {
    const html = await fetcher.fetchHtml(CITY_URL);
    const { rows } = parseCities(html);

    expect(rows.length).toBeGreaterThanOrEqual(1600);
    // If this drops to zero the capital marker has moved (OD-8).
    expect(rows.filter((row) => row.isCapital).length).toBeGreaterThan(50);
    // If this misses, the NCR district map needs revisiting.
    expect(rows.filter((row) => row.ncrDistrictCode !== undefined)).toHaveLength(17);
  }, 60_000);
});
