/**
 * URL-slug generation for resources that have no ISO code.
 *
 * Regions and provinces are addressed by their ISO `code` (OD-1), but cities carry
 * none — so a city is addressed by a slug of its `name`, which the schema already
 * guarantees is unique within its province (`@@unique([provinceId, name])`). The slug
 * is derived on demand rather than stored: it is a pure function of `name`, so a
 * column would only add a second copy for ingestion (PHG-013) to keep in sync.
 *
 * Unrelated to `string.util.ts`, which ports the legacy scraper's sanitisers — nothing
 * in the Lumen app slugs anything (it navigated by numeric id).
 */

/**
 * Non-spacing combining marks — the accents NFD decomposition splits off a letter
 * (`ñ` becomes `n` + U+0303 combining tilde).
 */
const COMBINING_MARKS = /\p{Mn}/gu;

/** Any run of characters a slug cannot contain, collapsed to a single separator. */
const NON_SLUG_RUN = /[^a-z0-9]+/g;

/** Separators left at either end once the run above has been substituted. */
const EDGE_SEPARATORS = /^-+|-+$/g;

/**
 * Reduce a place name to its lowercase, hyphen-separated URL form.
 *
 * Accented Latin letters are decomposed and stripped of their marks, so the
 * Spanish-derived spellings common in Philippine place names resolve to plain ASCII
 * (`Parañaque` → `paranaque`, `Peñablanca` → `penablanca`). Everything else that is
 * not a letter or digit — spaces, dots, hyphens, apostrophes — becomes a single
 * separator, with no special cases: one rule, so the slug of any name is predictable
 * from the name alone. A letter with no NFD decomposition (`ø`, `đ`) has no ASCII
 * form to fall back to and separates too; no Philippine LGU name contains one.
 *
 * @example slugify('Bislig')      // 'bislig'
 * @example slugify('Sto. Niño')   // 'sto-nino'
 * @example slugify('Lapu-Lapu')   // 'lapu-lapu'
 * @example slugify("T'Boli")      // 't-boli'
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG_RUN, '-')
    .replace(EDGE_SEPARATORS, '');
}

/**
 * The rule above, stated normatively for OpenAPI (OD-15). It lives beside the
 * implementation so the published contract and the code cannot drift; the city DTOs
 * and the `:city` path parameter all reference this one string.
 */
export const SLUG_RULE_DESCRIPTION =
  'Derived from `name`, never stored: NFD-decompose, strip combining marks, lowercase, ' +
  'collapse each run of non-alphanumeric characters to a single `-`, then trim the ends ' +
  "(`Sto. Niño` → `sto-nino`, `T'Boli` → `t-boli`). Matched exactly — the raw name is a 404, " +
  'not a redirect.';
