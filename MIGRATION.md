# Migrating from the Lumen API

This service replaces **`lumen-ph-geography`** (Laravel Lumen 8 · PHP 7.3 · MySQL). It serves the same
data — regions → provinces → cities/municipalities — from the same source, with the same field names.

This note is the short version: **what a consumer of the old API has to change, and why.** Every decision
below was recorded before it was implemented, and every difference is scored row-by-row in the project's
parity matrix — including the ones that are deliberate improvements. The matrix's verdict is **7 of 7
legacy routes and 17 of 17 response fields accounted for, with zero regressions.**

## The three things that will break a client

### 1. Paths are versioned

```
GET /api/regions/…        →    GET /api/v1/regions/…
```

### 2. There is no envelope

The legacy app wrapped every response:

```jsonc
{ "success": true, "response": { … }, "code": 200, "memory_usage": "2.5MB" }
```

The payload is now the resource itself, and the HTTP status carries the outcome. `memory_usage` is gone —
it was a PHP artifact with no meaning here.

### 3. "Not found" is a 404, not a 200

The legacy app answered **HTTP 200** with `success: false` for a missing resource. Errors are now
[RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) `application/problem+json` with a truthful status
code:

```jsonc
// GET /api/v1/regions/PH-99  →  404
{ "type": "about:blank", "title": "Not Found", "status": 404,
  "detail": "Region 'PH-99' was not found.", "instance": "/api/v1/regions/PH-99" }
```

A consequence worth calling out: an unknown region or province on a **list** route now 404s where the
legacy answered `200 []`. Stack traces are never returned.

## Identifiers

Resources are addressed by their **ISO 3166 code** (`PH-13`, `PH-AGN`) rather than the numeric database id,
which was never stable across re-seeds. Cities are addressed by a **slug** derived from the name
(`Sto. Niño` → `sto-nino`), returned as the city's `slug` field so you never have to derive it.

**Identifiers match exactly.** `/regions/ph-13` is a 404, not a case-insensitive hit or a redirect.

## Four legacy defects that are fixed, not reproduced

If you worked around any of these, remove the workaround:

| | Legacy behavior | Now |
|---|---|---|
| **City detail** | the route existed but its action body was empty | implemented, and returns the city with its province |
| **City `province`** | the resource read a `provinces` relation that did not exist | a populated, singular `province` object |
| **Province detail** | nested `cities` shipped without their `classification`, though the README documented it | `classification` is present |
| **NCR** | the scraper silently dropped Metro Manila — 17 LGUs missing | present, filed under four district provinces `PH-00-D1…D4` |

Payloads are otherwise field-for-field identical, with `slug` added. Collections now have a **defined
order** (by `name`) everywhere, including nested ones — the legacy lazy-loaded them with no ordering.

## Operational changes

- **PostgreSQL 16**, not MySQL. The schema is the same shape, plus the unique natural keys and foreign-key
  indexes the legacy schema lacked.
- **Ingestion is an idempotent upsert** keyed by natural key, on a schedule, guarded by change detection
  and an advisory lock. The legacy scraper was insert-only and had no guard for cities at all.
- **The `GET /test` route is not ported.** It ran a live scrape on a GET request.
- **The API stays unauthenticated** — it is public, read-only reference data — but is now rate-limited and
  CORS-scoped to `GET`.
- No `classifications` endpoint exists. Neither did the legacy one: its `ClassificationController` was
  never registered in `routes/api.php` and all five actions were empty. Classifications are returned inline
  on every city.

## One thing worth knowing about the old app

A legacy instance pointed at today's Wikipedia **scrapes zero cities and reports success.** Its
`CityScraper` locates the table with `$dom->find('#List', 0)`, and that anchor no longer exists on the
source page; it finds nothing, skips the block, and exits cleanly. Two of its other assumptions are dead
too. This is why parity was scored against the legacy *source* rather than by diffing two running
instances, and it is the clearest argument for this rewrite's rule that the scraper **fails loudly** on
layout drift rather than silently writing nothing.

## Where the full reasoning lives

Every difference above was decided before it was built, and the arguments are written down — in the
rewrite's **planning workspace**, which is kept alongside this repository rather than inside it:

- **the parity matrix** — every legacy route, field and behavior, scored MATCH / INTENTIONAL DIVERGENCE /
  REGRESSION, each MATCH naming the test that would fail if it stopped being true;
- **the open-decisions register** — the 15 decisions behind the divergences above, each with its evidence;
- **the architecture decision** — why this is one NestJS service rather than a distributed topology.

What is enforced *here* is the part that can be: the exact payload of all six endpoints is frozen in
[`test/__snapshots__/serialization.e2e-spec.ts.snap`](test/__snapshots__/serialization.e2e-spec.ts.snap),
and `pnpm test:e2e` fails if a response drifts from it.
