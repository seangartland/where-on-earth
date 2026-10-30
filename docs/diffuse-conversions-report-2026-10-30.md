# Diffuse conversions report, 2026-10-30

All 18 entries flagged by docs/diffuse-review-2026-10-30.md (South Beach
excluded; Sean quarantined it in scrub 4) are converted from point scoring
to the game's area/extent handling: 10 radius areas on the chunk-3
approved-areas path, 8 polygon extents through the extents pipeline.
Nothing committed, pushed, or deployed.

## Membership did not move

Measured with the game's own pool helpers before and after (identical):

| pool | before | after |
|---|---|---|
| Capitals | 207 | 207 |
| Landmarks | 214 | 214 |
| Landforms | 167 | 167 |
| combined | 588 | 588 |

Field-level audit of the bank against HEAD: exactly the 18 intended
entries changed, and only in `kind`, `extentKm`, `extentType`, and the
three documented anchor moves below. No fact, photo, clue, or difficulty
was touched anywhere in the bank.

## Radius areas (10)

kind set to `area` (six were `landmark`, four were unwired `area`) with
`extentKm` per the review, admitted to APPROVED_AREAS in both manifests
(test/extent-aware-scoring.test.mjs and scripts/validate-landmarks.mjs,
in lockstep, with the chunk-3/7 comment precedent):

| id | extentKm | anchor |
|---|---|---|
| amsterdam-canals-d34-7 | 2 | unchanged (52.3676, 4.9041) |
| xochimilco-mx | 4 | unchanged |
| banaue-rice-terraces-ph | 10 | unchanged |
| copacabana-beach-rio | 2.5 | unchanged |
| cappadocia | 12 | unchanged (Göreme) |
| chocolate-hills | 9 | unchanged (Carmen) |
| copper-canyon | 30 | unchanged (Divisadero) |
| danakil-depression | 50 | MOVED 14.2417, 40.3 (Dallol) to 13.92, 40.48 |
| gobi-desert-dinosaur-nemegt | 20 | unchanged |
| strait-of-gibraltar | 30 | unchanged |

Danakil anchor move is the review's recentring to the Dallol-Erta Ale
axis midpoint; QA confirms both Dallol (14.2417, 40.3) and Erta Ale
(13.6, 40.65) now score 0. Its clue ("Danakil Depression, Ethiopia")
stays correct: the new anchor is in the Afar Region, Ethiopia, as are
both named features.

## Polygon extents (8)

Geometry into assets/extents.json via build/make-extents.mjs, extended
with a diffuse-polygons block on the Reef/Sahara path (simplifyRing at
0.015 degrees, per-ring deviation measured against the source ring,
gated at 2.5 km). Sources are the boundary datasets the review verified,
taken as mapped in OpenStreetMap (fetched by the new
build/fetch-diffuse-polygons.py into build/extent-sources/, the same
OSM route the parked Wall source used):

| id | source | source verts | shipped verts | max dev (km) | source area check |
|---|---|---|---|---|---|
| nazca-lines | UNESCO property ref 700, OSM relation 2729059 | 1,764 | 27 | 1.533 | 773.7 km² mapped vs 753.6 inscribed |
| ha-long-bay | UNESCO property ref 672, OSM relation 19465352 | 44 | 13 | 1.661 | 450.7 km² mapped |
| kakadu | Kakadu NP boundary (WDPA site 67763; UNESCO ref 147), OSM relation 13000016 | 1,535 | 85 | 1.968 | 19,265 km² mapped (3 polygons) vs 19,025 WDPA reported |
| lencois-maranhenses | Park boundary (UNESCO ref 1611), OSM relation 7458131 | 529 | 11 | 1.422 | 1,458.6 km² mapped vs 1,550 legal |
| redwood-national-and-state-parks | UNESCO property ref 134, OSM relation 9592632 | 870 | 25 | 1.652 | 451.4 km² mapped (2 polygons) vs 415.7 WDPA reported |
| wadi-rum | UNESCO property ref 1377, OSM way 243200322 | 82 | 11 | 1.613 | 744.9 km² mapped vs 742 inscribed |
| zhangjiajie-national-forest-park | Wulingyuan (UNESCO ref 640), OSM relation 18589298 | 2,667 | 19 | 1.660 | 396.2 km² mapped |
| guilin-karst | Guilin Karst core areas, South China Karst ref 1248, OSM relations 21132393 + 21263564 | 1,842 | 16 | 1.571 | Putao 27.1 (inscribed 28.4), Lijiang 226.4 (inscribed 225.4) |

Disclosures on dataset fit:

- Zhangjiajie: OSM's ref-640 relation traces the whole Wulingyuan
  scenic area (396 km²), wider than the inscribed core (264 km²). It is
  the boundary the review pointed at (the property bounding the full
  pillar landscape) and spans all four park units; the wider reading is
  the conservative one for scoring. The smaller "core zone" relation
  (80.7 km², Zhangjiajie NP only) was not used.
- Guilin Karst: the geometry is the property's two core-area sections
  (Putao and Lijiang) from the dedicated core-area relations, not the
  combined relation, whose Lijiang ring sweeps in buffer land
  (729.6 km²). The anchor moved from Guilin city (25.2667, 110.2833)
  onto the Lijiang section at (24.95, 110.45), verified inside both the
  raw source and the shipped polygon. Clue unchanged and still correct.
- Ha Long Bay: the stored anchor sat 26 m outside the simplified
  polygon edge (the source boundary is coarse, 44 vertices), so it was
  nudged ~700 m into the bay to (20.905, 107.175), verified inside the
  raw source polygon; the anchor now scores exactly 0.
- Redwood's simplified area grows +7.5% (485 vs 451 km²): its two
  polygons are narrow coastal strips, where a 1.652 km deviation band
  inflates area. The governing deviation gate passes.

Pipeline integrity: before extension, the unmodified script regenerated
the committed sidecar byte-identical from freshly downloaded sources
(Natural Earth rivers, RESOLVE Ecoregions 2017 via the recreated
extraction, GBRMPA boundary). After extension, all 26 prior records are
byte-identical per record, and the whole sidecar (34 records, 490,367
bytes, under the 500 KB cap) regenerates byte-for-byte across runs.

## Scorer QA (shipped scoringDistanceKm + shipped sidecar)

Per polygon: anchor 0, a deep-inside point 0, one named outside point
plausible. Nazca: Lima 337.9 km. Ha Long: Hanoi 119.1 km. Kakadu:
Darwin 113.4 km. Lençóis: São Luís 92.9 km. Redwood: San Francisco
390.9 km. Wadi Rum: Amman 256.0 km. Zhangjiajie: Changsha 252.3 km.
Guilin: Guilin city (the old anchor) 21.3 km, and a point inside the
Putao section also scores 0. Radius areas are exercised by the suite's
APPROVED_AREAS test (inside and boundary guesses 0, 1.5x radius scores
half the radius), plus the Danakil two-feature check above.

## Difficulty

No rescoring. The brief makes rescore conditional on the geometry
change mechanically requiring it; it does not here. The frozen v2
difficulty was assigned to each entry as a subject, conversions change
only how distance to the subject is measured, and difficulty drives no
mode and is displayed nowhere. All 18 keep their stored difficulty and
difficultyWhy verbatim (verified in the field-level bank audit).

## Credits lines needed (orchestrator to add at banking; credits.html untouched here)

One new line on credits.html for the eight polygon boundaries, matching
the existing Natural Earth / RESOLVE style:

"Boundaries for Nazca Lines, Ha Long Bay, Kakadu, Lençóis Maranhenses,
Redwood National and State Parks, Wadi Rum, Wulingyuan (Zhangjiajie)
and Guilin Karst: © OpenStreetMap contributors, available under the
Open Database License (ODbL)."

No other credit changes: the radius areas use no external geometry, and
the existing credits already cover the Reef, Sahara and river sources.

## Tests

node --test test/*.test.mjs: 83/83 pass, before and after. Only test-side
change: the 10 new radius areas added to APPROVED_AREAS in
test/extent-aware-scoring.test.mjs (mirrored in
scripts/validate-landmarks.mjs). The extent-manifest assertions pass
with the 8 new sidecar records (bank extent entries and extents.json
keys in sync). No count assertions changed, because no count moved.
The validator's failure list is byte-identical to the pristine tree
(its pre-existing chunk-2/3/5/6 items only); its summary counts shift
exactly as the conversions predict (landmark 340 to 332, extent 26 to
34, approved areas 38 to 48).

## Files changed

- assets/locations-landmarks-sol.json (18 entries: kind/geometry, 3 anchor moves)
- assets/extents.json (+8 polygon records, 26 prior records byte-identical)
- build/make-extents.mjs (diffuse-polygons block; regenerates the sidecar deterministically)
- build/fetch-diffuse-polygons.py (new: fetches the 8 OSM boundary sources)
- test/extent-aware-scoring.test.mjs and scripts/validate-landmarks.mjs (APPROVED_AREAS +10)
