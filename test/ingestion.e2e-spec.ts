import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';

import { AppModule } from '@/app.module';
import { IngestionService } from '@/ingestion/ingestion.service';
import type { RunReport, ResourceKind } from '@/ingestion/scraper-core/geo-source';
import { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { PrismaService } from '@/persistence/prisma.service';

import { seedClassifications } from '../prisma/seed';
import { requireTestDatabaseUrl } from './support/test-database';

// A DB-backed run of the whole pipeline, so it needs a real database — the suite's
// own (PHG-019), not the one you develop against, which is where this spec used to
// write its PH-Z* rows.
process.env.DATABASE_URL = requireTestDatabaseUrl();
// Never arm the cron inside a test process.
process.env.INGESTION_ENABLE_SCHEDULE = 'false';

const CITY_URL =
  process.env.SOURCE_ISO3166_CITY_URL ??
  'https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines';

/**
 * Purpose-built source pages rather than the captured Wikipedia fixtures: the
 * parsers are already proven against the real markup in their own unit specs,
 * and a small, prefixed dataset (`PH-Z*`) is one this suite can create and then
 * delete without touching anyone's real rows. `PH-00` is real, because NCR
 * district creation keys on that exact code.
 */
const footer = (lastEdited: string): string =>
  `<li id="footer-info-lastmod">This page was last edited on ${lastEdited} (UTC).</li>`;

function regionPage(options: { lastEdited: string; caragaName?: string }): string {
  const { lastEdited, caragaName = 'Zaraga' } = options;

  return `<html><body>
    <div class="mw-heading mw-heading3"><h3 id="Regions">Regions</h3></div>
    <table class="wikitable">
      <tr><th>Code</th><th>Subdivision name (en)</th><th>Subdivision name (tl)</th><th>Roman numeral or acronym</th></tr>
      <tr><td>PH-Z1</td><td>${caragaName}</td><td>Rehiyon ng Zaraga</td><td>XIII</td></tr>
      <tr><td>PH-00</td><td>National Capital Region</td><td>Pambansang Punong Rehiyon</td><td>NCR</td></tr>
    </table>
    <div class="mw-heading mw-heading3"><h3 id="Provinces">Provinces</h3></div>
    <table class="wikitable">
      <tr><th>Code</th><th>Subdivision name (en)</th><th>Subdivision name (tl)</th><th>In region</th></tr>
      <tr><td>PH-ZAN</td><td>Zagusan del Norte</td><td>Hilagang Zagusan</td><td>Z1</td></tr>
      <tr><td>PH-ZSA</td><td>Zamar (local variant: Western Zamar)</td><td>Zamar</td><td>Z1</td></tr>
    </table>
    ${footer(lastEdited)}
  </body></html>`;
}

function cityPage(options: { lastEdited: string; zutuanClass?: string }): string {
  const { lastEdited, zutuanClass = 'HUC' } = options;

  return `<html><body>
    <table class="wikitable">
      <tr><th>City or municipality</th><th>Population</th><th>Area</th><th>PD</th><th>Brgy.</th><th>Class</th><th>Province</th></tr>
      <tr><th scope="row">Zutuan†</th><td>1</td><td>1</td><td>1</td><td>1</td><td>${zutuanClass}</td><td>Zagusan del Norte</td></tr>
      <tr><th scope="row" style="border-width:0.3em;">Zabadbaran</th><td>1</td><td>1</td><td>1</td><td>1</td><td>CC</td><td>Zagusan del Norte</td></tr>
      <tr><th scope="row">Zoliney</th><td>1</td><td>1</td><td>1</td><td>1</td><td>Mun</td><td>Zagusan del Norte</td></tr>
      <tr><th scope="row">Zatbalogan</th><td>1</td><td>1</td><td>1</td><td>1</td><td>CC</td><td>Western Zamar</td></tr>
      <tr><th scope="row">Pateros</th><td>1</td><td>1</td><td>1</td><td>1</td><td>Mun</td><td>Metro Manila</td></tr>
    </table>
    ${footer(lastEdited)}
  </body></html>`;
}

/** Stands in for the network; the allow-list and retry logic have their own unit spec. */
class StubFetcher {
  pages = {
    region: regionPage({ lastEdited: '1 March 2026, at 10:00' }),
    city: cityPage({ lastEdited: '1 March 2026, at 10:00' }),
  };

  fetchHtml(url: string): Promise<string> {
    return Promise.resolve(url === CITY_URL ? this.pages.city : this.pages.region);
  }
}

const statuses = (report: RunReport): Record<string, string> =>
  Object.fromEntries(report.resources.map((resource) => [resource.resource, resource.status]));

const forResource = (report: RunReport, resource: ResourceKind) =>
  report.resources.find((candidate) => candidate.resource === resource);

describe('Ingestion pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ingestion: IngestionService;
  const fetcher = new StubFetcher();

  async function cleanUp(): Promise<void> {
    // Region delete cascades to its provinces and their cities.
    await prisma.region.deleteMany({ where: { code: { startsWith: 'PH-Z' } } });
    await prisma.region.deleteMany({ where: { code: 'PH-00' } });
    await prisma.sourceSyncState.deleteMany({ where: { source: 'ISO 3166' } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HttpFetcher)
      .useValue(fetcher)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    prisma = app.get(PrismaService);
    ingestion = app.get(IngestionService);

    await seedClassifications(prisma);
    await cleanUp();
  }, 30_000);

  afterAll(async () => {
    await cleanUp();
    await app.close();
  });

  it('populates an empty database end to end', async () => {
    const report = await ingestion.run();

    expect(report.ok).toBe(true);
    expect(statuses(report)).toEqual({
      region: 'processed',
      province: 'processed',
      city: 'processed',
    });

    expect(await prisma.region.count({ where: { code: { in: ['PH-Z1', 'PH-00'] } } })).toBe(2);
    // 2 scraped provinces + the 4 NCR districts.
    expect(forResource(report, 'province')?.created).toBe(6);
    expect(forResource(report, 'city')?.created).toBe(5);
  });

  it('derives full_name, alt_name and is_capital as the source describes them', async () => {
    const cities = await prisma.city.findMany({
      where: { province: { code: { startsWith: 'PH-Z' } } },
      select: { name: true, fullName: true, isCapital: true, altName: true },
      orderBy: { name: 'asc' },
    });

    expect(cities).toEqual([
      // The dagger is stripped and is NOT read as a capital marker.
      { name: 'Zabadbaran', fullName: 'Zabadbaran City', isCapital: true, altName: null },
      { name: 'Zatbalogan', fullName: 'Zatbalogan City', isCapital: false, altName: null },
      { name: 'Zoliney', fullName: 'Zoliney', isCapital: false, altName: null },
      { name: 'Zutuan', fullName: 'Zutuan City', isCapital: false, altName: null },
    ]);
  });

  it('splits the ISO local-variant name so its cities can resolve', async () => {
    const province = await prisma.province.findUnique({
      where: { code: 'PH-ZSA' },
      select: { name: true, altName: true, cities: { select: { name: true } } },
    });

    expect(province).toMatchObject({ name: 'Zamar', altName: 'Western Zamar' });
    expect(province?.cities).toEqual([{ name: 'Zatbalogan' }]);
  });

  it('creates the four NCR districts and files Pateros under the fourth', async () => {
    const districts = await prisma.province.findMany({
      where: { code: { startsWith: 'PH-00-D' } },
      select: { code: true, cities: { select: { name: true } } },
      orderBy: { code: 'asc' },
    });

    expect(districts.map((district) => district.code)).toEqual([
      'PH-00-D1',
      'PH-00-D2',
      'PH-00-D3',
      'PH-00-D4',
    ]);
    expect(districts.at(-1)?.cities).toEqual([{ name: 'Pateros' }]);
  });

  it('serves the ingested data through the read API', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/regions/PH-Z1/provinces/PH-ZAN/cities')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        name: 'Zabadbaran',
        full_name: 'Zabadbaran City',
        is_capital: true,
      }),
      expect.objectContaining({ name: 'Zoliney', full_name: 'Zoliney', is_capital: false }),
      expect.objectContaining({ name: 'Zutuan', full_name: 'Zutuan City' }),
    ]);
  });

  it('skips every resource on a second run — the source has not moved', async () => {
    const report = await ingestion.run();

    expect(statuses(report)).toEqual({
      region: 'skipped',
      province: 'skipped',
      city: 'skipped',
    });
    expect(report.ok).toBe(true);
  });

  it('re-processes on --force and still writes nothing — the idempotency proof', async () => {
    const before = await snapshot();

    const report = await ingestion.run({ force: true });

    expect(statuses(report)).toEqual({
      region: 'processed',
      province: 'processed',
      city: 'processed',
    });
    for (const resource of report.resources) {
      expect({
        resource: resource.resource,
        created: resource.created,
        updated: resource.updated,
      }).toEqual({ resource: resource.resource, created: 0, updated: 0 });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('propagates a rename and a reclassification once the source advances', async () => {
    fetcher.pages.region = regionPage({
      lastEdited: '2 March 2026, at 10:00',
      caragaName: 'Zaraga Renamed',
    });
    fetcher.pages.city = cityPage({ lastEdited: '2 March 2026, at 10:00', zutuanClass: 'Mun' });

    const report = await ingestion.run();

    expect(forResource(report, 'region')?.updated).toBe(1);
    expect(forResource(report, 'city')?.updated).toBe(1);

    const region = await prisma.region.findUnique({
      where: { code: 'PH-Z1' },
      select: { name: true },
    });
    const city = await prisma.city.findFirst({
      where: { name: 'Zutuan' },
      select: { fullName: true, classification: { select: { code: true } } },
    });

    // The legacy inserted only when a row was absent, so neither change could land.
    expect(region?.name).toBe('Zaraga Renamed');
    expect(city).toMatchObject({ fullName: 'Zutuan', classification: { code: 'Mun' } });
  });

  it('records a high-water mark per resource', async () => {
    const state = await prisma.sourceSyncState.findMany({
      where: { source: 'ISO 3166' },
      select: { resource: true, lastSeenAt: true },
      orderBy: { resource: 'asc' },
    });

    expect(state.map((row) => row.resource)).toEqual(['city', 'province', 'region']);
    for (const row of state) {
      expect(row.lastSeenAt.toISOString()).toBe('2026-03-02T10:00:00.000Z');
    }
  });

  it('reports a failure instead of throwing when the source page drifts', async () => {
    fetcher.pages.city =
      '<html><body><p>the table is gone</p>' + footer('3 March 2026, at 10:00') + '</body></html>';

    const report = await ingestion.run();

    expect(report.ok).toBe(false);
    expect(forResource(report, 'city')).toMatchObject({
      status: 'failed',
      detail: expect.stringContaining('No table matching') as unknown,
    });
    // The marker must not advance past a failed run.
    const marker = await prisma.sourceSyncState.findUnique({
      where: { source_resource: { source: 'ISO 3166', resource: 'city' } },
      select: { lastSeenAt: true },
    });
    expect(marker?.lastSeenAt.toISOString()).toBe('2026-03-02T10:00:00.000Z');
  });

  /** Everything the pipeline owns, in a comparable shape. */
  async function snapshot(): Promise<unknown> {
    const [regions, provinces, cities] = await Promise.all([
      prisma.region.findMany({
        where: { code: { in: ['PH-Z1', 'PH-00'] } },
        select: { code: true, name: true, nameTl: true, acronym: true, updatedAt: true },
        orderBy: { code: 'asc' },
      }),
      prisma.province.findMany({
        select: { code: true, name: true, altName: true, updatedAt: true },
        orderBy: { code: 'asc' },
      }),
      prisma.city.findMany({
        select: { name: true, fullName: true, isCapital: true, updatedAt: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { regions, provinces, cities };
  }
});
