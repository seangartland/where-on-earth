# More modes hub and Landmarks mode: build report

Date: 2026-10-15. Design: docs/expeditions-rethink-opus.md, Proposal 2 (Sean
approved 2026-10-15). Phase 1 (the code) was built by Claude Opus 5.5 in one
session; its session ended during verification, so phases 2 and 3 of its plan
(the harness, screenshots and this report) were completed by the orchestrator
(Muse, in-session), as with the data pass. Nothing here is deployed by
the builders; the orchestrator deploys after this report.

## What a player gets

- Home: a **More modes** button beside Challenge, filling the grid's empty
  slot (Daily full width; Survival | Expeditions; Challenge | More modes).
  Sub-copy: "Landmarks, photo and trivia games".
- The More modes hub (Survival hub pattern): **Landmarks** live, with the
  pool count and the Landmark Survival best in its sub; **Photo mode** and
  **Trivia clues** as disabled "Coming soon" rows.
- Landmarks mode: Classic Survival rules on the curated landmark pool of
  **332** (kind landmark, playable, and a v2 difficultyWhy whose trailing
  level equals the stored difficulty; isla-foca is excluded by that rule).
  Band ramp per round 1-10: [1,3], [1,4], [2,5], [3,6], [4,7], [5,8], [6,9],
  [7,10], [8,10], [9,10], then [9,10]. Best streak under the new key
  `where-on-earth-best-landmarks-survival`. Rounds record into the landmark
  dex only. Share text is a new per-mode builder on the classic Survival
  shape; no existing mode's share text changed.
- The Passport Landmarks shelf and its summary now read the same curated
  pool (332 slots). Audit mode still shows the full bank. The three area
  island stops stay earnable through Expeditions.

## Implementation notes

- `src/modes/survival.js`: a source object {label, pool, resultsId, bestKey,
  optional bands(round), optional shareText}; CLASSIC keeps the cities pool,
  the uniform 1-10 band draw, its results id and the existing best key
  `where-on-earth-survival-best-v1` (the key the game already used; an
  earlier brief named it wrong and the builder used the real one).
- `src/modes/landmarks.js` (new): the pool rule (the validator's v2 regex),
  the ramp, the Landmarks source, the hub wiring and the hub sub copy.
- `src/game/round.js`: registers the hub elements and hides the hub with the
  other screens. `src/meta/passport.js` and `passport-store.js`: the shelf
  and summary read the curated pool; `expeditionLandmarks()` had no other
  caller and was removed. `index.html`: the More modes button and hub
  section. `src/modes/expeditions.js` and `src/main.js`: wiring.
- Repeat draws are possible in Landmarks exactly as in classic Survival:
  the pick is an independent uniform draw per round with no repeat
  prevention, which is Sean's standing Survival ruling. One harness run
  drew the same level-2 landmark three times; with 14 entries at that level
  and the early bands, that is within chance, and a later run drew four
  distinct targets.
- No existing localStorage key or saved shape changed (one new best key).
  No data files, Daily pins, or the frozen scorer were touched.

## Verification (orchestrator)

- Syntax: `node --check` and `node --check --input-type=module` pass on all
  seven edited JS files.
- Full regression: 11 of 12 suites pass. The one failure, PvP H2H 4, is a
  headless browser crash ("Target page, context or browser has been
  closed" at p4-complete.mjs:61), the known flake class; H2H 4 passed in
  the data pass's full run an hour earlier on near-identical code, and this
  change touches no PvP code.
- Orchestrator harness `shots/hub-landmarks/verify.mjs` (390px, real taps,
  entry points asserted visible, never forced): **13 of 13 checks pass**,
  zero page errors. Home button visible and beside Challenge (same row,
  right slot); hub rows correct; four Landmarks rounds all drew pool
  members; the run haul appears after the run-ending miss; results read
  "Landmark Survival run over / 3 rounds survived"; the best key holds 3
  and the classic best key is untouched; the shelf shows 332 slots with
  summary "3 of 332 landmark postcards · 4 visited"; the city header still
  reads 0 / 805; classic Survival still draws a city.
- Screenshots in `shots/hub-landmarks/`: 01-home.png (the new 2x2 grid),
  02-hub.png, 03-landmark-round.png, 03b-miss-reveal.png, 04-landmark-
  results.png, 04a-run-haul.png, 05-shelf.png. The orchestrator viewed the
  home and hub shots; both match the site's design language.

## Commits

- `8f6bbc1` More modes hub and Landmarks mode (1/3): hub, Landmarks mode,
  curated shelf (Opus).
- This report, committed by the orchestrator as the completion commit.

## Deploy

Pending orchestrator deploy at the time of writing.
