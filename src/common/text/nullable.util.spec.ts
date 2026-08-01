import { blankToNull } from '@/common/text/nullable.util';

/**
 * The guard behind the API's `alt_name` contract (PHG-010): always present, and `null`
 * rather than `''` when there is no former name.
 */
describe('blankToNull', () => {
  it('passes null through', () => {
    expect(blankToNull(null)).toBeNull();
  });

  it('collapses an empty string to null', () => {
    expect(blankToNull('')).toBeNull();
  });

  it('collapses whitespace-only input to null', () => {
    expect(blankToNull('   ')).toBeNull();
    expect(blankToNull('\t\n')).toBeNull();
  });

  it('returns a real value unchanged', () => {
    expect(blankToNull('Compostela Valley')).toBe('Compostela Valley');
  });

  it('does not trim a real value — sanitising scraped text is ingestion’s job', () => {
    expect(blankToNull('  Dinagat  ')).toBe('  Dinagat  ');
  });

  it('keeps a value that is only punctuation or digits', () => {
    expect(blankToNull('0')).toBe('0');
    expect(blankToNull('-')).toBe('-');
  });
});
