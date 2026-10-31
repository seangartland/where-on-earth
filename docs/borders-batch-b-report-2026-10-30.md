# Borders batch B report, 2026-10-30

Lane B of the borders program: the OpenStreetMap-sourced conversions from
docs/scan5-borders-inventory-2026-10-30.md, plus the Strait of Gibraltar
rerouted from lane A. Worktree woe-borders-b, based on demo main 1e1ccfc
(borders batch A). Nothing committed, pushed, or deployed.

Result: **18 converted, 5 held.** The 22 briefed entries split into 18
conversions, 2 holds found during sourcing (Daintree, Banaue), and 2 holds
found at scorer QA (Chocolate Hills, Amsterdam Canals). The rerouted
Gibraltar held a second time. Every hold carries measured evidence below.
No anchor was moved for any entry.

## Method (measured throughout)

- Geometries fetched from the OSM API with the new
  build/fetch-borders-polygons.py (a sibling of the diffuse round's
  fetcher, extended to combine several relations or ways per card), cached
  under build/extent-sources/ (gitignored). Raw vertex counts below are
  the fetched source geometry.
- Curated sources restored into the same cache first so the shipped
  generator runs end to end: Natural Earth rivers, lakes, and marine
  polygons, the RESOLVE ecoregions shapefile (Ecoregions2017.zip), the
  GBRMPA reef boundary, and the diffuse round's OSM files.
- Baseline proof before any edit: the unmodified generator regenerated
  the committed sidecar byte-identical (52 records, 735,211 bytes,
  sha256 86a6964be9712d5ff63527715247564f44b021c5fc6ba6b47cd1878df61bbfb0).
- build/make-extents.mjs gained a BORDERS_OSM block rendered by the same
  processPolygons helper lane A added: vertex ordering, Douglas-Peucker
  at the program-wide 0.015 degree tolerance, measured per-record
  deviation, 100 KB per-record guard. Five small features (Moraine Lake,
  Lake Bled, Crater Lake, Copacabana) needed a finer 0.002 tolerance
  because the standard one collapsed them to triangles; that is
  documented in the code and every one of them still measures under
  0.23 km deviation.
- Bank edits are kind "area" to "extent", extentType "polygon" added,
  extentKm removed. A field-level audit against the pre-edit bank shows
  exactly 18 entries changed, only in those three fields. The text diff
  is 36 lines each way.
- Scorer QA used the shipped scoringDistanceKm and the shipped sidecar
  (.build-tmp/qa-borders-b.mjs): the card's own anchor must score 0, a
  deep-inside point (grid search for the interior point farthest from
  the polygon edge) must score 0, and one named outside point from the
  game's own datasets must score a plausible distance.

## Converted (18)

Deviations are the generator's measured worst-case ring deviation against
the raw source, in km (cap 2.5). QA outside points are real pins from the
game's datasets; distances are the shipped scorer's.

| Entry | OSM source | Source polys / verts | Shipped verts | Deviation | Record bytes | Anchor | Deep-inside | Outside point |
|---|---|---|---|---|---|---|---|---|
| kruger-national-park | relation 1752987 | 1 / 1,688 | 73 | 1.655 | 1,664 | 0 | 0 (clearance 29.0 km) | Blyde River Canyon pin 55.9 |
| serengeti-national-park | relation 4475047 | 1 / 10,732 | 40 | 1.661 | 1,010 | 0 | 0 (37.0 km) | Arusha 179.5 |
| lake-titicaca | relation 3000330 | 1 / 24,344 | 681 | 1.637 | 14,135 | 0 | 0 (18.9 km) | La Paz 78.6 |
| lake-toba | relation 306034 | 1 / 32,158 (20 rings: lake plus Samosir and islets as holes) | 103 | 1.637 | 2,044 | 0 | 0 (8.0 km) | Medan 76.6 |
| crater-lake | relation 147401 | 1 / 2,038 | 51 | 0.222 | 1,309 | 0 | 0 (3.2 km) | Portland 285.8 |
| lake-bled | relation 646 | 1 / 557 | 9 | 0.207 | 436 | 0 | 0 (0.4 km) | Ljubljana 46.8 |
| lake-como | relation 541757 | 1 / 10,067 | 24 | 1.287 | 690 | 0 | 0 (1.7 km) | Milan 39.7 |
| moraine-lake | way 356877446 | 1 / 120 | 4 | 0.160 | 358 | 0 | 0 (0.1 km) | Banff 45.4 |
| yellowstone-national-park | relation 1453306 | 1 / 2,801 | 30 | 1.658 | 889 | 0 | 0 (36.5 km) | Salt Lake City 380.5 |
| grand-teton-national-park | relation 1492555 | 1 / 2,786 | 31 | 1.488 | 907 | 0 | 0 (12.6 km) | Salt Lake City 323.1 |
| plitvice-lakes | relation 10047860 | 1 / 201 | 12 | 1.125 | 519 | 0 | 0 (6.8 km) | Zagreb 99.9 |
| masai-mara | relation 15467577 | 1 / 2,446 | 12 | 1.611 | 512 | 0 | 0 (14.4 km) | Nairobi 162.2 |
| okavango-delta | relation 349348 | 1 / 107,441 | 415 | 1.668 | 8,102 | 0 | 0 (17.1 km) | Gaborone 575.8 |
| danube-delta | relation 12436972 | 1 / 6,033 | 77 | 1.624 | 1,678 | 0 | 0 (21.9 km) | Bucharest 204.3 |
| bering-strait | relation 11315299 | 77 member polygons combined by the fetcher to 1 outline (3,047 verts) | 22 | 1.621 | 723 | 0 | 0 (23.9 km) | Anchorage 1,017.6 |
| socotra | relation 1577075 | 2 / 14,864 | 32 | 1.354 | 867 | 0 | 0 (18.1 km) | Aden 897.5 |
| santorini-caldera | ways 453964 (Thera) + 533902 (Thirasia) + 533905 (Aspronisi) + 533903 (Nea Kameni) + 533904 (Palea Kameni) | 5 / 4,604 | 25 | 1.721 | 852 | 0 | 0 (2.6 km) | Athens 221.6 |
| copacabana-beach-rio | relation 5514745 | 1 / 473 | 6 | 0.172 | 405 | 0 | 0 (0.1 km) | Rio de Janeiro city pin 6.6 |

Notes on individual conversions:

- **Yellowstone named checks (required by the brief):** the Old Faithful
  pin (bank id old-faithful-yellowstone, 44.4605, -110.8281) scores 0
  against the new park polygon, and the Grand Prismatic pin
  (grand-prismatic-yellowstone, 44.525, -110.8382) scores 0. Both feature
  cards keep their free bullseye.
- **Overshoot releases:** Blyde River Canyon scored 0 under Kruger's old
  191 km circle; against the true park boundary it now scores 55.9 km.
  Olduvai Gorge scored 0 under the Serengeti's old 110.9 km circle; it
  now scores 25.6 km, just outside the park's eastern boundary.
- **Santorini** carries the batch's largest deviation, 1.721 km, on the
  long straight simplification runs across the caldera water between the
  islands. The polygons are the five island landmasses that ring the
  caldera, which is the mapped feature set OSM holds for it; the card's
  anchor sits on Nea Kameni, inside its polygon.
- **Moraine Lake** ships as a 4-vertex diamond (3 unique points plus
  closure) at 0.160 km deviation. The lake is half a square kilometre;
  at the finer tolerance the simplified ring still hugs the shoreline to
  160 m, and the deep-inside check clears 0.1 km from every edge.
- **Bering Strait** relation members are dozens of shoreline fragments
  around the Diomede Islands and both headlands. The fetcher combined
  them into one 137.9 km2 outline (convex hull of the member points,
  cached at 3,047 vertices), which the generator then simplified to 22
  vertices at 1.621 km deviation; the card's mid-strait anchor is inside
  it. This matches the inventory's "convert from the Diomede and
  shoreline members" instruction.
- **Lake Titicaca** is the largest new record at 14,135 bytes, far under
  the 100 KB cap.

## Held (5)

Each of these stays exactly as it was (kind "area", radius untouched).
None of the holds is a tooling failure; each is a measured conflict
between the card's fixed anchor and the honest source geometry, and the
brief forbids moving anchors.

1. **strait-of-gibraltar (held again, radius 30 km).** Lane A: Natural
   Earth's marine feature is 5 fragments that do not cover the channel;
   the anchor sits 8.4 km from the nearest fragment. This lane probed
   OSM directly. The only natural=strait feature tagged for the strait
   is way 1134960966, an 8-node OPEN line (a GNS label line, not a
   boundary). An Overpass query across the whole strait bounding box
   (35.6,-6.5 to 36.4,-5.2) for water or strait polygon relations
   returned none; the only relations present are administrative
   boundaries and routes. There is no OSM polygon to convert. A covering
   polygon could only be hand-drawn between the two coastlines, which is
   invented geometry, not a mapped feature. Recommendation: keep the
   30 km radius, or take a Sean ruling to hand-draw the channel.
2. **daintree-rainforest (radius 35 km).** The inventoried relation
   10179476 is a boundary relation of 7 ways that maps three small
   reserve parcels totalling about 0.5 km2 (0.4, 0.1, and 0.0 km2, 124
   vertices). The card's anchor (-16.2, 145.4) sits 3.58 km from the
   nearest parcel edge, so anchor-0 QA cannot pass with this footprint,
   and the parcels are not the rainforest in any case. A broader
   footprint exists (Daintree National Park, relation 8478278) but
   choosing it changes what the card's boundary means, which is a
   ruling, not a fetch. Recommendation: rule on the national-park
   footprint or keep the radius.
3. **banaue-rice-terraces-ph (radius 10 km).** All five UNESCO cluster
   relations were fetched: Batad (8167057), Bangaan (7628655), Hungduan
   (7137867), Mayoyao (8171344), and Nagacadan in Kiangan (7575218),
   together 21 polygons and about 6.6 km2 of terraces. The card's anchor
   (16.923, 121.058) sits 4.83 km from the nearest cluster edge, in the
   municipal area between clusters. No honest terrace polygon contains
   the anchor; the diffuse round chose the 10 km radius precisely to
   span the clusters from this anchor. Recommendation: keep the radius,
   or rule on moving the anchor onto the Batad amphitheatre.
4. **chocolate-hills (radius 9 km).** The Natural Monument relation
   15100962 fetched cleanly (1 polygon, 256 vertices), but scorer QA
   measured the card's anchor at 9.22 km from the simplified boundary,
   and re-measurement against the raw source puts the anchor 8.30 km
   outside the monument boundary entirely. The Wikidata anchor sits in
   the hills field northwest of the monument polygon. Recommendation:
   keep the radius, or rule on moving the anchor inside the monument.
5. **amsterdam-canals-d34-7 (radius 2 km).** The Grachtengordel
   protected-area way 222278733 fetched cleanly, but the city anchor
   (52.3676, 4.9041) sits 0.017 km (17 m) outside the raw ring, and
   0.119 km outside the ring after fine simplification at 0.002 degrees.
   The anchor is the Amsterdam city point, which sits just north of the
   canal ring boundary. The diffuse round's Ha Long precedent nudged an
   anchor 700 m to sit on its feature; this brief forbids anchor moves.
   Recommendation: keep the radius, or rule on a roughly 120 m anchor
   nudge south onto the ring (the smallest nudge in the program so far).

## Integrity and sidecar

- The 52 pre-existing sidecar records are byte-identical per record in
  the new file.
- The whole file regenerates byte-for-byte from the build sources:
  sha256 21eee0b06639c5f05bc3483ca5a049119394bf2e86ec65555da41c93435b5faa
  across repeated runs.
- Sidecar: 52 to 70 records; 735,211 to 857,604 bytes, under the 1 MB
  cap. Largest new record Lake Titicaca at 14,135 bytes, under the
  100 KB per-record cap. Largest shipped deviation 1.721 km
  (Santorini), under the 2.5 km cap.
- Bank: 432 entries before and after; kinds moved from 42 area / 52
  extent to 24 area / 70 extent. Membership verified with the game's own
  pack helpers (src/meta/pack-store.js): Capitals 207, Landmarks 218,
  Landforms 173, combined 598, unchanged. Facts, clues, photos,
  difficulty, and all other fields untouched (audit in Method above).

## Tests and manifests

- `node --test test/*.test.mjs`: 83 of 83 pass.
- scripts/validate-landmarks.mjs: 13 problems, down from 16 after lane A,
  and the problem list did not grow. The three that disappeared are the
  "unexpected admitted area" flags for Lake Toba, the Okavango Delta,
  and the Santorini Caldera, which left the area kind. The remaining 13
  are pre-existing: 10 difficultyWhy format notes and the gobi, kalahari,
  and rub-al-khali judgment-call flags, all outside this lane's scope.
- APPROVED_AREAS manifests: the 18 converted ids removed from both
  manifests (test/extent-aware-scoring.test.mjs and
  scripts/validate-landmarks.mjs; the validator never listed Toba,
  Okavango, or Santorini, so it lost 15 lines against the test file's
  18). The five held ids remain listed in both. Both manifests were
  first edited for all 20 QA candidates and then corrected for the two
  QA holds, so the final state matches the final bank exactly.

## Credits

credits.html was NOT edited, per the brief. The existing ODbL line names
the eight diffuse-round boundaries (Nazca Lines, Ha Long Bay, Kakadu,
Lençóis Maranhenses, Redwood, Wadi Rum, Wulingyuan, Guilin Karst). This
lane adds 18 more OpenStreetMap boundaries of the same classes, and lane
A added Natural Earth and RESOLVE polygons that the page credits
separately. Recommendation: widen the ODbL line's parenthetical from the
eight named features to a class wording, for example "Protected-area,
national-park, lake, reserve and coastline boundaries (including Nazca
Lines, Ha Long Bay, Kakadu, Lençóis Maranhenses, Redwood, Wadi Rum,
Wulingyuan, Guilin Karst, Kruger, Serengeti, Yellowstone, the Okavango
Delta and the Danube Delta) © OpenStreetMap contributors, available
under the Open Database License (ODbL)." One line change, no new credit
entries needed. The fetched boundary for Bering Strait and the Santorini
island ways are also OSM, covered by the same line.

## Files changed (uncommitted, for the banking review)

- assets/extents.json: 18 records added (70 total).
- assets/locations-landmarks-sol.json: the 18 bank edits above.
- build/make-extents.mjs: BORDERS_OSM block, fine-tolerance rule, and
  the header notes recording all five holds.
- build/fetch-borders-polygons.py: new fetcher (relation and way
  stitching, multi-source combining incl. hull mode).
- test/extent-aware-scoring.test.mjs and scripts/validate-landmarks.mjs:
  APPROVED_AREAS removals above.
- QA script kept at .build-tmp/qa-borders-b.mjs (not shipped).

Held entries need no banking action; their bank entries, manifest lines,
and radius handling are exactly as they were at 1e1ccfc.
