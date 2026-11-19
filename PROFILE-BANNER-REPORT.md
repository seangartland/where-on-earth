# Profile banner report

## Files changed

- `src/account/sheet.js`
- `src/account/progression-view.mjs`
- `src/meta/passport.js`
- `src/modes/pack.js`
- `src/styles/game.css`
- `test/progression-view.test.mjs`
- `test/passport-summary.test.mjs`

## Profile and banner

- The own-profile Customize control is now inside `.traveler-card`, anchored at `right: 14px; bottom: -14px`. It is a gold, 28px-minimum-height pill with `5px 11px` padding and the small game font. The own card reserves a 30px bottom margin, keeping the level strip clear. Friend profiles do not render the control.
- View cabinet remains in `.traveler-actions`; Customize was removed from that action area.
- Renamed player-facing strings:
  - `Calling Cards` to `Banners` for the catalog key and customizer tab.
  - `Airmail calling card` to `Airmail banner`.
  - `New calling card: Airmail` to `New banner: Airmail`.
- Reward-label suffix `calling card` to `banner`.
- Generic `Save calling cards` output to `Save banner`.
- Home count `N / total places` to `N places visited`.
- In-progress pack status `N of 3 opened · Tap the top card` to `Tap the top card to flip its clue.`
- Internal card identifiers, loadout fields, `data-card`, and worker payloads are unchanged.

## Passport

- Both Passport pack-head variants now share Luckiest Guy at 17px, `.02em` letter spacing, no text transform.
- The home Passport count now reads `N places visited` followed by the existing earned-postcard suffix. The removed total element has no remaining references.

## Pack opening

- `--pack-w` is `min(387px, 96vw)` normally and `min(262px, 67vw)` on screens up to 700px tall, a 1.24x increase from both prior variants.
- Opening stack cards are `min(372px, 95vw)`, also 1.24x their prior dimensions. The existing opening geometry uses live rectangles, so no JavaScript sizing constant encoded the old dimensions.
- Flap and cut insets are `left: 13.5%` and `right: 12.1%`; the tear guide remains at its original inset. Added panel padding and moved the close control to the screen's safe-area top-right so it remains clear of the larger pack and cards.
- The in-progress pack instruction is always `Tap the top card to flip its clue.` `summary.played` remains because pack completion and state logic consume it elsewhere.

## Verification

- Updated `test/progression-view.test.mjs` for the renamed Banners catalog and `Airmail banner` reward label.
- Updated `test/passport-summary.test.mjs` because it pinned the removed total element; it now verifies the visited copy and absence of that element/reference.
- Profile markup has no dedicated harness coverage.
- `node --test "test/*.mjs"`: 22 passing, 0 failing.
