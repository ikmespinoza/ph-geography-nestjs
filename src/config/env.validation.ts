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
  INGESTION_ENABLE_SCHEDULE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  SOURCE_ISO3166_REGION_URL: httpUrl.default('https://en.wikipedia.org/wiki/ISO_3166-2:PH'),
  SOURCE_ISO3166_CITY_URL: httpUrl.default(
    'https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines',
  ),
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
