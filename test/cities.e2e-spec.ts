import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import type { City, Classification, Province, Region } from '@/generated/prisma/client';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-009 acceptance. Boots the real AppModule — controller, service, DTOs and the
 * PHG-006 HTTP layer — over a stubbed PrismaService, so the wire contract is proven
 * without a database. The exact `where`/`orderBy`/`include` arguments the service
 * sends are asserted in cities.service.spec.ts; the stub here answers them the way
 * Prisma would, so region → province scoping is exercised end to end.
 *
 * The detail route is the endpoint the legacy never implemented (OD-4), and its
 * `province` field is the one the legacy got wrong (OD-5) — both are asserted here as
 * corrected behavior, not reproduced.
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

const CAGAYAN_VALLEY: Region = {
  id: 2,
  code: 'PH-02',
  name: 'Cagayan Valley',
  nameTl: 'Lambak ng Cagayan',
  acronym: 'II',
  ...TIMESTAMPS,
};

const SURIGAO_DEL_SUR: Province = {
  id: 23,
  code: 'PH-SUR',
  name: 'Surigao del Sur',
  altName: null,
  nameTl: 'Timog Surigaw',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

const DINAGAT_ISLANDS: Province = {
  id: 22,
  code: 'PH-DIN',
  name: 'Dinagat Islands',
  altName: 'Dinagat',
  nameTl: 'Pulo ng Dinagat',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

/** Lives under Cagayan Valley — proves a province cannot be read through Caraga. */
const CAGAYAN: Province = {
  id: 9,
  code: 'PH-CAG',
  name: 'Cagayan',
  altName: null,
  nameTl: 'Cagayan',
  regionId: CAGAYAN_VALLEY.id,
  ...TIMESTAMPS,
};

const MUNICIPALITY: Classification = {
  id: 1,
  code: 'Mun',
  description: 'Municipality',
  ...TIMESTAMPS,
};

const COMPONENT_CITY: Classification = {
  id: 2,
  code: 'CC',
  description: 'Component City',
  ...TIMESTAMPS,
};

type CityWithClassification = City & { classification: Classification };

const SURIGAO_DEL_SUR_CITIES: CityWithClassification[] = [
  {
    id: 201,
    name: 'Barobo',
    altName: null,
    fullName: 'Barobo',
    isCapital: false,
    provinceId: SURIGAO_DEL_SUR.id,
    classificationId: MUNICIPALITY.id,
    classification: MUNICIPALITY,
    ...TIMESTAMPS,
  },
  {
    id: 202,
    name: 'Bislig',
    altName: null,
    fullName: 'Bislig City',
    isCapital: false,
    provinceId: SURIGAO_DEL_SUR.id,
    classificationId: COMPONENT_CITY.id,
    classification: COMPONENT_CITY,
    ...TIMESTAMPS,
  },
  {
    id: 203,
    name: 'Tandag',
    altName: null,
    fullName: 'Tandag City',
    isCapital: true,
    provinceId: SURIGAO_DEL_SUR.id,
    classificationId: COMPONENT_CITY.id,
    classification: COMPONENT_CITY,
    ...TIMESTAMPS,
  },
];

/** An accented name, reachable only through its ASCII slug `penablanca`. */
const CAGAYAN_CITIES: CityWithClassification[] = [
  {
    id: 301,
    name: 'Peñablanca',
    altName: null,
    fullName: 'Peñablanca',
    isCapital: false,
    provinceId: CAGAYAN.id,
    classificationId: MUNICIPALITY.id,
    classification: MUNICIPALITY,
    ...TIMESTAMPS,
  },
];

const REGIONS: Region[] = [CAGAYAN_VALLEY, CARAGA];

/** Provinces per region id, already in `name` order as `orderBy` would return them. */
const PROVINCES_BY_REGION = new Map<number, Province[]>([
  [CARAGA.id, [DINAGAT_ISLANDS, SURIGAO_DEL_SUR]],
  [CAGAYAN_VALLEY.id, [CAGAYAN]],
]);

/** Cities per province id, likewise pre-sorted by `name`. */
const CITIES_BY_PROVINCE = new Map<number, CityWithClassification[]>([
  [SURIGAO_DEL_SUR.id, SURIGAO_DEL_SUR_CITIES],
  [CAGAYAN.id, CAGAYAN_CITIES],
  [DINAGAT_ISLANDS.id, []],
]);

/** The subset of `region.findUnique` arguments this suite's readers actually send. */
type RegionFindUniqueArgs = {
  where: { code: string };
  include?: {
    provinces?: {
      where?: { code: string };
      include?: { cities?: unknown };
    };
  };
};

/**
 * Stands in for `prisma.region.findUnique`, honouring the nested `where`/`include`
 * the service builds — so a province filtered out by region scoping is genuinely
 * absent from the result rather than assumed absent by the test.
 */
function findUniqueRegion(args: RegionFindUniqueArgs): Promise<unknown> {
  const region = REGIONS.find((candidate) => candidate.code === args.where.code);

  if (!region) {
    return Promise.resolve(null);
  }

  const nested = args.include?.provinces;
  const all = PROVINCES_BY_REGION.get(region.id) ?? [];
  const matched = nested?.where
    ? all.filter((province) => province.code === nested.where?.code)
    : all;

  if (!nested?.include?.cities) {
    return Promise.resolve({ ...region, provinces: matched });
  }

  return Promise.resolve({
    ...region,
    provinces: matched.map((province) => ({
      ...province,
      cities: CITIES_BY_PROVINCE.get(province.id) ?? [],
    })),
  });
}

const BISLIG_PAYLOAD = {
  name: 'Bislig',
  slug: 'bislig',
  alt_name: null,
  full_name: 'Bislig City',
  is_capital: false,
  classification: { code: 'CC', description: 'Component City' },
  province: {
    code: 'PH-SUR',
    name: 'Surigao del Sur',
    alt_name: null,
    name_tl: 'Timog Surigaw',
  },
};

describe('Cities (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
        region: {
          findMany: jest.fn().mockResolvedValue(REGIONS),
          findUnique: jest.fn(findUniqueRegion),
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    // Mirror the production bootstrap so the versioned routes resolve in-test.
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/regions/:region/provinces/:province/cities', () => {
    it("returns the province's cities ordered by name, each with classification and province", async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual([
        {
          name: 'Barobo',
          slug: 'barobo',
          alt_name: null,
          full_name: 'Barobo',
          is_capital: false,
          classification: { code: 'Mun', description: 'Municipality' },
          province: BISLIG_PAYLOAD.province,
        },
        BISLIG_PAYLOAD,
        {
          name: 'Tandag',
          slug: 'tandag',
          alt_name: null,
          full_name: 'Tandag City',
          is_capital: true,
          classification: { code: 'CC', description: 'Component City' },
          province: BISLIG_PAYLOAD.province,
        },
      ]);
    });

    it('keeps ids, FKs and timestamps off the wire for the city and both its relations', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200);

      const cities = response.body as { classification: object; province: object }[];

      for (const city of cities) {
        expect(Object.keys(city).sort()).toEqual([
          'alt_name',
          'classification',
          'full_name',
          'is_capital',
          'name',
          'province',
          'slug',
        ]);
        expect(Object.keys(city.classification).sort()).toEqual(['code', 'description']);
        expect(Object.keys(city.province).sort()).toEqual(['alt_name', 'code', 'name', 'name_tl']);
      }
    });

    it('serializes is_capital as a real JSON boolean, both ways', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities')
        .expect(200);

      const cities = response.body as { name: string; is_capital: unknown }[];

      for (const city of cities) {
        expect(typeof city.is_capital).toBe('boolean');
      }
      expect(cities.find((city) => city.name === 'Tandag')?.is_capital).toBe(true);
      expect(cities.find((city) => city.name === 'Bislig')?.is_capital).toBe(false);
    });

    it('serializes a city-less province as an empty array', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-DIN/cities')
        .expect(200)
        .expect([]);
    });

    it('404s a province that exists but belongs to a different region', async () => {
      // PH-CAG is real — it just sits under PH-02, so reading it through PH-13 misses.
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-02/provinces/PH-CAG/cities')
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-CAG/cities')
        .expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "Province 'PH-CAG' was not found.",
        instance: '/api/v1/regions/PH-13/provinces/PH-CAG/cities',
      });
    });

    it('blames the region, not the province, when the region is the unknown one', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-99/provinces/PH-SUR/cities')
        .expect(404);

      expect(response.body).toMatchObject({ detail: "Region 'PH-99' was not found." });
    });
  });

  describe('GET /api/v1/regions/:region/provinces/:province/cities/:city', () => {
    it('serves the city detail the legacy left unimplemented (OD-4), matching the documented payload', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities/bislig')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual(BISLIG_PAYLOAD);
    });

    it('returns a populated singular province — the OD-5 regression', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities/bislig')
        .expect(200);

      const body = response.body as Record<string, unknown>;

      // Legacy CityResource read `$this->provinces`, a relation City never declared.
      expect(body).not.toHaveProperty('provinces');
      expect(Array.isArray(body.province)).toBe(false);
      expect(body.province).toEqual({
        code: 'PH-SUR',
        name: 'Surigao del Sur',
        alt_name: null,
        name_tl: 'Timog Surigaw',
      });
    });

    it('addresses an accented city through its ASCII slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-02/provinces/PH-CAG/cities/penablanca')
        .expect(200);

      expect(response.body).toMatchObject({ name: 'Peñablanca', full_name: 'Peñablanca' });
    });

    it('answers an unknown city with 404 problem+json naming the slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities/atlantis')
        .expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "City 'atlantis' was not found.",
        instance: '/api/v1/regions/PH-13/provinces/PH-SUR/cities/atlantis',
      });
    });

    it('matches the slug exactly — the raw name is a miss, not a redirect', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-SUR/cities/Bislig')
        .expect(404);
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-02/provinces/PH-CAG/cities/Pe%C3%B1ablanca')
        .expect(404);
    });

    it('404s a city read through the wrong province', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-DIN/cities/bislig')
        .expect(404);
    });

    it('does not shadow the province or region detail routes', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/PH-13/provinces/PH-SUR').expect(200);
      await request(app.getHttpServer()).get('/api/v1/regions/PH-13').expect(200);
    });
  });
});
