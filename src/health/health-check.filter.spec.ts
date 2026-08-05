import { ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { HealthCheckFilter } from '@/health/health-check.filter';

/** The body Terminus throws with — note it carries no `message` key. */
const TERMINUS_RESULT = {
  status: 'error',
  info: { ingestion: { status: 'up' } },
  error: { database: { status: 'down', message: 'connection refused' } },
  details: {
    ingestion: { status: 'up' },
    database: { status: 'down', message: 'connection refused' },
  },
};

function createHost(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('HealthCheckFilter', () => {
  it('renders the indicator breakdown verbatim, at 503', () => {
    const { host, status, json } = createHost();

    new HealthCheckFilter().catch(new ServiceUnavailableException(TERMINUS_RESULT), host);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(TERMINUS_RESULT);
  });

  /**
   * The reason this filter exists. `ProblemDetailsFilter` looks for a `message` key,
   * finds none in a Terminus result, and falls back to the status phrase — so the
   * global filter would answer a bare `"Service Unavailable"` and discard exactly the
   * information the readiness endpoint is for.
   */
  it('keeps the failing indicator identifiable, which the global problem filter would not', () => {
    const { host, json } = createHost();

    new HealthCheckFilter().catch(new ServiceUnavailableException(TERMINUS_RESULT), host);

    const [body] = json.mock.calls[0] as [typeof TERMINUS_RESULT];
    expect(Object.keys(body.error)).toEqual(['database']);
    expect(body).not.toHaveProperty('type');
    expect(body).not.toHaveProperty('detail');
  });
});
