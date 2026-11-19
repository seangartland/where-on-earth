# Profile Tap Report

Files changed: `src/meta/passport.js`, `src/main.js`, `src/account/sheet.js`, `src/styles/game.css`, and this report.

The Passport module uses its existing host-callback boundary. `main.js` dynamically imports the Account sheet, opens it with the XP row as the return-focus trigger, then opens the exported existing `openTravelerProfile` view. This avoids a direct Passport to Account-sheet dependency and preserves the Account sheet's Profile button route.

New home-card order: count line, stamps strip, XP profile row, then the `Passport ›` cue.

The XP profile row is only unhidden under the existing signed-in progression condition. It supports click, Enter, and Space, stops propagation so the card still opens Passport elsewhere, and adds a wrapper-level chevron and footer-row styling.

No existing test covers home-card markup or behavior, so no test was added or changed. `node --test "test/*.mjs"` passed: 22 test files, 22 passing, 0 failing.
