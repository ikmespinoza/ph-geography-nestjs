import { Injectable, Logger } from '@nestjs/common';

import type { RegionRow, WriteCounts } from '@/ingestion/scraper-core/geo-source';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * Persists regions by their natural key, `code` (OD-10 — upsert, not the
 * legacy's insert-if-missing, so a renamed region or corrected acronym actually
 * propagates).
 *
 * The existing rows are read once and diffed in memory rather than upserted
 * blindly: it keeps the created/updated/unchanged counts honest, and makes a
 * re-run against an unchanged source cost exactly one SELECT and no writes —
 * which is what the idempotency test asserts.
 */
@Injectable()
export class RegionWriter {
  private readonly logger = new Logger(RegionWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(rows: readonly RegionRow[]): Promise<WriteCounts> {
    const existing = await this.prisma.region.findMany({
      select: { code: true, name: true, nameTl: true, acronym: true },
    });
    const byCode = new Map(existing.map((region) => [region.code, region]));

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const row of rows) {
      const current = byCode.get(row.code);

      if (current === undefined) {
        await this.prisma.region.create({ data: { ...row } });
        created++;
        continue;
      }

      if (
        current.name === row.name &&
        current.nameTl === row.nameTl &&
        current.acronym === row.acronym
      ) {
        unchanged++;
        continue;
      }

      await this.prisma.region.update({
        where: { code: row.code },
        data: { name: row.name, nameTl: row.nameTl, acronym: row.acronym },
      });
      updated++;
    }

    this.logger.log(`Regions: ${created} created, ${updated} updated, ${unchanged} unchanged`);
    return { created, updated, unchanged, rejected: 0 };
  }
}
