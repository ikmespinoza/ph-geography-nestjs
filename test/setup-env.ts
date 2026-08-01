/**
 * e2e env bootstrap. Booting AppModule validates the environment (Zod, fail-fast),
 * so provide the required DATABASE_URL. A dummy URL is enough — e2e specs that don't
 * exercise persistence stub PrismaService (see app.e2e-spec.ts), so no real
 * connection is opened; every other var falls back to its schema default.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/ph_geography_test';
// Booting AppModule also wires IngestionModule; no test process should arm the
// scheduled scrape (it would leave a live timer behind after the suite).
process.env.INGESTION_ENABLE_SCHEDULE ??= 'false';
