/**
 * Fixed constants — reference data and contract values that are deliberately not
 * environment-tunable, so they live as frozen typed constants rather than in the
 * env schema. Most are ported from the legacy `config/constants.php`.
 */

/**
 * Absolute path prefix of the health routes.
 *
 * Three cross-cutting concerns must agree on "what is the health route": responses
 * there are never cached (a cached readiness probe is worse than none), never
 * rate-limited (a 10-second probe would eat the budget and the platform would read
 * the 429 as unhealthy), and never auto-logged (they would drown every real request).
 * One constant so the three cannot drift apart.
 *
 * The rendered prefix is hardcoded rather than composed from `ConfigService`:
 * `globalPrefix` and `apiVersion` are themselves fixed contract values in
 * `app.config.ts`, and injecting config into an interceptor to rebuild a constant
 * string is ceremony. `constants.spec.ts` asserts the two stay in step.
 */
export const HEALTH_PATH_PREFIX = '/api/v1/health';

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
