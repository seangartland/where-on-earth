# Pacing build, phase 1 report: unification core

Built by Muse Wonder in-session, 2026-10-18. Spec: docs/pacing-and-monetization.md.

## What changed

- `src/modes/survival.js`: the Survival pool is now `mergedSurvivalPool()`, every playable city (805) plus the Landmark pool (341, including the 9 extent areas), 1,146 total, drawn with Classic's existing uniform band 1 to 10 rule (uniform band, then uniform item in the band). No ramp. `survivalBest()` with no key returns the max of the legacy Classic key and the legacy Landmark key; neither stored key is rewritten or deleted, and new bests write to the Classic key only after beating that merged max.
- `src/modes/landmarks.js`: the separate Landmark Survival source, its ramp bands, and its share text are removed. `landmarkPool()` and `isPoolLandmark` are unchanged and still serve the Passport shelf and the pack. The More modes hub's Landmarks row now starts the merged Survival. `LANDMARKS_BEST_KEY` is exported for the merged best read.
- `src/main.js`: `?mode=landmarks` aliases to the merged Survival, and the `?area=` test hook starts the merged Survival with the forced area.

Fallback: if the landmarks file fails to load, `landmarkPool()` is empty and the pool is cities only, which is the weigh-in's specified fallback. Rounds drawn in the brief window before the landmarks file settles draw from cities for the same reason and self-correct on the next pick, since the pool is computed per pick.

## Measured

- Pool: 1,146 entries, 805 cities + 341 landmark pool, no duplicate ids (node test against the real data files).
- Draw: per-item probability is 0.1 divided by the merged band cohort size. The thinnest merged cohort gives a worst overdraw of under 1.6x the flat rate (test asserts the bound), matching the weigh-in's 1.5x prediction for the uniform-band rule. CERN's per-round chance computes to well under 1% (test asserts under 1%), versus 12.9% of runs under the old ramp.
- Bests: with only the Landmark key set (17), `survivalBest()` reads 17; with the Classic key at 23 it reads 23; the explicit Landmark key read still returns 17 and the stored value is untouched.

## Verification

- New test file `test/survival-merge.test.mjs`: 4 of 4 pass. Full suite (account-merge, extent-aware-scoring, pack-store, passport-grouping, survival-merge): all pass, zero failures.
- Syntax: `node --check --input-type=module` clean on all three edited files.
- Headless (390x844, local serve of this tree): `?mode=landmarks` opened a merged Survival round and drew a city (Amman), proving the alias lands in the merged pool; `?area=black-forest` forced the Black Forest round as before; zero page errors. Script: ~/workspace/map-game/shots/merge-smoke.mjs.
