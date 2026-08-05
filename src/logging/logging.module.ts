import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Params } from 'nestjs-pino';

import type { AppConfig } from '@/config/app.config';
import { HEALTH_PATH_PREFIX } from '@/config/constants';
import type { HttpConfig } from '@/config/http.config';

/** Correlation-id header, read from the caller when present and always echoed back. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Every request and every `Logger` call becomes one structured JSON line.
 *
 * `@nestjs/common`'s `Logger` proxies to whatever `app.useLogger()` installs, so the
 * existing `new Logger(X)` call sites throughout the app start emitting through pino
 * without a single edit — `main.ts` and `ingest.ts` do the installing.
 */
export function buildLoggerParams(configService: ConfigService): Params {
  const { logLevel } = configService.getOrThrow<HttpConfig>('http');
  const { nodeEnv } = configService.getOrThrow<AppConfig>('app');

  return {
    pinoHttp: {
      level: logLevel,

      // Reuse an inbound correlation id so a trace survives a proxy hop, and always
      // echo it back — a caller reporting a problem can then quote the exact request.
      genReqId: (request: IncomingMessage, response: ServerResponse): string => {
        const inbound = request.headers[REQUEST_ID_HEADER];
        const id = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
        response.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },

      // A liveness probe on a 10-second period is ~8,600 lines a day of noise that
      // would bury every real request. Health still logs when it *errors*.
      autoLogging: {
        ignore: (request: IncomingMessage): boolean =>
          (request.url ?? '').startsWith(HEALTH_PATH_PREFIX),
      },

      // The API takes no credentials today. Redacting anyway is the cheapest moment
      // to satisfy "no secrets in logs" — before there are any to leak.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },

      // `pino-pretty` is a devDependency, so this must stay conditional: a production
      // image installs no dev dependencies and would crash at boot on a missing module.
      transport:
        nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
            }
          : undefined,
    },
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildLoggerParams,
    }),
  ],
})
export class LoggingModule {}
