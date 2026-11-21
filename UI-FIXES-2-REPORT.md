# UI Fixes 2 Report

## Item E: home Passport level progression and seal

- Enlarged the home progression seal from 30px to 60px and increased the home progression row from 38px to 76px (including the row's top border and vertical padding).
- The home seal remains rendered from the authenticated account profile response (`/v1/progression`), specifically `profile.loadout.avatar`, the same saved-loadout source used by the traveler profile.
- A successful Customize save emits `progression-loadout-change`; the home card re-reads `/v1/progression` and renders the updated saved loadout, avoiding a stale default seal. Signed-out and unavailable-profile behavior remains unchanged.
- Files touched: `src/meta/passport.js`, `src/account/progression-view.mjs`, `src/account/sheet.js`, `src/styles/game.css`, `test/ui-fixes-ef.test.mjs`.

## Item F: traveler-profile XP explanation

- Added one quiet secondary-text line immediately under the own-profile XP total: “Earn XP in the Daily. The closer your guesses, the more you earn.”
- Files touched: `src/account/sheet.js`, `src/styles/game.css`, `test/ui-fixes-ef.test.mjs`.

## Verification

- Before: `node --test "test/*.mjs"` passed 29 tests, failed 0.
- After: `node --test "test/*.mjs"` passed 30 tests, failed 0.
- DOM-level verification was performed without Chromium with a mocked signed-in `forest`/`star`/`SG` profile. The home renderer preserved the saved initials and forest disc at 60px; the focused test also validates the saved-loadout path, refresh event, and the single approved profile line.
