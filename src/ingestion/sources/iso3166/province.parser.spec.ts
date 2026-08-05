import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';
import { parseProvinces } from '@/ingestion/sources/iso3166/province.parser';
import { parseRegions } from '@/ingestion/sources/iso3166/region.parser';

const FIXTURE = join(__dirname, '../../../../test/fixtures/iso3166-regions.html');
const html = readFileSync(FIXTURE, 'utf8');

describe('parseProvinces', () => {
  const { rows, rejections } = parseProvinces(html);

  it('reads every province on the page, rejecting none', () => {
    expect(rows).toHaveLength(82);
    expect(rejections).toEqual([]);
  });

  it('maps the columns and prefixes the region column with PH-', () => {
    expect(rows).toContainEqual({
      code: 'PH-AGN',
      name: 'Agusan del Norte',
      altName: null,
      nameTl: 'Hilagang Agusan',
      regionCode: 'PH-13',
    });
  });

  it('strips the footnote marker the region column sometimes carries', () => {
    // Several rows read "09[a]" / "11[c]" / "12[b]" in the source.
    for (const row of rows) {
      expect(row.regionCode).toMatch(/^PH-[A-Z0-9]{2,}$/);
    }
  });

  it('splits the ISO "local variant" parenthetical into name + alt_name', () => {
    // Raw cell: "Samar (local variant: Western Samar)". The shared getAltName()
    // rejects it (the colon is not alphanumeric), which would leave the whole
    // string as the name — and orphan every Samar city on the other page.
    expect(rows).toContainEqual({
      code: 'PH-WSA',
      name: 'Samar',
      altName: 'Western Samar',
      nameTl: 'Samar',
      regionCode: 'PH-08',
    });
  });

  it('falls back to the English name when the source leaves name_tl blank', () => {
    // PH-COM (Davao de Oro) has an empty Tagalog cell. Rejecting the row would
    // drop the province and every city filed under it.
    expect(rows).toContainEqual({
      code: 'PH-COM',
      name: 'Davao de Oro',
      altName: null,
      nameTl: 'Davao de Oro',
      regionCode: 'PH-11',
    });
    expect(rows.every((row) => row.nameTl.length > 0)).toBe(true);
  });

  it('leaves a province with no parenthetical with a null alt_name', () => {
    expect(rows.find((row) => row.code === 'PH-ABR')).toEqual({
      code: 'PH-ABR',
      name: 'Abra',
      altName: null,
      nameTl: 'Abra',
      regionCode: 'PH-15',
    });
  });

  it('names only regions the region parser also produced', () => {
    const regionCodes = new Set(parseRegions(html).rows.map((row) => row.code));

    for (const row of rows) {
      expect(regionCodes.has(row.regionCode)).toBe(true);
    }
  });

  it('produces unique codes, so the upsert key is sound', () => {
    expect(new Set(rows.map((row) => row.code)).size).toBe(rows.length);
  });

  it('picks the provinces table, not the regions table above it', () => {
    expect(rows.some((row) => row.code === 'PH-13')).toBe(false);
  });

  /**
   * The per-row guards, on minimal pages rather than surgical edits to the real
   * markup — see the equivalent block in `region.parser.spec.ts`. `maxRejectionRatio`
   * is 0 for this table, so any rejection is a thrown `ScrapeError`: 82 provinces is
   * few enough that one unreadable row already means the layout moved.
   */
  describe('row-shape rejection', () => {
    const page = (rows: string): string => `<html><body>
      <div class="mw-heading mw-heading3"><h3 id="Provinces">Provinces</h3></div>
      <table class="wikitable">
        <tr><th>Code</th><th>Subdivision name (en)</th><th>Subdivision name (tl)</th><th>In region</th></tr>
        ${rows}
      </table>
    </body></html>`;

    const row = (code: string, name: string, nameTl: string, region: string): string =>
      `<tr><td>${code}</td><td>${name}</td><td>${nameTl}</td><td>${region}</td></tr>`;

    it('reads the minimal page, so the rejection cases below isolate one defect', () => {
      const { rows: parsed } = parseProvinces(
        page(row('PH-AGN', 'Agusan del Norte', 'Hilagang Agusan', '13')),
      );

      expect(parsed).toEqual([
        {
          code: 'PH-AGN',
          name: 'Agusan del Norte',
          altName: null,
          nameTl: 'Hilagang Agusan',
          regionCode: 'PH-13',
        },
      ]);
    });

    it('rejects a code that is not an ISO province code', () => {
      // Province codes are letters (PH-AGN); a numeric suffix is a region code, so
      // this is what a column shift or a copied regions table looks like.
      const html = page(row('PH-13', 'Caraga', 'Rehiyon ng Karaga', '13'));

      expect(() => parseProvinces(html)).toThrow(ScrapeError);
      expect(() => parseProvinces(html)).toThrow(/is not an ISO province code/);
    });

    it('rejects an unreadable region column rather than inventing a PH- code', () => {
      // `PH-${suffix}` would otherwise happily produce `PH-` + junk and orphan the
      // province against a region that does not exist.
      const html = page(row('PH-AGN', 'Agusan del Norte', 'Hilagang Agusan', 'Caraga (XIII)'));

      expect(() => parseProvinces(html)).toThrow(/has an unreadable region column/);
    });

    it('rejects a province whose name cell is empty', () => {
      // The code and region columns can both be well-formed while the name is not;
      // a blank here would otherwise reach the database and orphan the province's
      // cities, which match on name.
      const html = page(row('PH-AGN', '', 'Hilagang Agusan', '13'));

      expect(() => parseProvinces(html)).toThrow(/has an empty name/);
    });
  });
});
