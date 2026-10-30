# Extent geometry rebuild report

Date: 2026-10-29

## Outcome

The authoritative sources are wired into `build/make-extents.mjs`, the sidecar regenerates, the two scoring fixtures pass, the three-feature 390×844 capture harness is present, and the full Node test suite is green. The Wall extraction does **not** satisfy the brief's geometry acceptance criteria and must not be treated as release-ready: the direct-member OSM data is split into 6,006 connected components, and a defensible east-to-west route could not meet the requested 6,000 km sanity length without inventing a 1,514 km connection.

## Sources and method

- Wall: OSM relation 318110 full XML plus the JSON relation member list. The build uses only the 10,361 direct way members found in both downloads (the brief expected 10,363; the downloaded relation contains 10,361 direct ways). It builds a node/segment graph, adds candidate bridges only between dangling endpoints within 20 km, and uses a mapped-distance-first Dijkstra route through Shanhaiguan, Mutianyu, Badaling, and Jiayuguan. Because the western graph remains disconnected, the current output contains an explicit waypoint bridge and is therefore a failed candidate rather than an accepted spine.
- Reef: the single GBRMPA FeatureServer polygon ring.
- Canyon: unchanged Natural Earth derivation and record.
- Fetch commands are documented in the build-script header. `build/extent-sources/` is ignored by Git.

## Measurements

| Feature | Source vertices | Shipped vertices | Record bytes | Measured max deviation |
|---|---:|---:|---:|---:|
| Great Wall | 24,428 route vertices | 55 | 1,332 | 1.644 km |
| Great Barrier Reef | 73,634 | 331 | 6,948 | 1.662 km |
| Grand Canyon | unchanged | 173 | 3,702 | unchanged |

The complete sidecar is 37,302 raw bytes and 5,404 gzip bytes. Both rebuilt records are below 100 KB and their measured deviations are below 2.5 km.

The shared Douglas–Peucker implementation was copied from `make-country-outlines.mjs`. A 0.02° Reef run measured 2.963 km and failed the mandatory deviation gate, so the checked-in build currently uses 0.015°. This is an explicit deviation from the brief, not a claim that the 0.02° requirement passed. Both simplified counts are also well below the expected 2,000–4,000 range.

The Wall candidate length is 2,087.881 km. It contains 177 source-component bridges totaling 1,658.550 km. Bridges of at least 1 km are: 6.820, 14.554, 1.996, 3.519, 4.579, 1.011, 1.982, 1.896, 1.565, 2.875, 10.277, 1.181, 7.486, 1.618, 11.668, 9.105, 1.072, 10.473, 1.268, 17.513, and 1,514.074 km. The last bridge, from near Badaling to the western endpoint component, is disqualifying. The other 156 bridges are under 1 km.

## Scoring checks

- Badaling to shipped Wall: 0.312 km.
- Mutianyu to shipped Wall: 0.271 km.
- Neither fixture is a literal shipped vertex.
- Reef interior fixture `(lat -18, lng 147)`: 0.0 km.
- Reef outside fixture `(lat -18, lng 151.6029)`: 212.638 km. The test compares the scorer with an independently computed nearest point on the shipped polygon.

## Verification

- `node build/make-extents.mjs`: passes byte and deviation gates and regenerates the sidecar.
- `node --test test/*.test.mjs`: 13 test files passed, 0 failed.
- `shots/extent-pilot/capture.mjs` now forces reveals for the Wall, Reef, and Canyon at 390×844 and writes one screenshot per feature. Chromium was not started, per the brief's stated sandbox limitation; check-back must run the visual audit.

Runtime mechanics, pool membership, scoring implementation, and reveal rendering were not changed.

## Required follow-up

Do not accept the Wall geometry as complete. The OSM relation needs a better topology interpretation or a different approved extraction rule that produces a genuine Ming spine, resolves the western discontinuity without a fabricated segment, reaches the stated length sanity check, and yields the expected vertex density. The current build and report deliberately preserve the failed quantitative evidence for that follow-up.

## Split-banking addendum

The verified Great Barrier Reef rebuild is banked, while the failed Great Wall candidate is not. The Wall record and its scoring expectations have been restored verbatim to the `c3d5e9d` pilot state pending Sean's approach decision; Badaling and Mutianyu are literal pilot vertices scoring 0.0, not newly verified geometry. Grand Canyon remains unchanged.

| Shipped feature | Vertices | Record bytes |
|---|---:|---:|
| Great Wall | 24 | 607 |
| Great Barrier Reef | 331 | 6,948 |
| Grand Canyon | 172 | 3,702 |

The final sidecar is 35,325 raw bytes (5,098 gzip bytes). The Reef's measured maximum deviation is 1.662 km. `node --test test/*.test.mjs` passes all 13 test files with 0 failures.
