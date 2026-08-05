# API Reference

Complete reference for the PH Geography API — every endpoint, every field, with real
responses captured from a running instance.

> New here? [README.md](./README.md) covers installing and running the service.
> Coming from the legacy Lumen API? See [MIGRATION.md](./MIGRATION.md).

**Base URL** `http://localhost:3000/api/v1` · **Interactive docs** `/api/docs` · **Raw spec** `/api/docs-json`

---

## Contents

- [At a glance](#at-a-glance)
- [Conventions](#conventions)
- [Identifiers](#identifiers)
- [Endpoints](#endpoints)
  - [1 · List regions](#1--list-regions)
  - [2 · Get a region](#2--get-a-region)
  - [3 · List provinces in a region](#3--list-provinces-in-a-region)
  - [4 · Get a province](#4--get-a-province)
  - [5 · List cities in a province](#5--list-cities-in-a-province)
  - [6 · Get a city](#6--get-a-city)
  - [7 · Health](#7--health)
- [Field reference](#field-reference)
- [The dataset](#the-dataset)
- [Errors](#errors)
- [Response headers](#response-headers)
- [Recipes](#recipes)
- [Gotchas](#gotchas)

---

## At a glance

Everything is a read-only `GET`. There is **no authentication**, **no request body**, and
**no query parameters** anywhere in the API.

| # | Method | Path | Returns |
|:-:|--------|------|---------|
| 1 | `GET` | `/api/v1/regions` | `[ region ]` |
| 2 | `GET` | `/api/v1/regions/{region}` | `region` + `provinces[]` |
| 3 | `GET` | `/api/v1/regions/{region}/provinces` | `[ province + region ]` |
| 4 | `GET` | `/api/v1/regions/{region}/provinces/{province}` | `province` + `region` + `cities[]` |
| 5 | `GET` | `/api/v1/regions/{region}/provinces/{province}/cities` | `[ city + province ]` |
| 6 | `GET` | `/api/v1/regions/{region}/provinces/{province}/cities/{city}` | `city` + `province` |
| 7 | `GET` | `/api/v1/health` · `/api/v1/health/ready` | liveness · readiness |

The hierarchy is strict — a city is always reached **through** its province, which is always
reached **through** its region:

```
regions ──► provinces ──► cities
 PH-07       PH-CEB        cebu-city
```

---

## Conventions

**No envelope.** The resource *is* the response body. The HTTP status carries the outcome —
this is a deliberate break from the legacy Lumen API, which wrapped everything in
`{ success, response, code, memory_usage }` and answered `200` even for "not found".

```jsonc
// ✅ this API                          // ❌ the old Lumen API
{ "code": "PH-07", "name": "…" }        { "success": true, "code": 200,
                                          "response": { … }, "memory_usage": "2MB" }
```

**Wire fields are `snake_case`** — `name_tl`, `alt_name`, `full_name`, `is_capital` — even
though the TypeScript models are camelCase.

**Nothing internal leaks.** Response DTOs are opt-in (`@Exclude()` on the class, `@Expose()`
per field), so database `id`s, foreign keys and `created_at` / `updated_at` never reach the wire.

**Collections are always ordered by `name`**, ascending — including nested ones. The order is
stable across calls, so you never need to sort client-side.

**Nulls are explicit.** An optional field is present and `null` — never omitted, never `""`.

**Shapes are consistent.** A nested region is identical to a top-level one. There is no
"the nested copy is missing a field" case.

---

## Identifiers

| Resource | Identified by | Examples |
|----------|---------------|----------|
| Region | **ISO 3166-2 code** | `PH-07`, `PH-13`, `PH-00` (NCR) |
| Province | **ISO 3166-2 code** | `PH-CEB`, `PH-AGN`, `PH-00-D1` (NCR district) |
| City | **slug** of its name | `cebu-city`, `butuan`, `sto-nino` |

**Codes are case-sensitive and match exactly.** `/regions/ph-07` is a **`404`**, not a redirect.

**Cities have no ISO code**, so they are addressed by a slug derived from `name`. You never
have to build it yourself — every city object carries its own `slug`. The rule, if you want it:
decompose accents and strip the marks, lowercase, then collapse each run of non-alphanumeric
characters into a single `-`.

| Name | Slug |
|------|------|
| `Bislig` | `bislig` |
| `Cebu City` | `cebu-city` |
| `Lapu-Lapu` | `lapu-lapu` |
| `Peñablanca` | `penablanca` |
| `Sto. Niño` | `sto-nino` |
| `T'Boli` | `t-boli` |

A slug is unique **within its province**, which is why the province is part of the path.

---

## Endpoints

### 1 · List regions

```http
GET /api/v1/regions
```

All 17 regions, ordered by `name`. Shallow — no provinces.

```bash
curl http://localhost:3000/api/v1/regions
```

<details open>
<summary><code>200 OK</code> — 17 items (first 2 shown)</summary>

```json
[
  {
    "code": "PH-14",
    "name": "Autonomous Region in Muslim Mindanao",
    "name_tl": "Nagsasariling Rehiyon ng Muslim sa Mindanaw",
    "acronym": "ARMM"
  },
  {
    "code": "PH-05",
    "name": "Bicol",
    "name_tl": "Rehiyon ng Bikol",
    "acronym": "V"
  }
]
```
</details>

> Ordering is alphabetical by `name`, **not** by code — which is why `PH-14` comes first.

---

### 2 · Get a region

```http
GET /api/v1/regions/{region}
```

One region **with its provinces** nested one level deep.

```bash
curl http://localhost:3000/api/v1/regions/PH-07
```

<details open>
<summary><code>200 OK</code></summary>

```json
{
  "code": "PH-07",
  "name": "Central Visayas",
  "name_tl": "Rehiyon ng Gitnang Bisaya",
  "acronym": "VII",
  "provinces": [
    { "code": "PH-BOH", "name": "Bohol",           "alt_name": null, "name_tl": "Bohol" },
    { "code": "PH-CEB", "name": "Cebu",            "alt_name": null, "name_tl": "Sebu" },
    { "code": "PH-NER", "name": "Negros Oriental", "alt_name": null, "name_tl": "Silangang Negros" },
    { "code": "PH-SIG", "name": "Siquijor",        "alt_name": null, "name_tl": "Sikihor" }
  ]
}
```
</details>

<details>
<summary><b>Special case: NCR</b> — <code>GET /api/v1/regions/PH-00</code></summary>

Metro Manila has no provinces, so the ingestion models its four **districts** as provinces.
They carry the only synthetic codes in the dataset (`PH-00-D1`…`D4`) and every one has an
`alt_name`:

```json
{
  "code": "PH-00",
  "name": "National Capital Region",
  "name_tl": "Pambansang Punong Rehiyon",
  "acronym": "NCR",
  "provinces": [
    { "code": "PH-00-D1", "name": "Capital District",         "alt_name": "City of Manila",   "name_tl": "Distrito ng Kabisera" },
    { "code": "PH-00-D2", "name": "Eastern Manila District",  "alt_name": "Eastern Manila",   "name_tl": "Eastern Manila District" },
    { "code": "PH-00-D3", "name": "Northern Manila District", "alt_name": "CAMANAVA",         "name_tl": "Northern Manila District" },
    { "code": "PH-00-D4", "name": "Southern Manila District", "alt_name": "Southern Manila",  "name_tl": "Southern Manila District" }
  ]
}
```

The 17 Metro Manila LGUs hang off these districts, so the drill-down works uniformly —
no branching for NCR in your client.
</details>

**Errors** — `404` if no region has that exact code.

---

### 3 · List provinces in a region

```http
GET /api/v1/regions/{region}/provinces
```

Provinces in the region, ordered by `name`. Each one **carries its parent region** — handy when
you fan these out and lose the surrounding context.

```bash
curl http://localhost:3000/api/v1/regions/PH-07/provinces
```

<details open>
<summary><code>200 OK</code> — 4 items (first shown)</summary>

```json
[
  {
    "code": "PH-BOH",
    "name": "Bohol",
    "alt_name": null,
    "name_tl": "Bohol",
    "region": {
      "code": "PH-07",
      "name": "Central Visayas",
      "name_tl": "Rehiyon ng Gitnang Bisaya",
      "acronym": "VII"
    }
  }
]
```
</details>

**Errors** — `404` if the region does not exist.

---

### 4 · Get a province

```http
GET /api/v1/regions/{region}/provinces/{province}
```

One province, **with its region and all its cities**. The richest single call in the API.

```bash
curl http://localhost:3000/api/v1/regions/PH-07/provinces/PH-SIG
```

<details open>
<summary><code>200 OK</code> — <code>cities</code> has 6 entries (2 shown)</summary>

```json
{
  "code": "PH-SIG",
  "name": "Siquijor",
  "alt_name": null,
  "name_tl": "Sikihor",
  "region": {
    "code": "PH-07",
    "name": "Central Visayas",
    "name_tl": "Rehiyon ng Gitnang Bisaya",
    "acronym": "VII"
  },
  "cities": [
    {
      "name": "Enrique Villanueva",
      "slug": "enrique-villanueva",
      "alt_name": null,
      "full_name": "Enrique Villanueva",
      "is_capital": false,
      "classification": { "code": "Mun", "description": "Municipality" }
    },
    {
      "name": "Larena",
      "slug": "larena",
      "alt_name": null,
      "full_name": "Larena",
      "is_capital": false,
      "classification": { "code": "Mun", "description": "Municipality" }
    }
  ]
}
```
</details>

> Nested cities **include their `classification`**. The legacy Lumen API documented this but
> never loaded the relation — one of three deliberate improvements over it.

<details>
<summary><b>A province with an <code>alt_name</code></b> — <code>GET /api/v1/regions/PH-08/provinces/PH-WSA</code></summary>

```json
{
  "code": "PH-WSA",
  "name": "Samar",
  "alt_name": "Western Samar",
  "name_tl": "Samar",
  "region": { "code": "PH-08", "name": "Eastern Visayas", "name_tl": "Rehiyon ng Silangang Bisaya", "acronym": "VIII" },
  "cities": [ "…" ]
}
```
</details>

**Errors** — `404` if the region does not exist, the province does not exist, **or the province
is not in that region**. The lookup is region-anchored; see [Gotchas](#gotchas).

---

### 5 · List cities in a province

```http
GET /api/v1/regions/{region}/provinces/{province}/cities
```

Every city and municipality in the province, ordered by `name`. Each carries its
`classification` and its parent `province`.

```bash
curl http://localhost:3000/api/v1/regions/PH-07/provinces/PH-SIG/cities
```

<details open>
<summary><code>200 OK</code> — 6 items (first shown)</summary>

```json
[
  {
    "name": "Enrique Villanueva",
    "slug": "enrique-villanueva",
    "alt_name": null,
    "full_name": "Enrique Villanueva",
    "is_capital": false,
    "classification": { "code": "Mun", "description": "Municipality" },
    "province": {
      "code": "PH-SIG",
      "name": "Siquijor",
      "alt_name": null,
      "name_tl": "Sikihor"
    }
  }
]
```
</details>

> Cebu (`PH-CEB`) returns **53** entries — a good endpoint to test pagination-free clients against.

**Errors** — `404` if the region or province does not exist, or they are not related.

---

### 6 · Get a city

```http
GET /api/v1/regions/{region}/provinces/{province}/cities/{city}
```

One city or municipality, with its `classification` and parent `province`.
`{city}` is the **slug**, not the name.

```bash
curl http://localhost:3000/api/v1/regions/PH-07/provinces/PH-CEB/cities/cebu-city
```

<details open>
<summary><code>200 OK</code></summary>

```json
{
  "name": "Cebu City",
  "slug": "cebu-city",
  "alt_name": null,
  "full_name": "Cebu City",
  "is_capital": true,
  "classification": {
    "code": "HUC",
    "description": "Highly Urbanized City"
  },
  "province": {
    "code": "PH-CEB",
    "name": "Cebu",
    "alt_name": null,
    "name_tl": "Sebu"
  }
}
```
</details>

<details>
<summary><b>When <code>full_name</code> differs from <code>name</code></b> — <code>…/PH-13/provinces/PH-AGN/cities/butuan</code></summary>

```json
{
  "name": "Butuan",
  "slug": "butuan",
  "alt_name": null,
  "full_name": "Butuan City",
  "is_capital": false,
  "classification": { "code": "HUC", "description": "Highly Urbanized City" },
  "province": { "code": "PH-AGN", "name": "Agusan del Norte", "alt_name": null, "name_tl": "Hilagang Agusan" }
}
```

`name` is the bare place name and `full_name` is the official form. Slugs derive from `name`,
so this city is `butuan` — **not** `butuan-city`.
</details>

> This endpoint **did not work at all** in the legacy Lumen API, and its `province` field read a
> relation that did not exist. Both are fixed here.

**Errors** — `404` if any link in the chain is missing or unrelated.

---

### 7 · Health

```http
GET /api/v1/health          # liveness  — touches nothing
GET /api/v1/health/ready    # readiness — DB ping + "ingestion has run"
```

<details open>
<summary><code>GET /api/v1/health</code> → <code>200 OK</code></summary>

```json
{ "status": "ok", "info": {}, "error": {}, "details": {} }
```
</details>

<details>
<summary><code>GET /api/v1/health/ready</code> → <code>200 OK</code></summary>

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "ingestion": {
      "status": "up",
      "resources": {
        "ISO 3166/region":   { "last_run_at": "2026-08-05T13:49:20.669Z", "last_seen_at": "2025-07-29T13:25:00.000Z" },
        "ISO 3166/province": { "last_run_at": "2026-08-05T13:49:21.010Z", "last_seen_at": "2025-07-29T13:25:00.000Z" },
        "ISO 3166/city":     { "last_run_at": "2026-08-05T13:49:27.045Z", "last_seen_at": "2026-08-02T01:17:00.000Z" }
      }
    }
  },
  "error": {},
  "details": { "…": "same as info" }
}
```

`last_run_at` is when this service last processed the source; `last_seen_at` is how recently the
**source page itself** changed.
</details>

| | Liveness `/health` | Readiness `/health/ready` |
|---|---|---|
| Checks | nothing | database ping + ingestion has run ≥ once |
| Before first ingestion | `200` | **`503`** — an empty geography tree isn't ready to serve |
| During shutdown | `503` | `503` |
| Use it for | restart probes | traffic / load-balancer probes |
| Rate limited | **no** | **no** |

> ⚠️ Never point a **restart** probe at `/health/ready` — a fresh deployment would restart-loop
> before anyone could run the first ingestion.

---

## Field reference

Four canonical shapes describe every payload. Each is one class in
[`src/geography/dto/`](src/geography/dto/).

### `region`

| Field | Type | Notes |
|-------|------|-------|
| `code` | `string` | ISO 3166-2, e.g. `PH-07`. The URL identifier. |
| `name` | `string` | English name. |
| `name_tl` | `string` | Filipino/Tagalog name. |
| `acronym` | `string` | Roman numeral or short form — `VII`, `NCR`, `ARMM`. |

### `province`

| Field | Type | Notes |
|-------|------|-------|
| `code` | `string` | ISO 3166-2, e.g. `PH-CEB`. The URL identifier. |
| `name` | `string` | English name. |
| `alt_name` | `string \| null` | Former or alternative name. `null` when there isn't one. |
| `name_tl` | `string` | Filipino/Tagalog name. |

### `city`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Bare place name — `Butuan`. |
| `slug` | `string` | **The URL identifier.** Derived from `name`, unique within the province. |
| `alt_name` | `string \| null` | Former name. `null` when there isn't one. |
| `full_name` | `string` | Official form — `Butuan City`. Equals `name` for most municipalities. |
| `is_capital` | `boolean` | A real JSON boolean, not `0`/`1`/`"true"`. |
| `classification` | `object` | See below. |

### `classification`

| Field | Type | Notes |
|-------|------|-------|
| `code` | `string` | `Mun` · `CC` · `ICC` · `HUC` |
| `description` | `string` | Human-readable expansion. |

The four values are a fixed, seeded lookup:

| Code | Description |
|------|-------------|
| `Mun` | Municipality |
| `CC` | Component City |
| `ICC` | Independent Component City |
| `HUC` | Highly Urbanized City |

### Which relations come back where

| Endpoint | `region` | `provinces[]` | `cities[]` | `province` | `classification` |
|----------|:--------:|:-------------:|:----------:|:----------:|:----------------:|
| `GET /regions` | — | — | — | — | — |
| `GET /regions/{r}` | *self* | ✅ | — | — | — |
| `GET /regions/{r}/provinces` | ✅ | — | — | *self* | — |
| `GET /regions/{r}/provinces/{p}` | ✅ | — | ✅ | *self* | ✅ (on each city) |
| `GET …/cities` | — | — | — | ✅ | ✅ |
| `GET …/cities/{c}` | — | — | — | ✅ | ✅ |

Relations go **one level deep** — a city nested in a province does not repeat the province, and a
province nested in a region does not repeat the region. No cycles, no `?include=`.

---

## The dataset

Counts from the ingestion run of **2026-08-05**. They track the upstream sources, so expect
small drift over time.

| | Count |
|---|---:|
| Regions | **17** |
| Provinces | **86** |
| Cities & municipalities | **1,642** |
| Provincial capitals | **83** |

Provinces break down as **82 real provinces + 4 synthetic NCR districts**. Cities by classification:

| Classification | Count | Share |
|----------------|------:|------:|
| `Mun` — Municipality | 1,493 | ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 90.9% |
| `CC` — Component City | 111 | ▓▓ 6.8% |
| `HUC` — Highly Urbanized City | 33 | ▏2.0% |
| `ICC` — Independent Component City | 5 | ▏0.3% |

**Sources.** Scraped from Wikipedia's [ISO 3166-2:PH](https://en.wikipedia.org/wiki/ISO_3166-2:PH)
and [List of cities and municipalities in the Philippines](https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines)
pages, refreshed daily at 03:00 by the in-process scheduler. See [Licensing](./README.md#license) —
the dataset is **CC BY-SA 4.0** even though the code is MIT.

---

## Errors

All errors are [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) problem documents served
as **`application/problem+json`**. The status code always tells the truth.

```jsonc
// GET /api/v1/regions/PH-99  →  404
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Region 'PH-99' was not found.",
  "instance": "/api/v1/regions/PH-99"
}
```

| Field | Meaning |
|-------|---------|
| `type` | Problem type URI. `about:blank` — the status code is the whole story. |
| `title` | Short, stable summary of the status code. |
| `status` | Repeats the HTTP status, for clients that only read the body. |
| `detail` | Human-readable specifics. **Don't parse this** — it is not a stable contract. |
| `instance` | The path that produced the error. |

### Status codes

| Status | When |
|--------|------|
| `400 Bad Request` | Request validation failed. Adds an `errors` array of constraint messages. Every endpoint is read-only, so bad input is always a malformed path — hence `400`, not `422`. |
| `404 Not Found` | The resource, or the route itself, does not exist. |
| `429 Too Many Requests` | Rate limit exceeded. Adds a `Retry-After` header. |
| `500 Internal Server Error` | Unexpected failure. `detail` is generic; the stack is logged server-side and never returned. |

### Every 404 you can hit

| Request | `detail` |
|---------|----------|
| `/regions/PH-99` | `Region 'PH-99' was not found.` |
| `/regions/ph-07` *(wrong case)* | `Region 'ph-07' was not found.` |
| `/regions/PH-01/provinces/PH-CEB` *(wrong region)* | `Province 'PH-CEB' was not found.` |
| `/regions/PH-07/provinces/PH-CEB/cities/nope` | `City 'nope' was not found.` |
| `/regions/PH-07/provinces/PH-CEB/cities/Cebu%20City` *(name, not slug)* | `City 'Cebu City' was not found.` |
| `/nope` *(unknown route)* | `Cannot GET /api/v1/nope` |
| `/api/regions` *(version omitted)* | `Cannot GET /api/regions` |

### `429 Too Many Requests`

```jsonc
// 121st request within the window  →  429   Retry-After: 60
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "ThrottlerException: Too Many Requests",
  "instance": "/api/v1/regions"
}
```

Defaults are **120 requests per 60 s per client** (`THROTTLE_LIMIT`, `THROTTLE_TTL_MS`).
Verified: firing 140 concurrent requests yields exactly `120 × 200` and `20 × 429`.
Health endpoints are exempt.

---

## Response headers

| Header | Example | Meaning |
|--------|---------|---------|
| `X-Cache` | `HIT` / `MISS` | Whether the response came from the in-memory cache. |
| `Cache-Control` | `public, max-age=60` | Matches `CACHE_TTL_MS`. Safe for CDN/browser caching. |
| `X-RateLimit-Limit` | `120` | Requests allowed per window. |
| `X-RateLimit-Remaining` | `118` | Remaining in the current window. |
| `X-RateLimit-Reset` | `40` | Seconds until the window resets. |
| `Retry-After` | `60` | **On `429` only.** Seconds to wait. |
| `x-request-id` | `a71db555-…` | Correlates the response with server logs. Quote it in bug reports. |

```bash
curl -sD - -o /dev/null http://localhost:3000/api/v1/regions | grep -iE 'x-cache|ratelimit'
```

---

## Recipes

**Walk the whole tree for one region**

```bash
B=http://localhost:3000/api/v1
curl -s $B/regions/PH-07 \
  | jq -r '.provinces[].code' \
  | xargs -I{} curl -s "$B/regions/PH-07/provinces/{}/cities" \
  | jq -r '.[].full_name'
```

**Find every capital in a region**

```bash
curl -s $B/regions/PH-07/provinces/PH-CEB/cities | jq '.[] | select(.is_capital)'
```

**List all highly urbanized cities in a province**

```bash
curl -s $B/regions/PH-07/provinces/PH-CEB/cities \
  | jq '[.[] | select(.classification.code == "HUC") | .full_name]'
```

**Resolve a city slug without guessing at the rules**

```bash
curl -s $B/regions/PH-13/provinces/PH-AGN/cities \
  | jq -r '.[] | select(.name == "Butuan") | .slug'      # → butuan
```

**Count everything**

```bash
curl -s $B/regions | jq 'length'                          # → 17
curl -s $B/regions/PH-07/provinces/PH-CEB/cities | jq 'length'   # → 53
```

**Generate a typed client** from the committed OpenAPI spec:

```bash
curl -s http://localhost:3000/api/docs-json > openapi.json
npx openapi-typescript openapi.json -o src/api-types.ts
```

---

## Gotchas

> **1 · Cities are addressed by `slug`, not by `name`.**
> `…/cities/Cebu%20City` returns `404`; `…/cities/cebu-city` works. Every city object carries
> its own `slug` — read it from the list response rather than deriving it. Note that
> `Butuan` (`full_name`: `Butuan City`) slugs to `butuan`, **not** `butuan-city`.

> **2 · Identifiers are case-sensitive.**
> `/regions/ph-07` is a `404`, not a redirect to `/regions/PH-07`. Uppercase your ISO codes;
> lowercase your city slugs.

> **3 · Lookups are region-anchored — a valid code in the wrong parent is a `404`.**
> `PH-CEB` is a real province, but `/regions/PH-01/provinces/PH-CEB` returns `404` because Cebu
> is not in Ilocos. This is intentional: the URL asserts a hierarchy, and the API enforces it.

> **4 · `pnpm ingest` cannot invalidate a running server's cache.**
> The read cache is **in-memory and per-process**. When you ingest from a second terminal — or
> via `docker compose exec` — the invalidation happens in *that* process, so the live server
> keeps serving stale data for up to `CACHE_TTL_MS` (60 s by default). The symptom is
> distinctive: `/regions` returns `[]` while `/regions/PH-07` returns full data, because only
> the list was cached. Wait 60 s, or restart the server. The **scheduled in-process** run has
> no such gap.

> **5 · `/health/ready` answers `503` until the first ingestion completes.**
> Migrating and seeding gets you the schema and the four classifications, but **zero geography
> rows** — you must run the scrape once. Point restart probes at `/health` instead.

> **6 · The version prefix is not optional.**
> `/api/regions` is a `404`. Every endpoint lives under `/api/v1`. The only unversioned paths
> are `/api/docs` and `/api/docs-json`.

> **7 · There are no query parameters.**
> No pagination, no filtering, no sorting, no `?include=`. The dataset is small and fully
> ordered by design — fetch the collection and filter client-side. An endpoint that declares a
> query DTO rejects undeclared params with `400`; today none do.
