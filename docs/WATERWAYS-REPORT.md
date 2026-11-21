# Waterways batch report (straits and canals), 2026-11-21

Branch `waterways`. Chunk A `103f894`, chunk B `b33a3d1`, chunk C `859d8be`. No deploys.

## Method (all three chunks)

- Extent gate: an entry ships only as `kind: "extent"` with a record in `assets/extents.json`, sourced the way existing extent entries get theirs. The game resolves `extentType` polygon/line entries at runtime from `assets/extents.json` through `src/game/extents.js` (`setExtentData`, `nearestExtentPoint`): a guess inside a polygon or on a line scores 0 km, otherwise the distance to the nearest edge. Polygon sources, tried in order: the QID-matched OSM `natural=strait` relation or closed way (the Strait of Hormuz / Bering Strait precedent), then the Natural Earth 1:10m marine polygon (the Drake Passage precedent). Lines: OSM `waterway=canal` geometry (the Panama Canal precedent, `build/build-line-extents.py`). Simplification follows `build/make-extents.mjs`, gated at 2.5 km max deviation. Pipeline: `scripts/waterways/` (`fetch.py`, `geometry.py`, `score.py`, `images.py`, `stage.py`, `check.mjs`).
- Pin: Wikidata P625. Polygon pins must lie inside the shipped polygon (0 km); line pins must be within the 2.5 km gate. `scripts/pin-audit.py` 0 flagged for every entry.
- Fame: daily enwiki user views, trailing 365 days, mean and median recorded. Median under 100/day goes to quarantine. Measured, not estimated.
- Difficulty: frozen v2 scorer. Spike rule: mean above median and either at least 3x the median or the two in different rarity bands (Common 1 to 3, Uncommon 4 to 6, Rare 7 to 8, Legendary 9 to 10); a spike scores on the median.
- Images: Wikimedia Commons search by name (no page-image shortcut), denylist for maps, montages, satellite views and .svg, picked by eye from contact sheets for a center-square crop; 500px thumbnail, HEAD 200 image/jpeg, unique across the dataset.
- Waters classification: the game has no Waters pool in code yet. Each banked waterway id is in `PACK_WATERS_IDS` (`src/meta/pack-waters.js`); `landmarkPackPool` in `src/meta/pack-store.js` excludes those ids, they are not in Landforms, so both 200-card pools are unchanged. The entries stay in the landmarks bank, so Survival and Trivia keep drawing them. `test/pack-pools.test.mjs` asserts this.

## Per-entry table

Shape dev = max simplification deviation of the shipped geometry from its source (km). Pin = guess-on-pin distance through the game's extent code (km).

| id | chunk | dest | extent source and type | shape dev | pin | fame mean / median | v2 | spike verdict | image license, author |
|---|---|---|---|---|---|---|---|---|---|
| bosphorus | A | bank | OSM strait relation 8926171, polygon | 0.213 | 0 | 850.6 / 831 | 5 | no spike (mean 5, median 5) | CC BY 4.0, Joseolgon |
| dardanelles | A | bank | OSM strait relation 8926172, polygon | 0.212 | 0 | 905.5 / 797 | 6 | no spike (6, 6) | Public domain, Durkin |
| suez-canal | A | bank | OSM waterway=canal ways (Suez Canal / New Suez Canal), line | 0.435 | 0.016 | 2431.1 / 1945 | 1 | no spike (1, 2, both Common) | CC BY-SA 4.0, Godot13 |
| strait-of-malacca | B | bank | OSM strait relation 20664688, polygon | 1.657 | 0 | 969.6 / 676 | 7 | no spike (7, 8, both Rare) | CC BY-SA 4.0, ZoschH |
| strait-of-magellan | B | bank | Natural Earth 1:10m marine, polygon | 1.645 | 0 | 879.3 / 821 | 9 | no spike (9, 9) | Public domain, U.S. Navy |
| english-channel | B | bank | Natural Earth 1:10m marine, polygon | 1.660 | 0 | 912.8 / 884 | 6 | no spike (6, 6) | CC BY-SA 4.0, Supercarwaar |
| corinth-canal | B | bank | OSM waterway=canal way 165079335, line | 0.009 | 0.002 | 465.1 / 432 | 4 | no spike (4, 4) | CC0, Mona |
| golden-gate | B | bank | OSM strait way 668102609, polygon | 0.220 | 0 | 200.3 / 173 | 7 | no spike (7, 7) | Public domain, Leaflet |
| bab-el-mandeb | B | bank | OSM strait relation 11169730, polygon | 1.608 | 0 | 1354.7 / 538 | 7 | SPIKE: mean band Uncommon 6, median band Rare 7; scored on the median | CC0, Richard Weil |
| taiwan-strait | B | bank | Natural Earth 1:10m marine, polygon | 1.661 | 0 | 165.3 / 147 | 9 | no spike (9, 9) | CC BY-SA 3.0, Taiwankengo |
| cook-strait | B | bank | OSM strait relation 13512115, polygon | 1.564 | 0 | 122.8 / 116 | 6 | no spike (6, 6) | Public domain, Pseudopanax |
| oresund | B | bank | Natural Earth 1:10m marine, polygon | 1.397 | 0 | 184.1 / 182 | 5 | no spike (5, 5) | CC0, Cristina Munteanu |
| kiel-canal | C | bank | OSM waterway relation 407981, line (98 km) | 0.512 | 0.367 | 279.2 / 263 | 6 | no spike (6, 6) | CC0, Kq-hit |
| erie-canal | C | bank | OSM waterway relation 1823647, line (528 km) | 0.556 | 0.131 | 1045.7 / 908 | 5 | no spike (5, 6, both Uncommon) | CC0, Wilson44691 |
| grand-canal-china | C | bank | OSM waterway relation 1112801, line (1586 km) | 0.555 | 0.040 | 435.0 / 409 | 7 | no spike (7, 7) | Public domain, no machine-readable author |
| canal-du-midi | C | bank | OSM waterway relation 302044, line (219 km) | 0.541 | 0.011 | 204.4 / 193 | 7 | no spike (7, 7) | Public domain, Steve Scarlett |
| strait-of-messina | C | bank | OSM strait relation 11160661, polygon | 0.221 | 0 | 305.3 / 233 | 7 | no spike (7, 7) | CC0, Effems |
| straits-of-florida | C | bank | Natural Earth 1:10m marine, polygon (OSM way 1198394721 is an open label way) | 1.579 | 0 | 107.3 / 104 | 6 | no spike (6, 6) | Public domain, U.S. Coast Guard |
| bass-strait | C | bank | OSM strait relation 9457256, polygon | 1.665 | 0 | 185.5 / 174 | 8 | no spike (8, 8) | CC BY-SA 4.0, Wampy1 |
| mozambique-channel | C | quarantine | OSM strait relation 14383565, polygon (sourceable; not shipped) | 1.663 | n/a | 77.6 / 74 | 8 | no spike (8, 8) | CC BY-SA 2.0, Rod Waddington |

Notes:
- Mozambique Channel passes the extent gate but fails the fame gate (median 74 < 100). It sits in `assets/locations-landmarks-quarantine.json` as a `kind: "extent"` entry with no record in `assets/extents.json` (the validator rejects geometry without a bank entry) and is not in `PACK_WATERS_IDS`. If it is ever promoted, its polygon rebuilds from `geometry.py` unchanged.
- Two-country straits score on the largest coastline share and list both flags in share order (Hormuz template). Straits of Florida touches three countries (Cuba 0.493, United States 0.281, Bahamas 0.227) and uses the three-country Lake Malawi / Karakoram clue format: "Straits of Florida, Cuba, United States, and Bahamas".
- Nearest other entry under 10 km, each a distinct feature: golden-gate to golden-gate-bridge 0.5 km (the brief names the strait, not the bridge; the photo shows the strait from Lands End); grand-canal-china to hangzhou 5.6 km and canal-du-midi to toulouse-france 2.2 km (P625 pins at the canals' terminal cities; the canal guesses score on the whole line); strait-of-messina to messina-it 9.1 km (the city on the strait's shore).

## Suez Canal quarantine finding (chunk A)

Scrub round 2 (2026-10-29, `a5fd591`) parked the Suez Canal in the quarantine as BORDERLINE because it was "a 193 km linear corridor rather than a point site" (it was `kind: "area"`, `extentKm 97`). That reason is resolved by this batch: the canal now ships as an OSM `waterway=canal` line extent (3 lines, 231 km, deviation 0.435 km), the Panama Canal precedent, so guesses score against the whole corridor. Its fame (median 1945/day) was never the problem. It moved from the quarantine to the bank in chunk A.

## HELD (chunk C, no entry anywhere)

- yucatan-channel: no OSM strait polygon (no QID-matched object); the Natural Earth "Yucatan Channel" polygon lies 89.86 km from the Wikidata P625 pin, so the pin cannot sit inside its extent.
- kerch-strait: OSM way 1118123894 is an open label way, not a polygon, and Natural Earth has no Kerch Strait marine polygon.
- strait-of-tiran: no QID-matched OSM polygon and no Natural Earth marine polygon.

Chunks A and B held nothing.

## Final counts

| | before batch | after A | after B | after C |
|---|---|---|---|---|
| bank (`locations-landmarks-sol.json`) | 460 | 463 | 472 | 479 |
| quarantine | 244 | 243 | 243 | 244 |
| extents (`assets/extents.json`) | 134 | 137 | 146 | 153 |
| `PACK_WATERS_IDS` | 0 | 3 | 12 | 19 |

Batch total: 19 banked waterways (18 new plus Suez out of quarantine), 1 quarantined (Mozambique Channel), 3 held.

## Suite and checks (run before the chunk C commit)

- `node --test "test/*.mjs"`: 151 tests, 151 pass, 0 fail.
- `node scripts/validate-landmarks.mjs`: 18 problems, all pre-existing and unchanged since before the batch (missing v2 `difficultyWhy` on older manual adds, copper-canyon, gobi).
- `node scripts/waterways/check.mjs`: 20 checked, 0 failing.
- `scripts/pin-audit.py` on the chunk C ids (bank and quarantine): 0 flagged, all within 0.5 km of Wikidata.
