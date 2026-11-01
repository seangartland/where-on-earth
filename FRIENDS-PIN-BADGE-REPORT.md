# Friend pin initials: report (2026-11-01)

Brief: FRIENDS-PIN-BADGE-BRIEF.md (Sean's ruling: a friend's pin must show the friend's initial, legibly). Built and verified by Claude Code (Opus 5.5) directly in demo.

## Change

- src/globe/pin.js: makeBadgeTexture('friend', 0, initial) now returns a square initial medallion (new makeMedallionTexture): a filled disc with a dark rim and a dark 900-weight initial. The disc is drawn white so the sprite tint sets its fill: the friend colour #f3e7d3 normally, white while a pin glows after a chip or pin tap. The rim and letter stay dark under either tint. The pill texture path is otherwise unchanged (shared texture setup moved into a small badgeTexture helper), so the player's YOU and check badges and the '1ST' stored-guess badge render exactly as before.
- src/modes/daily-friends.js: friend pins draw the medallion square at MEDALLION = 0.12 tip units (about 30 css px at the reveal zoom, against about 22 px wide for the old pill whose letter was about 4 px tall), hung off the halo's edge at MEDALLION_X = -0.075 so it stays attached to the pin without covering the guess point. The '1ST' pin keeps the old FRIEND_BADGE_SCALE path. Hit testing, limb fade and glow are unchanged and apply to the medallion.
- Chips and popover untouched.

## Verification

- Capture: shots/friends-lane4/a2-reveal-initials-390.png (390 px, stubbed account worker, reveal round 1 of the lane 4 flow, run from a scratch copy of the lane 4 harness at .build-tmp/pin-badge/capture.mjs; the banked harness was not modified). Measured: 5 friend pins visible, chips "Ana 157 km", "Bea 463 km", "Cal 846 km", "+2" matching the recomputed expectations, no page errors. The C and B medallions are plainly readable at 1x (viewed directly and in a nearest-neighbour zoom).
- node --check src/main.js and node --check --input-type=module < src/main.js: pass.
- node --test test/*.test.mjs: 94/94 pass. account-worker npm test: 5/5 pass.
- Note on the brief: the banked shots/friends-lane4/capture.mjs already has the mjs MIME entry and stubs api.where-on.earth (alongside the old workers.dev host), so neither stated defect was present; the scratch copy only trims the run to reveal round 1 and renames the output.

## Visual review (FRIENDS-DESIGN.md section 6a), verdict

- Friend pin colour #f3e7d3: kept. On the reveal it reads as clearly distinct from the player's orange guess and the cyan answer on both land and ocean. As a halo alone it is low contrast on bright terrain, but identity now lives in the medallion, whose dark rim separates it from any background, so the colour no longer has to carry legibility.
- Chip layout: kept. Chips lead with the bold name, which starts with the same letter as the medallion, so a pin maps to its chip at a glance; the three chips plus "+2" fit one row at 390 px with no clipping.
- Found, not changed: in this capture the nearest friend's (Ana's) medallion sits under the player's own "292 km" distance label, a DOM element above the canvas, so it is hidden. This depends on where a friend guessed relative to the player's guess line, and moving or restyling the player's label is outside this brief (the player's own pins and labels stay unchanged). Ana remains identifiable through the chip and popover. If it matters in play, a follow-up could nudge the medallion to whichever side of the pin is away from the label.
- Found, not changed: the medallion's side relative to its pin follows the pin's local x axis, so on other parts of the globe it can sit to a different side of the halo. The old pill had the same property; it stays attached either way.
