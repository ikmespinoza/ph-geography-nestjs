import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';

import { IngestionService } from '@/ingestion/ingestion.service';
import type { RunReport } from '@/ingestion/scraper-core/geo-source';
import { PrismaService } from '@/persistence/prisma.service';

import { seedClassifications } from '../../prisma/seed';

/**
 * The e2e suite's dataset (PHG-019, decision D1).
 *
 * Rather than maintain a hand-written seed fixture, the dataset is produced by
 * running the **real ingestion pipeline** over the **committed HTML fixtures** with
 * only `HttpFetcher` replaced. That is "fixture-loaded, not live-scraped": no
 * network, deterministic, and pinned by the fixtures' recorded capture dates.
 *
 * Why this rather than a JSON/SQL seed:
 *   - **One dataset, not two.** A separate seed file is a second copy of the data
 *     that silently stops matching the parsers the moment a fixture is refreshed.
 *     Here the seed *is* the parser output, so the two cannot disagree.
 *   - **It is the real tree** — 17 regions, 82 + 4 NCR district provinces, 1,642
 *     cities — so the payloads the parity matrix scores are the payloads a consumer
 *     actually gets, and every edge case exists naturally: PH-WSA's `Samar (local
 *     variant: Western Samar)` split, PH-COM's blank `name_tl`, the NCR districts,
 *     and the ~83 thick-border capitals.
 */

const FIXTURES = join(__dirname, '../fixtures');

const CITY_URL =
  process.env.SOURCE_ISO3166_CITY_URL ??
  'https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines';

/**
 * Stands in for the network. The allow-list, timeout and retry logic have their own
 * unit spec; what matters here is only which page comes back for which URL.
 */
export class FixtureFetcher {
  private readonly pages = {
    region: readFileSync(join(FIXTURES, 'iso3166-regions.html'), 'utf8'),
    city: readFileSync(join(FIXTURES, 'iso3166-cities.html'), 'utf8'),
  };

  fetchHtml(url: string): Promise<string> {
    return Promise.resolve(url === CITY_URL ? this.pages.city : this.pages.region);
  }
}

/** Wipe the geography tree. The region cascade takes provinces and cities with it. */
export async function truncateGeography(prisma: PrismaService): Promise<void> {
  await prisma.region.deleteMany({});
  await prisma.sourceSyncState.deleteMany({});
}

/**
 * Populate an empty database from the fixtures. `force` bypasses change detection,
 * so a second call re-processes rather than skipping — which is what makes the
 * helper safe to call after a truncate.
 */
export async function seedFromFixtures(app: INestApplication): Promise<RunReport> {
  const prisma = app.get(PrismaService);

  await seedClassifications(prisma);
  await truncateGeography(prisma);

  const report = await app.get(IngestionService).run({ force: true });
  if (!report.ok) {
    const failures = report.resources
      .filter((resource) => resource.status === 'failed')
      .map((resource) => `${resource.resource}: ${resource.detail ?? 'unknown failure'}`)
      .join('; ');

    throw new Error(
      `Seeding from fixtures failed (${failures || report.detail || 'no detail'}). ` +
        'The fixtures and the parsers have diverged — read the diff before touching either.',
    );
  }

  return report;
}
