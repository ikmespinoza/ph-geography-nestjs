import { appConfig } from '@/config/app.config';
import { databaseConfig } from '@/config/database.config';
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
});
