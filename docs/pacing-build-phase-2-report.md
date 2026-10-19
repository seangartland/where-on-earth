# Pacing build, phase 2 report: Practice earning + home restructure

Built by Muse Wonder in-session, 2026-10-18. Spec: docs/pacing-and-monetization.md.

## Practice earning

- `src/game/round.js`: the reveal's `recordVisit` call now passes canEarn false whenever a Survival run is active (the same flag Endless and PvP already used). Survival rounds record the visit, the score, and the run's own bests, and nothing else in the Passport moves.
- `src/meta/passport-store.js`: a visit that cannot earn no longer improves the stored best distance. It had to change: readPassport's migration rebuilds tiers from the best distance, so a practice guess at 0 km would otherwise have earned the postcard on the next load. With both changes, practice cannot earn directly or through the rebuild. Endless and PvP share the tightened path; their stated rule (visits only) is unchanged.
- Nothing already earned is touched: prior tiers, distances, and both legacy Survival best keys are preserved.

## Home

- `index.html`: the mode grid is now Daily, Daily postcard pack, Expeditions, Practice, Challenge, in that order. The More modes button and hub are deleted. The old Survival hub is now the Practice hub: Survival (merged pool), Tap the Country, Country Blackout, and Trivia rows, under the copy "Play freely. Practice records visits and bests, but postcards are earned in the Daily, the pack and Expeditions."
- `src/meta/passport.js`: Option A. The Passport summary card is the Passport button (role button, keyboard operable, chevron affordance). The Stats/Passport home links row is gone. The Stats button now lives in the Passport screen's header, and the Stats screen element is re-appended at the end of the body so it paints above the Passport when opened from it; closing Stats returns to the still-open Passport.
- `src/modes/landmarks.js`: the More modes hub code and the Landmarks row wiring are removed; the file is the Landmark pool only. `src/modes/survival.js` updates the Practice hub's four best lines, Trivia included. `src/game/round.js` drops the deleted elements from its registry and hideScreens.

## Verification (headless, 390 px, this tree; script shots/practice-home-check.mjs)

- Home at 390x844 and 390x664: exactly the five mode buttons in order, summary card visible with role button, no links row, no Stats on home, zero element overlaps, content ends at y688 of 844 and y590 of 664.
- Card tap opens the Passport; the Stats button is inside its header; Stats opens above it; closing Stats returns to the Passport.
- Practice hub shows the four rows and the practice copy.
- Earning proof: a perfect (0 km) Survival guess on Thessaloniki recorded the visit with meta {b: 1000, t, f} and no earn field and no stored best distance, so no postcard was earned and none can be rebuilt later.
- Full node suite: all five test files pass (36 tests), syntax checks clean on every edited file.
- Screenshots reviewed: shots/pacing-home.png (card with chevron, five buttons) and shots/pacing-practice-hub.png (hub copy and rows).
