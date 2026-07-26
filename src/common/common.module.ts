import { ClassSerializerInterceptor, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { ProblemDetailsFilter } from '@/common/http/problem-details.filter';

/**
 * The cross-cutting HTTP layer every route inherits (PHG-006): DTOs validated on the
 * way in, DTOs serialized on the way out, RFC 7807 problem+json when something fails.
 *
 * Registered as APP_* providers rather than `app.useGlobalX()` in main.ts so a testing
 * module that imports this module boots the exact same stack as production.
 */
@Module({
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
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class CommonModule {}
