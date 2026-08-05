import { ClassSerializerInterceptor, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

import { HttpCacheInterceptor } from '@/common/cache/http-cache.interceptor';
import { ProblemDetailsFilter } from '@/common/http/problem-details.filter';
import type { HttpConfig } from '@/config/http.config';

/**
 * The cross-cutting HTTP layer every route inherits (PHG-006, extended by M4): rate
 * limiting at the door, cached responses, DTOs validated on the way in, DTOs
 * serialized on the way out, RFC 7807 problem+json when something fails.
 *
 * Registered as APP_* providers rather than `app.useGlobalX()` in main.ts so a testing
 * module that imports this module boots the exact same stack as production.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ThrottlerModuleOptions => {
        const { throttleEnabled, throttleTtlMs, throttleLimit } =
          configService.getOrThrow<HttpConfig>('http');

        return {
          throttlers: [{ ttl: throttleTtlMs, limit: throttleLimit }],
          // Disabling via `skipIf` rather than by omitting the guard keeps the module
          // graph identical in every environment — the e2e suites fire requests in
          // tight loops and would otherwise start collecting 429s.
          skipIf: () => !throttleEnabled,
        };
      },
    }),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        // Strip anything the DTO doesn't declare, then reject the request outright if
        // the caller sent it — a typo'd query param is a 400, not a silent no-op.
        whitelist: true,
        forbidNonWhitelisted: true,
        // Turn plain query/param strings into DTO instances so `@Type`/`@Transform` apply.
        transform: true,
      }),
    },
    // Rate limiting runs before anything else does work. `@SkipThrottle()` exempts the
    // health probes (OD-12).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // ── Interceptor order is load-bearing ──────────────────────────────────────────
    // Nest runs global interceptors in declaration order, outermost first. The cache
    // must therefore be declared BEFORE the serializer so it stores the finished wire
    // payload, not the DTO instance. Reversing these two silently changes what a
    // cached response looks like the moment a serializing store is introduced; the
    // "cached body is still snake_case" case in cache.e2e-spec.ts pins it.
    { provide: APP_INTERCEPTOR, useClass: HttpCacheInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class CommonModule {}
