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

## Architecture

Standalone modular monolith. `src/geography/` **reads** the DB and serves `/api/v1`; `src/ingestion/` **writes**
it (scraper on a schedule). Shared plumbing lives in `src/common/`, `src/config/`, `src/persistence/`. Layering
is `controller → service → repository (Prisma)`. The in-repo engineering rules live in `.claude/rules/`.

## License

Code: **MIT** (see [LICENSE](./LICENSE)).

The **dataset** is derived from **Wikipedia** ([CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/))
and **ISO 3166** — attribute those sources wherever the data is presented; CC BY-SA share-alike applies if you
redistribute the dataset itself (the code is MIT regardless).
