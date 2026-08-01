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
});
