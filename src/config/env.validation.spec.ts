import { validateEnv } from '@/config/env.validation';

/** A minimal env that satisfies the schema (only DATABASE_URL is required). */
const validBase = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('validateEnv', () => {
  it('accepts a minimal env and applies defaults', () => {
    const env = validateEnv({ ...validBase });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.INGESTION_SCHEDULE_CRON).toBe('0 3 * * *');
    expect(env.INGESTION_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(env.INGESTION_USER_AGENT).toContain('ph-geography-api');
    expect(env.SOURCE_ISO3166_REGION_URL).toBe('https://en.wikipedia.org/wiki/ISO_3166-2:PH');
    expect(env.SOURCE_ISO3166_CITY_URL).toContain('List_of_cities');
  });

  it('coerces numeric strings for PORT and timeout', () => {
    const env = validateEnv({
      ...validBase,
      PORT: '8080',
      INGESTION_REQUEST_TIMEOUT_MS: '30000',
    });

    expect(env.PORT).toBe(8080);
    expect(env.INGESTION_REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it('respects overrides for every namespace', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PORT: '80',
      DATABASE_URL: 'postgres://u:p@db:5432/app',
      INGESTION_SCHEDULE_CRON: '*/5 * * * *',
      INGESTION_USER_AGENT: 'custom-agent/2.0',
      SOURCE_ISO3166_REGION_URL: 'https://example.com/regions',
      SOURCE_ISO3166_CITY_URL: 'https://example.com/cities',
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(80);
    expect(env.DATABASE_URL).toBe('postgres://u:p@db:5432/app');
    expect(env.INGESTION_SCHEDULE_CRON).toBe('*/5 * * * *');
    expect(env.INGESTION_USER_AGENT).toBe('custom-agent/2.0');
  });

  it('fails fast when the required DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment configuration/);
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-PostgreSQL DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://u:p@localhost:3306/db' })).toThrow(
      /PostgreSQL connection string/,
    );
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validateEnv({ ...validBase, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...validBase, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects a source URL that is not http(s)', () => {
    expect(() =>
      validateEnv({
        ...validBase,
        SOURCE_ISO3166_REGION_URL: 'ftp://example.com/regions',
      }),
    ).toThrow(/http\(s\) URL/);
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() => validateEnv({ ...validBase, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('aggregates every offending variable into one message', () => {
    let message = '';
    try {
      validateEnv({ PORT: 'abc', DATABASE_URL: 'not-a-url' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('PORT');
    expect(message).toContain('DATABASE_URL');
  });
});
