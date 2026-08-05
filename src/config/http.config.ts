import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

/** Levels `pino` accepts, widest to narrowest, plus its `silent` off-switch. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export interface HttpConfig {
  /** Whether the rate limiter is armed. */
  readonly throttleEnabled: boolean;
  /** Rate-limit window in **milliseconds** (`@nestjs/throttler` v5+ takes ms, not seconds). */
  readonly throttleTtlMs: number;
  /** Requests allowed per window, per client. */
  readonly throttleLimit: number;
  /** Allowed CORS origins, or `['*']`. */
  readonly corsOrigins: string[];
  /** Minimum level `pino` emits. */
  readonly logLevel: LogLevel;
}

/**
 * `http` namespace — the public-exposure knobs (OD-12) plus the log level. The API
 * stays unauthenticated by design (open read-only reference data), so hardening is
 * rate limiting and an explicit CORS policy rather than auth.
 */
export const httpConfig = registerAs('http', (): HttpConfig => {
  const env = validateEnv(process.env);

  return {
    throttleEnabled: env.THROTTLE_ENABLED,
    throttleTtlMs: env.THROTTLE_TTL_MS,
    throttleLimit: env.THROTTLE_LIMIT,
    corsOrigins: env.CORS_ORIGINS,
    logLevel: env.LOG_LEVEL,
  };
});
