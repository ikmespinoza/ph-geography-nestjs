/**
 * Why a scrape stopped. Both kinds abort the resource loudly (OD-8) — ingestion
 * never commits a partial parse as if it were complete.
 *
 * - `fetch`  — the source page could not be retrieved (network, timeout, HTTP
 *   status, or a URL outside the configured allow-list).
 * - `layout` — the page was retrieved but no longer looks like what we parse:
 *   a missing table, a changed header signature, or too many malformed rows.
 *   This is the case the legacy scraper swallowed (`catch { return false; }`).
 */
export type ScrapeFailureKind = 'fetch' | 'layout';

/** A scrape failure carrying its kind and the resource/source context. */
export class ScrapeError extends Error {
  constructor(
    readonly kind: ScrapeFailureKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ScrapeError';
  }
}
