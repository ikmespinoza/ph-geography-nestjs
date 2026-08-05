import { appConfig } from '@/config/app.config';
import { cacheConfig } from '@/config/cache.config';
import { databaseConfig } from '@/config/database.config';
import { httpConfig } from '@/config/http.config';
import { ingestionConfig } from '@/config/ingestion.config';
import { sourcesConfig } from '@/config/sources.config';

const originalEnv = process.env;

describe('config namespaces', () => {
  beforeEach(() => {
    process.env = {
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      INGESTION_SCHEDULE_CRON: '0 6 * * *',
      INGESTION_REQUEST_TIMEOUT_MS: '9000',
      INGESTION_USER_AGENT: 'agent/1.0',
      INGESTION_MAX_RETRIES: '4',
      INGESTION_RETRY_BACKOFF_MS: '250',
      INGESTION_ENABLE_SCHEDULE: 'false',
      SOURCE_ISO3166_REGION_URL: 'https://example.com/regions',
      SOURCE_ISO3166_CITY_URL: 'https://example.com/cities',
      CACHE_ENABLED: 'true',
      CACHE_TTL_MS: '30000',
      THROTTLE_ENABLED: 'true',
      THROTTLE_TTL_MS: '15000',
      THROTTLE_LIMIT: '42',
      CORS_ORIGINS: 'https://a.test, https://b.test',
      LOG_LEVEL: 'warn',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('app namespace maps env + fixed contract values', () => {
    expect(appConfig()).toEqual({
      port: 4000,
      nodeEnv: 'test',
      globalPrefix: 'api',
      apiVersion: '1',
    });
  });

  it('database namespace exposes the connection url', () => {
    expect(databaseConfig()).toEqual({
      url: 'postgresql://u:p@localhost:5432/db',
    });
  });

  it('ingestion namespace maps scrape knobs', () => {
    expect(ingestionConfig()).toEqual({
      scheduleCron: '0 6 * * *',
      requestTimeoutMs: 9000,
      userAgent: 'agent/1.0',
      maxRetries: 4,
      retryBackoffMs: 250,
      enableSchedule: false,
    });
  });

  it('coerces the schedule flag to a boolean and defaults the retry knobs', () => {
    delete process.env.INGESTION_MAX_RETRIES;
    delete process.env.INGESTION_RETRY_BACKOFF_MS;
    delete process.env.INGESTION_ENABLE_SCHEDULE;

    expect(ingestionConfig()).toMatchObject({
      maxRetries: 2,
      retryBackoffMs: 500,
      enableSchedule: true,
    });
  });

  it('sources namespace nests the iso3166 urls', () => {
    expect(sourcesConfig()).toEqual({
      iso3166: {
        name: 'ISO 3166',
        regionUrl: 'https://example.com/regions',
        cityUrl: 'https://example.com/cities',
      },
    });
  });

  it('cache namespace maps the switch and the millisecond TTL', () => {
    expect(cacheConfig()).toEqual({ enabled: true, ttlMs: 30_000 });
  });

  it('http namespace maps the hardening knobs and splits the CORS list', () => {
    expect(httpConfig()).toEqual({
      throttleEnabled: true,
      throttleTtlMs: 15_000,
      throttleLimit: 42,
      corsOrigins: ['https://a.test', 'https://b.test'],
      logLevel: 'warn',
    });
  });

  it('defaults the M4 knobs to caching on, throttling on, open CORS and info logging', () => {
    delete process.env.CACHE_ENABLED;
    delete process.env.CACHE_TTL_MS;
    delete process.env.THROTTLE_ENABLED;
    delete process.env.THROTTLE_TTL_MS;
    delete process.env.THROTTLE_LIMIT;
    delete process.env.CORS_ORIGINS;
    delete process.env.LOG_LEVEL;

    // Both TTLs are milliseconds — cache-manager v6+ and throttler v5+ dropped the
    // seconds-based values, and a 60 read as seconds would expire 1000x too early.
    expect(cacheConfig()).toEqual({ enabled: true, ttlMs: 60_000 });
    expect(httpConfig()).toEqual({
      throttleEnabled: true,
      throttleTtlMs: 60_000,
      throttleLimit: 120,
      corsOrigins: ['*'],
      logLevel: 'info',
    });
  });

  it('trims and drops empty entries from a ragged CORS list', () => {
    process.env.CORS_ORIGINS = ' https://a.test ,, https://b.test ,';

    expect(httpConfig().corsOrigins).toEqual(['https://a.test', 'https://b.test']);
  });
});
