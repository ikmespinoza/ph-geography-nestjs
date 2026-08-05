import { config as loadDotenv } from 'dotenv';

/**
 * Resolving the database the e2e suite is allowed to write to (PHG-019).
 *
 * This is a **separate database from the developer's** — `pnpm test:e2e` truncates
 * the geography tables and re-seeds them from the HTML fixtures, which is only safe
 * somewhere the suite owns outright. Before PHG-019 the two DB-backed specs read
 * `DATABASE_URL` straight out of `.env` and wrote into the dev database, staying
 * harmless only by prefixing every row they created.
 *
 * `TEST_DATABASE_URL` is a **test-harness variable, not application config**: it is
 * read here and in `setup-env.ts`, never by `src/config/`, so the Zod schema and the
 * "nothing reads process.env outside the config layer" rule are both untouched. What
 * the app sees is an ordinary `DATABASE_URL`.
 */

/** Read the key without `dotenv` writing anything into `process.env` as a side effect. */
export function resolveTestDatabaseUrl(): string | undefined {
  const fromEnvironment = process.env.TEST_DATABASE_URL;
  if (fromEnvironment !== undefined && fromEnvironment.length > 0) {
    return fromEnvironment;
  }

  // `processEnv: {}` parses the file into a throwaway object. Without it, dotenv
  // would also copy the *dev* DATABASE_URL into this process — the one thing this
  // module exists to prevent.
  const fromFile = loadDotenv({ processEnv: {} }).parsed?.TEST_DATABASE_URL;

  return fromFile !== undefined && fromFile.length > 0 ? fromFile : undefined;
}

/**
 * The same value, but a hard failure when it is missing. DB-backed specs call this
 * so an unconfigured machine gets an actionable message instead of a connection
 * error against a placeholder — and never a silent fallback to the dev database,
 * which is how a test run quietly destroys someone's working data.
 */
export function requireTestDatabaseUrl(): string {
  const url = resolveTestDatabaseUrl();
  if (url !== undefined) {
    return url;
  }

  throw new Error(
    [
      'TEST_DATABASE_URL is not set, and this spec writes to a real database.',
      '',
      'Create the test database once, then add the key to your .env:',
      "  docker compose up -d db   # if it isn't already running",
      '  docker exec ph-geography-db psql -U ph_geography -d postgres \\',
      '    -c "CREATE DATABASE ph_geography_test;"',
      '  TEST_DATABASE_URL=postgresql://ph_geography:ph_geography@localhost:5432/ph_geography_test \\',
      '    DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate',
      '',
      'It must NOT point at the database you develop against: `pnpm test:e2e` truncates',
      'the geography tables.',
    ].join('\n'),
  );
}
