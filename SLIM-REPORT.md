# Slim results award report

Changed files:

- `src/modes/daily-game.js`
- `src/styles/game.css`
- `index.html`
- `shots-ux/capture.mjs`
- `SLIM-REPORT.md`

The Daily award now starts as a compact, tappable XP strip. Its four existing
breakdown rows remain omitted when their award is zero, except for the base
row, and expand in place on tap.

On a level crossing, the level-up card is a fixed, bottom-anchored overlay
inside the results screen. Its scrim covers the unchanged results content, so
the recap remains visible behind it and the overlay adds no layout height.
Both the Keep going button and a scrim tap dismiss it.

Validation run:

- `node --check src/modes/daily-game.js`
- `node --check shots-ux/capture.mjs`
- `node --test "test/*.mjs"`: 19 test files passed, 0 failed.
- `git diff --check`: passed.

The capture harness now records collapsed `results-award`, expanded
`results-award-expanded`, and overlay `results-levelup` states under
`PROG_SHOTS`. Chromium cannot launch in this sandbox, so I did not generate
the captures here; the orchestrator must run the harness.

Orchestrator fix during verification (Muse): the breakdown rendered
with the hidden attribute, but the .xp-award-breakdown display:grid rule
overrode the UA [hidden] style, so the rows were always visible and the
strip never rested collapsed. Added .xp-award-breakdown[hidden] {
display: none; } to game.css and recaptured: the resting state is now
the strip alone, and the breakdown appears only on tap.
