# Source fixtures

Saved copies of the two pages ingestion scrapes. The parser specs run against these, so they
run offline and deterministically — no network, no flakiness, and a Wikipedia edit can never
turn a test red on its own.

| File | Source | Captured | Page last edited |
|---|---|---|---|
| `iso3166-regions.html` | https://en.wikipedia.org/wiki/ISO_3166-2:PH | 2026-08-01 | 29 July 2025, 13:25 UTC |
| `iso3166-cities.html` | https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines | 2026-08-01 | 17 July 2026, 15:06 UTC |

Captured raw and unmodified — the whole value of a fixture is that it is the real markup,
including the parts we don't read. They are large (the cities page is ~3 MB) for the same reason.

## What they pin

- **regions**: 17 regions (`#Regions`) and 82 provinces (`#Provinces`), footnote markers
  (`09[a]`, `IV-B[c]`) intact, `PH-COM`'s empty `name_tl` cell, and `PH-WSA`'s
  `Samar (local variant: Western Samar)`.
- **cities**: 1,642 LGUs, the `Class`/`Province` columns at indexes 5 and 6, the thick-border
  capital cells, the dagger/double-dagger settlement markers, and the 17 rows filed under
  `Metro Manila`.

## Checking whether they have gone stale

These specs stay green forever once captured, so they can't tell you the live page has moved.
That's what the opt-in network test is for — run it before a release, or when ingestion starts
rejecting rows:

```bash
INGESTION_LIVE_TEST=1 pnpm test http-fetcher.live
```

It fetches both pages for real and asserts the parsers still work, the capital marker still
matches rows, and all 17 NCR LGUs still resolve. It is skipped in every ordinary run.

## Refreshing them

Re-download with the same URLs, then run `pnpm test`. **A failure after a refresh is the point**
— it means the page moved and the parsers need to follow, so read the diff before touching a
parser. Update the table above with the new capture date and the new "last edited" values (the
change-detection spec asserts them).

```bash
curl -sSL -A "ph-geography-api/1.0" -o test/fixtures/iso3166-regions.html \
  "https://en.wikipedia.org/wiki/ISO_3166-2:PH"
curl -sSL -A "ph-geography-api/1.0" -o test/fixtures/iso3166-cities.html \
  "https://en.wikipedia.org/wiki/List_of_cities_and_municipalities_in_the_Philippines"
```

Known drift already absorbed since the legacy Lumen scraper was written: headings are wrapped in
`<div class="mw-heading">`, the cities page no longer has a `#List` anchor, its province column
reads `Metro Manila` rather than `NCR …`, and its last row is a real municipality rather than a
summary row.
