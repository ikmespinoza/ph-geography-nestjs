import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-017 acceptance. The database is stubbed rather than real so both the healthy and
 * the unreachable path are reachable deterministically — the interesting assertions
 * are about the *unhealthy* responses, which a live database will not produce on demand.
 */

const SYNC_STATE = [
  {
    source: 'ISO 3166',
    resource: 'region',
    lastRunAt: new Date('2026-08-01T03:00:12.000Z'),
    lastSeenAt: new Date('2026-07-30T11:22:33.000Z'),
  },
];

type PrismaStub = {
  queryRawUnsafeFails: boolean;
  syncState: typeof SYNC_STATE;
};

describe('Health (e2e)', () => {
  let app: INestApplication;
  const stub: PrismaStub = { queryRawUnsafeFails: false, syncState: SYNC_STATE };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
        // Terminus' PrismaHealthIndicator tries the Mongo-only `$runCommandRaw` first
        // and falls back to `$queryRawUnsafe` on the provider-mismatch error, exactly
        // as the real Postgres client behaves.
        $runCommandRaw: jest
          .fn()
          .mockRejectedValue(
            new Error(
              'PrismaClientValidationError: The postgresql provider does not support $runCommandRaw. Use the mongodb provider.',
            ),
          ),
        $queryRawUnsafe: jest.fn(() =>
          stub.queryRawUnsafeFails
            ? Promise.reject(new Error('connection refused'))
            : Promise.resolve([{ '?column?': 1 }]),
        ),
        sourceSyncState: { findMany: jest.fn(() => Promise.resolve(stub.syncState)) },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  beforeEach(() => {
    stub.queryRawUnsafeFails = false;
    stub.syncState = SYNC_STATE;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health — liveness', () => {
    it('answers 200 without touching a dependency', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

      expect(response.body).toEqual({ status: 'ok', info: {}, error: {}, details: {} });
    });

    it('stays up even when the database is unreachable', async () => {
      stub.queryRawUnsafeFails = true;

      // A liveness probe wired to the database turns a brief connectivity blip into a
      // container restart loop. Readiness is the one that should react.
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });
  });

  describe('GET /api/v1/health/ready — readiness', () => {
    it('reports the database up and ingestion timestamps when healthy', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.info.database).toEqual({ status: 'up' });
      expect(response.body.info.ingestion).toEqual({
        status: 'up',
        resources: {
          'ISO 3166/region': {
            last_run_at: '2026-08-01T03:00:12.000Z',
            last_seen_at: '2026-07-30T11:22:33.000Z',
          },
        },
      });
    });

    /**
     * The reason `HealthCheckFilter` exists (D4). The global `ProblemDetailsFilter`
     * catches everything and would render a bare `"Service Unavailable"` problem
     * document, throwing away which indicator failed.
     */
    it('answers 503 with the indicator breakdown intact when the database is down', async () => {
      stub.queryRawUnsafeFails = true;

      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);

      expect(response.body.status).toBe('error');
      expect(response.body.error.database.status).toBe('down');
      expect(response.body).not.toHaveProperty('type');
      expect(response.body).not.toHaveProperty('detail');
      expect(response.headers['content-type']).not.toMatch(/problem\+json/);
    });

    it('is not ready before ingestion has ever populated the database', async () => {
      stub.syncState = [];

      const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
      const ingestion = response.body.error.ingestion as { status: string; message: string };

      expect(ingestion.status).toBe('down');
      expect(ingestion.message).toContain('empty');
      // The database itself is fine — the breakdown must say so.
      expect(response.body.info.database).toEqual({ status: 'up' });
    });

    it('stays ready when the last ingestion is ancient (D3 — staleness is data, not failure)', async () => {
      const ancient = new Date('2020-01-01T00:00:00.000Z');
      stub.syncState = [
        { source: 'ISO 3166', resource: 'region', lastRunAt: ancient, lastSeenAt: ancient },
      ];

      await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    });
  });

  it('exempts the probes from rate limiting', async () => {
    // A 10-second probe would otherwise spend the budget and start collecting 429s,
    // which an orchestrator reads as "unhealthy" — a self-inflicted restart loop.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });
});
