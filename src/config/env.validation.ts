import { z } from 'zod';

/**
 * Single source of truth for every environment variable the service reads.
 * Defaults live here so the namespaced config factories don't duplicate them.
 * `validateEnv` runs once at boot (wired as `@nestjs/config`'s `validate`) and
 * fails fast with a readable message — nothing else in the app touches
 * `process.env` directly.
 */
const httpUrl = z.url().refine((value) => /^https?:\/\//.test(value), {
  message: 'must be an http(s) URL',
});

/**
 * A `"true"`/`"false"` environment string as a real boolean. The default is applied
 * to the *string* before the transform runs, so the fallback goes through the same
 * enum check any explicit value does.
 */
const booleanFromString = (fallback: 'true' | 'false'): z.ZodType<boolean, string | undefined> =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  // Owned in detail by PHG-003; validated here so a bad/missing URL fails at boot.
  DATABASE_URL: z
    .url()
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'must be a PostgreSQL connection string (postgres:// or postgresql://)',
    }),

  INGESTION_SCHEDULE_CRON: z.string().min(1).default('0 3 * * *'),
  INGESTION_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  INGESTION_USER_AGENT: z
    .string()
    .min(1)
    .default('ph-geography-api/1.0 (+https://github.com/ikmespinoza/ph-geography-nestjs)'),
  INGESTION_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  INGESTION_RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(500),
  // The CLI (`pnpm ingest`) and the tests boot the same AppModule; this keeps the
  // cron from arming in those contexts without a second module graph.
  INGESTION_ENABLE_SCHEDULE: booleanFromString('true'),

  SOURCE_ISO3166_REGION_URL: httpUrl.default('https://en.wikipedia.org/wiki/ISO_3166-2:PH'),
  SOURCE_ISO3166_CITY_URL: httpUrl.default(
    'https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines',
  ),

  // The switch exists for two reasons: local debugging, and the e2e suites, which
  // re-request one URL with different stub data and would otherwise assert against
  // a cached first response.
  CACHE_ENABLED: booleanFromString('true'),
  // Milliseconds. cache-manager v6+ dropped the seconds-based TTL — a value read as
  // seconds here would expire 1000× too early.
  CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),

  THROTTLE_ENABLED: booleanFromString('true'),
  /** Milliseconds — `@nestjs/throttler` v5+ takes the window in ms, not seconds. */
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  // Comma-separated, or `*`. Public unauthenticated reference data sent without
  // credentials, so `*` is the correct default rather than a lazy one.
  CORS_ORIGINS: z
    .string()
    .default('*')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .refine((origins) => origins.length > 0, {
      message: 'must list at least one origin, or be "*"',
    }),

  // `silent` is pino's own "emit nothing" level — the test suites use it so their
  // output is the assertions rather than a request log.
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate the raw environment, throwing a readable aggregated error on failure
 * so boot exits non-zero with every offending variable listed at once.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(env)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
