import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from '@/health/database-health.indicator';
import { HealthController } from '@/health/health.controller';
import { IngestionHealthIndicator } from '@/health/ingestion-health.indicator';

/**
 * Liveness and readiness probes (PHG-017), replacing the placeholder controller the
 * scaffold shipped.
 *
 * It reads `SourceSyncState` directly through the global `PrismaService` rather than
 * importing `IngestionModule`: a health check is an operational read, not the write
 * pipeline, and depending on the write module for one table would couple the probe
 * to the scraper's lifecycle for nothing.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, IngestionHealthIndicator],
})
export class HealthModule {}
