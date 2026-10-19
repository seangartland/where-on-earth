# Brief: Landmark Survival serves the same round again on a fast Next click

Sean's report from the live game (2026-10-18, Landmark Survival):
he clicked Next round quickly and was given the same clue again
and had to play the same round a second time.

Work in this clone (extent-work), based on current main. Diagnose
first, then fix minimally. Leave all work uncommitted; the
orchestrator verifies and banks. No network.

## What the orchestrator already read (starting points, not conclusions)

- `nextRound()` (`src/game/round.js`) guards on
  `state.gameMode !== 'reveal'` and dispatches to `survivalNext()`.
- `survivalNext()` -> `survivalGo()` (`src/modes/survival.js`) is
  synchronous: round += 1, `survival.item = survivalPick()`,
  `host.showRound()`.
- `survivalPick()` is an independent uniform draw inside a random
  difficulty band, with intentionally NO repeat prevention (Sean's
  design; do not add any). Landmark pool band cohorts measure
  15-59 entries, so an honest back-to-back repeat of the same item
  is possible but uncommon (roughly 2-7% per round).
- `state.gameMode` transitions are spread across round.js,
  daily-game.js, and the pvp modules; trace exactly when it leaves
  'reveal' during a Survival advance, including anything async in
  the showRound path (flyover, toasts, rAF, timers).

## Your job

1. **Reproduce headlessly first** (the repo's playwright harness
   patterns; drive Landmark Survival through window.__game where
   needed). Script both rapid-fire Next clicks and normal pacing.
   Determine the mechanism with evidence: log the gameMode value,
   survival.round, and survival.item id at each step. The key
   distinction: a state bug replaying the same round object, or an
   honest draw repeat (new round, same item). Also rule in or out:
   a double-registered click listener on the Next button, and any
   async window in showRound where gameMode is still 'reveal'
   after the advance.
2. **Fix the mechanism, minimally**, in the shared path if that is
   where it lives. Hard constraints: the Daily's flow and
   selection must be bit-for-bit unaffected; Survival keeps its
   no-repeat-prevention draw; do not fix this by filtering the
   previous item out of the draw unless the evidence shows the
   draw itself is the defect (it is not, per the design note).
3. **Verify:** scripted rapid-click sessions in Landmark Survival
   and Classic Survival advance exactly one round per click and
   never re-serve the just-played round as a replay; a scripted
   Daily session plays its five rounds in order; both syntax
   checks; the repo's existing test suite green. If your
   conclusion is that no state bug exists and the report was an
   honest draw repeat, prove it with the reproduction logs and
   say so plainly instead of shipping a placebo fix.

Write the diagnosis and evidence into `docs/landmark-repeat-diagnosis.md`
and keep a short fix log there too.
