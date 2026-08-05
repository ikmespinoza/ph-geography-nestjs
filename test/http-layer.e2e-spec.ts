import { CacheModule } from '@nestjs/cache-manager';
import { Controller, Get, Logger, Module, Param, Query, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import request from 'supertest';

import { CommonModule } from '@/common/common.module';
import { PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';
import { ConfigModule } from '@/config/config.module';

/**
 * PHG-006 acceptance. A throwaway resource stands in for the domain controllers that
 * land in PHG-007–009, so the HTTP layer's contract is proven end-to-end without
 * shipping a sample route into the app.
 */

/** Mimics a Prisma row: internal id, FK and timestamps that must never reach the wire. */
const REGION_ROW = {
  id: 7,
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Caraga',
  altName: 'Region XIII',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

/** The exposure strategy PHG-007+ DTOs follow: class-level `@Exclude`, opt-in `@Expose`, snake_case on the wire. */
@Exclude()
class SampleRegionDto {
  @Expose()
  code!: string;

  @Expose()
  name!: string;

  @Expose({ name: 'name_tl' })
  nameTl!: string | null;

  @Expose({ name: 'alt_name' })
  altName!: string | null;

  constructor(row: typeof REGION_ROW) {
    Object.assign(this, row);
  }
}

class SampleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

@Controller('sample-regions')
class SampleRegionsController {
  @Get()
  list(@Query() query: SampleQueryDto): { limit_type: string } {
    return { limit_type: typeof query.limit };
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection terminated unexpectedly');
  }

  @Get(':code')
  findOne(@Param('code') code: string): SampleRegionDto {
    if (code !== REGION_ROW.code) {
      throw new ResourceNotFoundException('Region', code);
    }

    return new SampleRegionDto(REGION_ROW);
  }
}

/**
 * `CommonModule` grew two dependencies in M4 — the throttler reads `ConfigService`
 * and the cache interceptor needs `CACHE_MANAGER` — so the harness now supplies the
 * same two globals `AppModule` does. Caching is off here (`setup-env.ts`), which is
 * what this suite wants: it asserts the serializer's output, not the cache's.
 */
@Module({
  imports: [ConfigModule, CacheModule.register({ isGlobal: true }), CommonModule],
  controllers: [SampleRegionsController],
})
class SampleModule {}

describe('Common HTTP layer (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SampleModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirror the production bootstrap so routes resolve under /api/v1 in-test.
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('success responses', () => {
    it('returns a bare payload — no legacy { success, response, code, memory_usage } envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sample-regions/PH-13')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body).toEqual({
        code: 'PH-13',
        name: 'Caraga',
        name_tl: 'Rehiyon ng Caraga',
        alt_name: 'Region XIII',
      });
    });

    it('keeps ids, FKs and timestamps off the wire and names fields in snake_case', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sample-regions/PH-13')
        .expect(200);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'alt_name',
        'code',
        'name',
        'name_tl',
      ]);
      expect(response.body).not.toHaveProperty('id');
      expect(response.body).not.toHaveProperty('createdAt');
      expect(response.body).not.toHaveProperty('updatedAt');
      expect(response.body).not.toHaveProperty('nameTl');
    });

    it('leaves plain (non-DTO) payloads untouched by the serializer', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/sample-regions?limit=2')
        .expect(200)
        .expect({ limit_type: 'number' });
    });
  });

  describe('errors', () => {
    it('answers an unknown resource with 404 problem+json — the legacy answered 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sample-regions/PH-99')
        .expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: "Region 'PH-99' was not found.",
        instance: '/api/v1/sample-regions/PH-99',
      });
    });

    it('answers an unrouted path with the same problem shape', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toMatchObject({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        instance: '/api/v1/nope',
      });
    });

    it('rejects an invalid query param with 400 and lists the constraint messages', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sample-regions?limit=abc')
        .expect(400);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toMatchObject({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Request validation failed.',
        instance: '/api/v1/sample-regions?limit=abc',
      });
      expect((response.body as { errors: string[] }).errors).toEqual(
        expect.arrayContaining([expect.stringContaining('limit')]),
      );
    });

    it('rejects an undeclared query param (forbidNonWhitelisted)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/sample-regions?bogus=1')
        .expect(400);

      expect((response.body as { errors: string[] }).errors).toEqual([
        'property bogus should not exist',
      ]);
    });

    it('turns an unexpected handler error into a 500 problem with no stack or internals', async () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      const response = await request(app.getHttpServer())
        .get('/api/v1/sample-regions/boom')
        .expect(500);

      expect(response.headers['content-type']).toContain(PROBLEM_JSON_CONTENT_TYPE);
      expect(response.body).toEqual({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/api/v1/sample-regions/boom',
      });
      expect(response.text).not.toContain('connection terminated');
      expect(log).toHaveBeenCalled();

      log.mockRestore();
    });
  });
});
