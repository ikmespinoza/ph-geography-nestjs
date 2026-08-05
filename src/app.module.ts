import { CacheModule } from '@nestjs/cache-manager';
import type { CacheModuleOptions } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CommonModule } from '@/common/common.module';
import type { CacheConfig } from '@/config/cache.config';
import { ConfigModule } from '@/config/config.module';
import { GeographyModule } from '@/geography/geography.module';
import { HealthModule } from '@/health/health.module';
import { IngestionModule } from '@/ingestion/ingestion.module';
import { LoggingModule } from '@/logging/logging.module';
import { PersistenceModule } from '@/persistence/persistence.module';

/**
 * Root module. The global ConfigModule loads first so config is available
 * everywhere, then LoggingModule installs the request logger, the global
 * PersistenceModule exposes the shared DB gateway, the global CacheModule backs the
 * read cache, and CommonModule installs the HTTP layer (throttling, caching,
 * validation, serialization, problem+json errors) on every route. GeographyModule
 * serves the read API, IngestionModule owns the scheduled write side, and
 * HealthModule answers the container's probes.
 */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PersistenceModule,
    CacheModule.registerAsync({
      // Global so both the HTTP interceptor in `common/` and the invalidation call at
      // the end of an ingestion run reach the same store without either module having
      // to import the other.
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): CacheModuleOptions => {
        const { ttlMs } = configService.getOrThrow<CacheConfig>('cache');

        // No `stores` — the default in-memory Keyv store. The service deploys as one
        // container and the whole dataset is a couple of MB, so a Redis hop would be
        // more moving parts than the problem has.
        return { ttl: ttlMs };
      },
    }),
    CommonModule,
    GeographyModule,
    IngestionModule,
    HealthModule,
  ],
  providers: [],
})
export class AppModule {}
