import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { appConfig } from '@/config/app.config';
import { cacheConfig } from '@/config/cache.config';
import { databaseConfig } from '@/config/database.config';
import { validateEnv } from '@/config/env.validation';
import { httpConfig } from '@/config/http.config';
import { ingestionConfig } from '@/config/ingestion.config';
import { sourcesConfig } from '@/config/sources.config';

/**
 * Global configuration module. Loads `.env`, validates the whole environment
 * once at boot (fail-fast via Zod), and exposes typed namespaces through
 * `ConfigService`. Being global, no other module re-imports it.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      load: [appConfig, cacheConfig, databaseConfig, httpConfig, ingestionConfig, sourcesConfig],
    }),
  ],
})
export class ConfigModule {}
