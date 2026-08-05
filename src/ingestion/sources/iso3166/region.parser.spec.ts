import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';
import { parseRegions } from '@/ingestion/sources/iso3166/region.parser';

const FIXTURE = join(__dirname, '../../../../test/fixtures/iso3166-regions.html');
const html = readFileSync(FIXTURE, 'utf8');

describe('parseRegions', () => {
  const { rows, rejections } = parseRegions(html);

  it('reads every region on the page, rejecting none', () => {
    expect(rows).toHaveLength(17);
    expect(rejections).toEqual([]);
  });

  it('maps the four columns onto the row', () => {
    expect(rows).toContainEqual({
      code: 'PH-13',
      name: 'Caraga',
      nameTl: 'Rehiyon ng Karaga',
      acronym: 'XIII',
    });
  });

  it('includes NCR, whose PH-00 region is what the district provinces hang off', () => {
    expect(rows).toContainEqual({
      code: 'PH-00',
      name: 'National Capital Region',
      nameTl: 'Pambansang Punong Rehiyon',
      acronym: 'NCR',
    });
  });

  it('strips the footnote markers the source attaches to names and acronyms', () => {
    const armm = rows.find((row) => row.code === 'PH-14');
    const mimaropa = rows.find((row) => row.code === 'PH-41');

    // Raw cells read "Autonomous Region in Muslim Mindanao[b]" and "IV-B[c]".
    expect(armm?.name).toBe('Autonomous Region in Muslim Mindanao');
    expect(mimaropa?.acronym).toBe('IV-B');
  });

  it('produces unique codes, so the upsert key is sound', () => {
    expect(new Set(rows.map((row) => row.code)).size).toBe(rows.length);
  });

  it('fails loudly when the table is gone rather than returning nothing', () => {
    const withoutTables = html.replace(/<table/g, '<div').replace(/<\/table>/g, '</div>');

    expect(() => parseRegions(withoutTables)).toThrow(ScrapeError);
    expect(() => parseRegions(withoutTables)).toThrow(/No table matching/);
  });

  it('finds the table by its header signature even without the heading anchor', () => {
    const withoutAnchor = html.replace('id="Regions"', 'id="Regions_moved"');

    expect(parseRegions(withoutAnchor).rows).toHaveLength(17);
  });

  it('fails loudly when the code column stops holding ISO codes', () => {
    const rewritten = html.replace(/PH-(\d{2})/g, 'XX-$1');

    expect(() => parseRegions(rewritten)).toThrow(/rejected 17 of 17 rows/);
  });

  /**
   * The per-row guards, on minimal pages rather than surgical edits to 3 MB of real
   * markup: a single deliberately-broken row is what is under test, and a synthetic
   * table shows it in one screen. The fixture-driven cases above remain the proof
   * that the parser reads the page as it actually ships.
   */
  describe('row-shape rejection', () => {
    const page = (rows: string): string => `<html><body>
      <div class="mw-heading mw-heading3"><h3 id="Regions">Regions</h3></div>
      <table class="wikitable">
        <tr><th>Code</th><th>Subdivision name (en)</th><th>Subdivision name (tl)</th><th>Roman numeral or acronym</th></tr>
        ${rows}
      </table>
    </body></html>`;

    const GOOD = '<tr><td>PH-13</td><td>Caraga</td><td>Rehiyon ng Karaga</td><td>XIII</td></tr>';

    it('reads the minimal page, so the rejection cases below isolate one defect', () => {
      expect(parseRegions(page(GOOD)).rows).toHaveLength(1);
    });

    it.each([
      ['name', '<tr><td>PH-13</td><td></td><td>Rehiyon ng Karaga</td><td>XIII</td></tr>'],
      ['name_tl', '<tr><td>PH-13</td><td>Caraga</td><td></td><td>XIII</td></tr>'],
      ['acronym', '<tr><td>PH-13</td><td>Caraga</td><td>Rehiyon ng Karaga</td><td></td></tr>'],
    ])('rejects a row whose %s cell is empty rather than storing a blank', (_column, row) => {
      // A blank here would reach the database as an empty string on the wire —
      // the wart PHG-010 removed from `alt_name`, reintroduced by ingestion.
      expect(() => parseRegions(page(row))).toThrow(ScrapeError);
      expect(() => parseRegions(page(row))).toThrow(/has an empty name, name_tl or acronym/);
    });
  });
});
