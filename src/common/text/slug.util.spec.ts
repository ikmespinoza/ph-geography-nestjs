import { slugify } from '@/common/text/slug.util';

describe('slugify', () => {
  it('lowercases a single-word name', () => {
    expect(slugify('Bislig')).toBe('bislig');
    expect(slugify('BUTUAN')).toBe('butuan');
  });

  it('joins words with a single separator', () => {
    expect(slugify('General Trias')).toBe('general-trias');
    expect(slugify('Surigao del Sur')).toBe('surigao-del-sur');
  });

  it('keeps an existing hyphen as the separator', () => {
    expect(slugify('Lapu-Lapu')).toBe('lapu-lapu');
  });

  it('strips accents from Spanish-derived place names', () => {
    expect(slugify('Parañaque')).toBe('paranaque');
    expect(slugify('Peñablanca')).toBe('penablanca');
    expect(slugify('Los Baños')).toBe('los-banos');
    expect(slugify('Dasmariñas')).toBe('dasmarinas');
    expect(slugify('Sablayan')).toBe('sablayan');
  });

  it('slugs precomposed and decomposed spellings identically', () => {
    // The same name as one code point (U+00F1) and as n + U+0303 — a scraped page
    // can deliver either, and both must address the same city.
    expect(slugify('Parañaque'.normalize('NFC'))).toBe('paranaque');
    expect(slugify('Parañaque'.normalize('NFD'))).toBe('paranaque');
  });

  it('collapses punctuation and runs of whitespace into one separator', () => {
    expect(slugify('Sto. Niño')).toBe('sto-nino');
    expect(slugify('San   Jose')).toBe('san-jose');
    expect(slugify('Santa Cruz — Norte')).toBe('santa-cruz-norte');
  });

  it('treats an apostrophe as a separator like any other punctuation — no special case', () => {
    expect(slugify("T'Boli")).toBe('t-boli');
  });

  it('trims separators from both ends', () => {
    expect(slugify('  Bislig  ')).toBe('bislig');
    expect(slugify('(Bislig)')).toBe('bislig');
  });

  it('preserves digits', () => {
    expect(slugify('Barangay 1')).toBe('barangay-1');
  });

  it('is idempotent — slugging a slug changes nothing', () => {
    for (const name of ['Sto. Niño', 'Parañaque', 'Lapu-Lapu', 'General Trias']) {
      expect(slugify(slugify(name))).toBe(slugify(name));
    }
  });

  it('separates a letter that NFD cannot decompose, per the documented fallback', () => {
    // No Philippine LGU name contains one; asserted so the behavior is pinned rather
    // than incidental.
    expect(slugify('Øre')).toBe('re');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('---')).toBe('');
  });
});
