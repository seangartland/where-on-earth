# Brief: build extent-aware scoring (approved plan, decisions recorded)

Work in this clone (extent-work), based on current main, which
contains `docs/extent-aware-scoring-plan.md`. Implement that plan
exactly, including its Decisions section (Sean, 2026-10-18):

1. A zero-distance guess shows `0 km` only. Do NOT add any
   "Inside the feature" hint or other new reveal copy.
2. The reveal flight keeps the pin-to-center route; the travel
   counter ends at the adjusted km. No route-geometry changes.

## Scope reminders (from the plan, binding)

- One helper in `src/game/scoring.js` (the plan's
  `scoringDistanceKm` shape), used once in `revealGuess`
  (`src/game/round.js`). No repeated extent subtraction anywhere
  else. The no-extent branch returns the raw `distanceKm` result
  untouched: the no-op must stay structural.
- `distanceKm` itself stays generic (the outlines callers in
  `src/globe/outlines.js` must not become extent-aware).
- Pool gate in `src/modes/landmarks.js`: admit exactly the nine
  `kind: "area"` entries with valid positive `extentKm` (the
  plan's ID-to-extent map); nothing else enters. Validator asserts
  the exact nine-entry delta.
- PvP untouched (worker scoring and catalog unchanged; the PvP
  parity test must still pass). Tap the Country untouched. The
  Daily must be provably identical on fixed dates. The frozen v2
  difficulty system is out of scope.
- The pre-existing `isla-foca` validator failure is a tracked
  baseline: do not repair it, do not let it mask regressions.

## Build sequence (the plan's section 7, with step 4 reduced)

1. Freeze regressions and add helper tests (city/point-landmark/
   Daily fixtures, nine-entry matrix, boundary arithmetic).
2. Add the helper and swap the one call in `revealGuess`; run
   the helper, score, tier, Survival, persistence, and no-extent
   tests headlessly.
3. Open the pool gate for the nine and strengthen validation;
   run both validators.
4. Verify the zero-distance presentation is the existing 0 km
   path with no new copy (per Decision 1).
5. Full regressions and mode smoke tests headlessly: Daily,
   Landmark Survival, Survival boundary behavior, Expeditions,
   Trivia, restoration, PvP parity. Sean does the final phone
   pass later; your deliverable is the headless evidence.

Work step by step, running each step's verification before moving
on, and keep a short log of commands and results in
`docs/extent-build-log.md`. Leave all work uncommitted; the
orchestrator verifies and banks. Your sandbox has no network.
