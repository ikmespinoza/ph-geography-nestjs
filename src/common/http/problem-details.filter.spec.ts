import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { PROBLEM_JSON_CONTENT_TYPE } from '@/common/http/problem-details';
import type { ProblemDetails } from '@/common/http/problem-details';
import { ProblemDetailsFilter } from '@/common/http/problem-details.filter';
import { ResourceNotFoundException } from '@/common/http/resource-not-found.exception';

const INSTANCE = '/api/v1/regions/PH-99';

describe('ProblemDetailsFilter', () => {
  let filter: ProblemDetailsFilter;
  let json: jest.Mock;
  let type: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new ProblemDetailsFilter();

    json = jest.fn();
    type = jest.fn().mockImplementation(() => ({ json }));
    status = jest.fn().mockImplementation(() => ({ type }));

    host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: INSTANCE }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
  });

  /** The single problem document the filter wrote for this request. */
  const captured = (): ProblemDetails => json.mock.calls[0]?.[0] as ProblemDetails;

  it('answers a not-found with a 404 problem document, not a 200 envelope', () => {
    filter.catch(new ResourceNotFoundException('Region', 'PH-99'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(type).toHaveBeenCalledWith(PROBLEM_JSON_CONTENT_TYPE);
    expect(captured()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: "Region 'PH-99' was not found.",
      instance: INSTANCE,
    });
  });

  it('collects ValidationPipe messages into the `errors` extension member', () => {
    filter.catch(new BadRequestException(['limit must be an integer number']), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(captured()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Request validation failed.',
      instance: INSTANCE,
      errors: ['limit must be an integer number'],
    });
  });

  it('omits `errors` when the exception carries a plain message', () => {
    filter.catch(new NotFoundException(), host);

    expect(captured()).not.toHaveProperty('errors');
    expect(captured().detail).toBe('Not Found');
  });

  it('falls back to the status phrase when the exception body has no message', () => {
    filter.catch(new HttpException({ reason: 'opaque' }, HttpStatus.CONFLICT), host);

    expect(captured()).toMatchObject({ title: 'Conflict', status: 409, detail: 'Conflict' });
  });

  it('uses a string exception body as the detail', () => {
    filter.catch(new HttpException('Teapot refused to brew', HttpStatus.I_AM_A_TEAPOT), host);

    expect(captured().detail).toBe('Teapot refused to brew');
  });

  it('renders an unexpected error as a 500 and keeps the stack server-side', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const boom = new Error('connection terminated unexpectedly');

    filter.catch(boom, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: INSTANCE,
    });
    expect(JSON.stringify(captured())).not.toContain('connection terminated');
    expect(log).toHaveBeenCalledWith(expect.any(String), boom.stack);

    log.mockRestore();
  });

  it('logs a serialized value when a non-Error is thrown', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    filter.catch({ code: 'P2024' }, host);

    expect(captured().status).toBe(500);
    expect(log).toHaveBeenCalledWith(expect.any(String), "{ code: 'P2024' }");

    log.mockRestore();
  });

  it('survives a circular non-Error payload instead of throwing out of the filter', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const circular: Record<string, unknown> = { code: 'P2024' };
    circular.self = circular;

    // A throw escaping here would reach Express's default handler, which answers
    // with the stack outside production — the leak this filter exists to prevent.
    expect(() => filter.catch(circular, host)).not.toThrow();
    expect(captured().status).toBe(500);
    expect(log).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('[Circular'));

    log.mockRestore();
  });
});
