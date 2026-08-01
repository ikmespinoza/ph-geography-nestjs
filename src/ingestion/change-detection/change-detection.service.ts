import { Injectable, Logger } from '@nestjs/common';

import type { ResourceKind } from '@/ingestion/scraper-core/geo-source';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * "Has the source moved since we last processed it?" (OD-9).
 *
 * Replaces `HistoryTrait::isModified`, which had three defects this fixes:
 * - it inserted the marker **before** the scrape ran, so a crash mid-scrape
 *   permanently skipped that resource. Here the marker advances only after the
 *   write succeeds ({@link markProcessed} is called by the orchestrator).
 * - it keyed rows on a PHP class name in a polymorphic `histories` table and
 *   compared with `whereDate(... '<=' ...)`, losing the time component.
 * - the city scraper never consulted it at all. Here the same guard covers all
 *   three resources.
 */
@Injectable()
export class ChangeDetectionService {
  private readonly logger = new Logger(ChangeDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Whether the resource needs processing. `force` short-circuits the check —
   * a manual re-ingest must work even when the marker is current.
   */
  async shouldProcess(
    source: string,
    resource: ResourceKind,
    sourceLastModified: Date,
    force: boolean,
  ): Promise<boolean> {
    if (force) {
      return true;
    }

    const state = await this.prisma.sourceSyncState.findUnique({
      where: { source_resource: { source, resource } },
    });

    if (state === null) {
      return true;
    }

    const changed = sourceLastModified.getTime() > state.lastSeenAt.getTime();
    if (!changed) {
      this.logger.log(
        `${source}/${resource}: source unchanged since ${state.lastSeenAt.toISOString()} — skipping`,
      );
    }
    return changed;
  }

  /** Advance the high-water mark. Called only after a successful write. */
  async markProcessed(
    source: string,
    resource: ResourceKind,
    sourceLastModified: Date,
  ): Promise<void> {
    const lastRunAt = new Date();

    await this.prisma.sourceSyncState.upsert({
      where: { source_resource: { source, resource } },
      update: { lastSeenAt: sourceLastModified, lastRunAt },
      create: { source, resource, lastSeenAt: sourceLastModified, lastRunAt },
    });
  }
}
