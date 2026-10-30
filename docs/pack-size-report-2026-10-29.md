# Pack select screen: centering fix and bigger packs (2026-10-29)

Worktree woe-packsize at 2021c3c. CSS only: `src/styles/game.css`, 5 lines changed.
No JS, behavior, economy, or copy changes. Suite: 79/79 pass.
Harness: `shots/pack-size/capture.mjs` (fake origin, 390x844, seeded state
matching Sean's phone: 1 pack banked, 15 skip tokens, next pack in 12h,
Landforms Complete). Captures: `before-select.png`, `after-select.png`,
`before-tear.png`, `after-tear.png`; measurements in `before.json` / `after.json`.

## Diagnosis (container chain first)

Measured before any change, viewport 390x844, center (195, 422):

- The content block (heading through the pack row) sat **+16.5px right** of
  center (block cx 211.5) and -5.0px vertically (essentially centered).
- `.pack-panel` measured **387px wide with its right edge at x=405, 15px off
  the right edge of the screen**; the × back button hung 10px off-screen too.
- Cause: double side padding around a vw-sized row. `.pack-choices` was
  `width: min(354px, 90vw)` = 351px at 390px wide, and it sits inside 18px of
  panel padding inside 18px of screen padding (72px of inset total). The
  panel's intrinsic width was therefore 351 + 36 = 387px, wider than the
  `.pack-screen` grid's content box (390 - 36 = 354px). The grid's single
  implicit column sized itself to the panel from the left padding edge and
  spilled right, so `place-items: center` never got to center anything: the
  whole block hung off the right side. Vertically the block was fine; the
  high, empty look on the phone comes from the horizontal spill plus the
  fixed decorative shadow ellipse anchored at the bottom of the screen.

## Fix

Make the insets and the row width agree, then spend the recovered width on art:

- `.pack-screen` padding `12px 18px 18px` -> `14px 8px` (sides 18 -> 8;
  top/bottom equal so grid centering is exact).
- `.expedition-panel.pack-panel` padding sides 18px -> 4px. Combined inset is
  now 12px per side, so the panel (374px) exactly fills the screen content
  box and the grid centers it for real.
- `.pack-choices` width `min(354px, 90vw)` -> `min(366px, 100%)`, gap 8 -> 6px,
  `margin-inline: auto` for wider screens.
- `.pack-choice` padding 7px -> 2px, art row 142px -> 168px; `.pack-choice img`
  height 142px -> 168px. Card column is now (366 - 12) / 3 = 118px; the img
  box is 112 x 168px, which is exactly 2:3, so the art fills it at full size
  with no crop and no letterbox.

## Measured results

| Measure (390x844) | Before | After |
| --- | --- | --- |
| Content block horizontal offset | +16.5px | 0px |
| Content block vertical offset | -5.0px | -2.0px |
| Panel right edge | 405 (off-screen) | 382 |
| Pack art width | 95.7px | 112px (+17%) |
| Pack art height | 142px (letterboxed in row) | 168px (exact 2:3 fill) |
| Pack card width | 111.7px | 118px |

Captures confirm: even margins both sides, art visibly larger and readable,
pack names on one line, the "Complete" state line legible, the × button fully
on-screen.

## Tear stage regression check

The single-pack tear stage uses `--pack-w`, not the choice grid. Before and
after: sealed pack 234 x 351px, horizontal offset 0 in both. Vertical offset
+17.8px -> +20.8px (a 3px shift from the screen's top/bottom padding
rebalance). Framing otherwise unchanged; see `before-tear.png` /
`after-tear.png`.

## Blind spot

Desktop Chromium harness at 390x844; it cannot express iOS Safari's dynamic
viewport or browser chrome. Sean's phone is the final check, as with the tile
prefetch.
