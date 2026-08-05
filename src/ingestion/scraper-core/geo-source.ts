/**
 * The shared vocabulary of the ingestion pipeline: what a source can be asked
 * for, the rows a parser produces, and the report a run emits.
 *
 * A `GeoSource` is the seam OD-6 asked for — ISO 3166 is the only implementation
 * today, but a PSGC/Wikidata source would drop in behind the same interface
 * without touching the orchestrator, the writers or change-detection.
 */

/** One resource of one source — the unit of change detection and reporting. */
export type ResourceKind = 'region' | 'province' | 'city';

export interface RegionRow {
  readonly code: string;
  readonly name: string;
  readonly nameTl: string;
  readonly acronym: string;
}

export interface ProvinceRow {
  readonly code: string;
  readonly name: string;
  readonly altName: string | null;
  readonly nameTl: string;
  /** Already `PH-` prefixed; resolved to a region id by the writer. */
  readonly regionCode: string;
}

export interface CityRow {
  readonly name: string;
  readonly altName: string | null;
  readonly fullName: string;
  readonly isCapital: boolean;
  readonly classificationCode: string;
  /** Sanitised province name from the source; resolved to an id by the writer. */
  readonly provinceName: string;
  /**
   * Set instead of `provinceName` for NCR rows, whose source cell reads
   * "Metro Manila" and carries no district. See `ncr-districts.ts`.
   */
  readonly ncrDistrictCode?: string;
}

/** A row the parser could not trust, kept for the report instead of guessed at. */
export interface RowRejection {
  /** Zero-based index among the table's data rows. */
  readonly index: number;
  readonly reason: string;
  /** A short excerpt of the offending row, for the log. */
  readonly excerpt: string;
}

/** What a parser produces: the rows it trusts, plus the ones it refused. */
export interface ParseResult<TRow> {
  readonly rows: TRow[];
  readonly rejections: RowRejection[];
}

/**
 * A geographic data source. Parsing is pure (`html → rows`) so it can be tested
 * against a saved fixture with no network and no database.
 */
export interface GeoSource {
  readonly name: string;
  readonly regionUrl: string;
  readonly cityUrl: string;
  /** Which page carries a resource — regions and provinces share one page. */
  urlFor(resource: ResourceKind): string;
  parseRegions(html: string): ParseResult<RegionRow>;
  parseProvinces(html: string): ParseResult<ProvinceRow>;
  parseCities(html: string): ParseResult<CityRow>;
}

/** Injection token for the registered sources (OD-6 keeps this a list of one). */
export const GEO_SOURCES = Symbol('GEO_SOURCES');

/** Outcome of persisting one resource's rows. */
export interface WriteCounts {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Rows that parsed but could not be persisted (unresolved FK, unknown code). */
  readonly rejected: number;
}

export interface ResourceReport extends WriteCounts {
  readonly resource: ResourceKind;
  readonly status: 'processed' | 'skipped' | 'failed';
  readonly parsed: number;
  readonly durationMs: number;
  /** Why it was skipped, or how it failed. */
  readonly detail?: string;
}

export interface RunReport {
  readonly source: string;
  readonly force: boolean;
  readonly startedAt: Date;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly resources: ResourceReport[];
  /** Set when the run never started because another run held the lock. */
  readonly detail?: string;
}
