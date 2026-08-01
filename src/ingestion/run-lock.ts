import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

import type { DatabaseConfig } from '@/config/database.config';

/**
 * Fixed application-wide key for the ingestion advisory lock. Arbitrary but
 * stable — every replica must pick the same number for the lock to mean anything.
 */
const RUN_LOCK_KEY = 914107202601;

/** Releases the lock. Closing the session drops it, so this cannot leak. */
export interface RunLockHandle {
  release(): Promise<void>;
}

/**
 * Single-runner safety for ingestion: only one process may hold the lock, so a
 * cron firing on several replicas — or a manual `pnpm ingest` racing the
 * schedule — cannot double-run.
 *
 * It deliberately opens its **own** `pg` connection instead of borrowing
 * `PrismaService`. `pg_try_advisory_lock` is session-scoped, and Prisma's driver
 * adapter runs each query on whatever pooled connection is free, so the lock and
 * its release could land on different sessions — the lock would be held by an
 * idle connection nobody can unlock. A dedicated client makes the session
 * explicit, and closing it releases the lock even if the process dies mid-run.
 */
@Injectable()
export class RunLock {
  private readonly logger = new Logger(RunLock.name);

  constructor(private readonly configService: ConfigService) {}

  /** Take the lock, or return `null` when another run already holds it. */
  async acquire(): Promise<RunLockHandle | null> {
    const { url } = this.configService.getOrThrow<DatabaseConfig>('database');
    const client = new Client({ connectionString: url });
    await client.connect();

    try {
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [RUN_LOCK_KEY],
      );

      if (result.rows[0]?.locked !== true) {
        await client.end();
        return null;
      }
    } catch (error) {
      await client.end();
      throw error;
    }

    return {
      release: async (): Promise<void> => {
        try {
          await client.end();
        } catch (error) {
          this.logger.warn(`Failed to close the ingestion lock connection: ${describe(error)}`);
        }
      },
    };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
