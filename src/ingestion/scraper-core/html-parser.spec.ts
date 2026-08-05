import {
  cellTexts,
  dataRows,
  findTable,
  loadDocument,
  mapDataRows,
  normalizeText,
} from '@/ingestion/scraper-core/html-parser';
import { ScrapeError } from '@/ingestion/scraper-core/scrape-error';

const PAGE = `
<html><body>
  <div class="mw-heading mw-heading3"><h3 id="Regions">Regions</h3></div>
  <table class="wikitable">
    <tr><th>Code</th><th>Subdivision name (en)</th></tr>
    <tr><td>PH-13</td><td>Caraga</td></tr>
    <tr><td>PH-05</td><td>Bicol</td></tr>
  </table>
  <div class="mw-heading mw-heading3"><h3 id="Other">Other</h3></div>
  <table class="wikitable">
    <tr><th>Name</th><th>Value</th></tr>
    <tr><td>a</td><td>1</td></tr>
  </table>
</body></html>`;

const LOCATOR = {
  anchorId: 'Regions',
  requiredHeaders: ['code', 'subdivision name (en)'],
  context: 'the test table',
};

const ROW_SPEC = { minCells: 2, context: 'the test table', maxRejectionRatio: 0 };

describe('normalizeText', () => {
  it('collapses whitespace, drops non-breaking spaces and strips footnotes', () => {
    expect(normalizeText('  Ilocos\n  Norte[a] ')).toBe('Ilocos Norte');
    expect(normalizeText('IV-B[c]')).toBe('IV-B');
    expect(normalizeText('13:25 (UTC)')).toBe('13:25 (UTC)');
  });
});

describe('findTable', () => {
  it('takes the table following the heading anchor', () => {
    const $ = loadDocument(PAGE);

    expect(dataRows($, findTable($, LOCATOR))).toHaveLength(2);
  });

  it('still finds the table by header signature when the anchor is gone', () => {
    const $ = loadDocument(PAGE.replace('id="Regions"', 'id="Renamed"'));

    expect(dataRows($, findTable($, LOCATOR))).toHaveLength(2);
  });

  it('ignores a table whose headers do not match', () => {
    const $ = loadDocument(PAGE);
    const other = findTable($, {
      requiredHeaders: ['name', 'value'],
      context: 'the other table',
    });

    expect(cellTexts($, dataRows($, other)[0]!)).toEqual(['a', '1']);
  });

  it('throws a layout ScrapeError when nothing matches', () => {
    const $ = loadDocument(PAGE);

    expect(() => findTable($, { ...LOCATOR, requiredHeaders: ['population'] })).toThrow(
      ScrapeError,
    );
  });
});

describe('dataRows', () => {
  it('selects rows structurally, so the header drops out without an index rule', () => {
    const $ = loadDocument(PAGE);
    const rows = dataRows($, findTable($, LOCATOR));

    expect(rows).toHaveLength(2);
    expect(cellTexts($, rows[0]!)).toEqual(['PH-13', 'Caraga']);
    expect(cellTexts($, rows[1]!)).toEqual(['PH-05', 'Bicol']);
  });

  it('counts a th row-header as a cell', () => {
    const $ = loadDocument(
      '<table><tr><th>H</th></tr><tr><th scope="row">Bangued</th><td>Mun</td></tr></table>',
    );
    const rows = dataRows($, $('table'));

    expect(cellTexts($, rows[0]!)).toEqual(['Bangued', 'Mun']);
  });
});

describe('mapDataRows', () => {
  it('returns mapped rows and no rejections for a clean table', () => {
    const $ = loadDocument(PAGE);
    const result = mapDataRows($, findTable($, LOCATOR), ROW_SPEC, ({ cell }) => cell(0));

    expect(result.rows).toEqual(['PH-13', 'PH-05']);
    expect(result.rejections).toEqual([]);
  });

  it('rejects a short row instead of reading undefined columns', () => {
    const $ = loadDocument(
      `<table><tr><th>Code</th><th>Subdivision name (en)</th></tr>
       <tr><td>PH-13</td><td>Caraga</td></tr><tr><td>oops</td></tr></table>`,
    );

    expect(() =>
      mapDataRows($, findTable($, LOCATOR), { ...ROW_SPEC, maxRejectionRatio: 0.5 }, ({ cell }) =>
        cell(0),
      ),
    ).not.toThrow();

    const result = mapDataRows(
      $,
      findTable($, LOCATOR),
      { ...ROW_SPEC, maxRejectionRatio: 0.5 },
      ({ cell }) => cell(0),
    );
    expect(result.rows).toEqual(['PH-13']);
    expect(result.rejections).toEqual([
      { index: 1, reason: 'expected at least 2 cells, found 1', excerpt: 'oops' },
    ]);
  });

  it('carries the mapper’s own rejection reason', () => {
    const $ = loadDocument(PAGE);
    const result = mapDataRows(
      $,
      findTable($, LOCATOR),
      { ...ROW_SPEC, maxRejectionRatio: 1 },
      ({ cell, reject }) => (cell(0) === 'PH-05' ? reject('not wanted') : cell(0)),
    );

    expect(result.rows).toEqual(['PH-13']);
    expect(result.rejections[0]).toMatchObject({ index: 1, reason: 'not wanted' });
  });

  it('fails loudly once rejections pass the budget', () => {
    const $ = loadDocument(PAGE);

    expect(() =>
      mapDataRows($, findTable($, LOCATOR), ROW_SPEC, ({ reject }) => reject('drifted')),
    ).toThrow(/rejected 2 of 2 rows/);
  });

  it('treats a table with no data rows as drift', () => {
    const $ = loadDocument('<table><tr><th>Code</th><th>Subdivision name (en)</th></tr></table>');

    expect(() => mapDataRows($, findTable($, LOCATOR), ROW_SPEC, ({ cell }) => cell(0))).toThrow(
      /has no data rows/,
    );
  });
});
