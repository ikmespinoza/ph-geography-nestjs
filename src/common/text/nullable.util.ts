/**
 * Normalisation for optional text columns on the way to the wire.
 *
 * Only `alt_name` (a province's or city's former name) is nullable in the schema, and
 * the API contract is that it is **always present and `null` when there isn't one** —
 * never omitted, never an empty string (PHG-010). A DTO assigning the column straight
 * through would honour the first half of that but not the second: a row holding `''`
 * would put `"alt_name": ""` on the wire, which a consumer has to special-case on top
 * of the `null` it was promised.
 *
 * `''` and `null` mean the same thing here — no alternative name — so collapsing them
 * is faithful rather than lossy. Ingestion writes `null` today (`getAltName`,
 * PHG-005); this is what keeps the contract true regardless of what a future source
 * yields.
 */

/**
 * Return `null` for a value that carries no text, and the value unchanged otherwise.
 *
 * Whitespace-only input counts as blank, but a real value is never trimmed or altered
 * — sanitising scraped text is ingestion's job (`common/text/string.util.ts`), not the
 * serialisation layer's.
 *
 * @example blankToNull(null)                // null
 * @example blankToNull('')                  // null
 * @example blankToNull('   ')               // null
 * @example blankToNull('Compostela Valley') // 'Compostela Valley'
 */
export function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value;
}
