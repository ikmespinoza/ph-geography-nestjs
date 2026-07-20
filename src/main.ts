import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';
import type { AppConfig } from '@/config/app.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const { port, globalPrefix, apiVersion } = app.get(ConfigService).getOrThrow<AppConfig>('app');

  // Every route is served under /api/v1 — the global prefix + URI versioning are
  // set here so all later controllers inherit them without per-controller config.
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: apiVersion });
  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
