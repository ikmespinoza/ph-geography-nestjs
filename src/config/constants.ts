/**
 * Domain constants ported from the legacy `config/constants.php`. These are
 * fixed reference data, not environment-tunable, so they live as frozen typed
 * constants rather than in the env schema.
 */

/** Classification code as stored/served (natural key for the classification). */
export type ClassificationCode = 'Mun' | 'CC' | 'ICC' | 'HUC';

/** Whether a classification denotes a municipality or a city. */
export type ClassificationKind = 'municipality' | 'city';

export interface Classification {
  readonly code: ClassificationCode;
  readonly name: string;
  readonly kind: ClassificationKind;
}

/**
 * The four PH LGU classifications (legacy `classifications.city` +
 * `classifications.municipality`). Seed reference for PHG-004/PHG-005.
 */
export const CLASSIFICATIONS: readonly Classification[] = Object.freeze([
  { code: 'Mun', name: 'Municipality', kind: 'municipality' },
  { code: 'CC', name: 'Component City', kind: 'city' },
  { code: 'ICC', name: 'Independent Component City', kind: 'city' },
  { code: 'HUC', name: 'Highly Urbanized City', kind: 'city' },
]);

/**
 * Token markers used to extract a source page's "last edited" timestamp
 * (legacy `omit.modified_at` / `omit.utc`). Consumed by change-detection
 * (PHG-011): the modified-at text sits between these two tokens.
 */
export const CHANGE_DETECTION_TOKENS = Object.freeze({
  modifiedAtPrefix: 'This page was last edited on ',
  utcSuffix: '(UTC).',
});
