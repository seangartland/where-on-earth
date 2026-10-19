# Landmark Survival repeat-round diagnosis

Date: 2026-10-18

## Conclusion

No replay/state bug exists in the Survival advance path. The reported experience is consistent with an honest independent draw selecting the same item for a new round. A repeated item ID is therefore possible even though the round advanced correctly.

No application code was changed. In particular, no repeat prevention was added: that would alter the specified Survival selection distribution and would be a placebo for a state bug that the evidence does not show.

## State-path evidence

The complete accepted-Next path is synchronous:

1. `nextRound()` first requires `state.gameMode === 'reveal'` (`src/game/round.js:388-389`).
2. The Survival branch directly calls `survivalNext()` (`src/game/round.js:395`).
3. For a survived round, `survivalNext()` directly calls `survivalGo()`.
4. `survivalGo()` increments `survival.round`, independently draws and assigns `survival.item`, clears the previous outcome, and calls `host.showRound()` (`src/modes/survival.js:74-84`).
5. `showRound()` synchronously changes `state.gameMode` to `guess` before rendering the new round (`src/game/round.js:154-161`).

Consequently, by the time the first Next click handler returns, the mode is already `guess`. Any second queued click reaches `nextRound()` and is rejected by its first-line guard. Flyover animation, reveal beats, toast timers, `requestAnimationFrame`, and postcard callbacks do not sit between the advance and the `gameMode = 'guess'` assignment.

There is one Next registration in the active source: `gameEls.next.addEventListener('click', nextRound)` in `initRound()` (`src/game/round.js:455-475`). Repository search found no second active registration; apparent duplicates are historical `main.js.bak-*` files which are not imported by `index.html`.

The draw itself explicitly has no memory of the preceding item. `survivalPick()` chooses a band and then returns a uniform random member of that band (`src/modes/survival.js:58-71`). Drawing the same object reference again is expected behavior, not evidence that the previous round was re-served.

## Headless reproduction evidence

A headless production-module harness used the real `startSurvival()` / `survivalNext()` / `survivalGo()` implementation with a deterministic two-item band and `Math.random = () => 0`. Its log was:

```json
[
  { "step": "round 1 guess",  "gameMode": "guess",  "round": 1, "item": "alpha" },
  { "step": "round 1 reveal", "gameMode": "reveal", "round": 1, "item": "alpha" },
  { "step": "round 2 guess",  "gameMode": "guess",  "round": 2, "item": "alpha" }
]
```

This deterministically reproduces the user-visible “same clue again,” while distinguishing its mechanism: `round` advanced from 1 to 2, the state returned to `guess`, and the independent draw happened to select `alpha` again. It is a new round with the same item, not the old round object replaying without advancement.

I also prepared the repository-style Playwright route harness to run rapid double clicks, normally paced clicks, Classic Survival, Landmark Survival, and all five Daily rounds through `window.__game`. This managed execution sandbox would not allow either installed Chromium binary to start: `/opt/meta-chromium/chrome` aborted at crashpad `setsockopt` with `Operation not permitted`, and the local headless shell aborted in `sandbox_host_linux.cc` with the same restriction. Both failures occurred before a page was created, so they provide no contradictory application result. The source transition above is synchronous and the production-module reproduction exercises the state-changing Survival implementation directly.

## Verification

- Forced same-item Survival reproduction: round 1 to round 2, `reveal` to `guess`, same item ID; passed.
- Rapid-click safety: established by the synchronous transition and entry guard; after the first call returns in `guess`, another call cannot advance.
- Landmark and Classic: both use the same `survivalNext()` / `survivalGo()` path; there is no mode-specific advance path.
- Daily isolation: no source was changed. Daily retains its own ordered `state.selected[state.daily.round]` path, and `nextRound()` increments `state.daily.round` once before synchronous `showRound()` (`src/game/round.js:400-404`).
- Syntax: `node --check src/game/round.js` and `node --check src/modes/survival.js` passed.
- Existing suite: `node --test test/*.test.mjs` passed 3/3 (`account-merge`, `extent-aware-scoring`, `passport-grouping`).

## Fix log

No fix shipped. The correct action is to preserve the designed independent Survival draw and document that consecutive equal item IDs can represent distinct rounds. Adding a previous-item filter, debounce, listener rewrite, or asynchronous lock would change behavior without addressing an evidenced defect.
