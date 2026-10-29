# Pack summary Passport action report

Date: 2026-10-29
Model: GPT-5 Codex

## Implementation

- The done-state action row lives in `index.html` as `.pack-actions`, directly below `.pack-complete-stamina`. It contains the primary `.pack-primary` **Back to packs** button and the secondary `.pack-passport` **Passport** button.
- `src/modes/pack.js` hides or shows the entire action row from the same `packSummary(currentPack()).played >= PACK_CARDS` condition that controls the done state. The row is also explicitly hidden on the pack selector and sealed state, so Passport is absent mid-pack.
- The Passport button calls `host.openPassport(showPackSelect)`. `modeHost` receives the existing `openPassport` exported from `src/meta/passport.js`; there is no second Passport renderer or opener.
- `openPassport` now accepts an optional close callback. Existing Home entry points call the same opener with the normal Home return behavior. When opened from a completed pack, Passport close (×, Escape, or backdrop) invokes `showPackSelect`, so the player returns to the pack selector.
- `.pack-actions` is a two-column grid. **Back to packs** remains the larger primary action. `.pack-passport` matches the game's existing pale-blue outlined secondary treatment used by cancel/settings controls. Both columns use `minmax(0, ...)` and remove the primary button's global minimum width so the pair can shrink within the 390px layout.

## Tests

`node --test test/*.test.mjs`:

- 12 tests passed
- 0 failed
- Includes `test/pack-passport-action.test.mjs`, which asserts that both actions render together, that their container follows the shared done condition, and that the Passport action uses the host opener with the pack-select return callback.

`git diff --check` passed.

## 390×844 capture

`shots/pack-stamina/capture.mjs` now seeds a completed World Capitals pack at a 390×844 viewport, waits for `.pack-actions:not([hidden])`, records both action rectangles plus the floating menu rectangle, and writes:

`shots/pack-stamina/h-capitals-done-actions-390x844.png`

The capture could not be produced in this run. Both available Chromium binaries were run in the foreground and exited before creating a page because the managed environment denied Crashpad's socket operation (`setsockopt: Operation not permitted`, then `SIGTRAP`). The repository Chromium was also supplied its required signed Hatch WebGL domain policy; it then reached the same Crashpad denial. This is an environment launch failure, not a page/runtime error. The harness changes and intended output path are left in the tree for rerun in a browser-capable environment.

Expected capture content from the seeded state: the World Capitals completed summary, three played postcard cards, the completion/stamina copy, and a bottom action row with the wider white **Back to packs** pill beside the outlined blue **Passport** pill. The floating × menu remains at the upper-right edge, separated vertically from the action row.

Standing blind spot: even a successful desktop Chromium capture would not prove iOS Safari behavior.

## Orchestrator check-back (2026-10-29)

The capture harness was rerun by the orchestrator at 390x844 and succeeded: `shots/pack-stamina/h-capitals-done-actions-390x844.png` shows both "Back to packs" (left 36-216, top 511-563) and "Passport" (left 224-354, top 511-563) in one row, with no page errors. The floating menu button sits at top 264-308, well above the action row, so there is no overlap. Full test suite at check-back: 42 tests passed, 0 failed.
