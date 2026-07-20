/**
 * e2e env bootstrap. Booting AppModule validates the environment (Zod, fail-fast),
 * so provide the required DATABASE_URL. A dummy URL is enough — no ticket before
 * PHG-003 opens a real connection; every other var falls back to its schema default.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/ph_geography_test';
