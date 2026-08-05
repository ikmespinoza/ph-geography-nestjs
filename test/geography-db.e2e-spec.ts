import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import { AppModule } from '@/app.module';
import { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { PrismaService } from '@/persistence/prisma.service';

import { FixtureFetcher, seedFromFixtures, truncateGeography } from './support/seed-from-fixtures';
import { requireTestDatabaseUrl } from './support/test-database';

process.env.DATABASE_URL = requireTestDatabaseUrl();

/**
 * PHG-019 — the read API against **real Postgres**.
 *
 * The other endpoint suites boot `AppModule` over a stubbed `PrismaService`. That
 * pins the wire contract cheaply, but it means the `where` / `orderBy` / `include`
 * arguments the services build have only ever been asserted as *objects handed to a
 * jest mock* — nothing has checked that Postgres agrees with them. This suite closes
 * that gap: nothing is stubbed but `HttpFetcher`, so every request runs
 * controller → service → PrismaService → Postgres.
 *
 * The dataset is the committed HTML fixtures replayed through the real ingestion
 * pipeline (`support/seed-from-fixtures.ts`), so the assertions below are written
 * against the **actual** Philippine dataset — real first and last rows, not a
 * hand-picked pair, which is what makes the ordering cases a regression net.
 *
 * Row counts are asserted exactly. When a fixture is refreshed they are expected to
 * move, and the diff is the point: read it before editing a number.
 */

/** As ingested from the fixtures — the same figures M3 measured against live Wikipedia. */
const DATASET = {
  regions: 17,
  provinces: 86, // 82 ISO provinces + 4 NCR districts (OD-7)
  cities: 1642,
  capitals: 83,
} as const;

const CARAGA_PROVINCE_CODES = ['PH-AGN', 'PH-AGS', 'PH-DIN', 'PH-SUN', 'PH-SUR'];

interface NamedResource {
  readonly name: string;
}

const names = (resources: NamedResource[]): string[] => resources.map((resource) => resource.name);

describe('Geography read API against Postgres (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HttpFetcher)
      .useValue(new FixtureFetcher())
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror the production bootstrap so the versioned routes resolve in-test.
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    prisma = app.get(PrismaService);
    await seedFromFixtures(app);
  }, 180_000);

  afterAll(async () => {
    // Safe to wipe outright: this is the suite's own database, which is the whole
    // reason TEST_DATABASE_URL exists.
    await truncateGeography(prisma);
    await app.close();
  });

  describe('the seeded dataset', () => {
    it('is the full tree the fixtures describe', async () => {
      await expect(prisma.region.count()).resolves.toBe(DATASET.regions);
      await expect(prisma.province.count()).resolves.toBe(DATASET.provinces);
      await expect(prisma.city.count()).resolves.toBe(DATASET.cities);
      await expect(prisma.city.count({ where: { isCapital: true } })).resolves.toBe(
        DATASET.capitals,
      );
    });
  });

  describe('GET /api/v1/regions', () => {
    it('returns every region, ordered by name by Postgres rather than by a mock', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      const body = response.body as NamedResource[];

      expect(body).toHaveLength(DATASET.regions);
      // The real first and last rows: a mock returning a pre-sorted array proves
      // nothing about `orderBy`, but the database's own collation does.
      expect(body[0]?.name).toBe('Autonomous Region in Muslim Mindanao');
      expect(body.at(-1)?.name).toBe('Zamboanga Peninsula');
      expect(names(body)).toEqual([...names(body)].sort((a, b) => a.localeCompare(b)));
    });

    it('keeps ids, FKs and timestamps off the wire even when the rows are real', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      for (const region of response.body as object[]) {
        expect(Object.keys(region).sort()).toEqual(['acronym', 'code', 'name', 'name_tl']);
      }
    });
  });

  describe('GET /api/v1/regions/:region', () => {
    it('nests the region provinces, ordered by name', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions/PH-13').expect(200);
      const body = response.body as { name: string; provinces: { code: string; name: string }[] };

      expect(body.name).toBe('Caraga');
      expect(body.provinces.map((province) => province.code)).toEqual(CARAGA_PROVINCE_CODES);
      expect(names(body.provinces)).toEqual([...names(body.provinces)].sort());
    });

    it('answers an unknown code with 404 problem+json — the legacy answered 200', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions/PH-99').expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toMatchObject({ status: 404, detail: "Region 'PH-99' was not found." });
    });

    it('matches the code exactly — a lowercased code is a miss, not a redirect', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/ph-13').expect(404);
    });
  });

  describe('GET /api/v1/regions/:region/provinces', () => {
    it('returns the provinces of that region only, ordered by name', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces')
        .expect(200);
      const body = response.body as { code: string; region: { code: string } }[];

      expect(body.map((province) => province.code)).toEqual(CARAGA_PROVINCE_CODES);
      for (const province of body) {
        expect(province.region.code).toBe('PH-13');
      }
    });

    it('carries the ISO local-variant split as name + alt_name (PH-WSA)', async () => {
      // `Samar (local variant: Western Samar)` — stored whole by the legacy, which is
      // why its 26 Samar cities could never resolve. Region VIII, Eastern Visayas.
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-08/provinces')
        .expect(200);
      const samar = (
        response.body as { code: string; name: string; alt_name: string | null }[]
      ).find((province) => province.code === 'PH-WSA');

      expect(samar).toMatchObject({ name: 'Samar', alt_name: 'Western Samar' });
    });

    it('404s on an unknown region where the legacy answered 200 with []', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/PH-99/provinces').expect(404);
    });
  });

  describe('GET /api/v1/regions/:region/provinces/:province', () => {
    it('returns the province with its region and its name-ordered cities', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR')
        .expect(200);
      const body = response.body as {
        name: string;
        region: { code: string };
        cities: { name: string; classification: { code: string } }[];
      };

      expect(body.name).toBe('Surigao del Sur');
      expect(body.region.code).toBe('PH-13');
      expect(body.cities).toHaveLength(19);
      expect(names(body.cities)[0]).toBe('Barobo');
      expect(names(body.cities).at(-1)).toBe('Tandag');
      expect(names(body.cities)).toEqual([...names(body.cities)].sort());
    });

    it('nests each city classification — OD-14, which the legacy never loaded', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR')
        .expect(200);

      for (const city of (response.body as { cities: object[] }).cities) {
        expect(city).toHaveProperty('classification.code');
      }
    });

    it('is anchored on the region — a real province under the wrong region is a 404', async () => {
      // PH-AGN exists and PH-05 exists, but not together. A query that filtered on
      // the province alone would answer 200 here.
      await request(app.getHttpServer()).get('/api/v1/regions/PH-05/provinces/PH-AGN').expect(404);
    });
  });

  describe('GET /api/v1/regions/:region/provinces/:province/cities', () => {
    it('returns the province cities ordered by name, each with classification and province', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200);
      const body = response.body as {
        name: string;
        province: { code: string };
        classification: { code: string };
      }[];

      expect(body).toHaveLength(19);
      expect(names(body)).toEqual([...names(body)].sort());
      for (const city of body) {
        expect(city.province.code).toBe('PH-SUR');
        expect(city.classification.code).toBeTruthy();
      }
    });

    it('applies the full_name rule to real rows — " City" on city classes only', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200);
      const body = response.body as { name: string; full_name: string }[];

      expect(body.find((city) => city.name === 'Bislig')?.full_name).toBe('Bislig City');
      expect(body.find((city) => city.name === 'Barobo')?.full_name).toBe('Barobo');
    });

    it('marks the provincial capital from the thick-border cell (OD-8)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200);
      const capitals = (response.body as { name: string; is_capital: boolean }[]).filter(
        (city) => city.is_capital,
      );

      expect(names(capitals)).toEqual(['Tandag']);
    });
  });

  describe('GET /api/v1/regions/:region/provinces/:province/cities/:city', () => {
    it('serves the city the legacy left unimplemented (OD-4), with a populated singular province (OD-5)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities/bislig')
        .expect(200);

      const body = response.body as Record<string, unknown>;

      // The key set pins the shape (nothing added, nothing leaked); toMatchObject
      // pins the values that carry meaning, without asserting the seeded
      // classification description or the Tagalog name, which the fixtures own.
      expect(Object.keys(body).sort()).toEqual([
        'alt_name',
        'classification',
        'full_name',
        'is_capital',
        'name',
        'province',
        'slug',
      ]);
      expect(body).toMatchObject({
        name: 'Bislig',
        slug: 'bislig',
        alt_name: null,
        full_name: 'Bislig City',
        is_capital: false,
        classification: { code: 'CC' },
        province: { code: 'PH-SUR', name: 'Surigao del Sur', alt_name: null },
      });
    });

    it('resolves every returned slug back to its own detail route', async () => {
      const list = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200);

      for (const city of list.body as { slug: string }[]) {
        await request(app.getHttpServer())
          .get(`/api/v1/regions/PH-13/provinces/PH-SUR/cities/${city.slug}`)
          .expect(200);
      }
    });

    it('matches the slug exactly — the raw name is a 404, not a redirect', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities/Bislig')
        .expect(404);
    });

    it('404s a city that exists in another province', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-AGN/cities/bislig')
        .expect(404);
    });
  });

  describe('NCR (OD-7) — the region the legacy dropped entirely', () => {
    it('exposes the four district provinces under PH-00', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions/PH-00').expect(200);
      const body = response.body as { provinces: { code: string }[] };

      expect(body.provinces.map((province) => province.code).sort()).toEqual([
        'PH-00-D1',
        'PH-00-D2',
        'PH-00-D3',
        'PH-00-D4',
      ]);
    });

    it('files all 17 NCR LGUs under a district, none dropped', async () => {
      const districts = ['PH-00-D1', 'PH-00-D2', 'PH-00-D3', 'PH-00-D4'];
      let total = 0;

      for (const district of districts) {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/regions/PH-00/provinces/${district}/cities`)
          .expect(200);
        total += (response.body as unknown[]).length;
      }

      expect(total).toBe(17);
    });

    it('serves Pateros, the lone NCR municipality, through the city detail route', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-00/provinces/PH-00-D4/cities/pateros')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'Pateros',
        full_name: 'Pateros',
        classification: { code: 'Mun' },
      });
    });
  });

  describe('query efficiency', () => {
    it('reads a province detail and its 19 cities in a single query — no N+1', async () => {
      const findUnique = jest.spyOn(prisma.region, 'findUnique');
      const cityFindMany = jest.spyOn(prisma.city, 'findMany');

      try {
        await request(app.getHttpServer())
          .get('/api/v1/regions/PH-13/provinces/PH-SUR')
          .expect(200);

        // One region-anchored read with a nested include...
        expect(findUnique).toHaveBeenCalledTimes(1);
        // ...and the 19 cities came with it, rather than from a query per province.
        expect(cityFindMany).not.toHaveBeenCalled();
      } finally {
        // `finally`, so a failed assertion cannot leave the delegates patched for
        // whatever spec runs next.
        findUnique.mockRestore();
        cityFindMany.mockRestore();
      }
    });
  });
});
