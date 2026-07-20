import { Module } from '@nestjs/common';

import { ConfigModule } from '@/config/config.module';
import { HealthController } from '@/health.controller';

/**
 * Root module. Feature modules (persistence, geography, ingestion) are wired in
 * as they land; the global ConfigModule is loaded first so config is available
 * everywhere.
 */
@Module({
  imports: [ConfigModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
