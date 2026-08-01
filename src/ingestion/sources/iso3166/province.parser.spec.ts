import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
});
