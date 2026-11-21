# Home cleanup report (design pass, 2026-11-21)

Brief: `BRIEF-home-cleanup.md`. Base 615cf57. Working tree only; nothing committed, pushed, or deployed. This replaces the 2026-11-18 report.

## Changed files

- `index.html`: static panel labels (pack name and placeholder status, Practice sub)
- `src/modes/daily-game.js`: Daily panel text, fresh and done
- `src/modes/pack.js`: home pack-panel status text only; `staminaText` is untouched, so the pack screen still reads as before
- `src/meta/passport.js`: home Passport card markup (text cues removed, one chevron added)
- `src/account/progression-view.mjs`: level label `LEVEL n` becomes `Level n`, with uppercase kept by CSS everywhere except the home; compact bar says `n XP to go`
- `src/styles/game.css`: home panel and Passport card type and spacing; removed the now-unused `.passport-cue` rules
- `test/passport-summary.test.mjs`: updated for the new card markup

## What was removed or shortened, and why

| Where | Before | After |
|---|---|---|
| Daily, fresh | `Daily` / `5 places daily` | `Daily` / `5 places` |
| Daily, done | `✓ Daily done` / `· See results` (title wrapped to two lines) | `Daily` / `✓ See results` |
| Pack panel name | `Postcard Packs` (wrapped to two lines) | `Packs` (the sealed pack art above already says what kind) |
| Pack, 1 pack | `1 pack available · next in 0:27:14` (three lines) | `1 ready` / `Next 0:27:14` |
| Pack, at cap | `2 packs available` | `2 ready` (timer paused, so no countdown) |
| Pack, 0 packs | `Next pack in 11:04:51` | `Next 11:04:51` |
| Pack, open pack | `1 pack available · 1 in progress` | `1 ready` / `1 in progress` |
| Practice | `Free play, endless runs` | `Free play` |
| Passport card | `Passport ›` cue, `306 places visited · 137 postcards` | Cue removed; `306 places · 137 postcards` with a single `›` on the row |
| Level row | `LEVEL 5` (tracked caps), `38 XP to next level` | `Level 5`, `38 XP to go` |
| Profile cue | `Profile ›` under the card | Removed; the level row's existing `›` was a duplicate of it |

Rationale: each panel is now one word plus at most two short status lines. The panel name is stable across every state, so only the status changes, and every visible state still shows on the panel itself. The card had three tap cues for two targets. It now has one chevron per target: the card opens the Passport dex, and the level row opens the profile.

## Type system now

- **Luckiest Guy**: only the logotype on the home (the `h1`) and the art baked into the pack image. The home panels never used it; its other uses are on non-home surfaces (results, profile, cabinet) and are out of scope.
- **Oswald**: not on the home. Its only use is the pack-detail closest number, which is out of scope.
- **System sans** (the body stack) is the single UI voice, on the existing `--fs-*` tokens:
  - Panel names: `--fs-title` (17px), weight 750, -0.01em
  - Panel status: `--fs-small` (12px), weight 600, 78% opacity, tabular numerals so the ticking countdown does not jitter
  - Card count: `--fs-display` (25px) number with `--fs-base` (15px) label; postcards stay gold
  - Level row: `--fs-small` for both `Level 5` (gold) and `XP to go`, with no tracked caps
- Panel text uses one ink (`--ink-hi`) on all three panels. Before, it was gold-tinted on Daily and Packs and lavender on Practice. Gold accents are now limited to the gold refill bar, the token pill, the postcards count, and the level label/XP fill.
- At widths of 360px or less, panel names drop to `--fs-base` and the label padding tightens by 2px.

Design note: the home now uses two text sizes on the panels and two on the card, from the same token scale. Any new home text should use one of those four rather than introduce a size.

## State-by-state fit

Every status line reserves two lines (`min-height: 2.6em`), so the three panel names share one baseline in every state. This was checked from the harness's `fit.json` at 320, 375, 390, and 430px across all six states:

- All panels stay 225px tall
- No line is clipped, and no panel name wraps
- The name position varies by at most 1px between states at each width
- No horizontal overflow and no page errors

The longest strings (`Next 11:04:51`, `1 in progress`, `✓ See results`) fit on one line at 320px.

## Tests

`node --test "test/*.mjs"`, run after the final CSS change: **132 tests, 132 pass, 0 fail**. Full output: `.view/test-run.txt`.

## Captures

Taken at 390x844, DPR 3, with `shots-ux/home-capture.mjs` (harness patterns from `shots-ux/capture.mjs`).

- Before: `~/workspace/map-game/woe-home-shots/before/`
- After: `~/workspace/map-game/woe-home-shots/after/` (plus `fit.json`)
- States: `daily-fresh_pack-cap`, `daily-fresh_pack-1`, `daily-done_pack-1`, `daily-done_pack-cap`, `daily-done_pack-0`, `daily-done_pack-1-in-progress`

Notes on the captures:

- The before captures were not retaken. Four states were already in `before/`. The two missing ones (`daily-done_pack-0`, `daily-done_pack-1-in-progress`) were copied in from the earlier same-session before run in the clone's `.view/`.
- The before shots show an empty stamps strip, while the after shots render the five stamps through the harness's stand-in images. I did not investigate why. This change does not touch stamp rendering, apart from a `:empty` rule that collapses an empty strip.
- Copies of the after PNGs are also in `.view/after/` for in-clone viewing.
