# Brief: pacing batch (unification + Practice + home + pack guarantee)

Spec: docs/pacing-and-monetization.md in this repo. Read it in full before touching code. Sol's weigh-in is docs/pool-unification-weighin.md; where the two conflict, the pacing doc wins. Work in a fresh clone on the GitHub line (origin https://github.com/seangartland/where-on-earth). Bank each phase with its own commit and push before starting the next. Do not deploy; the orchestrator deploys the batch at the end.

## Phase 1: unification core

- Merge Landmark Survival into Classic Survival. One Survival mode over a single pool: all playable cities (805) plus the full landmark pool (341, including the 9 kind:"area" entries with extentKm), 1,146 total. Use the existing pool functions (isPlayableLocation, isPoolLandmark/landmarkPool) rather than new lists.
- Draw: Classic's uniform band 1-10 over the merged pool, plus the weigh-in's draw fix (item-uniform sampling within the ramp range, so no cohort is overdrawn). The frozen v2 difficulty data does not change; only sampling changes.
- Retire the separate Landmark Survival mode and its picker entry. `?mode=landmarks` must alias to Survival and start it. The `?area=` test hook must still force an area round in Survival.
- Bests: existing per-mode best keys are a contract. Merged Survival bests read as the max of the legacy Classic and Landmark keys; do not delete or rewrite stored keys. Landmark Survival bests set under the old mode stay honored.
- Passport, Daily, PvP, Expeditions: untouched in this phase. Extent-aware scoring keeps working through the shared reveal path for the 9 areas.
- Tests: pool total is 1,146; a distribution check shows no difficulty cohort overdrawn beyond the weigh-in's predicted bound; legacy bests read correctly with only one, both, or neither legacy key present; `?mode=landmarks` lands in Survival; full existing suite green.

## Phase 2: Practice earning + home restructure

- Survival stops earning postcards: rounds still record visits and survival bests/streaks, but no postcard is earned and no earned postcard's tier or best distance is upgraded from a Survival round, for cities and landmarks alike. Find every path Survival uses to award (including the postcard popup flow) and gate it at the shared award point if one exists; do not scatter conditionals. Earning rules should live in one shared place (the pacing doc's structural requirement).
- Daily, pack, and Expeditions earning: unchanged, verified by tests.
- Home, in order: tappable Passport summary card (the whole card opens the Passport; keep its contents), Daily row, pack row (already live), Expeditions button, Practice button. Delete the Stats/Passport links row; Stats becomes reachable inside the Passport screen.
- Practice hub: one screen listing Survival, Tap the Country, Country Blackout, and Trivia, following the existing picker-hub pattern and shared UI classes. Its copy states the practice rule plainly (no postcards are earned in Practice). The More modes hub and its home cell are removed; Trivia's only home entry point becomes the Practice hub.
- Challenge: placement unchanged.
- Headless verification at 390x844 and 390x664: home fits without overlap, all five zones tappable, gear and mute no longer overlap (the pack build's C1 fix must survive), Practice hub opens and every tenant launches. Full suite green.

## Phase 3: pack landmark guarantee

- In the pack store's daily generation: one of the 3 slots is drawn from the pack pool's landmark subset; the other two from the full pack pool. The 3 cards in a day's pack remain distinct. A pack already generated for the current day is never regenerated.
- Tests: over simulated days, every generated pack contains at least one landmark; no duplicate cards inside a pack; stored packs from before this change load unchanged; full suite green.

## Reporting

Per phase, write a short report file (docs/pacing-build-phase-N-report.md): what changed, test counts, the pool/draw numbers measured (phase 1), and screenshots or headless results for phase 2's home checks. Commit and push each phase separately with clear messages, no em dashes anywhere, code comments included.
