import { Module } from '@nestjs/common';

import { CommonModule } from '@/common/common.module';
import { ConfigModule } from '@/config/config.module';
import { GeographyModule } from '@/geography/geography.module';
import { HealthController } from '@/health.controller';
import { IngestionModule } from '@/ingestion/ingestion.module';
import { PersistenceModule } from '@/persistence/persistence.module';

/**
 * Root module. The global ConfigModule loads first so config is available
 * everywhere, then the global PersistenceModule exposes the shared DB gateway and
 * CommonModule installs the HTTP layer (validation, serialization, problem+json
 * errors) on every route. GeographyModule serves the read API; IngestionModule
 * owns the scheduled write side.
 */
@Module({
  imports: [ConfigModule, PersistenceModule, CommonModule, GeographyModule, IngestionModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
