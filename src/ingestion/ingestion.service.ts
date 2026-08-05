import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { ChangeDetectionService } from '@/ingestion/change-detection/change-detection.service';
import { parseLastModified } from '@/ingestion/change-detection/last-modified.parser';
import { GEO_SOURCES } from '@/ingestion/scraper-core/geo-source';
import type {
  GeoSource,
  ParseResult,
  ResourceKind,
  ResourceReport,
  RunReport,
  WriteCounts,
} from '@/ingestion/scraper-core/geo-source';
import { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { loadDocument } from '@/ingestion/scraper-core/html-parser';
import { RunLock } from '@/ingestion/run-lock';
import { CityWriter } from '@/ingestion/writers/city.writer';
import { ProvinceWriter } from '@/ingestion/writers/province.writer';
import { RegionWriter } from '@/ingestion/writers/region.writer';

export interface RunOptions {
  /** Ignore change detection and re-process every resource. */
  readonly force?: boolean;
}

const NO_COUNTS: WriteCounts = { created: 0, updated: 0, unchanged: 0, rejected: 0 };

/**
 * The "self-updating" pipeline (PHG-014). Runs each source's resources in
 * dependency order — regions, then provinces (plus the NCR district provinces),
 * then cities — because each stage resolves foreign keys written by the one
 * before it. A failing stage stops the rest of that source's run, as the legacy
 * sequencing did, but reports why instead of returning a bare `false`.
 *
 * The legacy equivalent lived in a database seeder and a throwaway `GET /test`
 * route (OD-13, deliberately not ported).
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly fetcher: HttpFetcher,
    private readonly changeDetection: ChangeDetectionService,
    private readonly regionWriter: RegionWriter,
    private readonly provinceWriter: ProvinceWriter,
    private readonly cityWriter: CityWriter,
    private readonly runLock: RunLock,
    @Inject(GEO_SOURCES) private readonly sources: readonly GeoSource[],
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** Run every configured source once. Never throws — failures land in the report. */
  async run(options: RunOptions = {}): Promise<RunReport> {
    const force = options.force ?? false;
    const startedAt = new Date();
    const started = Date.now();

    const lock = await this.runLock.acquire();
    if (lock === null) {
      this.logger.warn('Another ingestion run holds the lock — skipping this run');
      return {
        source: this.sources.map((source) => source.name).join(', '),
        force,
        startedAt,
        durationMs: Date.now() - started,
        ok: true,
        resources: [],
        detail: 'another ingestion run is already in progress',
      };
    }

    try {
      const resources: ResourceReport[] = [];
      for (const source of this.sources) {
        resources.push(...(await this.runSource(source, force)));
      }

      const ok = resources.every((resource) => resource.status !== 'failed');
      const report: RunReport = {
        source: this.sources.map((source) => source.name).join(', '),
        force,
        startedAt,
        durationMs: Date.now() - started,
        ok,
        resources,
      };

      this.logger.log(
        `Ingestion ${ok ? 'completed' : 'FAILED'} in ${report.durationMs}ms: ${summarize(resources)}`,
      );
      await this.invalidateReadCache(resources);
      return report;
    } finally {
      await lock.release();
    }
  }

  /**
   * Drop the read cache so the new data is served immediately (PHG-015).
   *
   * Guarded on something having actually changed: the nightly run is normally a
   * no-op — a forced re-run of the real dataset reports 0 created, 0 updated — and
   * flushing a warm cache every night for nothing is a self-inflicted latency spike.
   *
   * This is the one place the write side touches a read-side concern. It stays on the
   * right side of the seam: `ingestion/` still never *serves* a read, it only tells a
   * cross-cutting cache that what it holds is stale. A failure here must not fail the
   * run — the data is written, and the worst case is one TTL of staleness.
   */
  private async invalidateReadCache(resources: readonly ResourceReport[]): Promise<void> {
    const changed = resources.reduce(
      (total, resource) => total + resource.created + resource.updated,
      0,
    );

    if (changed === 0) {
      return;
    }

    try {
      await this.cache.clear();
      this.logger.log(`Read cache invalidated after ${changed} created/updated rows`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate the read cache: ${describe(error)}`);
    }
  }

  private async runSource(source: GeoSource, force: boolean): Promise<ResourceReport[]> {
    const reports: ResourceReport[] = [];

    // Regions and provinces share one page — fetched once, unlike the legacy,
    // which fetched and re-parsed the same URL for each scraper.
    let regionHtml: string;
    let regionLastModified: Date;
    try {
      regionHtml = await this.fetcher.fetchHtml(source.urlFor('region'));
      regionLastModified = parseLastModified(loadDocument(regionHtml), source.urlFor('region'));
    } catch (error) {
      return [failed('region', error), failed('province', error), failed('city', error)];
    }

    const regionReport = await this.stage('region', source, regionLastModified, force, () => {
      const parsed = source.parseRegions(regionHtml);
      return { parsed, write: () => this.regionWriter.write(parsed.rows) };
    });
    reports.push(regionReport);
    if (regionReport.status === 'failed') {
      return [...reports, notRun('province'), notRun('city')];
    }

    const provinceReport = await this.stage('province', source, regionLastModified, force, () => {
      const parsed = source.parseProvinces(regionHtml);
      return { parsed, write: () => this.provinceWriter.write(parsed.rows) };
    });
    reports.push(await this.withNcrDistricts(provinceReport));
    if (provinceReport.status === 'failed') {
      return [...reports, notRun('city')];
    }

    let cityHtml: string;
    let cityLastModified: Date;
    try {
      cityHtml = await this.fetcher.fetchHtml(source.urlFor('city'));
      cityLastModified = parseLastModified(loadDocument(cityHtml), source.urlFor('city'));
    } catch (error) {
      return [...reports, failed('city', error)];
    }

    reports.push(
      await this.stage('city', source, cityLastModified, force, () => {
        const parsed = source.parseCities(cityHtml);
        return { parsed, write: () => this.cityWriter.write(parsed.rows) };
      }),
    );

    return reports;
  }

  /**
   * Run one resource: consult change detection, parse, write, and advance the
   * marker only once the write has succeeded.
   */
  private async stage<TRow>(
    resource: ResourceKind,
    source: GeoSource,
    lastModified: Date,
    force: boolean,
    work: () => { parsed: ParseResult<TRow>; write: () => Promise<WriteCounts> },
  ): Promise<ResourceReport> {
    const started = Date.now();

    try {
      const shouldProcess = await this.changeDetection.shouldProcess(
        source.name,
        resource,
        lastModified,
        force,
      );

      if (!shouldProcess) {
        return {
          resource,
          status: 'skipped',
          parsed: 0,
          durationMs: Date.now() - started,
          detail: 'source unchanged since the last successful run',
          ...NO_COUNTS,
        };
      }

      const { parsed, write } = work();
      const counts = await write();
      await this.changeDetection.markProcessed(source.name, resource, lastModified);

      const rejected = counts.rejected + parsed.rejections.length;
      for (const rejection of parsed.rejections) {
        this.logger.warn(
          `${resource} row ${rejection.index} rejected: ${rejection.reason} — "${rejection.excerpt}"`,
        );
      }

      return {
        resource,
        status: 'processed',
        parsed: parsed.rows.length,
        durationMs: Date.now() - started,
        ...counts,
        rejected,
      };
    } catch (error) {
      this.logger.error(`Ingestion stage "${resource}" failed: ${describe(error)}`);
      return { ...failed(resource, error), durationMs: Date.now() - started };
    }
  }

  /**
   * The four NCR district provinces are ensured on every run, whether or not the
   * province page moved: they are synthetic rows the source never lists, and the
   * city stage cannot place NCR LGUs without them. Their counts fold into the
   * province report.
   */
  private async withNcrDistricts(provinceReport: ResourceReport): Promise<ResourceReport> {
    if (provinceReport.status === 'failed') {
      return provinceReport;
    }

    const districts = await this.provinceWriter.ensureNcrDistricts();
    const changed = districts.created + districts.updated > 0;

    return {
      ...provinceReport,
      created: provinceReport.created + districts.created,
      updated: provinceReport.updated + districts.updated,
      unchanged: provinceReport.unchanged + districts.unchanged,
      rejected: provinceReport.rejected + districts.rejected,
      status: provinceReport.status === 'skipped' && changed ? 'processed' : provinceReport.status,
      detail:
        provinceReport.status === 'skipped'
          ? `${provinceReport.detail ?? 'source unchanged'}; NCR district provinces ensured`
          : provinceReport.detail,
    };
  }
}

function failed(resource: ResourceKind, error: unknown): ResourceReport {
  return {
    resource,
    status: 'failed',
    parsed: 0,
    durationMs: 0,
    detail: describe(error),
    ...NO_COUNTS,
  };
}

function notRun(resource: ResourceKind): ResourceReport {
  return {
    resource,
    status: 'skipped',
    parsed: 0,
    durationMs: 0,
    detail: 'not attempted — an earlier stage failed',
    ...NO_COUNTS,
  };
}

function summarize(resources: readonly ResourceReport[]): string {
  return resources
    .map(
      (resource) =>
        `${resource.resource}=${resource.status}(+${resource.created}/~${resource.updated}/=${resource.unchanged}/!${resource.rejected})`,
    )
    .join(' ');
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
