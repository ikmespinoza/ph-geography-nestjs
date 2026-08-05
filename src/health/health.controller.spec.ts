import type { HealthCheckService } from '@nestjs/terminus';

import type { DatabaseHealthIndicator } from '@/health/database-health.indicator';
import { HealthController } from '@/health/health.controller';
import type { IngestionHealthIndicator } from '@/health/ingestion-health.indicator';

/**
 * The composition of the two probes, pinned independently of `health.e2e-spec.ts`.
 *
 * The e2e proves the endpoints answer; this proves *what they check* — and the
 * liveness invariant in particular is a decision, not an implementation detail: a
 * liveness probe that touches the database turns a brief connectivity blip into a
 * container restart loop. That is the kind of regression a passing e2e would not
 * notice, because adding a database check to liveness still returns 200 whenever
 * the database happens to be up.
 */
describe('HealthController', () => {
  const check = jest.fn();
  const databaseCheck = jest.fn();
  const ingestionCheck = jest.fn();

  const build = (): HealthController =>
    new HealthController(
      { check } as unknown as HealthCheckService,
      { check: databaseCheck } as unknown as DatabaseHealthIndicator,
      { check: ingestionCheck } as unknown as IngestionHealthIndicator,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    check.mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });
  });

  describe('liveness', () => {
    it('checks nothing at all — no indicator, no I/O', async () => {
      await build().liveness();

      expect(check).toHaveBeenCalledWith([]);
      expect(databaseCheck).not.toHaveBeenCalled();
      expect(ingestionCheck).not.toHaveBeenCalled();
    });

    it('returns the Terminus result unchanged', async () => {
      const result = { status: 'ok', info: {}, error: {}, details: {} };
      check.mockResolvedValue(result);

      await expect(build().liveness()).resolves.toBe(result);
    });
  });

  describe('readiness', () => {
    it('checks exactly the database and ingestion indicators, in that order', async () => {
      await build().readiness();

      expect(check).toHaveBeenCalledTimes(1);
      const indicators = (check.mock.calls[0] as [Array<() => unknown>])[0];
      expect(indicators).toHaveLength(2);

      // Terminus is handed thunks, so nothing has run yet — invoking them is what
      // proves which indicator each one wraps.
      expect(databaseCheck).not.toHaveBeenCalled();
      expect(ingestionCheck).not.toHaveBeenCalled();

      indicators[0]?.();
      expect(databaseCheck).toHaveBeenCalledTimes(1);
      expect(ingestionCheck).not.toHaveBeenCalled();

      indicators[1]?.();
      expect(ingestionCheck).toHaveBeenCalledTimes(1);
    });

    it('returns the Terminus result unchanged, including a failing breakdown', async () => {
      // A 503 is rendered by HealthCheckFilter from the thrown result; the controller
      // itself must not reshape or swallow whatever Terminus produces.
      const result = {
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      };
      check.mockResolvedValue(result);

      await expect(build().readiness()).resolves.toBe(result);
    });

    it('lets a Terminus failure propagate — no catch to turn a 503 into a 200', async () => {
      const failure = new Error('Service Unavailable Exception');
      check.mockRejectedValue(failure);

      await expect(build().readiness()).rejects.toBe(failure);
    });
  });
});
