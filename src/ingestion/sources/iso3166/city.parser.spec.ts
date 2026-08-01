import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseCities } from '@/ingestion/sources/iso3166/city.parser';
import { NCR_DISTRICTS, NCR_LGU_COUNT } from '@/ingestion/sources/iso3166/ncr-districts';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';

const FIXTURE = join(__dirname, '../../../../test/fixtures/iso3166-cities.html');
const html = readFileSync(FIXTURE, 'utf8');

describe('parseCities', () => {
  const { rows, rejections } = parseCities(html);
  const byName = (name: string) => rows.find((row) => row.name === name);

  it('reads every LGU on the page, rejecting none', () => {
    // 149 cities + 1,493 municipalities.
    expect(rows).toHaveLength(1642);
    expect(rejections).toEqual([]);
  });

  it('keeps the final row, which is a real municipality', () => {
    // The legacy skipped the last row as a summary row; this table has none, so
    // that rule silently dropped Tungawan.
    expect(byName('Tungawan')).toBeDefined();
    expect(rows.at(-1)?.name).toBe('Tungawan');
  });

  it('finds the table by header signature — the #List anchor no longer exists', () => {
    expect(html).not.toContain('id="List"');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('appends " City" to city classifications only', () => {
    expect(byName('Butuan')).toMatchObject({ classificationCode: 'HUC', fullName: 'Butuan City' });
    expect(byName('Boliney')).toMatchObject({ classificationCode: 'Mun', fullName: 'Boliney' });
  });

  it('leaves a name that already ends in " City" alone', () => {
    expect(byName('Quezon City')?.fullName).toBe('Quezon City');
    expect(byName('Davao City')?.fullName).toBe('Davao City');
  });

  it('reads is_capital from the thick-border cell, per the table legend', () => {
    // The legend: thick borders mark de jure provincial capitals.
    expect(byName('Cabadbaran')?.isCapital).toBe(true);
    expect(byName('Kabugao')?.isCapital).toBe(true);
    expect(byName('La Trinidad')?.isCapital).toBe(true);
  });

  it('does not treat the dagger as a capital marker', () => {
    // The dagger marks the province's largest settlement. Butuan carries one and
    // is not the capital of Agusan del Norte; Cabadbaran is.
    expect(byName('Butuan')?.isCapital).toBe(false);
    expect(byName('Baguio')?.isCapital).toBe(false);
  });

  it('marks about one capital per province', () => {
    const capitals = rows.filter((row) => row.isCapital);

    // 82 provincial capitals + Manila, which the source also borders (national capital).
    expect(capitals).toHaveLength(83);
  });

  it('strips the dagger and double dagger from names', () => {
    expect(rows.every((row) => !/[†‡]/.test(row.name))).toBe(true);
    expect(rows.every((row) => !/[†‡]/.test(row.fullName))).toBe(true);
    expect(byName('Quezon City')).toBeDefined();
  });

  it('resolves every NCR LGU to a district province instead of dropping it', () => {
    const ncr = rows.filter((row) => row.ncrDistrictCode !== undefined);

    expect(ncr).toHaveLength(NCR_LGU_COUNT);
    expect(ncr).toHaveLength(17);
    expect(ncr.every((row) => row.provinceName === 'Metro Manila')).toBe(true);
  });

  it('places Pateros, the lone NCR municipality', () => {
    expect(byName('Pateros')).toMatchObject({
      classificationCode: 'Mun',
      fullName: 'Pateros',
      ncrDistrictCode: 'PH-00-D4',
    });
  });

  it('spreads NCR cities across all four districts', () => {
    const used = new Set(
      rows.filter((row) => row.ncrDistrictCode !== undefined).map((row) => row.ncrDistrictCode),
    );

    expect(used).toEqual(new Set(NCR_DISTRICTS.map((district) => district.code)));
    expect(byName('Manila')?.ncrDistrictCode).toBe('PH-00-D1');
    expect(byName('Caloocan')?.ncrDistrictCode).toBe('PH-00-D3');
  });

  it('reconciles the Mindoro spellings so the province page can match', () => {
    const mindoro = rows.filter((row) => row.provinceName.startsWith('Mindoro'));

    expect(mindoro.length).toBeGreaterThan(0);
    expect(rows.every((row) => !/^(Occidental|Oriental) Mindoro$/.test(row.provinceName))).toBe(
      true,
    );
  });

  it('only reports classification codes the seed knows', () => {
    const codes = new Set(rows.map((row) => row.classificationCode));

    expect([...codes].sort()).toEqual(['CC', 'HUC', 'ICC', 'Mun']);
  });

  it('produces a unique (province, name) key for every row', () => {
    const keys = rows.map((row) => `${row.ncrDistrictCode ?? row.provinceName}/${row.name}`);

    expect(new Set(keys).size).toBe(rows.length);
  });

  it('splits a parenthetical city name into name + alt_name', () => {
    // No LGU on the page carries one today — every row's alt_name is null — so the
    // rule is exercised against a synthetic row rather than left untested until a
    // rename puts one back (as "Davao (Davao del Norte)" once did).
    expect(rows.every((row) => row.altName === null)).toBe(true);

    const synthetic = `<html><body><table class="wikitable">
      <tr><th>City or municipality</th><th>Population</th><th>Area</th><th>PD</th><th>Brgy.</th><th>Class</th><th>Province</th></tr>
      <tr><th scope="row">Davao (Davao del Norte)†</th><td>1</td><td>1</td><td>1</td><td>1</td><td>HUC</td><td>Davao del Sur</td></tr>
    </table></body></html>`;

    expect(parseCities(synthetic).rows[0]).toMatchObject({
      name: 'Davao',
      altName: 'Davao del Norte',
      fullName: 'Davao City',
    });
  });

  it('fails loudly when the class column stops carrying known codes', () => {
    const rewritten = html.replace(/>Mun</g, '>Municipality<');

    expect(() => parseCities(rewritten)).toThrow(ScrapeError);
    expect(() => parseCities(rewritten)).toThrow(/rejected \d+ of 1642 rows/);
  });

  it('fails loudly when the table itself disappears', () => {
    const withoutTables = html.replace(/<table/g, '<div').replace(/<\/table>/g, '</div>');

    expect(() => parseCities(withoutTables)).toThrow(/No table matching/);
  });
});
