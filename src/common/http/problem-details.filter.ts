import { STATUS_CODES } from 'node:http';
import { inspect } from 'node:util';

import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { DEFAULT_PROBLEM_TYPE, PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import type { ProblemDetails } from '@/common/http/problem-details';

const UNEXPECTED_ERROR_DETAIL = 'An unexpected error occurred.';
const VALIDATION_FAILED_DETAIL = 'Request validation failed.';
const UNKNOWN_STATUS_TITLE = 'Error';

/** The body Nest puts in `HttpException.getResponse()`; `message` is an array for validation failures. */
interface NestExceptionBody {
  message?: string | string[];
}

/**
 * Renders every exception as an RFC 7807 `application/problem+json` document (OD-2).
 * Catches everything, not just `HttpException`, so an unexpected failure still leaves as a
 * well-formed 500 problem — with the stack logged server-side and never sent to the client.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const problem = this.toProblemDetails(exception, ctx.getRequest<Request>().originalUrl);

    ctx
      .getResponse<Response>()
      .status(problem.status)
      .type(PROBLEM_JSON_CONTENT_TYPE)
      .json(problem);
  }

  private toProblemDetails(exception: unknown, instance: string): ProblemDetails {
    if (!(exception instanceof HttpException)) {
      // `inspect` rather than `JSON.stringify`: this is the last line of defence, and a
      // circular non-Error throw would make the stringify blow up *inside* the filter —
      // handing the request to Express's default handler, which answers with the stack.
      this.logger.error(
        'Unhandled exception escaped to the HTTP layer',
        exception instanceof Error ? exception.stack : inspect(exception),
      );

      return buildProblem(HttpStatus.INTERNAL_SERVER_ERROR, instance, UNEXPECTED_ERROR_DETAIL);
    }

    const { detail, errors } = describe(exception.getResponse());

    return buildProblem(exception.getStatus(), instance, detail, errors);
  }
}

/** Pulls the human-readable detail — and validation messages, when present — out of a Nest exception body. */
function describe(body: string | object): { detail?: string; errors?: string[] } {
  if (typeof body === 'string') {
    return { detail: body };
  }

  const { message } = body as NestExceptionBody;

  if (Array.isArray(message)) {
    return { detail: VALIDATION_FAILED_DETAIL, errors: message };
  }

  return typeof message === 'string' ? { detail: message } : {};
}

function buildProblem(
  status: number,
  instance: string,
  detail?: string,
  errors?: string[],
): ProblemDetails {
  const title = STATUS_CODES[status] ?? UNKNOWN_STATUS_TITLE;
  const problem: ProblemDetails = {
    type: DEFAULT_PROBLEM_TYPE,
    title,
    status,
    detail: detail ?? title,
    instance,
  };

  return errors ? { ...problem, errors } : problem;
}
