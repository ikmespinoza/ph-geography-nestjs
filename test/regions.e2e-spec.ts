import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import type { Province, Region } from '@/generated/prisma/client';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-007 acceptance. Boots the real AppModule — controller, service, DTOs and the
 * PHG-006 HTTP layer — over a stubbed PrismaService, so the wire contract is proven
 * without a database. The `orderBy`/`include` arguments the service sends are
 * asserted in regions.service.spec.ts; here the stub stands in for the query result.
 */

const TIMESTAMPS = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const BICOL: Region = {
  id: 3,
  code: 'PH-05',
  name: 'Bicol Region',
  nameTl: 'Kabikulan',
  acronym: 'V',
  ...TIMESTAMPS,
};

const CARAGA: Region = {
  id: 7,
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Karaga',
  acronym: 'XIII',
  ...TIMESTAMPS,
};

const CARAGA_PROVINCES: Province[] = [
  {
    id: 21,
    code: 'PH-AGN',
    name: 'Agusan del Norte',
    altName: null,
    nameTl: 'Hilagang Agusan',
    regionId: CARAGA.id,
    ...TIMESTAMPS,
  },
  {
    id: 22,
    code: 'PH-DIN',
    name: 'Dinagat Islands',
    altName: 'Dinagat',
    nameTl: 'Pulo ng Dinagat',
    regionId: CARAGA.id,
    ...TIMESTAMPS,
  },
];

/** Rows as the database would hand them back for `orderBy: { name: 'asc' }`. */
const REGIONS_BY_NAME = [BICOL, CARAGA];

describe('Regions (e2e)', () => {
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
          findMany: jest.fn().mockResolvedValue(REGIONS_BY_NAME),
          findUnique: jest.fn(({ where }: { where: { code: string } }) => {
            if (where.code === CARAGA.code) {
              return Promise.resolve({ ...CARAGA, provinces: CARAGA_PROVINCES });
            }
            if (where.code === BICOL.code) {
              return Promise.resolve({ ...BICOL, provinces: [] });
            }

            return Promise.resolve(null);
          }),
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

  describe('GET /api/v1/regions', () => {
    it('returns every region ordered by name, in the documented list shape', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual([
        { code: 'PH-05', name: 'Bicol Region', name_tl: 'Kabikulan', acronym: 'V' },
        { code: 'PH-13', name: 'Caraga', name_tl: 'Rehiyon ng Karaga', acronym: 'XIII' },
      ]);
    });

    it('omits provinces from list items and keeps ids, FKs and timestamps off the wire', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

      for (const region of response.body as object[]) {
        expect(Object.keys(region).sort()).toEqual(['acronym', 'code', 'name', 'name_tl']);
      }
    });
  });

  describe('GET /api/v1/regions/:code', () => {
    it('returns the region with nested provinces, matching the documented payload', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/regions/PH-13')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual({
        code: 'PH-13',
        name: 'Caraga',
        name_tl: 'Rehiyon ng Karaga',
        acronym: 'XIII',
        provinces: [
          { code: 'PH-AGN', name: 'Agusan del Norte', alt_name: null, name_tl: 'Hilagang Agusan' },
          {
            code: 'PH-DIN',
            name: 'Dinagat Islands',
            alt_name: 'Dinagat',
            name_tl: 'Pulo ng Dinagat',
          },
        ],
      });
    });

    it('serializes a province-less region as an empty array', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/PH-05').expect(200).expect({
        code: 'PH-05',
        name: 'Bicol Region',
        name_tl: 'Kabikulan',
        acronym: 'V',
        provinces: [],
      });
    });

    it('answers an unknown code with 404 problem+json — the legacy answered 200', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/regions/PH-99').expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "Region 'PH-99' was not found.",
        instance: '/api/v1/regions/PH-99',
      });
    });

    it('matches the code exactly — a lowercased code is a miss, not a redirect', async () => {
      await request(app.getHttpServer()).get('/api/v1/regions/ph-13').expect(404);
    });
  });
});
