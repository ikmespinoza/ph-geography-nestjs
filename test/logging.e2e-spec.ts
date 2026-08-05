// pino must be able to emit for this suite; setup-env.ts silences it for the others.
process.env.LOG_LEVEL = 'info';

import { Writable } from 'node:stream';

import { VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Logger, PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';
import request from 'supertest';

import { AppModule } from '@/app.module';
import type { Region } from '@/generated/prisma/client';
import { REQUEST_ID_HEADER, buildLoggerParams } from '@/logging/logging.module';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * PHG-017 acceptance for logging.
 *
 * pino writes straight to a file descriptor, so patching `process.stdout.write` would
 * capture nothing and every assertion would pass vacuously. Instead the suite swaps in
 * a real in-memory destination stream through nestjs-pino's own params token, keeping
 * the production configuration (`buildLoggerParams`) exactly as it ships and asserting
 * on the lines an operator would actually receive.
 */

const CARAGA: Region = {
  id: 7,
  code: 'PH-13',
  name: 'Caraga',
  nameTl: 'Rehiyon ng Karaga',
  acronym: 'XIII',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

/** `pino-http`'s standard request serializer nests the correlation id at `req.id`. */
interface LogLine {
  level: number;
  msg?: string;
  responseTime?: number;
  req?: { id?: string; url?: string; headers?: Record<string, unknown> };
  res?: { statusCode?: number };
}

describe('Structured logging (e2e)', () => {
  let app: INestApplication;
  let captured: string[] = [];

  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      captured.push(chunk.toString());
      callback();
    },
  });

  const lines = (): LogLine[] =>
    captured
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line) as LogLine);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn().mockResolvedValue(undefined),
        onModuleDestroy: jest.fn().mockResolvedValue(undefined),
        region: { findMany: jest.fn().mockResolvedValue([CARAGA]) },
        sourceSyncState: { findMany: jest.fn().mockResolvedValue([]) },
      })
      // The shipped options, redirected to a stream this suite can read.
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useFactory({
        inject: [ConfigService],
        factory: (configService: ConfigService): Params => {
          const params = buildLoggerParams(configService);

          return { ...params, pinoHttp: [params.pinoHttp, sink] } as Params;
        },
      })
      .compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  beforeEach(() => {
    captured = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('emits machine-readable JSON, one line per completed request', async () => {
    await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

    const completed = lines().filter((line) => line.req?.url === '/api/v1/regions');

    expect(completed).toHaveLength(1);
    const [line] = completed;
    expect(line?.msg).toBe('request completed');
    expect(line?.res?.statusCode).toBe(200);
    expect(typeof line?.level).toBe('number');
    expect(typeof line?.responseTime).toBe('number');
    expect(typeof line?.req?.id).toBe('string');
  });

  it('assigns a correlation id and echoes it back to the caller', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/regions').expect(200);

    const id = response.headers[REQUEST_ID_HEADER];
    expect(id).toBeDefined();
    expect(lines().some((line) => line.req?.id === id)).toBe(true);
  });

  it("reuses the caller's own request id so a trace survives a proxy hop", async () => {
    const inbound = 'trace-from-the-edge-0001';

    const response = await request(app.getHttpServer())
      .get('/api/v1/regions')
      .set(REQUEST_ID_HEADER, inbound)
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toBe(inbound);
    expect(lines().some((line) => line.req?.id === inbound)).toBe(true);
  });

  it('redacts credential headers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/regions')
      .set('Authorization', 'Bearer super-secret-token')
      .set('Cookie', 'session=super-secret-session')
      .expect(200);

    const serialized = captured.join('');
    // Guard against a vacuous pass: something must have been logged at all.
    expect(lines().length).toBeGreaterThan(0);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('super-secret-session');
    expect(serialized).toContain('[redacted]');
  });

  it('does not auto-log the health probes', async () => {
    // A 10-second liveness probe is ~8,600 lines a day that would bury real traffic.
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(lines().some((line) => line.req?.url?.startsWith('/api/v1/health'))).toBe(false);

    // ...but a normal request on the same app still is, so the filter is selective
    // rather than the logger being silent.
    await request(app.getHttpServer()).get('/api/v1/regions').expect(200);
    expect(lines().some((line) => line.req?.url === '/api/v1/regions')).toBe(true);
  });
});
