import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '@/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Every route is served under /api/v1 — the global prefix + URI versioning are
  // set here so all later controllers inherit them without per-controller config.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  // TODO: source the port from ConfigService once the config module exists.
  await app.listen(3000);
}

void bootstrap();
