# PH Geography API

REST API for Philippine geographic reference data — **regions → provinces → cities/municipalities** — with a
self-updating scraper. Built with **NestJS 11 + TypeScript** and **PostgreSQL (Prisma)**.

## Requirements

- **Node.js 20 LTS** (`.nvmrc`) — newer majors work; 20 is the declared baseline (`engines`).
- **pnpm** (`packageManager` pinned).
- **PostgreSQL 16** (local via Docker) — required once the data layer lands.

## Usage

### Installation Instructions

1. Clone the repo and enter it: `git clone <repo-url>` then `cd ph-geography-nestjs`.
2. Start a PostgreSQL database (Docker): `docker compose up -d db`.
3. From the project root run `cp .env.example .env`.
4. Configure your `.env` (at minimum `DATABASE_URL`).
5. Install dependencies: `pnpm install`.
6. Create the schema: `pnpm db:migrate`.
7. Seed the classification lookups, then load the dataset: `pnpm db:seed` (required — cities cannot be
   written without it), then `pnpm ingest` (scrapes the sources → DB; add `--force` to re-process pages
   that haven't changed). The NCR district provinces are created by the ingestion run itself, since they
   hang off the scraped `PH-00` region.
8. Start the API: `pnpm dev` → **http://localhost:3000/api/v1** — interactive docs at
   **`/api/docs`**, health at `/api/v1/health`.

**Common scripts:** `pnpm dev` · `pnpm build` · `pnpm start:prod` · `pnpm lint` · `pnpm format` · `pnpm test` ·
`pnpm test:cov` · `pnpm test:e2e` (see [Testing](#testing)).

### Routes

All endpoints are read-only `GET`s under `/api/v1`.

| Method | Path                                                          | Handler                     | Description                                          |
| ------ | ------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| GET    | `/api/v1/regions`                                             | `RegionsController.index`   | All regions (ordered by name)                        |
| GET    | `/api/v1/regions/{region}`                                    | `RegionsController.show`    | A region with its provinces                          |
| GET    | `/api/v1/regions/{region}/provinces`                          | `ProvincesController.index` | Provinces in the region                              |
| GET    | `/api/v1/regions/{region}/provinces/{province}`               | `ProvincesController.show`  | A province with its region + cities                  |
| GET    | `/api/v1/regions/{region}/provinces/{province}/cities`        | `CitiesController.index`    | Cities/municipalities in the province                |
| GET    | `/api/v1/regions/{region}/provinces/{province}/cities/{city}` | `CitiesController.show`     | A city/municipality (with classification + province) |
| GET    | `/api/v1/health`                                              | `HealthController.liveness` | Liveness — touches nothing; 503 once shutdown begins |
| GET    | `/api/v1/health/ready`                                        | `HealthController.readiness`| Readiness — database ping + ingestion has run        |
| GET    | `/api/docs`                                                   | —                           | OpenAPI / Swagger UI (raw spec at `/api/docs-json`)  |

`{region}` and `{province}` are **ISO 3166 codes** (e.g. `PH-13`, `PH-AGN`); `{city}` is a `name` slug unique
within its province, returned as the city's `slug` field so you never have to derive it yourself. All
identifiers match **exactly** — `/regions/ph-13` is a `404`, not a redirect.

### API conventions

The API follows **standard REST** — a deliberate break from the legacy Lumen app, which wrapped every
response in `{ success, response, code, memory_usage }` and answered **HTTP 200 even for "not found"**.

**Success** — the resource itself, no envelope, with the status code carrying the outcome:

```jsonc
// GET /api/v1/regions/PH-13  →  200
{
  "code": "PH-13",
  "name": "Caraga",
  "name_tl": "Rehiyon ng Karaga",
  "acronym": "XIII",
  "provinces": [{ "code": "PH-AGN", "name": "Agusan del Norte", "alt_name": null, "name_tl": "Hilagang Agusan" }]
}
```

- **Wire fields are `snake_case`** (`name_tl`, `alt_name`, `full_name`, `is_capital`) even though the
  TypeScript models are camelCase — response DTOs map the two with `@Expose({ name: 'name_tl' })`.
- Response DTOs are **opt-in**: `@Exclude()` on the class, `@Expose()` per field. Internal columns (`id`,
  foreign keys, `created_at`/`updated_at`) never reach the wire unless a DTO asks for them.
- Collections have a **defined order** — regions, provinces and cities are all sorted by `name`, including
  where they are nested inside a parent.
- `memory_usage` is gone — it was a PHP artifact with no meaning here.

### Response shapes

Four canonical shapes describe every payload. Each is one class in
[`src/geography/dto/`](src/geography/dto/), so a nested region looks the same whether you found it under a
province or listed it directly — there is no "the nested one is missing a field" case.

| Shape | Fields |
| ----- | ------ |
| **region** | `code`, `name`, `name_tl`, `acronym` |
| **province** | `code`, `name`, `alt_name`, `name_tl` |
| **city** | `name`, `slug`, `alt_name`, `full_name`, `is_capital`, `classification` |
| **classification** | `code`, `description` |

Endpoints are those shapes plus their relations — a list is shallow, a detail adds one level of children:

| Endpoint | Returns |
| -------- | ------- |
| `GET /regions` | `[ region ]` |
| `GET /regions/{region}` | `region` + `provinces: [ province ]` |
| `GET /regions/{region}/provinces` | `[ province + region ]` |
| `GET /regions/{region}/provinces/{province}` | `province` + `region` + `cities: [ city ]` |
| `GET …/cities` | `[ city + province ]` |
| `GET …/cities/{city}` | `city` + `province` |

Notes on individual fields:

- **`alt_name`** is a province's or city's former name. It is always present, and `null` when there isn't one
  — never omitted, never `""`.
- **`is_capital`** is a real JSON boolean.
- **`slug`** is how a city is addressed in a URL, derived from `name`: accents are stripped, everything is
  lowercased, and each run of non-alphanumeric characters becomes one `-` (`Peñablanca` → `penablanca`,
  `Sto. Niño` → `sto-nino`). It is computed, not stored.

The exact payload of all six endpoints is pinned in
[`test/__snapshots__/serialization.e2e-spec.ts.snap`](test/__snapshots__/serialization.e2e-spec.ts.snap) —
that snapshot is the contract, and `pnpm test:e2e` fails if a response drifts from it.

**Differences from the legacy Lumen API.** The shapes above match its documented payloads field-for-field,
with three deliberate additions: a province's nested `cities` carry their `classification` (the old app
documented it but never loaded the relation), a city's `province` is populated (the old resource read a
relation that did not exist), and `slug` is new. Every difference — envelope, status codes, identifiers,
dataset counts — is enumerated and scored in the project's parity matrix, with zero regressions.

**Errors** — [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) `application/problem+json`, with the
status code telling the truth:

```jsonc
// GET /api/v1/regions/PH-99  →  404  Content-Type: application/problem+json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Region 'PH-99' was not found.",
  "instance": "/api/v1/regions/PH-99"
}
```

| Status | When |
| ------ | ---- |
| `400 Bad Request` | Request validation failed. Adds an `errors` array of constraint messages. Every endpoint is read-only, so invalid input is always a malformed path or query param — hence 400 rather than 422. |
| `404 Not Found` | The resource, or the route, does not exist. |
| `500 Internal Server Error` | Unexpected failure. The detail is generic; the stack is logged server-side and never returned. |

Requests are validated by a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). On any
endpoint that declares a query DTO, an undeclared query param is a `400` rather than a silent no-op; endpoints
that take no query parameters at all ignore extras.

## Testing

```bash
pnpm test        # unit — services, scrapers (against saved HTML fixtures), utils
pnpm test:cov    # the same, with coverage; fails below the thresholds in jest.config.ts
pnpm test:e2e    # endpoints, ingestion and schema — needs the test database below
```

Unit tests need nothing but `pnpm install`: scrapers run **offline** against the committed fixtures in
[`test/fixtures/`](test/fixtures/), and services run against a mocked Prisma client. Coverage floors are set
per area in [`jest.config.ts`](./jest.config.ts), which also documents why bootstrap and DI-wiring files are
excluded from the denominator.

### The test database

`pnpm test:e2e` **truncates the geography tables and re-seeds them**, so it needs a database of its own —
never the one you develop against. Create it once:

```bash
docker compose up -d db
docker exec ph-geography-db psql -U ph_geography -d postgres -c "CREATE DATABASE ph_geography_test;"
TEST_DATABASE_URL=postgresql://ph_geography:ph_geography@localhost:5432/ph_geography_test
DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate
```

Then set `TEST_DATABASE_URL` in your `.env` (see `.env.example`). It is a **test-harness variable**: it is
read by [`test/setup-env.ts`](test/setup-env.ts), never by `src/config/`, and the app itself only ever sees
`DATABASE_URL`. A DB-backed spec run without it fails immediately with setup instructions rather than
falling back to your development data.

The suite runs `--runInBand`: three specs share that database, and truncation is not safe in parallel.

### What the e2e suite covers

Most specs boot the real `AppModule` over a stubbed `PrismaService` — fast, deterministic, and enough to pin
the wire contract. [`geography-db.e2e-spec.ts`](test/geography-db.e2e-spec.ts) is the exception: it stubs only
the HTTP fetcher, replays the committed fixtures through the **real ingestion pipeline** (17 regions, 86
provinces, 1,642 cities) and then exercises all six endpoints against **real Postgres** — so ordering,
region-anchored scoping and nested `include`s are proven against SQL rather than against a mock's arguments.

## Architecture

Standalone modular monolith. `src/geography/` **reads** the DB and serves `/api/v1`; `src/ingestion/` **writes**
it (scraper on a schedule). Shared plumbing lives in `src/common/`, `src/config/`, `src/persistence/`. Layering
is `controller → service → repository (Prisma)`. The in-repo engineering rules live in `.claude/rules/`.

## License

Code: **MIT** (see [LICENSE](./LICENSE)).

The **dataset** is derived from **Wikipedia** ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/))
and **ISO 3166** — attribute those sources wherever the data is presented; CC BY-SA share-alike applies if you
redistribute the dataset itself (the code is MIT regardless).
