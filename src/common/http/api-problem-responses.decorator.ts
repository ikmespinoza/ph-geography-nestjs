import { applyDecorators } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { ProblemDetailsDto } from '@/common/http/problem-details.dto';

/**
 * The failure responses every read endpoint can produce, documented once.
 *
 * Deliberately **not** a 422: no endpoint takes a request body or a query parameter —
 * every input is a path segment — so request validation cannot fail on any route, and
 * the global `ValidationPipe` would answer 400 rather than 422 if it ever could.
 * Documenting a response the service cannot emit is a lie the published spec would
 * carry forever.
 */
export const ApiProblemResponses = (): MethodDecorator =>
  applyDecorators(
    ApiTooManyRequestsResponse({
      description: 'Rate limit exceeded. Retry after the `Retry-After` header says.',
      type: ProblemDetailsDto,
    }),
    ApiInternalServerErrorResponse({
      description: 'Unexpected server error. No stack trace is ever returned.',
      type: ProblemDetailsDto,
    }),
  );

/** Adds the 404 the nested routes can produce when a path segment names nothing. */
export const ApiNotFoundProblem = (description: string): MethodDecorator =>
  ApiNotFoundResponse({ description, type: ProblemDetailsDto });
