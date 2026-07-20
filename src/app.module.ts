import { Module } from '@nestjs/common';

import { HealthController } from '@/health.controller';

/**
 * Root module. Feature modules (config, persistence, geography, ingestion) are
 * wired in as they land; for now it only mounts the temporary health ping.
 */
@Module({
  imports: [],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
