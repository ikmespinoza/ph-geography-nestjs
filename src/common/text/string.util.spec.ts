import {
  getAltName,
  sanitize,
  sanitizeProvinceName,
  stripAltName,
  stripAnnotation,
} from '@/common/text/string.util';

describe('string.util', () => {
  describe('stripAnnotation', () => {
    it('removes HTML tags', () => {
      expect(stripAnnotation('<a href="/wiki/Davao">Davao</a>')).toBe('Davao');
      expect(stripAnnotation('<b>Ilocos</b> <i>Norte</i>')).toBe('Ilocos Norte');
    });

    it('removes [...] footnote / reference markers', () => {
      expect(stripAnnotation('Butuan[1]')).toBe('Butuan');
      expect(stripAnnotation('Cebu[a][b]')).toBe('Cebu');
      expect(stripAnnotation('Manila[note 2]')).toBe('Manila');
      expect(stripAnnotation('Taguig[]')).toBe('Taguig');
    });

    it('strips a footnote wrapped in tags (tags then bracket text)', () => {
      expect(stripAnnotation('Butuan<sup>[1]</sup>')).toBe('Butuan');
    });

    it('decodes named HTML entities', () => {
      expect(stripAnnotation('Ilocos &amp; Cagayan')).toBe('Ilocos & Cagayan');
      expect(stripAnnotation('A&nbsp;B')).toBe('A\u00A0B');
      expect(stripAnnotation('Cotabato&ndash;Sarangani')).toBe('Cotabato–Sarangani');
    });

    it('decodes decimal and hex numeric entities', () => {
      expect(stripAnnotation('&#68;avao')).toBe('Davao');
      expect(stripAnnotation('&#x44;avao')).toBe('Davao');
      expect(stripAnnotation('Cotabato&#8211;Sarangani')).toBe('Cotabato–Sarangani');
    });

    it('decodes Latin-1 accented named entities (PH place names — legacy parity)', () => {
      expect(stripAnnotation('Para&ntilde;aque')).toBe('Parañaque');
      expect(stripAnnotation('Los Ba&ntilde;os')).toBe('Los Baños');
      expect(stripAnnotation('Pe&ntilde;ablanca')).toBe('Peñablanca');
      expect(stripAnnotation('General Santos &eacute;')).toBe('General Santos é');
      // named and numeric forms of the same letter agree
      expect(stripAnnotation('Ba&#241;os')).toBe(stripAnnotation('Ba&ntilde;os'));
    });

    it('decodes entities BEFORE stripping tags, so an encoded tag is unwrapped then removed', () => {
      expect(stripAnnotation('&lt;b&gt;Davao&lt;/b&gt;')).toBe('Davao');
    });

    it('leaves an unrecognised entity untouched', () => {
      expect(stripAnnotation('A&notreal;B')).toBe('A&notreal;B');
      expect(stripAnnotation('50&#x110000;')).toBe('50&#x110000;'); // out-of-range code point
    });

    it('trims surrounding whitespace', () => {
      expect(stripAnnotation('  Davao  ')).toBe('Davao');
    });

    it('returns an empty string when everything is stripped', () => {
      expect(stripAnnotation('<sup>[1]</sup>')).toBe('');
      expect(stripAnnotation('   ')).toBe('');
    });

    it('leaves a plain name unchanged', () => {
      expect(stripAnnotation('Nueva Ecija')).toBe('Nueva Ecija');
    });
  });

  describe('getAltName', () => {
    it('returns the trailing parenthetical content (the canonical example)', () => {
      expect(getAltName('Davao (Davao del Norte)')).toBe('Davao del Norte');
    });

    it('returns null when there is no parenthetical', () => {
      expect(getAltName('Metropolitan Manila')).toBeNull();
    });

    it('returns null when the parenthetical is not at the end', () => {
      expect(getAltName('Davao (del Norte) Region')).toBeNull();
    });

    it('returns null when the trailing parenthetical contains punctuation (guard is alphanumeric-only)', () => {
      expect(getAltName('Cotabato (North-Cotabato)')).toBeNull();
      expect(getAltName('Samar (a.k.a. Western Samar)')).toBeNull();
    });

    it('returns the LAST parenthetical when several are present', () => {
      expect(getAltName('Foo (Bar) (Western Samar)')).toBe('Western Samar');
    });

    it('accepts digits and internal whitespace inside the parenthetical', () => {
      expect(getAltName('Region (Region 4A)')).toBe('Region 4A');
    });

    it('requires whitespace before the opening parenthesis', () => {
      expect(getAltName('Davao(Davao del Norte)')).toBeNull();
    });
  });

  describe('stripAltName', () => {
    it('removes the trailing parenthetical and trims (the canonical example)', () => {
      expect(stripAltName('Davao (Davao del Norte)')).toBe('Davao');
    });

    it('returns a plain name unchanged (trimmed)', () => {
      expect(stripAltName('  Metropolitan Manila  ')).toBe('Metropolitan Manila');
    });

    it('leaves a non-alphanumeric trailing parenthetical in place (guard does not match)', () => {
      expect(stripAltName('Cotabato (North-Cotabato)')).toBe('Cotabato (North-Cotabato)');
    });

    it('removes only the last parenthetical when it is the trailing one', () => {
      expect(stripAltName('Foo (Bar) (Western Samar)')).toBe('Foo (Bar)');
    });

    it('does not strip a parenthetical that is not at the end', () => {
      expect(stripAltName('Davao (del Norte) Region')).toBe('Davao (del Norte) Region');
    });
  });

  describe('sanitize', () => {
    it('trims and strips annotations in one pass', () => {
      expect(sanitize('  Butuan[1]  ')).toBe('Butuan');
      expect(sanitize(' <b>Ilocos &amp; Cagayan</b> ')).toBe('Ilocos & Cagayan');
    });

    it('leaves an already-clean value unchanged', () => {
      expect(sanitize('Nueva Vizcaya')).toBe('Nueva Vizcaya');
    });
  });

  describe('sanitizeProvinceName', () => {
    it('reconciles the reversed Mindoro spellings', () => {
      expect(sanitizeProvinceName('Occidental Mindoro')).toBe('Mindoro Occidental');
      expect(sanitizeProvinceName('Oriental Mindoro')).toBe('Mindoro Oriental');
    });

    it('applies the Mindoro rule after sanitising annotations/whitespace', () => {
      expect(sanitizeProvinceName('  Occidental Mindoro[1]  ')).toBe('Mindoro Occidental');
    });

    it('passes a non-Mindoro province through the sanitiser only', () => {
      expect(sanitizeProvinceName('  Nueva Ecija ')).toBe('Nueva Ecija');
    });

    it('does not rewrite the already-canonical Mindoro spellings', () => {
      expect(sanitizeProvinceName('Mindoro Occidental')).toBe('Mindoro Occidental');
      expect(sanitizeProvinceName('Mindoro Oriental')).toBe('Mindoro Oriental');
    });
  });

  describe('DoD parity spot-check', () => {
    it('splits "Davao (Davao del Norte)" into name + alt name', () => {
      const raw = 'Davao (Davao del Norte)';
      expect(stripAltName(raw)).toBe('Davao');
      expect(getAltName(raw)).toBe('Davao del Norte');
    });
  });
});
