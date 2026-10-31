# Border fixes: the four held conversions (2026-10-30)

All four of lane B's held entries are converted to polygon extents. Nothing
committed, pushed, or deployed. credits.html untouched (the ODbL line lane B
widened already covers national-park, protected-area and heritage
boundaries as a class; no wording change needed for these four).

## Method (measured throughout)

- Sources restored into build/extent-sources/ from the official URLs in
  build/make-extents.mjs's header (Natural Earth geojson, RESOLVE
  Ecoregions 2017, GBRMPA, the diffuse fetcher, the borders fetcher) and
  the unmodified generator regenerated the committed sidecar byte-identical
  before any edit (70 records, 857,604 bytes, sha256
  21eee0b06639c5f05bc3483ca5a049119394bf2e86ec65555da41c93435b5faa, matching
  lane B's reported final hash).
- build/fetch-borders-polygons.py's daintree job now fetches relation
  8478278 (Daintree National Park) instead of 10179476, with the reroute
  noted in its header; build/make-extents.mjs gained the four
  BORDERS_OSM_POLYGONS entries and three FINE-tolerance additions (below).
- Scorer QA used the shipped scoringDistanceKm (src/game/scoring.js) with
  setExtentData on the final sidecar: anchor score, a verified interior
  point far from the anchor, and a named outside pin per entry.

## The four fixes

### 1. daintree-rainforest: Daintree National Park boundary (converted, anchor NOT moved)

- Source: OSM relation 8478278 "Daintree National Park", 102 polygons,
  11,566 source vertices. Shipped: 975 vertices, max deviation 0.251 km,
  record 21,958 bytes.
- Anchor (-16.2, 145.4) unchanged. It sits inside the raw NP boundary, in
  the 283.2 km2 section polygon, but only 0.184 km from that section's
  edge (the stored pin is a one-decimal point). At the program-wide 0.015
  degree tolerance the simplified boundary moves up to 2.226 km locally
  and leaves the anchor 0.355 km outside the shipped ring, which fails
  anchor-0 QA. Following lane B's documented precedent for features the
  standard tolerance breaks (Moraine Lake, Lake Bled, Crater Lake,
  Copacabana), this entry ships at the finer 0.002 degree tolerance:
  deviation 0.251 km, anchor inside, every gate unchanged. Flagged here
  plainly because the brief's stop condition was written against the
  anchor falling outside the park; against the park's actual boundary it
  is inside, and the failure was the simplification, not the footprint.
- QA: anchor 0; grid-verified interior point 34.4 km from the anchor
  (-16.4905, 145.2758, another park section) 0; the Cairns city pin
  (-16.92, 145.78) scores 66.64 km.

### 2. banaue-rice-terraces-ph: UNESCO clusters, anchor moved onto Batad

- Source: the five cluster relations lane B fetched (Batad 8167057,
  Bangaan 7628655, Hungduan 7137867, Mayoyao 8171344, Nagacadan 7575218),
  21 polygons, 5,249 source vertices. Shipped at the fine 0.002 tolerance
  (individual clusters are ~1 km across and collapse at 0.015): 164
  vertices, max deviation 0.348 km, record 3,933 bytes.
- Anchor moved 8.34 km: (16.923, 121.058) in Banaue town to (16.93264,
  121.13571), the area-weighted centroid of the Batad cluster polygon
  (relation 8167057), verified inside that polygon in both the raw source
  and the shipped ring. Pin-audit --reverse on the new pin reads "To
  Tappia Falls via terraces, Batad, Banaue, Ifugao", and the pin is not
  gate-flagged.
- QA: anchor 0; grid-verified interior point in a different cluster
  (16.7712, 121.0546, ~19.5 km away) 0; the old town anchor scores
  4.84 km, matching lane B's 4.83 km measurement to the nearest cluster.

### 3. chocolate-hills: Natural Monument boundary, anchor moved to the Carmen viewpoint

- Source: OSM relation 15100962 "Chocolate Hills Natural Monument", 1
  polygon, 366 source vertices (live OSM has grown since lane B's 256).
  Shipped: 24 vertices, max deviation 1.412 km, record 801 bytes.
- Anchor moved 18.41 km: (9.7, 124.0333), the Wikidata point, which sits
  8.30 km outside the monument in the northwestern hills field, to
  (9.7982126, 124.168487). The new point is OSM node 11927408233, tagged
  tourism=viewpoint, at the main Chocolate Hills attraction in Carmen
  (way 1128401018, wikidata Q977422, the viewpoint complex with the
  entrance, hotel and restaurant nodes within ~150 m), verified inside
  both the raw and shipped monument boundary.
- Pin-audit --reverse reads "Loay Interior Road, Poblacion Norte,
  Tambo-an, Bohol" (Carmen). The audit's 3 km gate flags the pin at
  13.17 km from the Wikidata reference: that flag is the move itself,
  since the reference point is the old, outside-the-monument anchor this
  ruling replaced. Recorded here for the manual review the gate asks for.
- QA: anchor 0; grid-verified interior point (9.9449, 124.0963, ~17.7 km
  away) 0; the old anchor scores 9.22 km, matching lane B's measurement.

### 4. amsterdam-canals-d34-7: Grachtengordel boundary, anchor nudged 156 m

- Source: OSM way 222278733 (the Grachtengordel protected-area ring), 107
  source vertices. Shipped at the fine 0.002 tolerance: 9 vertices, max
  deviation 0.221 km, record 490 bytes.
- Anchor nudged 0.156 km due south: (52.3676, 4.9041) to (52.3662,
  4.9041). The brief's ~120 m figure lands the pin 1 m inside the shipped
  ring; 156 m puts it 34 m inside, still on the same canal-side block.
  Pin-audit --reverse reads "20, Nieuwe Herengracht, Weesperbuurt,
  Centrum, Amsterdam", inside the ring. (The audit's "no QID" reference
  note for this entry is pre-existing reference-data state, not a pin
  flag.) The Amsterdam CITY pin (amsterdam-netherlands in locations.json)
  is untouched at (52.3676, 4.9041); locations.json is not modified.
- QA: anchor 0; grid-verified interior point (52.3727, 4.8800, ~2.4 km
  away) 0; the old anchor (now outside the ring) scores 0.12 km, matching
  lane B's 0.119 km simplified-ring measurement.

## Integrity and sidecar

- All 70 pre-existing sidecar records are byte-identical per record in
  the new file.
- The whole file regenerates byte-for-byte across repeated runs: sha256
  4a07d7d1547041844a488a0f85964d49542fe18ed88b8f417e85bd5e0a5cd3f6.
- Sidecar: 70 to 74 records; 857,604 to 943,067 bytes, under the 1 MB
  cap. Largest new record Daintree at 21,958 bytes, under the 100 KB
  per-record cap. Largest shipped deviation among the four: Chocolate
  Hills 1.412 km, under the 2.5 km gate.
- Bank field-level audit against HEAD: exactly the four entries changed,
  only in kind/extentKm/extentType, plus lat/lng on the three ruled
  anchor moves. Facts, clues, photos, difficulty untouched. Bank 433
  entries, cities 803, both unchanged in count.
- Membership verified with the game's own pack helpers
  (src/meta/pack-store.js): Capitals 207, Landmarks 219, Landforms 173,
  combined 599, unchanged.

## Tests and manifests

- `node --test test/*.test.mjs`: 83 of 83 pass.
- APPROVED_AREAS: the four ids removed from both manifests
  (test/extent-aware-scoring.test.mjs and scripts/validate-landmarks.mjs,
  4 lines each). Bank kinds moved from 24 area / 70 extent to
  20 area / 74 extent.
- Validator: 13 problems, the same pre-existing 13 as lane B's ending
  state (10 difficultyWhy-format notes from the spike-check rescoring
  era, plus gobi, kalahari and rub-al-khali, which sit in the test
  manifest only). No new problems; the four conversions resolve none of
  the 13 and add none.

## Files changed (uncommitted)

assets/extents.json, assets/locations-landmarks-sol.json,
build/make-extents.mjs, build/fetch-borders-polygons.py,
test/extent-aware-scoring.test.mjs, scripts/validate-landmarks.mjs, plus
this report.
