# Extent-aware scoring build log

Build date: 2026-10-18 (UTC)

Re-verified: 2026-10-19 (UTC)

## 1. Baseline and frozen fixtures

- `node scripts/validate-landmarks.mjs` — expected baseline failure only:
  `playable landmark without v2 difficultyWhy: isla-foca (F5·A2·K0·C0·S0 → 8)`.
- `node scripts/validate-weekly-expeditions.mjs` — PASS (37 routes, 259 distinct stops).
- Captured pinned `2026-10-18` and derived `2026-11-03` Daily IDs plus fixed-guess exact distance, rounded distance, base score, and weighted score in `test/extent-aware-scoring.test.mjs`.

## 2. Runtime helper and propagation

- Added `scoringDistanceKm` beside runtime scoring and replaced the single local-round `distanceKm` call in `revealGuess`.
- `node --test test/extent-aware-scoring.test.mjs` — PASS. Covers all nine area geometries, exact clamp/malformed-extent behavior, thresholds, city and point-landmark no-op fixtures, both fixed Daily fixtures, saved-result field shape, mode/catalog isolation, route/counter arguments, and the zero-km copy decision.

## 3. Landmark pool and validation

- Added the explicit playable-area/finite-positive-extent branch without changing the existing point-landmark branch.
- Strengthened `scripts/validate-landmarks.mjs` with the approved exact ID-to-extent map.
- `node scripts/validate-landmarks.mjs` — reports `approved playable areas: 9`, then exits 1 only for the unchanged `isla-foca` baseline above.
- `node scripts/validate-weekly-expeditions.mjs` — PASS (37 routes, 259 distinct stops).

## 4. Zero-distance presentation

- No reveal copy or layout was added. The existing distance/counter path receives rounded adjusted distance (`0 km` at zero), while both reveal functions retain the original guess-to-answer coordinates.
- Source-contract assertions in `test/extent-aware-scoring.test.mjs` — PASS.

## 5. Full offline regressions

- `node --test test/*.test.mjs` — PASS (account merge, extent-aware scoring, passport grouping).
- `(cd pvp-worker && npm run test:scoring)` — PASS (6/6 parity vectors); worker scoring and catalog unchanged.
- `git diff --check` and Node syntax checks for changed runtime modules — PASS.
- Daily, Classic Survival city-only selection, Landmark Survival boundary behavior, classic Island Hopping, Weekly, Trivia, restoration/result fields, Tap the Country independence, and PvP catalog isolation are covered by the focused headless suite.
- Phone/browser presentation review was not run, as assigned to Sean by the brief.
