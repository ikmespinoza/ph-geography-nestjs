# PH Geography API

[![CI](https://github.com/ikmespinoza/ph-geography-nestjs/actions/workflows/ci.yml/badge.svg)](https://github.com/ikmespinoza/ph-geography-nestjs/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Data](https://img.shields.io/badge/data-CC_BY--SA_4.0-EF9421.svg?logo=creativecommons&logoColor=white)](#license)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E.svg?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9_strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-5FA04E.svg?logo=nodedotjs&logoColor=white)](.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748.svg?logo=prisma&logoColor=white)](https://www.prisma.io)

[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-6BA539.svg?logo=openapiinitiative&logoColor=white)](#-api)
[![Jest](https://img.shields.io/badge/Jest-29-C21325.svg?logo=jest&logoColor=white)](#-automated-tests)
[![Docker](https://img.shields.io/badge/Docker-compose_ready-2496ED.svg?logo=docker&logoColor=white)](#option-a--docker-everything-in-one-command)
[![Zod](https://img.shields.io/badge/Zod-4-3E67B1.svg?logo=zod&logoColor=white)](https://zod.dev)
[![Pino](https://img.shields.io/badge/logs-pino-687634.svg)](https://getpino.io)
[![Cheerio](https://img.shields.io/badge/scraper-cheerio-E88C1F.svg)](https://cheerio.js.org)

> **REST API for Philippine geographic reference data** — regions → provinces →
> cities/municipalities — with a self-updating scraper that keeps itself current.

Read-only, unauthenticated, and small enough to run anywhere: **one container plus a Postgres**.
Built with **NestJS 11 + TypeScript (strict)** on **PostgreSQL 16 via Prisma**.

```bash
curl http://localhost:3000/api/v1/regions/PH-07/provinces/PH-CEB/cities/cebu-city
```
```json
{
  "name": "Cebu City", "slug": "cebu-city", "alt_name": null,
  "full_name": "Cebu City", "is_capital": true,
  "classification": { "code": "HUC", "description": "Highly Urbanized City" },
  "province": { "code": "PH-CEB", "name": "Cebu", "alt_name": null, "name_tl": "Sebu" }
}
```

---

## Contents

- [What's in the box](#whats-in-the-box)
- [Requirements](#requirements)
- [Quick start](#-quick-start)
- [Configuration](#-configuration)
- [API](#-api)
- [Testing it manually](#-testing-it-manually)
- [Automated tests](#-automated-tests)
- [Gotchas](#-gotchas)
- [Scripts](#-scripts)
- [Architecture](#-architecture)
- [Deployment](#-deployment)
- [License](#license)

---

## What's in the box

| | |
|---|---|
| 🗺️ **Complete dataset** | 17 regions · 86 provinces · 1,642 cities & municipalities |
| 🔄 **Self-updating** | Daily scrape at 03:00, skipping source pages that haven't changed |
| 📖 **Documented** | Swagger UI at `/api/docs`, generated from decorators — never hand-written |
| 🎯 **Honest HTTP** | RFC 7807 errors, real `404`s, no `{ success: true }` envelope |
| 🛡️ **Hardened** | Rate limiting, CORS, response caching, structured logs |
| 🧪 **Tested** | Unit + e2e, scrapers pinned to offline HTML fixtures |
| 🐳 **One command** | `docker compose up` brings up db → migrate → seed → API |

## Requirements

| | Version | Notes |
|---|---|---|
| **Node.js** | 20 LTS | [`.nvmrc`](.nvmrc). Newer majors work; 20 is the declared baseline in `engines`. |
| **pnpm** | 10 | Pinned via `packageManager`. |
| **PostgreSQL** | 16 | Easiest via the bundled `docker compose`. |
| **Docker** | any recent | Optional for local dev, required for the one-command path. |

---

## 🚀 Quick start

### Option A · Docker (everything in one command)

The whole stack — database, schema, seed and API — from a clean checkout:

```bash
cp .env.example .env          # compose reads it for ${DB_PORT}/${APP_PORT} only
docker compose up             # db → migrate (schema + seed) → app
docker compose exec app node dist/ingest.js    # first scrape → ~7 s, needs network
```

→ **http://localhost:3000/api/v1** · docs at `/api/docs` · health at `/api/v1/health`

<details>
<summary>Why the first ingestion is a separate command</summary>

Wiring a live 3 MB scrape into `up` would make **starting the stack fail on an offline machine**.
It is `node dist/ingest.js` rather than `pnpm ingest` because the compiled entry point is already
in the image. Add `--force` to re-process pages that haven't changed.

The **`migrate`** service is a one-shot job that applies migrations and seeds the classifications,
then exits; the API waits for it. Both steps are idempotent, so `up` is safe to re-run. It is
built from its own image stage because the served image deliberately carries no Prisma CLI or
ts-node.

`docker compose up -d db` still starts **only** the database — the flow Option B uses.
</details>

### Option B · Local development

```bash
# 1 · database
docker compose up -d db

# 2 · configure
cp .env.example .env                       # at minimum, check DATABASE_URL

# 3 · install
pnpm install                               # runs `prisma generate` via postinstall

# 4 · schema + lookups
pnpm db:migrate                            # create the schema
pnpm db:seed                               # seed the 4 classifications — REQUIRED before ingest

# 5 · data
pnpm ingest                                # scrape the sources → DB  (~7 s, needs network)

# 6 · run
pnpm dev                                   # → http://localhost:3000/api/v1
```

A healthy `pnpm ingest` finishes like this:

```text
Regions:   17 created, 0 updated, 0 unchanged
Provinces: 82 created, 0 updated, 0 unchanged, 0 rejected
NCR districts: 4 created, 0 updated, 0 unchanged
Capitals:  83 marked across 86 provinces
Cities:    1642 created, 0 updated, 0 unchanged, 0 rejected
run ok · source=ISO 3166 · force=false · 6973ms
```

Re-running is safe — writes are idempotent upserts, so a second run reports `unchanged`
rather than creating duplicates. The **NCR district provinces are created by the ingestion
itself**, since they hang off the scraped `PH-00` region.

> 💡 **Port 5432 already taken?** Set `DB_PORT=5433` in `.env` **and** match it in
> `DATABASE_URL` (`…@localhost:5433/…`). Compose reads `DB_PORT`; the app only ever reads
> `DATABASE_URL`, so the two must agree.

---

## ⚙️ Configuration

Every variable is validated at boot by a **Zod schema** — a missing or malformed value exits
non-zero with a readable message rather than failing later. `.env` is gitignored;
[`.env.example`](.env.example) is the committed reference.

> 🔒 **Never read `process.env` outside `src/config/`.** That's the whole point of the fail-fast layer.

| Variable | Default | What it does |
|----------|---------|--------------|
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string. |
| `NODE_ENV` | `development` | `development` · `test` · `production` |
| `PORT` | `3000` | HTTP listen port. |
| `DB_PORT` | `5432` | Host port compose publishes for Postgres. **Compose only.** |
| `APP_PORT` | `3000` | Host port compose publishes for the API. **Compose only.** |
| `INGESTION_SCHEDULE_CRON` | `0 3 * * *` | When the scheduled scrape runs. |
| `INGESTION_ENABLE_SCHEDULE` | `true` | Arm the cron in this process. `pnpm ingest` forces `false`. |
| `INGESTION_REQUEST_TIMEOUT_MS` | `15000` | Per-request fetch timeout. |
| `INGESTION_MAX_RETRIES` | `2` | Retries after a failed fetch (transient errors only). |
| `INGESTION_RETRY_BACKOFF_MS` | `500` | Base backoff, doubled per attempt. |
| `INGESTION_USER_AGENT` | *(project UA)* | Sent by the scraper. Be a good citizen. |
| `SOURCE_ISO3166_REGION_URL` | *(Wikipedia)* | Allow-listed source for regions & provinces. |
| `SOURCE_ISO3166_CITY_URL` | *(Wikipedia)* | Allow-listed source for cities. |
| `CACHE_ENABLED` | `true` | Cache read responses in memory. |
| `CACHE_TTL_MS` | `60000` | Response TTL, **milliseconds**. |
| `THROTTLE_ENABLED` | `true` | Arm the rate limiter. |
| `THROTTLE_TTL_MS` | `60000` | Rate-limit window, **milliseconds**. |
| `THROTTLE_LIMIT` | `120` | Requests per window, per client. |
| `CORS_ORIGINS` | `*` | Comma-separated list, or `*`. Public read-only data sent without credentials. |
| `LOG_LEVEL` | `info` | pino level: `trace`…`fatal`, `silent`. |
| `TEST_DATABASE_URL` | — | **Test harness only** — see [Automated tests](#-automated-tests). |

---

## 📚 API

All endpoints are read-only `GET`s under `/api/v1`. **No auth, no request bodies, no query
parameters.**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/regions` | All regions, ordered by name |
| `GET` | `/api/v1/regions/{region}` | A region with its provinces |
| `GET` | `/api/v1/regions/{region}/provinces` | Provinces in the region |
| `GET` | `/api/v1/regions/{region}/provinces/{province}` | A province with its region + cities |
| `GET` | `/api/v1/regions/{region}/provinces/{province}/cities` | Cities/municipalities in the province |
| `GET` | `/api/v1/regions/{region}/provinces/{province}/cities/{city}` | A city, with classification + province |
| `GET` | `/api/v1/health` | Liveness — touches nothing |
| `GET` | `/api/v1/health/ready` | Readiness — DB ping + ingestion has run |
| `GET` | `/api/docs` | Swagger UI (raw spec at `/api/docs-json`) |

`{region}` and `{province}` are **ISO 3166 codes** (`PH-07`, `PH-CEB`); `{city}` is the **slug**
returned in every city object. Identifiers match **exactly** — `/regions/ph-07` is a `404`,
not a redirect.

Responses carry no envelope, use `snake_case` wire fields, are always ordered by `name`, and
never leak database internals:

```jsonc
// GET /api/v1/regions/PH-07  →  200
{
  "code": "PH-07",
  "name": "Central Visayas",
  "name_tl": "Rehiyon ng Gitnang Bisaya",
  "acronym": "VII",
  "provinces": [
    { "code": "PH-BOH", "name": "Bohol", "alt_name": null, "name_tl": "Bohol" },
    { "code": "PH-CEB", "name": "Cebu",  "alt_name": null, "name_tl": "Sebu" }
  ]
}
```

Errors are [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) `application/problem+json`,
with the status code telling the truth:

```jsonc
// GET /api/v1/regions/PH-99  →  404
{ "type": "about:blank", "title": "Not Found", "status": 404,
  "detail": "Region 'PH-99' was not found.", "instance": "/api/v1/regions/PH-99" }
```

> 📖 **[API.md](./API.md) is the complete reference** — every endpoint with full sample
> responses, a field-by-field breakdown, the slug rules, the error catalog, response headers,
> `jq` recipes, and dataset statistics.

<details>
<summary>Response shapes at a glance</summary>

| Shape | Fields |
|-------|--------|
| **region** | `code`, `name`, `name_tl`, `acronym` |
| **province** | `code`, `name`, `alt_name`, `name_tl` |
| **city** | `name`, `slug`, `alt_name`, `full_name`, `is_capital`, `classification` |
| **classification** | `code`, `description` |

A list is shallow; a detail adds one level of children. A nested region is identical to a
top-level one — there is no "the nested copy is missing a field" case.

The exact payload of all six endpoints is pinned in
[`test/__snapshots__/serialization.e2e-spec.ts.snap`](test/__snapshots__/serialization.e2e-spec.ts.snap) —
that snapshot **is** the contract, and `pnpm test:e2e` fails if a response drifts from it.
</details>

<details>
<summary>Differences from the legacy Lumen API</summary>

The shapes match its documented payloads field-for-field, with three deliberate improvements:

1. a province's nested `cities` carry their `classification` (the old app documented it but
   never loaded the relation);
2. a city's `province` is populated (the old resource read a relation that did not exist);
3. `slug` is new.

Plus the structural changes: no `{ success, response, code, memory_usage }` envelope, and real
status codes instead of `200`-for-everything. Every difference is enumerated and scored in the
project's parity matrix, with zero regressions. See [MIGRATION.md](./MIGRATION.md).
</details>

---

## 🔍 Testing it manually

### The easy way — Swagger UI

Open **http://localhost:3000/api/docs** and click through. Every endpoint has *Try it out*,
real schemas, and example values. The spec is generated from `@nestjs/swagger` decorators, so
it cannot drift from the code.

### The fast way — curl

Walk the hierarchy top-down. Each response tells you the identifier for the next call:

```bash
B=http://localhost:3000/api/v1

curl $B/health                                          # 1 · is it alive?
curl $B/health/ready                                    # 2 · is there data?
curl $B/regions                                         # 3 · 17 regions
curl $B/regions/PH-07                                   # 4 · + its provinces
curl $B/regions/PH-07/provinces                          # 5 · provinces, each with its region
curl $B/regions/PH-07/provinces/PH-SIG                   # 6 · + its 6 cities
curl $B/regions/PH-07/provinces/PH-CEB/cities            # 7 · 53 cities in Cebu
curl $B/regions/PH-07/provinces/PH-CEB/cities/cebu-city  # 8 · one city
```

Pipe through `jq` for readable output — `curl -s $B/regions | jq`.

### Check the failure paths too

A working API is one that fails correctly. All five of these should return **404**, not 200:

```bash
curl -i $B/regions/PH-99                        # unknown code
curl -i $B/regions/ph-07                        # wrong case — no redirect
curl -i $B/regions/PH-01/provinces/PH-CEB       # real province, wrong region
curl -i $B/regions/PH-07/provinces/PH-CEB/cities/Cebu%20City   # name instead of slug
curl -i http://localhost:3000/api/regions       # version prefix omitted
```

### Confirm caching and rate limiting are live

```bash
curl -sD - -o /dev/null $B/regions | grep -iE 'x-cache|ratelimit|cache-control'
# X-RateLimit-Limit: 120
# X-RateLimit-Remaining: 118
# X-Cache: MISS          ← HIT on the second call within CACHE_TTL_MS
# Cache-Control: public, max-age=60
```

Trip the limiter deliberately — 140 concurrent requests against a 120/min window:

```bash
node -e "Promise.all(Array.from({length:140},()=>fetch('http://localhost:3000/api/v1/regions')))
  .then(r=>{const c={};r.forEach(x=>c[x.status]=(c[x.status]||0)+1);console.log(c)})"
# { '200': 120, '429': 20 }
```

Health endpoints are `@SkipThrottle()`-exempt, so hammering `/api/v1/health` will **not** trip it —
that's by design, so a 10-second probe interval can't starve the budget.

### Inspect the database directly

```bash
docker exec ph-geography-db psql -U ph_geography -d ph_geography \
  -c "SELECT (SELECT count(*) FROM regions) regions,
             (SELECT count(*) FROM provinces) provinces,
             (SELECT count(*) FROM cities) cities;"
#  regions | provinces | cities
#       17 |        86 |   1642
```

---

## 🧪 Automated tests

```bash
pnpm test        # unit — services, scrapers (offline HTML fixtures), utils
pnpm test:cov    # + coverage; fails below the thresholds in jest.config.ts
pnpm test:e2e    # endpoints, ingestion and schema — needs the test database below
```

Unit tests need nothing but `pnpm install`: scrapers run **offline** against the committed
fixtures in [`test/fixtures/`](test/fixtures/), and services run against a mocked Prisma client.
Coverage floors are set per area in [`jest.config.ts`](./jest.config.ts), which also documents
why bootstrap and DI-wiring files are excluded from the denominator.

### The test database

`pnpm test:e2e` **truncates the geography tables and re-seeds them**, so it needs a database of
its own — never the one you develop against. Create it once:

```bash
docker compose up -d db
docker exec ph-geography-db psql -U ph_geography -d postgres \
  -c "CREATE DATABASE ph_geography_test;"

# match the port to DB_PORT if you changed it
export TEST_DATABASE_URL=postgresql://ph_geography:ph_geography@localhost:5432/ph_geography_test
DATABASE_URL=$TEST_DATABASE_URL pnpm db:migrate
```

Then set `TEST_DATABASE_URL` in your `.env`. It is a **test-harness variable**: read by
[`test/setup-env.ts`](test/setup-env.ts), never by `src/config/`, and the app itself only ever
sees `DATABASE_URL`. A DB-backed spec run without it fails immediately with setup instructions
rather than silently falling back to your development data.

The suite runs `--runInBand`: three specs share that database, and truncation is not safe in
parallel.

### What the e2e suite covers

Most specs boot the real `AppModule` over a stubbed `PrismaService` — fast, deterministic, and
enough to pin the wire contract. [`geography-db.e2e-spec.ts`](test/geography-db.e2e-spec.ts) is
the exception: it stubs only the HTTP fetcher, replays the committed fixtures through the **real
ingestion pipeline** (17 regions, 86 provinces, 1,642 cities), then exercises all six endpoints
against **real Postgres** — so ordering, region-anchored scoping and nested `include`s are proven
against SQL rather than against a mock's arguments.

---

## ⚠️ Gotchas

Six things that will cost you time if you don't know them. The full list, with symptoms, lives
in [API.md § Gotchas](./API.md#gotchas).

<table>
<tr><td>1️⃣</td><td><b>Cities are addressed by <code>slug</code>, not <code>name</code>.</b>
<code>…/cities/Cebu%20City</code> → <code>404</code>; <code>…/cities/cebu-city</code> → <code>200</code>.
Read <code>slug</code> off the list response instead of deriving it — <code>Butuan</code>
(<code>full_name: "Butuan City"</code>) slugs to <code>butuan</code>, not <code>butuan-city</code>.</td></tr>

<tr><td>2️⃣</td><td><b><code>pnpm ingest</code> can't invalidate a running server's cache.</b>
The read cache is <b>in-memory and per-process</b>, so ingesting from a second terminal leaves the
live server serving stale data for up to <code>CACHE_TTL_MS</code> (60 s). The symptom is
distinctive: <code>/regions</code> returns <code>[]</code> while <code>/regions/PH-07</code> returns
full data. Wait it out or restart. The <b>scheduled in-process</b> run has no such gap.</td></tr>

<tr><td>3️⃣</td><td><b><code>/health/ready</code> answers <code>503</code> until the first ingestion.</b>
Migrate + seed gives you the schema and four classifications but <b>zero geography rows</b>.
Point restart probes at <code>/health</code> instead, or a fresh stack will restart-loop before
anyone can populate it.</td></tr>

<tr><td>4️⃣</td><td><b>Lookups are region-anchored.</b> <code>PH-CEB</code> is a real province, but
<code>/regions/PH-01/provinces/PH-CEB</code> is a <code>404</code> — Cebu isn't in Ilocos. The URL
asserts a hierarchy and the API enforces it.</td></tr>

<tr><td>5️⃣</td><td><b>Identifiers are case-sensitive and the version prefix isn't optional.</b>
<code>/regions/ph-07</code> and <code>/api/regions</code> are both <code>404</code>s. Only
<code>/api/docs</code> and <code>/api/docs-json</code> live outside <code>/api/v1</code>.</td></tr>

<tr><td>6️⃣</td><td><b>Run exactly one instance.</b> The cache is in-memory and the ingestion cron
arms in <i>every</i> process. A second replica means a second stale cache and a second cron — an
advisory lock keeps the concurrent run <i>safe</i>, but not useful.</td></tr>
</table>

---

## 📜 Scripts

| Script | What it does |
|--------|--------------|
| `pnpm dev` | Watch-mode server via nodemon + ts-node |
| `pnpm build` | `nest build` + path-alias rewrite → `dist/` |
| `pnpm start:prod` | Run the compiled `dist/main.js` |
| `pnpm ingest [--force]` | Manual scrape. `--force` re-processes unchanged pages |
| `pnpm db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `pnpm db:migrate:dev` | Create + apply a migration in development |
| `pnpm db:seed` | Seed the classification lookups (idempotent) |
| `pnpm db:reset` | Drop, re-migrate and re-seed — **destroys data** |
| `pnpm test` · `test:cov` · `test:e2e` | See [Automated tests](#-automated-tests) |
| `pnpm lint` · `lint:fix` | ESLint over `src/` and `test/` |
| `pnpm format` · `format:check` | Prettier |
| `pnpm typecheck` | `tsc --noEmit` |

---

## 🏗️ Architecture

Standalone **modular monolith** — one deployable, one database, one Prisma schema.

```
src/
├── geography/     READ side — serves /api/v1, never writes
│   ├── regions/  provinces/  cities/  dto/
├── ingestion/     WRITE side — scraper, never serves reads
│   ├── scraper-core/  change-detection/  sources/iso3166/  writers/
├── common/        cache/  http/  text/
├── config/  persistence/  health/  logging/
└── main.ts  app.module.ts  ingest.ts
```

That read/write split is the internal seam — the fault line if the service is ever decomposed.
Layering is strictly `controller → service → repository (Prisma)`: controllers are thin, the DB
is reached only through `PrismaService`, and providers are always injected, never `new`ed.

Scraping fetches through a single `HttpFetcher` (timeout / retry / User-Agent from config) and
parses with `cheerio` using resilient selectors plus row-shape validation — it **fails loudly on
layout drift** rather than silently inserting garbage, and only fetches allow-listed URLs.

The in-repo engineering rules live in [`.claude/rules/`](.claude/rules/).

---

## 🚢 Deployment

One container plus a Postgres 16. Any host that can do these five things is enough — no
Kubernetes, no IaC:

1. run an OCI container built from the [`Dockerfile`](./Dockerfile) (`--target runtime`);
2. provide **PostgreSQL 16**;
3. run a **one-off release command before the app starts** — this is where the `migrator` image
   stage runs `pnpm db:migrate && pnpm db:seed`. A platform that can't run a pre-deploy job would
   force the Prisma CLI and ts-node into the served image;
4. inject environment variables (`DATABASE_URL` at minimum — the config layer validates the whole
   environment at boot and exits non-zero with a readable message);
5. run **exactly one instance** (see gotcha 6️⃣).

The image is a multi-stage build: dependencies + `prisma generate` → compile → a runtime stage
carrying only `dist/` and production dependencies, running as the unprivileged `node` user.
It is **~540 MB** on disk, most of it `@prisma/client` and the Prisma CLI pnpm installs as a peer.

**Probes.** Restart probe → `/api/v1/health` (liveness). Traffic probe → `/api/v1/health/ready`
(DB ping + "ingestion has run at least once").

**First run.** After the first deploy the database is migrated and seeded but empty of geography;
run `node dist/ingest.js` once in the container. After that the cron keeps it current
(`INGESTION_SCHEDULE_CRON`, default 03:00 daily), skipping any source page that hasn't changed.

**Rollback** is redeploying the previous image tag. Migrations are additive and ingestion is an
idempotent upsert, so an older image serves the same data — nothing needs un-migrating.

---

## Contributing

Conventional commits (`feat|fix|refactor|test|chore|docs(scope): summary`), branches named
`feature/<slug>` or `fix/<slug>`.

A Husky `pre-commit` hook runs **`lint-staged`** — ESLint `--fix` and Prettier over staged `.ts`
files. It does **not** run the test suite, so `pnpm lint && pnpm test` before you commit is on
you (and `pnpm test:e2e` when the change touches an endpoint or the ingestion flow). `--no-verify`
is not an accepted workaround. Schema changes ship their migration in the same change-set; new
code ships its tests.

## License

**Code: [MIT](./LICENSE)** © 2026 Ian Kris Espinoza.

**Dataset: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).** The geographic data
is derived from **Wikipedia** and **ISO 3166** — attribute those sources wherever the data is
presented, and note that CC BY-SA **share-alike applies if you redistribute the dataset itself**.
The code is MIT regardless of what you do with the data.
