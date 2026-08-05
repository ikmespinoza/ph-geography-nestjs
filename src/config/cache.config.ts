import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

export interface CacheConfig {
  /** Whether read responses are cached at all. */
  readonly enabled: boolean;
  /** Response time-to-live in **milliseconds** (cache-manager v6+ takes ms, not seconds). */
  readonly ttlMs: number;
}

/**
 * `cache` namespace — read-response caching (PHG-015). The dataset changes at most
 * once a day, on the ingestion cadence, so a short TTL plus explicit invalidation
 * after a run that actually wrote something keeps reads cheap without serving
 * anything meaningfully stale.
 */
export const cacheConfig = registerAs('cache', (): CacheConfig => {
  const env = validateEnv(process.env);

  return {
    enabled: env.CACHE_ENABLED,
    ttlMs: env.CACHE_TTL_MS,
  };
});
