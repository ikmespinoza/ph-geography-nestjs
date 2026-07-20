import { registerAs } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';

export interface IngestionConfig {
  /** Cron expression driving the scheduled scrape (`@nestjs/schedule`). */
  readonly scheduleCron: string;
  /** Per-request fetch timeout in milliseconds. */
  readonly requestTimeoutMs: number;
  /** User-Agent sent by the scraper's HttpFetcher. */
  readonly userAgent: string;
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
  };
});
