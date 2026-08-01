import { Injectable, Logger } from '@nestjs/common';

import { blankToNull } from '@/common/text/nullable.util';
import type { ProvinceRow, WriteCounts } from '@/ingestion/scraper-core/geo-source';
import { NCR_DISTRICTS, NCR_REGION_CODE } from '@/ingestion/sources/iso3166/ncr-districts';
import { PrismaService } from '@/persistence/prisma.service';

/**
 * Persists provinces by `code`, resolving each row's region.
 *
 * A province naming a region we don't have is **rejected and counted**, never
 * fatal — the legacy dropped those rows silently, so nothing ever showed that
 * data had gone missing.
 */
@Injectable()
export class ProvinceWriter {
  private readonly logger = new Logger(ProvinceWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(rows: readonly ProvinceRow[]): Promise<WriteCounts> {
    const regions = await this.prisma.region.findMany({ select: { id: true, code: true } });
    const regionIdByCode = new Map(regions.map((region) => [region.code, region.id]));

    const existing = await this.prisma.province.findMany({
      select: { code: true, name: true, altName: true, nameTl: true, regionId: true },
    });
    const byCode = new Map(existing.map((province) => [province.code, province]));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let rejected = 0;

    for (const row of rows) {
      const regionId = regionIdByCode.get(row.regionCode);
      if (regionId === undefined) {
        this.logger.warn(
          `Province ${row.code} (${row.name}) references unknown region ${row.regionCode} — skipped`,
        );
        rejected++;
        continue;
      }

      const altName = blankToNull(row.altName);
      const current = byCode.get(row.code);

      if (current === undefined) {
        await this.prisma.province.create({
          data: { code: row.code, name: row.name, altName, nameTl: row.nameTl, regionId },
        });
        created++;
        continue;
      }

      if (
        current.name === row.name &&
        current.altName === altName &&
        current.nameTl === row.nameTl &&
        current.regionId === regionId
      ) {
        unchanged++;
        continue;
      }

      await this.prisma.province.update({
        where: { code: row.code },
        data: { name: row.name, altName, nameTl: row.nameTl, regionId },
      });
      updated++;
    }

    this.logger.log(
      `Provinces: ${created} created, ${updated} updated, ${unchanged} unchanged, ${rejected} rejected`,
    );
    return { created, updated, unchanged, rejected };
  }

  /**
   * Create the four NCR district provinces (OD-7). They hang off the scraped
   * `PH-00` region, which is why this runs as an ingestion step between the
   * province and city stages rather than as a database seed — PHG-004 could not
   * seed a province whose non-null `region_id` did not exist yet.
   */
  async ensureNcrDistricts(): Promise<WriteCounts> {
    const region = await this.prisma.region.findUnique({
      where: { code: NCR_REGION_CODE },
      select: { id: true },
    });

    if (region === null) {
      this.logger.warn(
        `Region ${NCR_REGION_CODE} is not present — NCR districts were not created, so NCR cities will be rejected`,
      );
      return { created: 0, updated: 0, unchanged: 0, rejected: NCR_DISTRICTS.length };
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const district of NCR_DISTRICTS) {
      const current = await this.prisma.province.findUnique({
        where: { code: district.code },
        select: { name: true, altName: true, nameTl: true, regionId: true },
      });

      if (current === null) {
        await this.prisma.province.create({
          data: {
            code: district.code,
            name: district.name,
            altName: district.altName,
            nameTl: district.nameTl,
            regionId: region.id,
          },
        });
        created++;
        continue;
      }

      if (
        current.name === district.name &&
        current.altName === district.altName &&
        current.nameTl === district.nameTl &&
        current.regionId === region.id
      ) {
        unchanged++;
        continue;
      }

      await this.prisma.province.update({
        where: { code: district.code },
        data: {
          name: district.name,
          altName: district.altName,
          nameTl: district.nameTl,
          regionId: region.id,
        },
      });
      updated++;
    }

    this.logger.log(
      `NCR districts: ${created} created, ${updated} updated, ${unchanged} unchanged`,
    );
    return { created, updated, unchanged, rejected: 0 };
  }
}
