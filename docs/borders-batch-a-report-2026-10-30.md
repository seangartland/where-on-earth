# Border conversions, program lane A: Natural Earth + RESOLVE batches (2026-10-30)

Lane A of the borders program (inventory batches 1, 2, 4, 5), executed per
.build-tmp/borders-batch-a-brief.md against
docs/scan5-borders-inventory-2026-10-30.md. Nothing committed, pushed, or
deployed.

## Outcome: 18 converted, 2 held

The brief's 21 targets are 20 bank entries (its batch-5 count of 11 lakes
counts the Aral's two basin features as separate targets). Of the 20:
**18 converted** from radius areas to polygon extents, and **2 held** on
measured source evidence (below), left exactly as they were (kind "area",
still in APPROVED_AREAS). No anchor was moved on any entry in this lane.

### Converted (18)

All through the shipped extents pipeline: geometry in assets/extents.json
via build/make-extents.mjs (extended with a Natural Earth polygons block
and a RESOLVE deserts block), 0.015 degree simplification, per-ring
deviation measured against the source ring. Bank entries: kind "area" ->
"extent", extentType "polygon", extentKm removed; a field-level audit
confirms only those fields changed on exactly these 18 entries (lat, lng,
fact, clue, image, difficulty, short all byte-identical).

| id | source feature | source verts | shipped verts | max dev (km) | scorer QA (anchor / deep-inside / named outside) |
|---|---|---|---|---|---|
| dead-sea | NE lakes "Dead Sea", 2 basin polygons (union) | 67 | 21 | 1.644 | 0 / 0 / Jerusalem 24.1 |
| lake-victoria | NE lakes "Lake Victoria" | 2,225 | 575 | 2.270 | 0 / 0 / Nairobi 245.6 |
| lake-malawi | NE lakes "Lake Malawi" | 486 | 110 | 1.656 | 0 / 0 / Lilongwe 80.1 |
| lake-tanganyika | NE lakes "Lake Tanganyika" | 544 | 125 | 1.656 | 0 / 0 / Gitega 66.0 |
| lake-baikal | NE lakes "Lake Baikal" | 662 | 131 | 1.594 | 0 / 0 / Irkutsk 56.8 |
| lake-balkhash | NE lakes "Lake Balkhash" | 894 | 226 | 1.667 | 0 / 0 / Almaty 292.0 |
| lake-superior | NE lakes "Lake Superior" | 1,311 | 313 | 1.660 | 0 / 0 / Minneapolis 215.4 |
| lake-michigan | NE lakes "Lake Michigan" | 785 | 179 | 1.663 | 0 / 0 / Indianapolis 225.0 |
| lake-huron | NE lakes "Lake Huron" | 1,540 | 357 | 1.667 | 0 / 0 / Toronto 107.3 |
| lake-erie | NE lakes "Lake Erie" | 404 | 104 | 1.667 | 0 / 0 / Pittsburgh 177.3 |
| lake-ontario | NE lakes "Lake Ontario" | 548 | 150 | 1.655 | 0 / 0 / Ottawa 102.4 |
| great-salt-lake | NE lakes "Great Salt Lake" | 444 | 66 | 1.829 | 0 / 0 / Salt Lake City 20.4 |
| loch-ness | NE lakes "Loch Ness" | 21 | 4 | 1.051 | 0 / 0 / Edinburgh 161.2 |
| caspian-sea | NE marine polygons "Caspian Sea" | 344 | 198 | 1.636 | 0 / 0 / Tehran 106.7 |
| bay-of-fundy | NE marine polygons "Bay of Fundy" | 92 | 64 | 1.587 | 0 / 0 / Halifax 60.7 |
| mojave-desert | RESOLVE ECO_ID 433 "Mojave desert" | 10,787 | 462 | 1.662 | 0 / 0 / Phoenix 195.3 |
| namib | RESOLVE ECO_ID 103 "Namib Desert" | 3,074 | 353 | 1.662 | 0 / 0 / Windhoek 140.2 |
| atacama | RESOLVE ECO_ID 598 "Atacama desert" | 719 | 99 | 1.651 | 0 / 0 / Santiago 796.5 |

Scorer QA used the shipped scoringDistanceKm with the new sidecar loaded
(script: .build-tmp/qa-borders.mjs). Every anchor scores 0, every
deep-inside point (a second point inside the shipped polygon, distinct
from the anchor) scores 0, and every named outside point scores a
plausible positive distance.

### Named cross-checks (the brief's required proofs)

- Jerusalem (city pin) vs the Dead Sea card: **24.1 km** (inventory
  measured 24.2 km against the raw polygons; the 0.1 km is the
  simplification). The other four cards the 55 km circle zeroed are also
  released: Ramallah 32.2, Dome of the Rock 22.7, Western Wall 22.8,
  Church of the Holy Sepulchre 23.2.
- Serengeti pin vs Lake Victoria: **86.9 km**; Masai Mara pin vs Lake
  Victoria: **124.3 km**. Neither scores 0 any more.
- Lilongwe vs Lake Malawi 80.1 and Gitega vs Lake Tanganyika 66.0
  (also in the table above).
- Bonus: Area 51 vs the Mojave polygon scores 2.5 km (scan 3's rim-clip
  inside the old circle is gone), and Windhoek vs the Namib polygon is
  140.2 km (was inside the 250 km circle).
- **Masada vs the Dead Sea: 5.9 km, not "about 0".** The brief and the
  inventory expected Masada to stay at about 0. Measured against the RAW
  NE polygons it is 5.8 km (5.9 against the simplified shipped ring), so
  this is the source geometry, not a conversion defect: at Masada's
  latitude NE draws the shoreline (Lisan/southern-basin outline) at about
  35.41E, several km east of the fortress mesa. The score is plausible
  for a shore fortress; the inventory's "about 0" was an assumption, not
  a measurement. Flagged here rather than silently passed.

### Held (2), with the evidence

- **aral-sea** (batch 5). NE's "North Aral Sea" and "South Aral Sea" are
  the shrunken remnant seas. The card's anchor (45.0, 60.0, the historic
  lake's entity point) sits **104.6 km** from the nearest remnant
  shoreline, on what is now dry bed. The conversion cannot pass the
  brief's anchor-0 QA without moving the pin ~105 km onto remnant water,
  a change neither the brief nor the inventory authorizes ("anchor stays
  unless the inventory notes otherwise"; the inventory does not note
  it). Held the way Thames/Parana/Murray/Rio Grande were held: Sean's
  call between moving the pin to the remnant sea or keeping the 200 km
  radius over the historic lake.
- **strait-of-gibraltar** (batch 5). NE's named marine feature is **five
  small fragments (32 vertices total)** around the narrows and bays that
  do not cover the strait's channel; the card's anchor (35.95, -5.5) is
  **8.4 km** from the nearest fragment. Shipping it would make the card
  nearly unhittable and fail anchor QA. The entry keeps its diffuse-lane
  radius of 30 km. If Sean wants this one converted, the OSM lane (lane
  B's sources) is the place to look for a real strait polygon.

## Sidecar integrity

- Sources were restored from the official URLs in the make-extents.mjs
  header (the worktree had no build/extent-sources/). The UNMODIFIED
  script then regenerated the committed sidecar **byte-identical**
  (sha256 da6d0ceb..., 490,367 bytes) before any extension: the
  chunk-4/7 and conversions discipline, re-proven here.
- After extension: 34 -> 52 records; **all 34 pre-existing records are
  byte-identical per record**; the whole sidecar regenerates byte-for-byte
  across runs (sha256 86a6964b... on repeated runs).
- Final sidecar: 735,211 bytes (gzip 100,495). The script's total-size
  guard was raised from 500 KB to 1 MB, with the reason commented at the
  check: the file legitimately outgrew the old cap with 18 new polygon
  records (the largest single new record is Lake Victoria's). The 100 KB
  per-record cap is unchanged and nothing approaches it. This change is
  flagged for the orchestrator's attention; it is a guard adjustment,
  not a gate change (the 2.5 km deviation gate is untouched and every
  record passes it).
- New build file: build/extract-desert-ecoregions.py (the Sahara
  extractor's pattern, one ECO_ID per file; ECO_NAMEs verified against
  the dataset at extraction: "Mojave desert" 433, "Namib Desert" 103,
  "Atacama desert" 598).

## Membership and counts (game's own helpers, src/meta/pack-store.js)

Unchanged, before and after: Capitals 207, Landmarks 218, Landforms 173;
bank 432 entries, cities 804. Bank kind counts moved only as designed:
area 60 -> 42, extent 34 -> 52, landmark 338 unchanged.

## Tests

- node --test test/*.test.mjs: **83/83**, same as the pre-change baseline.
- Test changes: test/extent-aware-scoring.test.mjs APPROVED_AREAS loses
  the 18 converted lines (plus the Great Lakes comment block that
  headed four of them and had no remaining entries);
  scripts/validate-landmarks.mjs APPROVED_AREAS loses the 13 of the 18
  that were in its shorter Map.
- Validator: 21 problems at baseline -> **16 after, with no new
  problems**. The five resolved items are the baseline's "unexpected
  admitted area" flags for atacama, bay-of-fundy, caspian-sea,
  lake-tanganyika and namib (converted entries that were never in the
  validator's Map). The remaining 16 are pre-existing (10 difficultyWhy
  items and 6 unexpected-area flags for entries outside this lane).

## Credits

credits.html untouched. No new credit line is required: Natural Earth is
public domain and RESOLVE Ecoregions 2017 (CC BY 4.0) is already credited
for the Sahara; the three deserts are the same dataset under the same
license. One optional wording note for the orchestrator: the existing
Natural Earth sentence on credits.html names river-course geometry
specifically; broadening it to cover the lake and marine-polygon
geometry is a one-line wording change Sean may want when this banks.
