/**
 * Pure, framework-free string helpers ported from the legacy Lumen scraper.
 *
 * Legacy sources (read-only reference under `lumen-ph-geography/`):
 * - `app/Helpers/StringHelper.php` — {@link getAltName} / {@link stripAltName} / {@link stripAnnotation}
 * - `app/Traits/SanitizerTrait.php` — {@link sanitize} / {@link sanitizeProvinceName}
 *
 * These decide the `name`, `alt_name` and `full_name` of scraped provinces and
 * cities, so they are ported faithfully and tested exhaustively (PHG-005). They
 * touch neither the DOM/HTTP (PHG-011) nor the database — inputs come in as raw
 * cell text and outputs go straight into upserts.
 *
 * NOTE: parsing the source page's "last edited on …" footer — the non-breaking
 * space, `(UTC).` and `This page was last edited on ` tokens — is
 * change-detection (PHG-011), NOT text sanitisation, and is deliberately not
 * handled here. Those tokens stay centralised in `config/constants.ts`
 * (`CHANGE_DETECTION_TOKENS`) so both consumers share one source of truth.
 */

/**
 * Trailing ` (alphanumeric)` parenthetical anchored at the end of a string — the
 * "alternate name" marker, e.g. the ` (Davao del Norte)` in
 * `"Davao (Davao del Norte)"`. Only letters, digits and whitespace are allowed
 * inside, so a hyphenated or punctuated parenthetical is intentionally NOT an
 * alt-name. Shared by {@link getAltName} and {@link stripAltName}.
 *
 * Legacy: `/\s\([A-Za-z0-9\s]+\)$/` (StringHelper.php:8, :18).
 */
const TRAILING_ALT_NAME = /\s\([A-Za-z0-9\s]+\)$/;

/**
 * Every `(...)` group in a string, capturing the inner text. Used to pick the
 * LAST parenthetical once {@link TRAILING_ALT_NAME} confirms one exists.
 *
 * Legacy: `/\(([^\)]+)\)/` via `preg_match_all` (StringHelper.php:12).
 */
const PARENTHETICAL = /\(([^)]+)\)/g;

/**
 * `[...]` footnote / reference marker, e.g. `[1]`, `[a]`, `[note 2]`, `[]`.
 *
 * Legacy: `/\[[^\]]*\]/` (StringHelper.php:22).
 */
const FOOTNOTE_MARKER = /\[[^\]]*\]/g;

/** A well-formed HTML tag `<...>`. Approximates PHP `strip_tags` for scraped cell markup. */
const HTML_TAG = /<[^>]*>/g;

/** An HTML character reference: named (`&amp;`), decimal (`&#160;`) or hex (`&#xA0;`). */
const HTML_ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

/**
 * Named HTML entities, decoded to match PHP `html_entity_decode`. Numeric
 * references (`&#160;`, `&#x2013;`) are decoded generically, so this table only
 * lists named ones: the structural/typographic set plus the full Latin-1
 * Supplement letter block — the accented letters that show up in Spanish-derived
 * Philippine place names (Parañaque, Los Baños, Peñablanca, Sto. Niño). Without
 * the Latin-1 letters, a cell encoded as `Ba&ntilde;os` would keep the raw entity
 * where legacy produced `Baños` — a name-level parity regression. Unknown names
 * are left verbatim (matching `html_entity_decode`); `&nbsp;` decodes to U+00A0
 * (its real value) — normalising NBSP to a plain space is PHG-011's job.
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  // Structural + typographic
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
  hellip: '\u2026',
  deg: '\u00B0',
  // Latin-1 Supplement letters (HTML 4.01 named refs) — accented PH place names
  Agrave: '\u00C0',
  Aacute: '\u00C1',
  Acirc: '\u00C2',
  Atilde: '\u00C3',
  Auml: '\u00C4',
  Aring: '\u00C5',
  AElig: '\u00C6',
  Ccedil: '\u00C7',
  Egrave: '\u00C8',
  Eacute: '\u00C9',
  Ecirc: '\u00CA',
  Euml: '\u00CB',
  Igrave: '\u00CC',
  Iacute: '\u00CD',
  Icirc: '\u00CE',
  Iuml: '\u00CF',
  ETH: '\u00D0',
  Ntilde: '\u00D1',
  Ograve: '\u00D2',
  Oacute: '\u00D3',
  Ocirc: '\u00D4',
  Otilde: '\u00D5',
  Ouml: '\u00D6',
  Oslash: '\u00D8',
  Ugrave: '\u00D9',
  Uacute: '\u00DA',
  Ucirc: '\u00DB',
  Uuml: '\u00DC',
  Yacute: '\u00DD',
  THORN: '\u00DE',
  szlig: '\u00DF',
  agrave: '\u00E0',
  aacute: '\u00E1',
  acirc: '\u00E2',
  atilde: '\u00E3',
  auml: '\u00E4',
  aring: '\u00E5',
  aelig: '\u00E6',
  ccedil: '\u00E7',
  egrave: '\u00E8',
  eacute: '\u00E9',
  ecirc: '\u00EA',
  euml: '\u00EB',
  igrave: '\u00EC',
  iacute: '\u00ED',
  icirc: '\u00EE',
  iuml: '\u00EF',
  eth: '\u00F0',
  ntilde: '\u00F1',
  ograve: '\u00F2',
  oacute: '\u00F3',
  ocirc: '\u00F4',
  otilde: '\u00F5',
  ouml: '\u00F6',
  oslash: '\u00F8',
  ugrave: '\u00F9',
  uacute: '\u00FA',
  ucirc: '\u00FB',
  uuml: '\u00FC',
  yacute: '\u00FD',
  thorn: '\u00FE',
  yuml: '\u00FF',
});

/** The two Wikipedia Mindoro provinces named in reverse across the region/city pages. */
const MINDORO_PROVINCE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'Occidental Mindoro': 'Mindoro Occidental',
  'Oriental Mindoro': 'Mindoro Oriental',
});

/** Convert a Unicode code point to its string, or `null` if it is out of range. */
function codePointToString(codePoint: number): string | null {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return null;
  }
  return String.fromCodePoint(codePoint);
}

/** Decode named + numeric HTML entities; leave anything unrecognised untouched. */
function decodeHtmlEntities(value: string): string {
  return value.replace(HTML_ENTITY, (match, entity: string): string => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return codePointToString(codePoint) ?? match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

/**
 * Strip HTML tags, decode entities and remove `[...]` footnote markers, then
 * trim. Entities are decoded BEFORE tags are stripped (legacy order), so an
 * encoded tag like `&lt;b&gt;` is unwrapped and then removed.
 *
 * Legacy: `trim(preg_replace('/\[[^\]]*\]/', '', strip_tags(html_entity_decode($string))))`
 * (StringHelper.php:22).
 *
 * @example stripAnnotation('Butuan<sup>[1]</sup>') // 'Butuan'
 * @example stripAnnotation('Ilocos &amp; Cagayan') // 'Ilocos & Cagayan'
 */
export function stripAnnotation(value: string): string {
  const decoded = decodeHtmlEntities(value);
  const withoutTags = decoded.replace(HTML_TAG, '');
  const withoutFootnotes = withoutTags.replace(FOOTNOTE_MARKER, '');
  return withoutFootnotes.trim();
}

/**
 * Return the trailing `(...)` parenthetical's inner text (trimmed), or `null`
 * when the string has no qualifying alt-name. Only an alphanumeric parenthetical
 * anchored at the end qualifies; when several exist, the last one wins.
 *
 * Legacy: guard `/\s\([A-Za-z0-9\s]+\)$/`, then `trim(end($alt[1]))` from
 * `preg_match_all('/\(([^\)]+)\)/', ...)` (StringHelper.php:7-15).
 *
 * @example getAltName('Davao (Davao del Norte)') // 'Davao del Norte'
 * @example getAltName('Metropolitan Manila')     // null
 */
export function getAltName(value: string): string | null {
  if (!TRAILING_ALT_NAME.test(value)) {
    return null;
  }
  const matches = [...value.matchAll(PARENTHETICAL)];
  const inner = matches.at(-1)?.[1];
  return inner === undefined ? null : inner.trim();
}

/**
 * Return the string with its trailing `(...)` alt-name removed and trimmed. A
 * string without a qualifying alt-name is returned trimmed but otherwise
 * unchanged (matching {@link getAltName}'s guard).
 *
 * Legacy: `trim(preg_replace('/\s\([A-Za-z0-9\s]+\)$/', '', $string))`
 * (StringHelper.php:17-19).
 *
 * @example stripAltName('Davao (Davao del Norte)') // 'Davao'
 */
export function stripAltName(value: string): string {
  return value.replace(TRAILING_ALT_NAME, '').trim();
}

/**
 * Trim, then strip annotations — the base sanitiser applied to every scraped
 * cell before more specific parsing.
 *
 * Legacy: `StringHelper::stripAnnotation(trim($string))` (SanitizerTrait.php:9-11).
 */
export function sanitize(value: string): string {
  return stripAnnotation(value.trim());
}

/**
 * Sanitise a province name and reconcile the two Wikipedia spellings of the
 * Mindoro provinces (`Occidental Mindoro` → `Mindoro Occidental`,
 * `Oriental Mindoro` → `Mindoro Oriental`) so the region and city pages agree.
 *
 * Legacy: `SanitizerTrait::sanitizeProvinceName` (SanitizerTrait.php:13-19).
 */
export function sanitizeProvinceName(value: string): string {
  const name = sanitize(value);
  return MINDORO_PROVINCE_ALIASES[name] ?? name;
}
