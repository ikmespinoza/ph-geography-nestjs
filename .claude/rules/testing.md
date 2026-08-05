# Testing Rules

- **New code ships with unit tests.** Every controller, service, scraper, and utility gets a `*.spec.ts` next to its source, covering the happy path and the guard/failure paths.
- **Scrapers are tested offline against saved HTML fixtures** (`test/fixtures/*.html`) — deterministic, no network. Services are tested with a mocked `PrismaService`. Pure string/sanitizer utils are tested exhaustively.
- Endpoint / e2e specs (Supertest) live under `test/` and run against a seeded test DB — happy path, 404s, ordering, plus the legacy parity matrix where the work calls for it. **Don't reproduce known legacy bugs** — e.g. the previously-unimplemented city detail endpoint and the broken city `province` field — assert the corrected behavior.
- Don't test the framework — test behavior: given this request, that response / side effect.
- `pnpm lint && pnpm test` must pass before every commit; run `pnpm test:e2e` when the change touches an endpoint or the ingestion flow.
- A ticket (`PHG-###`) is not done until its Definition of Done / acceptance criteria are covered by tests.
