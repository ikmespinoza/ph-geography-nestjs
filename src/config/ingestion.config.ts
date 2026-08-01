import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

export interface IngestionConfig {
  /** Cron expression driving the scheduled scrape (`@nestjs/schedule`). */
  readonly scheduleCron: string;
  /** Per-request fetch timeout in milliseconds. */
  readonly requestTimeoutMs: number;
  /** User-Agent sent by the scraper's HttpFetcher. */
  readonly userAgent: string;
  /** Retry attempts after the first failed fetch (0 disables retrying). */
  readonly maxRetries: number;
  /** Base backoff between fetch attempts, doubled per attempt. */
  readonly retryBackoffMs: number;
  /** Whether the `@Cron` scheduled run is armed in this process. */
  readonly enableSchedule: boolean;
}

/**
 * `ingestion` namespace — scrape scheduling + outbound HTTP knobs. Consumed by
 * the ingestion pipeline (PHG-011+).
 */
export const ingestionConfig = registerAs('ingestion', (): IngestionConfig => {
  const env = validateEnv(process.env);

  return {
    scheduleCron: env.INGESTION_SCHEDULE_CRON,
    requestTimeoutMs: env.INGESTION_REQUEST_TIMEOUT_MS,
    userAgent: env.INGESTION_USER_AGENT,
    maxRetries: env.INGESTION_MAX_RETRIES,
    retryBackoffMs: env.INGESTION_RETRY_BACKOFF_MS,
    enableSchedule: env.INGESTION_ENABLE_SCHEDULE,
  };
});
