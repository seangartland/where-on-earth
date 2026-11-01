# Friend medallion clears the distance label: report (2026-11-01)

Brief: FRIENDS-PIN-BADGE2-BRIEF.md (Sean approved follow-up to 08c6e3c: a friend's initial medallion must not hide under the player's own guess-to-answer distance label). Built and verified by Claude Code (Opus 5.5) directly in demo.

## Change

- src/modes/daily-friends.js only. When the player's distance label (#line-distance) is showing, each friend pin's medallion is placed by a new placeMedallion() every frame; when the label is hidden nothing runs and the medallion sits exactly where it did (MEDALLION_X = -0.075, the usual side).
- Medallion look, glow, size, limb fade, hit testing, the player's own badges, the '1ST' badge, chips and popover are untouched. src/globe/pin.js is unchanged.

## How placement is decided

- Why not "away from the answer": the label is not on the guess-to-answer line. For short routes, src/globe/reveal.js updateLineLabel() steps it off the line along the upward normal, and for nearly coincident pins it rises above them. In the reproduced scenario Ana guessed up and to the right of the answer, the same side the label steps to, so "away from the answer" would still have put her medallion under the label. Placement therefore tests the actual label box.
- Candidates: 16 tip-local spots around the halo, in order of preference: the usual side (-x) first, then the other seven compass points at the same reach, then the same eight at 1.6x the reach.
- Each frame, with the label visible: read the label's rect relative to the canvas, project every candidate to screen, and estimate the disc radius in px from the near-side projected offset (disc radius 0.06 against offset 0.075 tip units) plus a 4 px pad. Pick the first candidate whose distance from the label box is at least that radius. If none clears, take the candidate farthest from the label's centre.
- So a medallion that is already clear never moves, and one that would be covered moves to the nearest clear spot.

## Verification

- Overlap scenario: shots/friends-lane4/a3-reveal-medallion-clear-390.png (390 px, stubbed account worker, the a2 setup: reveal round 1, same friend offsets and player guess). This was captured with a scratch copy of the lane 4 harness at .build-tmp/pin-badge2/capture.mjs. It writes the a3 name and measures each visible medallion against the label rect; the banked harness is unchanged. Measured: label "292 km" box x 198 to 270, y 270 to 298. Ana's pin core is at (255, 298), on the label's bottom edge. Her medallion moved to the 1.6x reach on the +x side, centre (278, 319), radius 16 px, clear of the label by 7 px. Viewed directly, the "A" is fully visible and readable. Bea, Cal and the two off-screen pins kept the usual side (-0.075). Chips "Ana 157 km", "Bea 463 km", "Cal 846 km", "+2" match the expected values, with 5 friend pins visible and no page errors.
- Spread-out re-check: the same harness with SPREAD=1 (wider friend offsets), image at .build-tmp/pin-badge2/spread-390.png. All five medallions kept the usual side, the nearest is 118 px from the label, chips match and there were no page errors. Viewed directly, it looks the same as before this change.
- node --check src/main.js and node --check --input-type=module < src/main.js: pass.
- node --test test/*.test.mjs: 94/94 pass. account-worker npm test: 5/5 pass.
- Not covered: only the label is avoided. A medallion can still overlap another pin, the answer badge or a second friend's medallion, as it could before. The review recap hides #line-distance (enterReview runs clearReveal, which runs hideRevealSheet and then hideLineLabel), so placement there is unchanged.
