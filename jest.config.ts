import type { Config } from 'jest';

/**
 * Unit-test configuration (PHG-018). The e2e suite has its own config at
 * `test/jest-e2e.json` and collects no coverage — which is why a file exercised
 * only by e2e still scores 0 % here.
 *
 * This lives in a `.ts` file rather than package.json's `jest` key so the coverage
 * exclusions below can carry the reason they exist. An exclusion list without one
 * silently inflates the number it is measured against.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  coverageDirectory: '../coverage',

  /**
   * What the threshold is measured against. Every exclusion is a file whose only
   * behaviour is *being wired correctly* — which the e2e suite proves by booting
   * AppModule. Excluding them aims the threshold rather than lowering it: left in,
   * they cost ~15 points of statement coverage that no honest unit test can win
   * back, which would force the floor down to a number that never fires.
   *
   * Everything with logic stays in — DTOs, controllers, services, indicators,
   * filters, interceptors, parsers, writers, config factories and utils.
   */
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!generated/**', // Prisma's generated client — not ours
    '!**/*.module.ts', // DI wiring; asserted by the e2e boot, not by unit tests
    '!main.ts', // HTTP bootstrap
    '!ingest.ts', // CLI bootstrap
    '!config/openapi.ts', // a static DocumentBuilder literal; its content is asserted in openapi.e2e-spec.ts
  ],

  /**
   * Floors set from the measured baseline, rounded down to the nearest 5 — high
   * enough that deleting a spec turns the build red, low enough that it never
   * blocks honest work. A threshold above reality breaks the build on day one; one
   * far below it never fires.
   *
   * A path-scoped entry removes those files from `global`, so the four groups below
   * are disjoint: `global` covers what the other three don't (cache, http, config,
   * health, persistence).
   *
   * **Branches sit ~20 points below statements everywhere, and that is expected.**
   * Two things account for nearly all of it, neither reachable from a unit test:
   *   - `@ApiProperty({ type: () => Dto })` and `@ApiOkResponse` thunks, which only
   *     run when SwaggerModule builds the document — asserted in `openapi.e2e-spec.ts`.
   *     This is also why `geography/` functions sit at 85: its DTOs are mostly thunks.
   *   - destructuring defaults that `noUncheckedIndexedAccess` requires but a matched
   *     regex makes unreachable (e.g. `last-modified.parser.ts`'s `[, day = '', …]`).
   * Raising these floors means deleting unreachable code or weakening types, not
   * writing tests — so don't, without checking which of the two you are looking at.
   */
  coverageThreshold: {
    global: { statements: 95, branches: 75, functions: 95, lines: 95 },
    // Pure string utils, tested exhaustively by rule — no reason for these to slip.
    './src/common/text/': { statements: 100, branches: 95, functions: 100, lines: 100 },
    './src/geography/': { statements: 95, branches: 75, functions: 85, lines: 95 },
    './src/ingestion/': { statements: 95, branches: 80, functions: 95, lines: 95 },
  },
};

export default config;
