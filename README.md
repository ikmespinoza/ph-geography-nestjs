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
7. Seed lookups (classifications + NCR districts) and load the dataset: `pnpm db:seed` then `pnpm ingest`
   (scrapes the source → DB).
8. Start the API: `pnpm dev` → **http://localhost:3000/api/v1** (health at `/api/v1/health`).

**Common scripts:** `pnpm dev` · `pnpm build` · `pnpm start:prod` · `pnpm lint` · `pnpm format` · `pnpm test` ·
`pnpm test:e2e`.

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
| GET    | `/api/v1/health`                                              | `HealthController`          | Liveness ping (temporary)                            |
| GET    | `/api/docs`                                                   | —                           | OpenAPI / Swagger UI                                 |

`{region}` and `{province}` are **ISO 3166 codes** (e.g. `PH-13`, `PH-AGN`); `{city}` is a `name` slug unique
within its province. Only `/api/v1/health` is implemented today; the resource routes are in progress.

### API conventions

The API follows **standard REST** — a deliberate break from the legacy Lumen app, which wrapped every
response in `{ success, response, code, memory_usage }` and answered **HTTP 200 even for "not found"**.

**Success** — the resource itself, no envelope, with the status code carrying the outcome:

```jsonc
// GET /api/v1/regions/PH-13  →  200
{ "code": "PH-13", "name": "Caraga", "name_tl": "Rehiyon ng Caraga", "alt_name": "Region XIII" }
```

- **Wire fields are `snake_case`** (`name_tl`, `alt_name`, `full_name`, `is_capital`) even though the
  TypeScript models are camelCase — response DTOs map the two with `@Expose({ name: 'name_tl' })`.
- Response DTOs are **opt-in**: `@Exclude()` on the class, `@Expose()` per field. Internal columns (`id`,
  foreign keys, `created_at`/`updated_at`) never reach the wire unless a DTO asks for them.
- `memory_usage` is gone — it was a PHP artifact with no meaning here.

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

## Architecture

Standalone modular monolith. `src/geography/` **reads** the DB and serves `/api/v1`; `src/ingestion/` **writes**
it (scraper on a schedule). Shared plumbing lives in `src/common/`, `src/config/`, `src/persistence/`. Layering
is `controller → service → repository (Prisma)`. The in-repo engineering rules live in `.claude/rules/`.

## License

Code: **MIT** (see [LICENSE](./LICENSE)).

The **dataset** is derived from **Wikipedia** ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/))
and **ISO 3166** — attribute those sources wherever the data is presented; CC BY-SA share-alike applies if you
redistribute the dataset itself (the code is MIT regardless).
