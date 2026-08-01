import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import type { City, Classification, Province, Region } from '@/generated/prisma/client';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-010 acceptance — the frozen wire contract.
 *
 * The per-module suites (regions/provinces/cities) prove their own endpoint behaves;
 * this one exists to pin the *shape* of all six payloads in a single place, so
 * `__snapshots__/serialization.e2e-spec.ts.snap` reads as the API's response format
 * and any unintended change to it shows up as a diff rather than as a surprise for a
 * consumer. PHG-016 generates its OpenAPI schemas from the same DTOs.
 *
 * Fixtures are the legacy README's own "Properties" examples (Caraga → Agusan del
 * Norte → Buenavista/Butuan/Cabadbaran), so the snapshots double as the parity
 * evidence PHG-019 needs: every documented field is present, with the documented
 * value, plus the two deliberate supersets — `classification` on a province's nested
 * cities (OD-14) and `slug` on a city (OD-15).
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

const AGUSAN_DEL_NORTE: Province = {
  id: 21,
  code: 'PH-AGN',
  name: 'Agusan del Norte',
  altName: null,
  nameTl: 'Hilagang Agusan',
  regionId: CARAGA.id,
  ...TIMESTAMPS,
};

/** Carries a former name — the only fixture that proves `alt_name` is not always null. */
const DINAGAT_ISLANDS: Province = {
  id: 22,
  code: 'PH-DIN',
  name: 'Dinagat Islands',
  altName: 'Dinagat',
  nameTl: 'Pulo ng Dinagat',
  regionId: CARAGA.id,
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

/** The README's Agusan del Norte cities, already in `name` order. */
const AGUSAN_DEL_NORTE_CITIES: CityWithClassification[] = [
  {
    id: 301,
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
    id: 302,
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
    id: 303,
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

const REGIONS: Region[] = [CARAGA];

const PROVINCES_BY_REGION = new Map<number, Province[]>([
  [CARAGA.id, [AGUSAN_DEL_NORTE, DINAGAT_ISLANDS]],
]);

const CITIES_BY_PROVINCE = new Map<number, CityWithClassification[]>([
  [AGUSAN_DEL_NORTE.id, AGUSAN_DEL_NORTE_CITIES],
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

/** Every internal column a DTO must never let through, at any depth. */
const INTERNAL_KEYS = [
  'id',
  'regionId',
  'region_id',
  'provinceId',
  'province_id',
  'classificationId',
  'classification_id',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
];

/** Every key appearing anywhere in the payload, however deeply nested. */
function collectKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, found);
    }

    return found;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      collectKeys(nested, found);
    }
  }

  return found;
}

const ROUTES = {
  regionList: '/api/v1/regions',
  regionDetail: '/api/v1/regions/PH-13',
  provinceList: '/api/v1/regions/PH-13/provinces',
  provinceDetail: '/api/v1/regions/PH-13/provinces/PH-AGN',
  cityList: '/api/v1/regions/PH-13/provinces/PH-AGN/cities',
  cityDetail: '/api/v1/regions/PH-13/provinces/PH-AGN/cities/cabadbaran',
};

describe('Serialization contract (e2e)', () => {
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
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('frozen payloads', () => {
    it.each(Object.entries(ROUTES))('%s matches its frozen shape', async (_name, route) => {
      const response = await request(app.getHttpServer()).get(route).expect(200);

      expect(response.body).toMatchSnapshot();
    });
  });

  describe('no internal columns leak, at any depth', () => {
    it.each(Object.entries(ROUTES))(
      '%s exposes no ids, FKs or timestamps',
      async (_name, route) => {
        const response = await request(app.getHttpServer()).get(route).expect(200);
        const keys = collectKeys(response.body);

        for (const internal of INTERNAL_KEYS) {
          expect(keys.has(internal)).toBe(false);
        }
      },
    );
  });

  describe('wire fields are snake_case', () => {
    it.each(Object.entries(ROUTES))('%s uses no camelCase keys', async (_name, route) => {
      const response = await request(app.getHttpServer()).get(route).expect(200);

      for (const key of collectKeys(response.body)) {
        expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });

  describe('alt_name', () => {
    it('is present and null — never omitted — when a province has no former name', async () => {
      const response = await request(app.getHttpServer()).get(ROUTES.provinceDetail).expect(200);
      const body = response.body as Record<string, unknown>;

      expect(body).toHaveProperty('alt_name');
      expect(body.alt_name).toBeNull();
    });

    it('carries the former name when there is one', async () => {
      const response = await request(app.getHttpServer()).get(ROUTES.regionDetail).expect(200);
      const { provinces } = response.body as { provinces: { code: string; alt_name: unknown }[] };

      expect(provinces.find((province) => province.code === 'PH-DIN')?.alt_name).toBe('Dinagat');
      expect(provinces.find((province) => province.code === 'PH-AGN')?.alt_name).toBeNull();
    });

    it('is present and null on every city that has no former name', async () => {
      const response = await request(app.getHttpServer()).get(ROUTES.cityList).expect(200);
      const cities = response.body as Record<string, unknown>[];

      for (const city of cities) {
        expect(city).toHaveProperty('alt_name');
        expect(city.alt_name).toBeNull();
      }
    });
  });

  describe('is_capital', () => {
    it('is a real JSON boolean both ways — the legacy needed a PHP accessor for this', async () => {
      const response = await request(app.getHttpServer()).get(ROUTES.cityList).expect(200);
      const cities = response.body as { name: string; is_capital: unknown }[];

      const capital = cities.find((city) => city.name === 'Cabadbaran');
      const municipality = cities.find((city) => city.name === 'Buenavista');

      expect(capital?.is_capital).toBe(true);
      expect(municipality?.is_capital).toBe(false);
    });
  });

  describe('nested shapes are identical wherever they appear', () => {
    it('serves the same region object in the list and inside a province', async () => {
      const [list, provinces] = await Promise.all([
        request(app.getHttpServer()).get(ROUTES.regionList).expect(200),
        request(app.getHttpServer()).get(ROUTES.provinceList).expect(200),
      ]);

      const listed = (list.body as Record<string, unknown>[])[0];
      const nested = (provinces.body as { region: Record<string, unknown> }[])[0].region;

      expect(nested).toEqual(listed);
    });

    it('serves the same province object inside a region and inside a city', async () => {
      const [region, city] = await Promise.all([
        request(app.getHttpServer()).get(ROUTES.regionDetail).expect(200),
        request(app.getHttpServer()).get(ROUTES.cityDetail).expect(200),
      ]);

      const { provinces } = region.body as { provinces: Record<string, unknown>[] };
      const nested = (city.body as { province: Record<string, unknown> }).province;

      expect(nested).toEqual(provinces.find((province) => province.code === 'PH-AGN'));
    });

    it('serves a city under a province as the city payload minus its province', async () => {
      const [province, cities] = await Promise.all([
        request(app.getHttpServer()).get(ROUTES.provinceDetail).expect(200),
        request(app.getHttpServer()).get(ROUTES.cityList).expect(200),
      ]);

      const nested = (province.body as { cities: Record<string, unknown>[] }).cities;
      const standalone = cities.body as Record<string, unknown>[];

      const withoutProvince = standalone.map((city) => {
        const copy = { ...city };
        delete copy.province;

        return copy;
      });

      expect(nested).toEqual(withoutProvince);
    });

    it('serves the same classification object in both places a city appears', async () => {
      const [province, cities] = await Promise.all([
        request(app.getHttpServer()).get(ROUTES.provinceDetail).expect(200),
        request(app.getHttpServer()).get(ROUTES.cityList).expect(200),
      ]);

      const nested = (province.body as { cities: { classification: unknown }[] }).cities;
      const standalone = cities.body as { classification: unknown }[];

      expect(nested.map((city) => city.classification)).toEqual(
        standalone.map((city) => city.classification),
      );
    });
  });

  describe('slug (OD-15)', () => {
    it('addresses the city detail route it appears on', async () => {
      const list = await request(app.getHttpServer()).get(ROUTES.cityList).expect(200);
      const cities = list.body as { slug: string; name: string }[];

      // The contract OD-15 buys: a consumer builds the detail URL from the payload
      // alone, with no client-side reimplementation of the slug rule.
      for (const city of cities) {
        const detail = await request(app.getHttpServer())
          .get(`${ROUTES.cityList}/${city.slug}`)
          .expect(200);

        expect((detail.body as { name: string }).name).toBe(city.name);
      }
    });
  });
});
