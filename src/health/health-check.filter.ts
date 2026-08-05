import { Catch, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Keeps a failing health check's own payload instead of letting the global
 * `ProblemDetailsFilter` flatten it.
 *
 * Terminus signals failure by throwing `ServiceUnavailableException(result)`, where
 * the body is `{ status, info, error, details }` — and carries no `message` key. The
 * global filter looks for `message`, finds none, and renders a generic
 * `"Service Unavailable"` problem document, discarding *which* indicator failed:
 * precisely the information the endpoint exists to give.
 *
 * Route-scoped filters are selected ahead of global ones (Nest resolves them
 * `[...method, ...class, ...global]`), so applying this to the health controller is
 * enough. Health is an operational endpoint rather than part of the public REST
 * contract OD-2 governs, which is why it may opt out of `problem+json`.
 */
@Catch(ServiceUnavailableException)
export class HealthCheckFilter implements ExceptionFilter {
  catch(exception: ServiceUnavailableException, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(exception.getStatus())
      .json(exception.getResponse());
  }
}
