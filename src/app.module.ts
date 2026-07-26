import { Module } from '@nestjs/common';

import { CommonModule } from '@/common/common.module';
import { ConfigModule } from '@/config/config.module';
import { HealthController } from '@/health.controller';
import { PersistenceModule } from '@/persistence/persistence.module';

/**
 * Root module. Feature modules (geography, ingestion) are wired in as they land;
 * the global ConfigModule loads first so config is available everywhere, then the
 * global PersistenceModule exposes the shared DB gateway and CommonModule installs
 * the HTTP layer (validation, serialization, problem+json errors) on every route.
 */
@Module({
  imports: [ConfigModule, PersistenceModule, CommonModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
