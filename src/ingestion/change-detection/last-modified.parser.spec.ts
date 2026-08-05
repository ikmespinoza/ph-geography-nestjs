import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseLastModified } from '@/ingestion/change-detection/last-modified.parser';
import { loadDocument } from '@/ingestion/scraper-core/html-parser';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';

const footer = (text: string): string =>
  `<html><body><ul><li id="footer-info-lastmod">${text}</li></ul></body></html>`;

describe('parseLastModified', () => {
  it('reads the footer MediaWiki actually renders, non-breaking space included', () => {
    const $ = loadDocument(
      footer(
        ' This page was last edited on 29 July 2025, at 13:25<span class="anonymous-show">&#160;(UTC)</span>.',
      ),
    );

    expect(parseLastModified($, 'test').toISOString()).toBe('2025-07-29T13:25:00.000Z');
  });

  it('interprets the timestamp as UTC, not the host timezone', () => {
    const $ = loadDocument(footer('This page was last edited on 1 January 2026, at 00:30 (UTC).'));

    expect(parseLastModified($, 'test').getTime()).toBe(Date.UTC(2026, 0, 1, 0, 30));
  });

  it('handles a single-digit day and hour', () => {
    const $ = loadDocument(footer('This page was last edited on 5 March 2024, at 07:05 (UTC).'));

    expect(parseLastModified($, 'test').toISOString()).toBe('2024-03-05T07:05:00.000Z');
  });

  it('reads the real fixtures', () => {
    const regions = loadDocument(
      readFileSync(join(__dirname, '../../../test/fixtures/iso3166-regions.html'), 'utf8'),
    );
    const cities = loadDocument(
      readFileSync(join(__dirname, '../../../test/fixtures/iso3166-cities.html'), 'utf8'),
    );

    expect(parseLastModified(regions, 'regions').toISOString()).toBe('2025-07-29T13:25:00.000Z');
    expect(parseLastModified(cities, 'cities').toISOString()).toBe('2026-07-17T15:06:00.000Z');
  });

  it('throws when the footer element is missing', () => {
    const $ = loadDocument('<html><body><p>no footer</p></body></html>');

    expect(() => parseLastModified($, 'regions')).toThrow(ScrapeError);
    expect(() => parseLastModified($, 'regions')).toThrow(/no #footer-info-lastmod/);
  });

  it('throws rather than silently processing when the wording changes', () => {
    const $ = loadDocument(footer('Last modified 2025-07-29T13:25Z'));

    expect(() => parseLastModified($, 'regions')).toThrow(/could not read a last-edited date/);
  });

  it('throws on an unknown month name', () => {
    const $ = loadDocument(footer('This page was last edited on 29 Julyy 2025, at 13:25 (UTC).'));

    expect(() => parseLastModified($, 'regions')).toThrow(/unknown month/);
  });
});
