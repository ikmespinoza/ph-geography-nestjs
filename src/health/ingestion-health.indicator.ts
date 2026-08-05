import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';

import { PrismaService } from '@/persistence/prisma.service';

const NEVER_INGESTED = 'no ingestion run has completed — the geography tree is empty';
const UNREADABLE = 'could not read the ingestion sync state';

/** What a caller sees per (source, resource) on a healthy readiness check. */
interface ResourceFreshness {
  readonly last_run_at: string;
  readonly last_seen_at: string;
}

/**
 * Readiness signal for the write side: has this database ever been populated?
 *
 * It reads `SourceSyncState` rather than the in-memory `RunReport`, which dies with
 * the process — an instance restarted hours after the nightly scrape would otherwise
 * report "never ingested" over a perfectly good dataset.
 *
 * **Staleness is reported, not failed on.** `ChangeDetectionService.markProcessed`
 * advances `lastRunAt` only when a resource is actually *processed*, so a run that
 * correctly skips everything because the source page hasn't moved leaves the
 * timestamp untouched. On a stable dataset it can legitimately be weeks old while
 * the service is entirely healthy, so failing readiness on an age threshold would
 * take a working instance out of rotation for doing its job right. The one state
 * that genuinely means "not ready" is having no rows at all.
 */
@Injectable()
export class IngestionHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async check(): Promise<HealthIndicatorResult<'ingestion'>> {
    const session = this.healthIndicatorService.check('ingestion');

    // A raw throw here would escape Terminus (it only swallows HealthCheckErrors)
    // and surface as a 500 — but an unreachable database is exactly the case
    // readiness exists to answer with a 503.
    let states;
    try {
      states = await this.prisma.sourceSyncState.findMany({
        orderBy: [{ source: 'asc' }, { resource: 'asc' }],
      });
    } catch {
      return session.down(UNREADABLE);
    }

    if (states.length === 0) {
      return session.down(NEVER_INGESTED);
    }

    const resources: Record<string, ResourceFreshness> = {};
    for (const state of states) {
      resources[`${state.source}/${state.resource}`] = {
        last_run_at: state.lastRunAt.toISOString(),
        last_seen_at: state.lastSeenAt.toISOString(),
      };
    }

    return session.up({ resources });
  }
}
