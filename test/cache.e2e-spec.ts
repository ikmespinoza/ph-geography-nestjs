// Must be set before AppModule is imported: the config namespaces read the
// environment at module-factory time, and setup-env.ts turns caching off for every
// other suite. This is the one spec that needs it on.
process.env.CACHE_ENABLED = 'true';
process.env.CACHE_TTL_MS = '60000';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';
import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import type { Region } from '@/generated/prisma/client';
import { IngestionService } from '@/ingestion/ingestion.service';
import type { ChangeDetectionService } from '@/ingestion/change-detection/change-detection.service';
import type { RunLock } from '@/ingestion/run-lock';
import type { GeoSource } from '@/ingestion/scraper-core/geo-source';
import type { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import type { CityWriter } from '@/ingestion/writers/city.writer';
import type { ProvinceWriter } from '@/ingestion/writers/province.writer';
import type { RegionWriter } from '@/ingestion/writers/region.writer';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-015 acceptance. Boots the real `AppModule` over a stubbed `PrismaService` whose
 * rows *change between requests* — so a response that still matches the first payload
 * proves the cache answered, and one that matches the second proves it did not.
 */

const TIMESTAMPS = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const CARAGA: Region = {
  id: 7,
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Karaga',
  acronym: 'XIII',
  ...TIMESTAMPS,
};

/** What the "database" returns after ingestion has renamed the region. */
const RENAMED: Region = { ...CARAGA, name: 'Caraga (renamed)' };

/** A page carrying only what the pipeline reads from it: the last-edited footer. */
const SOURCE_PAGE =
  '<html><body><li id="footer-info-lastmod">This page was last edited on 29 July 2025, at 13:25 (UTC).</li></body></html>';

const WROTE_ROWS = { created: 2, updated: 1, unchanged: 0, rejected: 0 };

/**
 * The real orchestrator over fake collaborators, sharing the app's actual cache. Only
 * the write counts vary between cases — everything else just lets `run()` reach its
 * invalidation step.
 */
function buildIngestion(cache: Cache, counts = WROTE_ROWS): IngestionService {
  const rowsParsed = { rows: [{ code: 'PH-13' }], rejections: [] };
  const source = {
    name: 'ISO 3166',
    regionUrl: 'https://example.test/regions',
    cityUrl: 'https://example.test/cities',
    urlFor: () => 'https://example.test/regions',
    parseRegions: () => rowsParsed,
    parseProvinces: () => rowsParsed,
    parseCities: () => rowsParsed,
  } as unknown as GeoSource;

  return new IngestionService(
    { fetchHtml: () => Promise.resolve(SOURCE_PAGE) } as unknown as HttpFetcher,
    {
      shouldProcess: () => Promise.resolve(true),
      markProcessed: () => Promise.resolve(),
    } as unknown as ChangeDetectionService,
    { write: () => Promise.resolve(counts) } as unknown as RegionWriter,
    {
      write: () => Promise.resolve(counts),
      ensureNcrDistricts: () =>
        Promise.resolve({ created: 0, updated: 0, unchanged: 4, rejected: 0 }),
    } as unknown as ProvinceWriter,
    { write: () => Promise.resolve(counts) } as unknown as CityWriter,
    { acquire: () => Promise.resolve({ release: () => Promise.resolve() }) } as unknown as RunLock,
    [source],
    cache,
  );
}

describe('Caching (e2e)', () => {
  let app: INestApplication;
  let cache: Cache;
  let rows: Region[];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
        region: {
          findMany: jest.fn(() => Promise.resolve(rows)),
          findUnique: jest.fn(({ where }: { where: { code: string } }) => {
            const match = rows.find((row) => row.code === where.code);

            return Promise.resolve(match ? { ...match, provinces: [] } : null);
          }),
        },
        sourceSyncState: { findMany: jest.fn().mockResolvedValue([]) },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    cache = app.get<Cache>(CACHE_MANAGER);
  });

  beforeEach(async () => {
    rows = [CARAGA];
    await cache.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('hit and miss', () => {
    it('serves the second identical GET from cache', async () => {
      const first = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      expect(first.headers['x-cache']).toBe('MISS');

      rows = [RENAMED];

      const second = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      expect(second.headers['x-cache']).toBe('HIT');
      expect(second.body).toEqual(first.body);
      expect(second.body).toEqual([expect.objectContaining({ name: 'Caraga' })]);
    });

    it('keys on the URL, so a different route is its own entry', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      const detail = await request(app.getHttpServer()).get('/api/v1/regions/PH-13').expect(200);

      expect(detail.headers['x-cache']).toBe('MISS');
    });
  });

  /**
   * The invariant that makes the interceptor's placement matter (spec §6.2). The cache
   * is registered ahead of `ClassSerializerInterceptor`, so what it stores is the
   * finished wire payload rather than the DTO instance. Were the order reversed, a
   * cached response would still be snake_case *in memory* — and would silently revert
   * to the class's real property names the moment a serializing store was introduced.
   */
  describe('the cached body is the wire body', () => {
    it('keeps snake_case fields and leaks no internals on a hit', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      const hit = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      expect(hit.headers['x-cache']).toBe('HIT');
      expect(Object.keys(hit.body[0] as object).sort()).toEqual([
        'acronym',
        'code',
        'name',
        'name_tl',
      ]);
      expect(hit.body[0]).not.toHaveProperty('nameTl');
      expect(hit.body[0]).not.toHaveProperty('id');
      expect(hit.body[0]).not.toHaveProperty('createdAt');
    });

    it('stores a plain object, not a DTO instance', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      const stored = await cache.get<unknown[]>('/api/v1/regions');

      expect(stored).toBeDefined();
      expect(Object.getPrototypeOf(stored?.[0])).toBe(Object.prototype);
      expect(stored?.[0]).toHaveProperty('name_tl');
    });
  });

  describe('headers', () => {
    it('advertises the same max-age the server caches for', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      expect(response.headers['cache-control']).toBe('public, max-age=60');
    });

    it('sets Cache-Control on a hit too, not only on the miss that populated it', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      const hit = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      expect(hit.headers['x-cache']).toBe('HIT');
      expect(hit.headers['cache-control']).toBe('public, max-age=60');
    });

    /**
     * Express computes a weak ETag for every JSON body and answers 304 when
     * `If-None-Match` matches, so conditional requests need no code of ours — PHG-015
     * only has to prove it, and would have found out here if it were not true.
     */
    it('answers 304 to a conditional request carrying the returned ETag', async () => {
      const first = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      // Asserted with a type guard rather than `toBeDefined()`: the header is typed
      // `string | undefined`, and `.set()` takes a string — so the check has to
      // narrow, not merely assert, or the next line does not compile.
      const etag = first.headers.etag;
      if (typeof etag !== 'string') {
        throw new Error(`expected an ETag on the first response, got ${String(etag)}`);
      }

      const conditional = await request(app.getHttpServer())
        .get('/api/v1/regions')
        .set('If-None-Match', etag)
        .expect(304);

      expect(conditional.body).toEqual({});
    });
  });

  describe('exemptions', () => {
    it('never caches the health probes', async () => {
      const first = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      const second = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      expect(first.headers['x-cache']).toBeUndefined();
      expect(second.headers['x-cache']).toBeUndefined();
      // Terminus sets this itself — a second layer under the path exemption.
      expect(first.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    });

    /**
     * Failures must never be cached: the interceptor only stores an *emitted* value,
     * and a thrown `ResourceNotFoundException` emits nothing. Otherwise a resource
     * that appears moments later would keep 404ing for a whole TTL.
     */
    /**
     * PHG-015's Definition of Done, literally: *change data → the cached response
     * updates*.
     *
     * The real `IngestionService` is built here over fake collaborators but the app's
     * **real** cache instance — the same one the interceptor reads — so the assertion
     * covers the whole seam (a run that wrote rows clears the cache, and the next GET
     * serves the new data) rather than just the `clear()` call the unit spec pins.
     */
    it('serves the new data after an ingestion run that changed rows', async () => {
      const primed = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      expect(primed.body).toEqual([expect.objectContaining({ name: 'Caraga' })]);
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      // The database now holds a renamed region; the cache still holds the old name.
      rows = [RENAMED];
      const stale = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      expect(stale.headers['x-cache']).toBe('HIT');
      expect(stale.body).toEqual([expect.objectContaining({ name: 'Caraga' })]);

      await buildIngestion(cache).run();

      const fresh = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      expect(fresh.headers['x-cache']).toBe('MISS');
      expect(fresh.body).toEqual([expect.objectContaining({ name: 'Caraga (renamed)' })]);
    });

    it('leaves the cache warm when an ingestion run changed nothing', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      await buildIngestion(cache, { created: 0, updated: 0, unchanged: 3, rejected: 0 }).run();

      const after = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
      expect(after.headers['x-cache']).toBe('HIT');
    });

    it('does not cache a 404, so a region that appears later is served', async () => {
      const miss = await request(app.getHttpServer()).get('/api/v1/regions/PH-05').expect(404);
      expect(miss.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(await cache.get('/api/v1/regions/PH-05')).toBeUndefined();

      rows = [CARAGA, { ...CARAGA, id: 3, code: 'PH-05', name: 'Bicol Region' }];

      await request(app.getHttpServer()).get('/api/v1/regions/PH-05').expect(200);
    });
  });
});
