import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { ChangeDetectionService } from '@/ingestion/change-detection/change-detection.service';
import { IngestionScheduler } from '@/ingestion/ingestion.scheduler';
import { IngestionService } from '@/ingestion/ingestion.service';
import { RunLock } from '@/ingestion/run-lock';
import { GEO_SOURCES } from '@/ingestion/scraper-core/geo-source';
import { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { Iso3166Source } from '@/ingestion/sources/iso3166/iso3166.source';
import { CityWriter } from '@/ingestion/writers/city.writer';
import { ProvinceWriter } from '@/ingestion/writers/province.writer';
import { RegionWriter } from '@/ingestion/writers/region.writer';

/**
 * The write side of the service. It reaches the database only through
 * `PrismaService` and serves no HTTP routes — `geography/` reads, `ingestion/`
 * writes, and that seam stays clean.
 *
 * `IngestionService` is exported so the `pnpm ingest` CLI can resolve it from an
 * application context. There is no ingestion controller: OD-12 deferred the
 * guarded `POST /ingestion/run` endpoint to the hardening work, and the legacy
 * `GET /test` scrape route is deliberately not ported (OD-13).
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    HttpFetcher,
    ChangeDetectionService,
    RegionWriter,
    ProvinceWriter,
    CityWriter,
    RunLock,
    Iso3166Source,
    IngestionService,
    IngestionScheduler,
    {
      provide: GEO_SOURCES,
      useFactory: (iso3166: Iso3166Source) => [iso3166],
      inject: [Iso3166Source],
    },
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
