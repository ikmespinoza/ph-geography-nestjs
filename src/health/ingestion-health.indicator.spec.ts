import { HealthIndicatorService } from '@nestjs/terminus';

import { IngestionHealthIndicator } from '@/health/ingestion-health.indicator';
import type { PrismaService } from '@/persistence/prisma.service';

const LAST_RUN = new Date('2026-08-01T03:00:12.000Z');
const LAST_SEEN = new Date('2026-07-30T11:22:33.000Z');

function createIndicator(findMany: jest.Mock): IngestionHealthIndicator {
  const prisma = { sourceSyncState: { findMany } } as unknown as PrismaService;

  return new IngestionHealthIndicator(new HealthIndicatorService(), prisma);
}

/** `down(message)` widens to the base result type, so read the extension member back. */
const messageOf = (result: object): string => (result as { message?: string }).message ?? '';

describe('IngestionHealthIndicator', () => {
  it('is down when the database has never been ingested', async () => {
    const indicator = createIndicator(jest.fn().mockResolvedValue([]));

    const result = await indicator.check();

    expect(result.ingestion.status).toBe('down');
    expect(messageOf(result.ingestion)).toContain('empty');
  });

  it('is up and reports each resource once the source has been processed', async () => {
    const indicator = createIndicator(
      jest.fn().mockResolvedValue([
        { source: 'ISO 3166', resource: 'city', lastRunAt: LAST_RUN, lastSeenAt: LAST_SEEN },
        { source: 'ISO 3166', resource: 'region', lastRunAt: LAST_RUN, lastSeenAt: LAST_SEEN },
      ]),
    );

    const result = await indicator.check();

    expect(result.ingestion).toEqual({
      status: 'up',
      resources: {
        'ISO 3166/city': {
          last_run_at: LAST_RUN.toISOString(),
          last_seen_at: LAST_SEEN.toISOString(),
        },
        'ISO 3166/region': {
          last_run_at: LAST_RUN.toISOString(),
          last_seen_at: LAST_SEEN.toISOString(),
        },
      },
    });
  });

  /**
   * The decisive case (D3). `markProcessed` advances `lastRunAt` only when a resource
   * is actually processed, so a run that correctly skips everything — because the
   * source page has not moved — leaves the timestamp where it was. On a stable dataset
   * that is weeks old and entirely healthy; failing readiness on it would pull a
   * working instance out of rotation for doing its job right.
   */
  it('stays up for an ancient timestamp — staleness is reported, never failed on', async () => {
    const ancient = new Date('2020-01-01T00:00:00.000Z');
    const indicator = createIndicator(
      jest
        .fn()
        .mockResolvedValue([
          { source: 'ISO 3166', resource: 'region', lastRunAt: ancient, lastSeenAt: ancient },
        ]),
    );

    const result = await indicator.check();

    expect(result.ingestion.status).toBe('up');
  });

  /**
   * Terminus rethrows anything that isn't a HealthCheckError, which would surface as a
   * 500. An unreachable database is precisely what readiness exists to answer with 503.
   */
  it('is down rather than throwing when the sync state cannot be read', async () => {
    const indicator = createIndicator(jest.fn().mockRejectedValue(new Error('connection refused')));

    const result = await indicator.check();

    expect(result.ingestion.status).toBe('down');
    expect(messageOf(result.ingestion)).toContain('sync state');
  });

  it('asks for a deterministic ordering so the payload is stable between probes', async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await createIndicator(findMany).check();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ source: 'asc' }, { resource: 'asc' }],
    });
  });
});
