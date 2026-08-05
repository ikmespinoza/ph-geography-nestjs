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
// The endpoint suites re-request one URL with different stub data, so a cache would
// serve the first response to the second assertion — a silent failure that reads like
// a service bug. cache.e2e-spec.ts turns it back on for itself.
process.env.CACHE_ENABLED ??= 'false';
// Likewise the rate limiter: several suites fire the same route in a tight loop.
// throttle.e2e-spec.ts turns it back on for itself.
process.env.THROTTLE_ENABLED ??= 'false';
// Keep the suites' output to the assertions themselves rather than a request log.
process.env.LOG_LEVEL ??= 'silent';
