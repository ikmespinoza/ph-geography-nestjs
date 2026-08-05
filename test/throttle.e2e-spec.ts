// Set before AppModule is imported — setup-env.ts disables throttling for every other
// suite, and the config namespaces read the environment at module-factory time. A tiny
// limit keeps the test fast and the intent obvious.
process.env.THROTTLE_ENABLED = 'true';
process.env.THROTTLE_TTL_MS = '60000';
process.env.THROTTLE_LIMIT = '5';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import type { Region } from '@/generated/prisma/client';
import { PrismaService } from '@/persistence/prisma.service';

/** OD-12 acceptance: the public surface is rate-limited, and health is exempt. */

const LIMIT = 5;

const CARAGA: Region = {
  id: 7,
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Karaga',
  acronym: 'XIII',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
        region: { findMany: jest.fn().mockResolvedValue([CARAGA]) },
        sourceSyncState: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('allows the configured number of requests, then answers 429 as problem+json', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
    }

    const blocked = await request(app.getHttpServer()).get('/api/v1/regions').expect(429);

    // The throttler throws a plain HttpException, so the global filter renders it in
    // the same RFC 7807 shape as every other failure — one error contract, not two.
    expect(blocked.headers['content-type']).toMatch(PROBLEM_JSON_CONTENT_TYPE);
    expect(blocked.body).toMatchObject({
      status: 429,
      title: 'Too Many Requests',
      instance: '/api/v1/regions',
    });
  });

  it('tells the caller how long to wait', async () => {
    const blocked = await request(app.getHttpServer()).get('/api/v1/regions').expect(429);

    expect(blocked.headers['retry-after']).toBeDefined();
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('leaves the health probes unthrottled however hard they are hit', async () => {
    // The geography route is already over its limit at this point; health must not be.
    for (let attempt = 0; attempt < LIMIT * 3; attempt += 1) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });
});

/**
 * The `THROTTLE_ENABLED=false` switch, which every other e2e suite depends on via
 * `setup-env.ts` — and which nothing would otherwise notice the loss of, since those
 * suites all stay comfortably under the default limit. A second app is booted with
 * the flag off so the config factory reads it fresh.
 */
describe('Rate limiting disabled (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.THROTTLE_ENABLED = 'false';

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
        region: { findMany: jest.fn().mockResolvedValue([CARAGA]) },
        sourceSyncState: { findMany: jest.fn().mockResolvedValue([]) },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env.THROTTLE_ENABLED = 'true';
  });

  it('serves well past the configured limit without a single 429', async () => {
    for (let attempt = 0; attempt < LIMIT * 4; attempt += 1) {
      await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
    }
  });
});
