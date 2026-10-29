# Extent pilot implementation report (2026-10-29)

Model: GPT-5 Codex.

## Outcome

Implemented the three-entry extent data model and local-mode runtime path: lazy sidecar loading, fail-closed pool admission, line/polygon nearest-point scoring, polygon containment, nearest-point reveal marker and connector, stroke-only extent reveal, validation, Landforms membership, credits, and focused regression coverage. PvP remains unchanged.

## Geometry

| Entry | Source represented in the sidecar | License | Shipped vertices | JSON bytes |
| --- | --- | --- | ---: | ---: |
| `great-wall-of-china` | OpenStreetMap relation 318110, Ming main line pilot extract | ODbL 1.0 | 24 | 607 |
| `great-barrier-reef` | GBRMPA amalgamated Great Barrier Reef Marine Park boundary pilot extract | CC BY 4.0 | 20 | 684 |
| `grand-canyon` | Natural Earth 1:10m Colorado River, Lees Ferry toward Grand Wash Cliffs | Public domain | 172 | 3,702 |

The complete sidecar is 14,121 raw bytes / 2,257 gzip bytes. Coordinates are quantised to 1e-4 degrees. The Wall photograph is the quarantined Mutianyu image: Nicolas Perrault III (Velatrix), CC0 1.0.

## QA gates

- Wall ground truth: Badaling `(40.3598, 116.02)` = **0.0 km**; Mutianyu `(40.4319, 116.5704)` = **0.0 km**.
- Reef containment: `(-18, 149)` = **0.0 km**.
- Reef exterior: `(-18, 151.6028964613)` = **100.0000000000 km** by the runtime nearest-segment calculation; independently remeasuring the returned nearest coordinate with the shared great-circle function returns the same value (tolerance under `1e-8 km`).
- Non-extent regression: `node --test test/*.test.mjs` = **13/13 test files pass**.
- Validator: `node scripts/validate-landmarks.mjs` = **PASS** (333 entries: 278 landmark, 52 area, 3 extent; 26 approved playable areas).
- Syntax checks passed for all changed runtime modules.
- `python3 scripts/pack-landforms/derive.py` regenerated **134** Landforms, including all three pilot entries.
- Phone capture harness: `shots/extent-pilot/capture.mjs` can express a forced Grand Canyon Survival reveal at 390×844 and asserts the nearest-point copy. Chromium could not start in this sandbox: the managed browser first rejected the WebGL domain policy, then both installed Chromium builds exited on the sandboxed crashpad socket (`setsockopt: Operation not permitted`). No capture was produced. This remains a visual blind spot; desktop Chromium would not prove iOS Safari behavior either.

## Files changed for this pilot

- Data/build/docs: `assets/extents.json`, `assets/locations-landmarks-sol.json`, `build/make-extents.mjs`, `credits.html`, this report.
- Runtime: `src/game/extents.js`, `src/game/scoring.js`, `src/game/round.js`, `src/globe/outlines.js`, `src/globe/pin.js`, `src/globe/reveal.js`, `src/main.js`, `src/modes/landmarks.js`.
- Pipeline/meta: `scripts/pack-landforms/derive.py`, `scripts/validate-landmarks.mjs`, `src/meta/pack-landforms.js`.
- Tests/harness: `test/extent-aware-scoring.test.mjs`, `test/pack-pools.test.mjs`, `test/passport-packs.test.mjs`, `test/survival-merge.test.mjs`, `shots/extent-pilot/capture.mjs`.

## Contract issue flagged

The environment had no usable network path for downloading the OSM relation or GBRMPA FeatureServer geometry. The build therefore checks in small, already-reduced pilot extracts rather than fetching and simplifying full raw source files. Consequently, source-before vertex counts and measured Douglas–Peucker maximum deviations are not available, and the Wall/reef extracts are much coarser than the spec's estimated 2,000–4,000 vertices. The runtime implementation and required numeric gates pass, but these two geometry records should be replaced from the authoritative downloads and visually audited before release. This was not silently represented as a completed source-quality gate.
