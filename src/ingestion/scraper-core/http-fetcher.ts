import { setTimeout as sleep } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { IngestionConfig } from '@/config/ingestion.config';
import type { SourcesConfig } from '@/config/sources.config';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';

/** HTTP statuses worth retrying — the rest are permanent for our purposes. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * The one way ingestion reaches the network. Node 20's global `fetch` covers it,
 * so there is no extra HTTP dependency: timeout via `AbortSignal.timeout`,
 * retries with exponential backoff, an explicit User-Agent, and a hard
 * allow-list built from the `sources` config.
 *
 * Every failure path **throws** `ScrapeError('fetch', …)`. The legacy helper
 * returned `false` from `file_get_html` and let the caller treat it as "nothing
 * to do", which is how a network blip became a silent no-op.
 */
@Injectable()
export class HttpFetcher {
  private readonly logger = new Logger(HttpFetcher.name);
  private readonly ingestion: IngestionConfig;
  private readonly allowedUrls: ReadonlySet<string>;

  constructor(configService: ConfigService) {
    this.ingestion = configService.getOrThrow<IngestionConfig>('ingestion');
    // Enumerated rather than reflected over: `SourcesConfig` is a fixed shape, and
    // a new source (OD-6) should have to add its URLs here deliberately.
    const { iso3166 } = configService.getOrThrow<SourcesConfig>('sources');
    this.allowedUrls = new Set([iso3166.regionUrl, iso3166.cityUrl]);
  }

  /** Fetch a source page as text, or throw. */
  async fetchHtml(url: string): Promise<string> {
    this.assertAllowed(url);

    const attempts = this.ingestion.maxRetries + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await sleep(this.ingestion.retryBackoffMs * 2 ** (attempt - 1));
      }

      try {
        return await this.attempt(url);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === attempts - 1) {
          break;
        }
        this.logger.warn(
          `Fetch of ${url} failed (attempt ${attempt + 1}/${attempts}), retrying: ${describe(error)}`,
        );
      }
    }

    throw new ScrapeError('fetch', `Failed to fetch ${url}: ${describe(lastError)}`, {
      cause: lastError,
    });
  }

  private async attempt(url: string): Promise<string> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.ingestion.requestTimeoutMs),
      redirect: 'follow',
      headers: {
        'User-Agent': this.ingestion.userAgent,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new HttpStatusError(response.status, response.statusText);
    }

    const html = await response.text();
    if (html.trim().length === 0) {
      throw new ScrapeError('fetch', `${url} returned an empty body`);
    }
    return html;
  }

  /**
   * Only the configured source URLs may be fetched, and only over http(s) — a
   * scraped page must never be able to redirect ingestion at an arbitrary host.
   */
  private assertAllowed(url: string): void {
    if (!this.allowedUrls.has(url)) {
      throw new ScrapeError(
        'fetch',
        `Refusing to fetch a URL outside the source allow-list: ${url}`,
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ScrapeError('fetch', `Source URL is not a valid URL: ${url}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ScrapeError('fetch', `Source URL must be http(s): ${url}`);
    }
  }
}

/** A non-2xx response. Carries the status so retry logic can classify it. */
class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
  ) {
    super(`HTTP ${status} ${statusText}`.trim());
    this.name = 'HttpStatusError';
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof HttpStatusError) {
    return RETRYABLE_STATUSES.has(error.status);
  }
  // Timeouts and transport errors: retry. A ScrapeError raised here is our own
  // permanent verdict (empty body / allow-list), so it is not retried.
  return !(error instanceof ScrapeError);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
