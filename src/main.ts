import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from '@/app.module';
import type { AppConfig } from '@/config/app.config';
import type { HttpConfig } from '@/config/http.config';
import { OPENAPI_PATH, openApiConfig } from '@/config/openapi';

async function bootstrap(): Promise<void> {
  // Buffer until the pino logger exists, so boot-time messages are structured too
  // rather than being split across two logger implementations.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const { port, globalPrefix, apiVersion } = configService.getOrThrow<AppConfig>('app');
  const { corsOrigins } = configService.getOrThrow<HttpConfig>('http');

  // Every route is served under /api/v1 — the global prefix + URI versioning are
  // set here so all later controllers inherit them without per-controller config.
  app.setGlobalPrefix(globalPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: apiVersion });

  // Open reference data, read-only, sent without credentials — so `*` is a correct
  // default rather than a lax one, and GET is genuinely the whole API (OD-12).
  app.enableCors({
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET'],
    maxAge: 86_400,
  });

  // Mounted outside the versioned prefix: `/api/docs` for the UI, `/api/docs-json`
  // and `/api/docs-yaml` for the raw spec (both defaults of `<path>-json|yaml`).
  SwaggerModule.setup(OPENAPI_PATH, app, () => SwaggerModule.createDocument(app, openApiConfig));

  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
