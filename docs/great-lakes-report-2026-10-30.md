# Great Lakes completion report, 2026-10-30

The four missing Great Lakes (Michigan, Huron, Erie, Ontario) added to the
landmarks bank as Landforms radius areas on the Lake Superior pattern, per
`.build-tmp/great-lakes-brief.md`. Executed in the `woe-lakes` worktree.
Not committed, not pushed, not deployed.

## Outcome

- **4 of 4 added, 0 held.** All four are kind "area" radius entries in
  `assets/locations-landmarks-sol.json`, admitted to APPROVED_AREAS in
  both manifests, and in the Landforms pool through the derive.py
  regeneration (diff exactly +4 / -0).
- Bank 422 → **426**. Pools measured by the game's own tests:
  **Capitals 207 (unchanged), Landmarks 214 (unchanged), Landforms
  167 → 171, combined 588 → 592.**
- Suite: **83/83** (`node --test test/*.test.mjs`).
- Validator (`node scripts/validate-landmarks.mjs`): failure list
  byte-identical in composition to the pristine tree, 21 pre-existing
  problems (10 spike-suffix difficultyWhy strings its regex predates,
  11 chunk-3 areas never synced into its map). This chunk adds no new
  validator failures; its summary counts shift as predicted (426 entries,
  area 56 → 60, approved playable areas 48 → 52).
- Dedupe: zero hits on id and on diacritics-stripped short name for all
  four candidates across cities (804), bank (422 before this chunk), and
  quarantine (202).

## Radius arithmetic (and one correction to the brief)

The brief describes Superior as "r 160". The stored Superior entry
actually carries `extentKm` **338**, and docs/lakes-parks-integration.md
defines that number: the great-circle distance from the lake's exact
Wikidata P625 anchor to the farthest vertex of its shoreline. That is
the coverage logic followed here, because it is the logic the shipped
data uses (Baikal 342.7, Malawi 301.2, Balkhash 334.3 are the same
measurement).

Method: for each lake, the maximum haversine distance from its P625
anchor to any shoreline vertex of the lake's polygon in the repo's own
Natural Earth geometry (`assets/lakes-10m.geo.json`), cross-checked
against `assets/ne_50m_lakes.geojson`. Method validation: run on Lake
Superior, the same measurement gives 339.8 km against the stored 338
(the stored value came from the finer OSM shoreline; 0.5% agreement).

| id | anchor (Wikidata P625) | farthest shoreline vertex | radius (1:10m / 1:50m) | stored extentKm |
|---|---|---|---|---|
| lake-michigan | Q1169: 44.007874, -86.756451 | 41.64, -87.3858 (south end) | 268.2 / 267.4 | **268.2** |
| lake-huron | Q1383: 44.592584, -82.756293 | 44.7579, -79.6626 (Georgian Bay mouth) | 245.3 / 248.5 | **245.3** |
| lake-erie | Q5492: 42.25, -80.999722 | 41.7215, -83.4591 (west end) | 211.6 / 210.7 | **211.6** |
| lake-ontario | Q1062: 43.728889, -78.106389 | 44.4971, -75.792 (Kingston end) | 203.5 / 203.4 | **203.5** |

The 1:10m figure is stored in each case (Huron's 1:50m cross-check runs
3.2 km higher because the coarser polygon cuts the Bruce Peninsula tip
differently; the 1:10m shoreline is the better source).

## Containment (the scan-3 lesson, checked for the new circles)

Pins of other entries inside each new scoring circle, measured the
scan-3 way. No capital pin is contained by any of the four.

- **Michigan (r 268.2): 4 city pins**, all genuine Lake Michigan shore
  cities: Green Bay 115.6, Milwaukee 143.5, Grand Rapids 145.6, Chicago
  250.7 (17.5 km inside the rim; Chicago stands on the lake's southwest
  shore, the Caspian/Baku legitimate-shore class).
- **Huron (r 245.3): none.** The cleanest of the four.
- **Erie (r 211.6): 10 pins.** Shore-legitimate: Cleveland 101.4,
  Detroit 168.5, Buffalo 187.6, Hamilton 145.6, Mississauga 183.8,
  Brampton 188.3, Niagara-on-the-Lake 193.1, Niagara Falls 182.2 (the
  Falls are Erie's own outflow). Rim overshoot: Toronto 204.7 and CN
  Tower 203.0 sit about 7 km inside the rim; Toronto is Lake Ontario's
  shore city, contained only because a circle spanning Erie's 388 km
  length from a centre anchor reaches it. This is the documented
  long-lake construction cost (scan 3: Malawi ∋ Lilongwe, Tanganyika ∋
  Gitega); shrinking the radius to exclude Toronto would leave Erie's
  own western shore scoring positive distance, against the coverage
  logic above.
- **Ontario (r 203.5): 8 pins.** Shore-legitimate: Toronto 103.1 and CN
  Tower 103.4 (on the lake's north shore), Niagara-on-the-Lake 94.0
  (at its outlet), Hamilton 150.4, Mississauga 126.0, Brampton 133.5.
  By construction: Niagara Falls 106.7 (up the Niagara River between
  the lakes) and Buffalo 112.6 (Lake Erie's shore city, well inside
  this circle because the two lakes' anchors are close).

## Difficulty (frozen adapted v2, spike check applied)

Scorer math replicated exactly (frozen cuts, K table, GeoNames
population centres), with the chunk-3/7 area adaptation: fallback and
isolation distances are measured to the anchor, then the radius is
subtracted (floor 0). The fame figures in the first column are the
orchestrator's measurements from the brief (Wikimedia REST, median
monthly daily views Oct 2025-Sep 2026; the canonical titles are exactly
"Lake Michigan" etc., so they stand). The mean/median pair is this
run's scorer-window measurement of the same articles (mean =
total/365, median = median monthly daily rate), used for the spike
check.

| id | views/day (brief) | mean / median | band mean → median | stored D | difficultyWhy |
|---|---|---|---|---|---|
| lake-michigan | 1,100.8 | 893.5 / 867.9 | 6 → 6 | **6** | `p.76·fb541·K0·iso0 → 32.2 → 6` |
| lake-huron | 472.8 | 454.8 / 408.2 | 7 → 7 | **7** | `p.61·fb707·K0·iso40 → 64.4 → 7` |
| lake-erie | 851.4 | 743.4 / 675.3 | 7 → 7 | **7** | `p.72·fb794·K0·iso0 → 52.9 → 7` |
| lake-ontario | 544.8 | 3,702.8 / 441.9 | 2 → 8 | **8** | `p.60·fb1065·K0·iso0 → 96.4 → 8` |

- **Ontario is the spike case.** Its Aug 2026 (904,676) and Sep 2026
  (321,215) monthly views are 20-60x its typical 10-15k months, so the
  mean lands in band 2 and the median in band 8. Per the frozen spike
  rule the median is adopted: difficulty 8, with the stored difficultyWhy
  written from the median run.
- **Fallback centre for the transnational clues.** Superior's stored
  difficultyWhy predates the adapted scorer and cannot be reproduced
  from any single centre, so it binds nothing here. For the three lakes
  whose clue names "Canada and United States", the fallback centre is
  the combined GeoNames population-weighted centre of the two named
  countries (40.21, -92.73), the scorer's own "centre of the unit the
  clue names" logic applied to the named pair; K is 0 for both
  countries. Sensitivity, for the record: Huron's band runs 6 (Canada
  centre) to 8 (US centre, median), Erie's 6-7, Ontario's median band
  7-8. Michigan is scored on the US centre like any single-country
  entry.

## Photos

One real photograph per lake, every finalist viewed on contact sheets
and every pick re-viewed as a centre square crop (the game's crop) in
`.batch-great-lakes/`. All four stored URLs re-verified 200 image/jpeg
and unique across both datasets; none is its article's page image
(checked against all four pageimages: Michigan's true-colour MODIS,
Huron's winter MODIS, Erie's MODIS frame, Ontario's ISS-36 horizontal
frame — the Ontario pick is a different ISS photograph, Expedition 31
sunglint, not the ISS-36 page image or its portrait twin). Whole-lake
orbital views follow Superior's own card (an ISS whole-lake photo):
for lakes of 200-500 km, the whole-lake view is the honest identifier,
where a shore photograph could be any large lake.

| id | file | license | author |
|---|---|---|---|
| lake-michigan | ISS-61 Lake Michigan, United 
...[truncated 5358 chars]