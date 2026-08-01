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
 * PHG-008 acceptance. Boots the real AppModule — controller, service, DTOs and the
 * PHG-006 HTTP layer — over a stubbed PrismaService, so the wire contract is proven
 * without a database. The exact `where`/`orderBy`/`include` arguments the service
 * sends are asserted in provinces.service.spec.ts; the stub here answers them the way
 * Prisma would, so region-scoping is exercised end to end.
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

const ILOCOS: Region = {
  id: 1,
  code: 'PH-01',
  name: 'Ilocos Region',
  nameTl: 'Rehiyon ng Iloko',
  acronym: 'I',
  ...TIMESTAMPS,
};

const BICOL: Region = {
  id: 3,
  code: 'PH-05',
  name: 'Bicol Region',
  nameTl: 'Kabikulan',
  acronym: 'V',
  ...TIMESTAMPS,
};

const AGUSAN_DEL_NORTE: Province = {
  id: 21,
  code: 'PH-AGN',
  name: 'Agusan del Norte',
  altName: null,
  nameTl: 'Hilagang Agusan',
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

/** Lives under Ilocos — the fixture that proves a province cannot be read via Caraga. */
const ABRA: Province = {
  id: 1,
  code: 'PH-ABR',
  name: 'Abra',
  altName: null,
  nameTl: 'Abra',
  regionId: ILOCOS.id,
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

const HIGHLY_URBANIZED_CITY: Classification = {
  id: 4,
  code: 'HUC',
  description: 'Highly Urbanized City',
  ...TIMESTAMPS,
};

type CityWithClassification = City & { classification: Classification };

const AGUSAN_DEL_NORTE_CITIES: CityWithClassification[] = [
  {
    id: 101,
    name: 'Buenavista',
    altName: null,
    fullName: 'Buenavista',
    isCapital: false,
    provinceId: AGUSAN_DEL_NORTE.id,
    classificationId: MUNICIPALITY.id,
    classification: MUNICIPALITY,
    ...TIMESTAMPS,
  },
  {
    id: 102,
    name: 'Butuan',
    altName: null,
    fullName: 'Butuan City',
    isCapital: false,
    provinceId: AGUSAN_DEL_NORTE.id,
    classificationId: HIGHLY_URBANIZED_CITY.id,
    classification: HIGHLY_URBANIZED_CITY,
    ...TIMESTAMPS,
  },
  {
    id: 103,
    name: 'Cabadbaran',
    altName: null,
    fullName: 'Cabadbaran City',
    isCapital: true,
    provinceId: AGUSAN_DEL_NORTE.id,
    classificationId: COMPONENT_CITY.id,
    classification: COMPONENT_CITY,
    ...TIMESTAMPS,
  },
];

const REGIONS: Region[] = [ILOCOS, BICOL, CARAGA];

/** Provinces per region id, already in `name` order as `orderBy` would return them. */
const PROVINCES_BY_REGION = new Map<number, Province[]>([
  [CARAGA.id, [AGUSAN_DEL_NORTE, DINAGAT_ISLANDS]],
  [ILOCOS.id, [ABRA]],
  [BICOL.id, []],
]);

const CITIES_BY_PROVINCE = new Map<number, CityWithClassification[]>([
  [AGUSAN_DEL_NORTE.id, AGUSAN_DEL_NORTE_CITIES],
  [DINAGAT_ISLANDS.id, []],
  [ABRA.id, []],
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

describe('Provinces (e2e)', () => {
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

  describe('GET /api/v1/regions/:region/provinces', () => {
    it("returns the region's provinces ordered by name, each with its region", async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual([
        {
          code: 'PH-AGN',
          name: 'Agusan del Norte',
          alt_name: null,
          name_tl: 'Hilagang Agusan',
          region: {
            code: 'PH-13',
            name: 'Caraga',
            name_tl: 'Rehiyon ng Karaga',
            acronym: 'XIII',
          },
        },
        {
          code: 'PH-DIN',
          name: 'Dinagat Islands',
          alt_name: 'Dinagat',
          name_tl: 'Pulo ng Dinagat',
          region: {
            code: 'PH-13',
            name: 'Caraga',
            name_tl: 'Rehiyon ng Karaga',
            acronym: 'XIII',
          },
        },
      ]);
    });

    it('omits cities from list items and keeps ids, FKs and timestamps off the wire', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces')
        .expect(200);

      for (const province of response.body as { region: object }[]) {
        expect(Object.keys(province).sort()).toEqual([
          'alt_name',
          'code',
          'name',
          'name_tl',
          'region',
        ]);
        expect(Object.keys(province.region).sort()).toEqual(['acronym', 'code', 'name', 'name_tl']);
      }
    });

    it('serializes a province-less region as an empty array', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-05/provinces')
        .expect(200)
        .expect([]);
    });

    it('answers an unknown region with 404 problem+json — the legacy answered 200 with []', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-99/provinces')
        .expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "Region 'PH-99' was not found.",
        instance: '/api/v1/regions/PH-99/provinces',
      });
    });
  });

  describe('GET /api/v1/regions/:region/provinces/:province', () => {
    it('returns the province with its region and cities, matching the documented payload', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-AGN')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual({
        code: 'PH-AGN',
        name: 'Agusan del Norte',
        alt_name: null,
        name_tl: 'Hilagang Agusan',
        region: {
          code: 'PH-13',
          name: 'Caraga',
          name_tl: 'Rehiyon ng Karaga',
          acronym: 'XIII',
        },
        cities: [
          {
            name: 'Buenavista',
            alt_name: null,
            full_name: 'Buenavista',
            is_capital: false,
            classification: { code: 'Mun', description: 'Municipality' },
          },
          {
            name: 'Butuan',
            alt_name: null,
            full_name: 'Butuan City',
            is_capital: false,
            classification: { code: 'HUC', description: 'Highly Urbanized City' },
          },
          {
            name: 'Cabadbaran',
            alt_name: null,
            full_name: 'Cabadbaran City',
            is_capital: true,
            classification: { code: 'CC', description: 'Component City' },
          },
        ],
      });
    });

    it('keeps city ids, FKs and timestamps off the wire', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-AGN')
        .expect(200);

      const { cities } = response.body as { cities: { classification: object }[] };

      for (const city of cities) {
        expect(Object.keys(city).sort()).toEqual([
          'alt_name',
          'classification',
          'full_name',
          'is_capital',
          'name',
        ]);
        expect(Object.keys(city.classification).sort()).toEqual(['code', 'description']);
      }
    });

    it('serializes a city-less province as an empty array', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-DIN')
        .expect(200)
        .expect({
          code: 'PH-DIN',
          name: 'Dinagat Islands',
          alt_name: 'Dinagat',
          name_tl: 'Pulo ng Dinagat',
          region: {
            code: 'PH-13',
            name: 'Caraga',
            name_tl: 'Rehiyon ng Karaga',
            acronym: 'XIII',
          },
          cities: [],
        });
    });

    it('404s a province that exists but belongs to a different region', async () => {
      // PH-ABR is real — it just sits under PH-01, so reading it through PH-13 misses.
      await request(app.getHttpServer()).get('/api/v1/regions/PH-01/provinces/PH-ABR').expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13/provinces/PH-ABR')
        .expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "Province 'PH-ABR' was not found.",
        instance: '/api/v1/regions/PH-13/provinces/PH-ABR',
      });
    });

    it('blames the region, not the province, when the region is the unknown one', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-99/provinces/PH-AGN')
        .expect(404);

      expect(response.body).toMatchObject({ detail: "Region 'PH-99' was not found." });
    });

    it('matches both codes exactly — lowercased codes are a miss, not a redirect', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/ph-13/provinces/ph-agn').expect(404);
      await request(app.getHttpServer()).get('/api/v1/regions/PH-13/provinces/ph-agn').expect(404);
    });

    it('does not shadow the region detail route', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/PH-13').expect(200);
    });
  });
});
