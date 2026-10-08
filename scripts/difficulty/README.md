# Measured difficulty scoring (2026-10-06)

Outputs (dry run; `assets/locations.json` is NOT modified):
- `../../assets/difficulty/difficulty-full.json`: all 2000 locations (`meta` + `items`, each with difficulty, difficultyWhy, terms, measured inputs, notes)
- `oversize-features.json`: natural features with measured R > 150 km (framework §2.7), cities never listed

## Run (in order)
    python3 country_span.py     # A: country-span.json + main-territory.npz (Natural Earth 10m, ~8 s)
    python3 warm.py             # F: fills pageviews-cache.json for all 2000 (chunked, resumable)
    python3 extent.py           # S: extent.json (Wikidata class + OSM / Wikidata-extreme-point R); progress every 500
    python3 score.py            # -> ../../assets/difficulty/difficulty-full.json; progress every 500
    python3 oversize.py         # -> oversize-features.json
All network lookups are cached (`pageviews-cache.json`, `extent-cache.json`), so a rerun after a crash resumes.
`extent.py` exits with `STALL: ...` if one item takes over 10 min, and Overpass retries are bounded
(3 tries, 90 s). The previous attempt stalled because each Overpass object could retry for about an hour without logging.

## Decisions (2026-10-06)

**1. Framework variant: primate relief (§2.2) + neighbor rule (§2.6) ship.** Both are part of the
framework's formula, not optional add-ons, and the pilot matched §3's formula column 24/26 exact and
26/26 within ±1 with them. `basic` (MATRIX[F][A] + K + C + S − G) is kept on every row for audit only.

**2. Missing sizes: measure, don't accept S=0 by default.** Order: (a) OSM geometry tagged with the
item's Wikidata Q, (b) Wikidata extreme points P1332–P1335 (northern/southern/eastern/westernmost
coordinates), both real coordinates. Wikidata area (P2046) is not used, because turning an area into
a radius assumes a shape (§2.7). The hand-written `extentKm` values from the framework draft are no
longer used either; they were estimates. Items with neither source get S=0 and the note
"extentKm unmeasured", and they are listed in `oversize-features.json` → `naturalUnmeasured`. City
and point classes (settlements, buildings, summits, waterfalls) are S=0 by construction, because the
pin is the canonical point.

**3. Forbidden City: §3 → 2.** Icon landmarks (difficulty 1) need F0, the same bar as icon cities.
Forbidden City is F1, so it gets neighbor base 1 + step 0 and the non-icon floor of 2. The framework
doc's §2.9 was revised to match.

**4. Country spans: the polygon measurements are trusted.** A comes from Natural Earth 10m admin-0
(map units for the UK nations). Main territory is the largest polygon plus everything within 500 km
of it, and the span is the maximum great-circle vertex distance. Where this disagreed with the
framework's from-memory examples (South Korea, Scotland, Honduras, Panama → A1; Egypt, Morocco,
Tanzania, Afghanistan, Kazakhstan → A2; Mexico → A3), the measurement wins. Borderline cases within
100 km of a tier edge (Egypt 1584, Tanzania 1520, Afghanistan 1536, Kazakhstan 2959) are noted, not
overridden. Morocco's polygon includes Western Sahara.

## Files
- `wiki.py`: F. Title resolution (coords-verified), 12-month pageviews (2025-10..2026-09), langlinks.
- `country_span.py`: A. `extent.py`: S. `oversize.py`: the §2.7 > 150 km list. `score.py`: C, G, K, icon, formula.
- `country-familiarity.json` (K, §2.4 verbatim), `geo-anchors.json` (G, §2.8 named examples only),
  `primate-cities.json` (capital / #1 metro, for icon + relief).

Moved from `.build-tmp/difficulty-measured/` to `scripts/difficulty/` on 2026-10-07. `ne/` and the two network caches are gitignored. `country-span.json` and `main-territory.npz` aren't kept here: run `country_span.py` first to regenerate them (the committed span is in `assets/difficulty/`). The framework's rules are paraphrased in `SPEC-v1.md`.
