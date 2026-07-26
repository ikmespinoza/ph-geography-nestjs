import { NotFoundException } from '@nestjs/common';

/**
 * The one "X not found" services throw, so every miss reads the same on the wire.
 * Replaces the legacy `errorResponse('Region information not found.', 200)` — which
 * reported failure with HTTP 200 and never named the identifier that missed.
 * Rendered as a 404 problem document by `ProblemDetailsFilter`.
 */
export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, identifier: string) {
    super(`${resource} '${identifier}' was not found.`);
  }
}
