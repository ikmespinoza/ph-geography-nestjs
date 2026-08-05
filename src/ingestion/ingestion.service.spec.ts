import type { Cache } from '@nestjs/cache-manager';

import { IngestionService } from '@/ingestion/ingestion.service';
import type { ChangeDetectionService } from '@/ingestion/change-detection/change-detection.service';
import type { RunLock } from '@/ingestion/run-lock';
import type { GeoSource, ResourceKind } from '@/ingestion/scraper-core/geo-source';
import type { HttpFetcher } from '@/ingestion/scraper-core/http-fetcher';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';
import type { CityWriter } from '@/ingestion/writers/city.writer';
import type { ProvinceWriter } from '@/ingestion/writers/province.writer';
import type { RegionWriter } from '@/ingestion/writers/region.writer';

const REGION_URL = 'https://example.test/regions';
const CITY_URL = 'https://example.test/cities';

/** Minimal pages carrying only what the pipeline reads: the last-edited footer. */
const page = (date: string): string =>
  `<html><body><li id="footer-info-lastmod">This page was last edited on ${date} (UTC).</li></body></html>`;

const COUNTS = { created: 1, updated: 0, unchanged: 0, rejected: 0 };
const NO_CHANGE = { created: 0, updated: 0, unchanged: 4, rejected: 0 };

describe('IngestionService', () => {
  const fetchHtml = jest.fn();
  const shouldProcess = jest.fn();
  const markProcessed = jest.fn();
  const writeRegions = jest.fn();
  const writeProvinces = jest.fn();
  const ensureNcrDistricts = jest.fn();
  const writeCities = jest.fn();
  const acquire = jest.fn();
  const release = jest.fn();
  const clearCache = jest.fn();

  const parseRegions = jest.fn();
  const parseProvinces = jest.fn();
  const parseCities = jest.fn();

  const source: GeoSource = {
    name: 'ISO 3166',
    regionUrl: REGION_URL,
    cityUrl: CITY_URL,
    urlFor: (resource: ResourceKind) => (resource === 'city' ? CITY_URL : REGION_URL),
    parseRegions,
    parseProvinces,
    parseCities,
  };

  function build(): IngestionService {
    return new IngestionService(
      { fetchHtml } as unknown as HttpFetcher,
      { shouldProcess, markProcessed } as unknown as ChangeDetectionService,
      { write: writeRegions } as unknown as RegionWriter,
      { write: writeProvinces, ensureNcrDistricts } as unknown as ProvinceWriter,
      { write: writeCities } as unknown as CityWriter,
      { acquire } as unknown as RunLock,
      [source],
      { clear: clearCache } as unknown as Cache,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    acquire.mockResolvedValue({ release });
    fetchHtml.mockImplementation((url: string) =>
      Promise.resolve(
        url === CITY_URL ? page('17 July 2026, at 15:06') : page('29 July 2025, at 13:25'),
      ),
    );
    shouldProcess.mockResolvedValue(true);
    parseRegions.mockReturnValue({ rows: [{ code: 'PH-13' }], rejections: [] });
    parseProvinces.mockReturnValue({ rows: [{ code: 'PH-AGN' }], rejections: [] });
    parseCities.mockReturnValue({ rows: [{ name: 'Butuan' }], rejections: [] });
    writeRegions.mockResolvedValue(COUNTS);
    writeProvinces.mockResolvedValue(COUNTS);
    writeCities.mockResolvedValue(COUNTS);
    ensureNcrDistricts.mockResolvedValue(NO_CHANGE);
    clearCache.mockResolvedValue(true);
  });

  describe('read-cache invalidation (PHG-015)', () => {
    it('clears the cache once a run has created or updated rows', async () => {
      await build().run();

      expect(clearCache).toHaveBeenCalledTimes(1);
    });

    /**
     * The nightly run is normally a no-op — a forced re-run of the real dataset
     * reports 0 created and 0 updated — so flushing a warm cache every night would be
     * a self-inflicted latency spike for no gain.
     */
    it('leaves a warm cache alone when nothing actually changed', async () => {
      writeRegions.mockResolvedValue(NO_CHANGE);
      writeProvinces.mockResolvedValue(NO_CHANGE);
      writeCities.mockResolvedValue(NO_CHANGE);

      const report = await build().run();

      expect(report.ok).toBe(true);
      expect(clearCache).not.toHaveBeenCalled();
    });

    it('does not fail the run when the cache cannot be cleared', async () => {
      clearCache.mockRejectedValue(new Error('store unavailable'));

      // The data is written either way; the worst case is one TTL of staleness.
      await expect(build().run()).resolves.toMatchObject({ ok: true });
    });

    it('skips invalidation entirely when another run holds the lock', async () => {
      acquire.mockResolvedValue(null);

      await build().run();

      expect(clearCache).not.toHaveBeenCalled();
    });
  });

  it('runs region, then province, then city — the order the foreign keys need', async () => {
    const report = await build().run();

    expect(report.ok).toBe(true);
    expect(report.resources.map((resource) => resource.resource)).toEqual([
      'region',
      'province',
      'city',
    ]);
    expect(report.resources.every((resource) => resource.status === 'processed')).toBe(true);
  });

  it('fetches the shared region page once, not once per resource', async () => {
    await build().run();

    const urls = fetchHtml.mock.calls.map(([url]) => url as string);
    expect(urls).toEqual([REGION_URL, CITY_URL]);
  });

  it('ensures the NCR districts between the province and city stages', async () => {
    await build().run();

    expect(ensureNcrDistricts).toHaveBeenCalledTimes(1);
    const ensureOrder = ensureNcrDistricts.mock.invocationCallOrder[0]!;
    expect(ensureOrder).toBeGreaterThan(writeProvinces.mock.invocationCallOrder[0]!);
    expect(ensureOrder).toBeLessThan(writeCities.mock.invocationCallOrder[0]!);
  });

  it('advances the change-detection marker only after the write succeeds', async () => {
    await build().run();

    expect(markProcessed).toHaveBeenCalledTimes(3);
    expect(markProcessed.mock.invocationCallOrder[0]!).toBeGreaterThan(
      writeRegions.mock.invocationCallOrder[0]!,
    );
  });

  it('does not advance the marker when the write throws', async () => {
    writeRegions.mockRejectedValue(new Error('db down'));

    const report = await build().run();

    expect(markProcessed).not.toHaveBeenCalled();
    expect(report.ok).toBe(false);
    expect(report.resources[0]).toMatchObject({ resource: 'region', status: 'failed' });
  });

  it('skips a resource whose source has not moved, without parsing or writing', async () => {
    shouldProcess.mockResolvedValue(false);

    const report = await build().run();

    expect(parseRegions).not.toHaveBeenCalled();
    expect(writeRegions).not.toHaveBeenCalled();
    expect(report.resources[0]).toMatchObject({ status: 'skipped', created: 0 });
    expect(report.ok).toBe(true);
  });

  it('still ensures the NCR districts when the province page was unchanged', async () => {
    shouldProcess.mockResolvedValue(false);

    await build().run();

    expect(ensureNcrDistricts).toHaveBeenCalledTimes(1);
  });

  it('passes force through so every resource is re-processed', async () => {
    await build().run({ force: true });

    expect(shouldProcess).toHaveBeenCalledWith('ISO 3166', 'region', expect.any(Date), true);
    expect(shouldProcess).toHaveBeenCalledWith('ISO 3166', 'city', expect.any(Date), true);
  });

  it('stops the later stages when an earlier one fails', async () => {
    writeRegions.mockRejectedValue(new ScrapeError('layout', 'table moved'));

    const report = await build().run();

    expect(writeProvinces).not.toHaveBeenCalled();
    expect(writeCities).not.toHaveBeenCalled();
    expect(report.resources.map((resource) => resource.status)).toEqual([
      'failed',
      'skipped',
      'skipped',
    ]);
    expect(report.ok).toBe(false);
  });

  it('reports all three resources as failed when the first fetch fails', async () => {
    fetchHtml.mockRejectedValue(new ScrapeError('fetch', 'timed out'));

    const report = await build().run();

    expect(report.resources).toHaveLength(3);
    expect(report.resources.every((resource) => resource.status === 'failed')).toBe(true);
    expect(report.resources[0]?.detail).toContain('timed out');
  });

  it('fails only the city stage when the city page cannot be fetched', async () => {
    fetchHtml.mockImplementation((url: string) =>
      url === CITY_URL
        ? Promise.reject(new ScrapeError('fetch', 'HTTP 503'))
        : Promise.resolve(page('29 July 2025, at 13:25')),
    );

    const report = await build().run();

    expect(report.resources.map((resource) => resource.status)).toEqual([
      'processed',
      'processed',
      'failed',
    ]);
  });

  it('does not run at all when another run holds the lock', async () => {
    acquire.mockResolvedValue(null);

    const report = await build().run();

    expect(fetchHtml).not.toHaveBeenCalled();
    expect(report.resources).toEqual([]);
    expect(report.detail).toMatch(/already in progress/);
    expect(report.ok).toBe(true);
  });

  it('releases the lock even when a stage throws', async () => {
    fetchHtml.mockRejectedValue(new Error('boom'));

    await build().run();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('folds parser rejections into the resource report', async () => {
    parseCities.mockReturnValue({
      rows: [{ name: 'Butuan' }],
      rejections: [{ index: 4, reason: 'unknown classification', excerpt: '…' }],
    });

    const report = await build().run();

    expect(report.resources[2]).toMatchObject({ resource: 'city', parsed: 1, rejected: 1 });
  });
});
