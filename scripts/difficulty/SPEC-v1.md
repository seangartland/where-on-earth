# Build spec: difficulty scoring system (Where on Earth)

Workdir: `~/workspace/map-game/demo/.build-tmp/difficulty/`. Write ALL outputs here. Python 3 stdlib only (no pip installs).
Framework (read §2 fully, §3 for calibration): `~/workspace/map-game/demo/.fanout-tmp/difficulty-framework.md`.
Data: `~/workspace/map-game/demo/assets/locations.json` (2000 items: id, short, clue, lat, lng, country, difficulty, difficultyWhy). **READ-ONLY. Never write to anything under assets/.**

Existing `difficultyWhy` format: `F4·A1·K0·C0·S0 → 6 → evened to 4` (sometimes `·G1`, sometimes `→ 2 (Icon) →`). The number after the first `→` is the raw formula score; "evened to" is a later redistribution step we are NOT reproducing. Compare against the raw score and the components.

Natural Earth is already downloaded in `ne/`: `ne_10m_admin_0_countries.geojson` and `ne_10m_admin_0_map_units.geojson` (has England, Scotland, Wales, N. Ireland as separate units). Note: `assets/world-10m.geo.json` is a coastline-only MultiLineString with no country boundaries, so it cannot be used for spans; say so in the README.

## Deliverables

### 1. `build_country_span.py` → `country-span.json`
- For every distinct `country` value in locations.json (184, incl. "England", "Scotland", "Wales", "Northern Ireland", "United Kingdom", "International Waters", "Antarctica", "Palestine", "Kosovo", "Vatican City", "Cape Verde", "DR Congo", "Congo", "Czech Republic", "Micronesia", "Cook Islands", "Niue"...), map to an NE feature (explicit alias table for name mismatches; use map_units for the UK home nations, countries file for everything else).
- **Main territory**: drop polygons whose nearest point is > 1000 km from the largest polygon (the framework's "detached territory" rule). Then span = max great-circle distance between any two vertices of the remaining polygons. Make it fast: take the convex-hull-ish candidate set (e.g. dedupe vertices, subsample long rings to ≤ 2000 points, then exact pairwise max on the reduced set); haversine, R=6371 km.
- Tier: A0 <600, A1 600–1500, A2 1500–3000, A3 >3000.
- Special entries: `"International Waters"` → A1 (no span). Antarctica → A3.
- Output: `{ "<country>": {"spanKm": int, "A": int, "neName": "...", "note": "..."} , ..., "_detached": {...} }` where `_detached` documents the A=2 detached-territory rule (§2.2) and lists a bounding-box/region table for known detached territories (Easter Island, Galápagos, Svalbard, Hawaii, Canaries, Azores, Madeira, Tristan da Cunha, Chagos, Pitcairn, Réunion, Falklands, Andaman & Nicobar, Socotra, Bermuda ...) that the scorer uses: if a location's lat/lng is in one of those regions, A=2 regardless of country.
- Print a table of country, spanKm, A; flag any country whose computed A disagrees with the framework's §2.2 example table, and any whose A disagrees with the majority A in existing difficultyWhy values. Do not hand-override computed tiers to force agreement; report disagreements in the README.

### 2. `country-familiarity.json`
Curated K per §2.4. Shape: `{"_doc": "...", "K": {"<country>": 1|2, ...}}` (countries not listed = 0). Must include every example from §2.4. +2: Tuvalu, Nauru, Kiribati, Niue, Cook Islands, Palau, Marshall Islands, Micronesia, Tonga, Samoa, Vanuatu, Solomon Islands, plus remote dependencies (Chagos/British Indian Ocean Territory, Pitcairn, Tristan da Cunha / Saint Helena, Tokelau, Wallis and Futuna...). +1: low-profile non-European countries under 5M people (Guinea-Bissau, Eritrea, Lesotho, Suriname, Brunei, Timor-Leste, Comoros, Cape Verde, plus any others among the 184 dataset countries that clearly fit, e.g. Guyana, Djibouti, Eswatini, Gambia, Bhutan, Maldives, Saint Kitts and Nevis, Saint Lucia...). Use judgment, but explain in `_doc` and keep it short. Remote dependencies that appear as a *location* rather than a country value (e.g. Tristan da Cunha listed under country "United Kingdom") need a lat/lng region list `"regions": [{"name":..., "K":2, "bbox":[minLat,minLng,maxLat,maxLng]}]` the scorer checks too. Existing data shows United Kingdom has K2 for 6 items: find which ones and make sure the region list covers them.

### 3. `score-difficulty.py`
CLI + importable module. Input: one location JSON (file path, `-` for stdin, or `--id <id>` to pull from locations.json), or `--all` / `--ids a,b,c` for batch. Output JSON: `{"id", "difficulty", "difficultyWhy", "terms": {F, A, K, C, S, G, base, neighbor, icon, eligible}, "notes": [...]}`.
`difficultyWhy` format: `F2·A3·K0·C0·S0 → 6` (append `·G1` only when G≠0, append ` (Icon)` when icon rule applied, append ` (neighbor <id>)` when neighbor rule lowered base). If not eligible (S reject), difficulty = null and why says `REJECT: extent >150 km`.

Terms:
- **F** (§2.1): views/day thresholds ≥2500→0, 1200→1, 500→2, 200→3, 50→4, else 5. Sources in priority order: `--views N` / `"views"` field in input; local cache `pageviews-cache.json` (id → {title, views12}); seed the cache from `../../.fanout-tmp/_pv12.json`; then live Wikimedia REST API (`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/<Title>/monthly/<start>/<end>`, last 12 full months, avg/day = sum/365, User-Agent `map-game-difficulty/0.1`), resolving the title first via `https://en.wikipedia.org/w/api.php?action=query&titles=...&redirects=1&format=json` (try `short`, then `short, country`, then the city part of the clue). Cache every fetch (including misses). `--offline` disables network. If nothing resolves, F=5 with a note. Also support `--f-from-existing` (parse F from the item's existing difficultyWhy) as a fallback, used only for testing the other terms; it must be clearly labelled.
- **A**: country-span.json; detached-region override → A2; country "International Waters" → A1. Primate relief: only when A ∈ {2,3} and the item is a national capital or #1 metro → A−1. Ship a small curated `primate-cities.json` (country → [capital, #1 metro names]) covering at least the A2/A3 countries in the dataset; match on `short` (case/accent-insensitive) and only for city-type items, not landmarks.
- **K**: country-familiarity.json + region overrides.
- **C** (§2.5): 0 if clue names the country (or an accepted alias: USA/US/United States, UK/England/Scotland/Wales/Britain, Czechia, DRC, Côte d'Ivoire/Ivory Coast, Hong Kong/Macau/Puerto Rico/Greenland/Svalbard etc. per §5 exemptions — exempt items still score C+1 if no country named, per §5) **or carries that country's flag emoji** (flag only, without name, still counts as named? → NO: §2.5 says "names the country (flag optional)"; check what existing data does for flag-only clues and match it, documenting the choice). +2 riddle: clue is phrased as a question/description and does not contain the place's `short` name (normalize accents/case; allow partial token match of the name's distinctive word). +1 otherwise.
- **S** (§2.7): `extentKm` field on input if present; else a keyword heuristic is NOT enough to reject — default S=0 and add note "extentKm missing". Also accept `--extent N`. 25–150 → +1; >150 → reject.
- **G** (§2.8): −1 if within 25 km of an entry in a curated `geo-anchors.json` (name, lat, lng): Bering Strait, Strait of Gibraltar, Suez Canal (Ismailia + Port Said + Suez), Panama Canal, Bosphorus, Strait of Magellan, Cape Horn, Cape of Good Hope, Cape Agulhas, North Cape, Cape York, Cape Reinga, Land's End, Cabo da Roca, Easter Island, Tristan da Cunha, Pitcairn, St Helena, Ascension, Bouvet, Kerguelen, Isthmus of Panama, Strait of Hormuz, Bab-el-Mandeb, Strait of Malacca (Singapore end), Dover Strait, Drake Passage n/a. Keep it ~30 entries. Check the 7 existing `·G1` items and make sure they're covered.
- **MATRIX** exactly as §2.3.
- **Neighbor rule** (§2.6): needs the whole dataset. For each other entry within 25 km whose F is lower (better-known), neighbor_base = that entry's base (MATRIX[F][A] after relief, computed without its own neighbor step, to avoid recursion); step = clamp(F_own−1,0,3); base = min(own, neighbor_base+step). Use the min over all qualifying neighbors. Neighbor F comes from the same F source (cache / existing in `--f-from-existing` mode).
- **Icon** (§2.9): `icons.json` curated list of ids (start with the framework's passing list: Tokyo, Paris, London, New York, Sydney, Moscow, Beijing, Shanghai, Rome, Prague, Istanbul + Eiffel Tower, Big Ben, Statue of Liberty, Colosseum; ALSO include every id whose existing difficultyWhy has `(Icon)` — there are 60). Icon ids clamp at 1 instead of 2; landmarks whose neighbor is an icon with step 0 can reach base 1 per §2.9.
- D = clamp(base+K+C+S+G, 2 (or 1 if icon-eligible), 10).

### 4. `test_score.py` → `test-report.md`
- Pick 20 locations from locations.json deterministically: cover each existing raw score 2..10 at least twice, include ≥2 `(Icon)`, ≥2 `·G1`, ≥2 with C1/C2, ≥2 with K>0, ≥3 in A3 countries, ≥1 International Waters. Fixed list of ids written into the test file.
- Run the scorer twice: (a) `--f-from-existing` mode (isolates A/K/C/S/G/matrix/neighbor logic), (b) real F (cache + live API).
- Pass criterion: |new raw − existing raw| ≤ 1 for each item. Report per-item table: id, existing why, new why, delta, which terms differ. Also report term-level agreement counts.
- Then also run mode (a) over ALL 2000 and report: % within ±1, % exact, per-term agreement rates, top 20 disagreements with reason. This is diagnostics; do not tune per-item to win it. Fix genuine bugs (e.g. alias misses) and rerun.

### 5. `README.md` (≤ 60 lines)
How to run, file inventory, data-source choices (incl. the world-10m coastline issue), known gaps/disagreements with the framework table, and test results summary.

## Rules
- Clean, documented code: module docstrings, a docstring per function, constants at the top. Match the style of the framework terminology (F, A, K, C, S, G).
- No writes outside this workdir. Do not modify locations.json or anything in assets/.
- No out-of-scope refactors. Don't touch other .build-tmp files.
- Rate-limit the live API (≤ 8 concurrent, retry once on 429) and cache.
- Final reply: ≤ 15 lines: files written, 20-item test pass count for both modes, full-dataset ±1 rate, open issues.
