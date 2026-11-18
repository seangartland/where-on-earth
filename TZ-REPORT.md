# Daily local-midnight report

## Files changed

- `src/core/format.js`: documents the local Daily rule and adds the DST-safe `localYesterday()` calendar helper.
- `src/modes/daily-game.js`: uses local dates for Daily selection, streaks, played state, stale-page reloads, and countdown tracking.
- `src/account/sync.js`: requests local today and local yesterday from sync.
- `src/account/friends.js`: backfills only the local-current Daily.
- `test/daily-selection.test.mjs`: covers the local Daily key and New York spring-forward and fall-back local-yesterday dates.
- `account-worker/test/friends.test.mjs`: verifies the worker accepts local dates at the UTC+14 and UTC-12 extremes.

## Worker validDate verification

No worker production change was needed. The existing window from UTC `now - 36h` through UTC `now + 14h` accepts every real local date tested:

- UTC+14 at `2026-03-08T10:30:00.000Z` accepted local date `2026-03-09`.
- UTC+14 at `2026-11-17T12:30:00.000Z` accepted local date `2026-11-18`.
- UTC-12 at `2026-03-08T00:30:00.000Z` accepted local date `2026-03-07`.
- UTC-12 at `2026-11-17T01:30:00.000Z` accepted local date `2026-11-16`.

## Sync audit

`GET /v1/sync` uses the client-supplied `today` and `yesterday` strings directly in its date query, so local-date params retrieve the intended rows. The POST limit permits through UTC tomorrow, which includes the current local date for UTC+14 clients; it has no lower bound that would reject a UTC-12 local date. No sync-worker change was required.

## Remaining UTC references

- `src/daily.js:65,67,69,71`: UTC arithmetic converts an already selected date string to a stable rotation index, avoiding a UTC+12 through UTC+14 parsing shift. It does not choose the player's Daily date.
- `src/core/format.js:27`: `utcDateKey` remains as a general formatter for future non-Daily callers; it has no client call sites.
- `src/modes/weekly.js:12,20,24,25`: weekly schedule epoch and keys are for Weekly, which is out of scope.
- `src/account/merge.js:81`: UTC arithmetic normalizes stored date-string history ordering; it does not choose a Daily date.
- `account-worker/src/daily.js:278,280`: worker mirror of the stable date-string rotation-index calculation.
- `account-worker/src/friends.js:43,51-53`: UTC conversion validates that submitted strings are real calendar dates and applies the verified 36-hour-back to 14-hour-forward acceptance window.
- `account-worker/src/sync.js:27,100`: the UTC-tomorrow ceiling admits the UTC+14 local current date, while sync reads honor the client dates directly.
- `account-worker/test/daily-trust.test.mjs:18,20`: test fixture labels its generated fixed date strings as UTC.
- `account-worker/test/friends.test.mjs:297,301-304`: the new extreme-zone test names UTC offsets to document the cases it verifies.

## Tests run

- Root: `node --test --test-reporter=tap test/*.test.mjs` completed with 19 of 19 test files passing. The suite contains 110 top-level test declarations, including the new DST case.
- Worker: `npm test` completed with 3 of 4 test files passing. The one known pre-existing failure is `account-worker/test/friends.test.mjs` expecting `og-v3.png` while the invite page returns `og-v4.jpg`. The worker suite contains 20 top-level test declarations. The focused friends run showed 9 of 10 assertions passing, including all four new extreme-zone checks.

## Transition note

On the switch day, a player may receive a fresh local-date Daily after completing the former UTC-date game. Existing archive keys stay unchanged, and from the switch forward each key means the player's local date.
