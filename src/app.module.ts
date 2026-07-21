import { Module } from '@nestjs/common';

import { ConfigModule } from '@/config/config.module';
import { HealthController } from '@/health.controller';
import { PersistenceModule } from '@/persistence/persistence.module';

/**
 * Root module. Feature modules (geography, ingestion) are wired in as they land;
 * the global ConfigModule loads first so config is available everywhere, then the
 * global PersistenceModule exposes the shared DB gateway.
 */
@Module({
  imports: [ConfigModule, PersistenceModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
