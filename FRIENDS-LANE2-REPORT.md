# Friends on the Daily: lane 2 report

Date: 2026-11-01

## Built

Added `src/account/friends.js` as the authenticated client data layer. It exports:

- `submitDailyGuess(result, slot)`
- `fetchFriendPins(date)`
- `backfillToday()`
- `listFriends()`
- `updateProfile(profile)`
- `createInvite()`
- `previewInvite(token)`
- `acceptInvite(token)`
- `removeFriend(friendId)`
- `cachedFriendPins(date)` for the lane 4 renderer

All calls are gated by `ACCOUNTS_ENABLED` and a current signed-in session. They use `accountApi`, `readAccountSession`, and `isSignedIn`. No friend data is persisted. Successful Daily responses and authoritative `GUESS_LOCKED` responses are held in a module-level memory cache. Friend entries are passed through with only the server fields. No server score or distance is consumed for a friend.

Extended `AccountError` with its parsed response body in `data`. This preserves the existing thrown-error contract while allowing `submitDailyGuess` to consume the `stored` and `friends` fields on `GUESS_LOCKED`.

## Call sites

- `src/game/round.js`: immediately after `saveDaily()` in the new, non-restoring Daily result branch, a signed-in accounts build dynamically imports the data layer and fires `submitDailyGuess(result, slot)` without delaying the reveal. Restored reveals and other modes do not enter this branch.
- `src/account/sync.js`: `firstSignInMerge()` dynamically imports and awaits `backfillToday()` after the merged session and progress have been saved.
- `src/main.js`: at boot, accounts builds read `?friend=<token>` into the exported in-memory `pendingFriendInviteToken`, delete only that parameter, and replace the current URL while preserving other query parameters and the hash.

No account sheet, account CSS, worker, or Daily review file was changed. No localStorage key was added.

## Lane 4 handoff

The POST path publishes each completed response in two ways:

- `cachedFriendPins(date)` returns the current in-memory shape `{ date, locations }`. Each location contains `mine` and `friends`.
- A `daily-friend-pins` window event fires after a successful or `GUESS_LOCKED` submission. Its detail contains `date`, `locationId`, `mine`, `friends`, and `stored`.

Lane 4 can listen for that event to add reveal pins after its visual timing hook. It should recompute every friend's distance and score from `detail.friends[].guess` and the answer. `detail.stored.guess` is authoritative for the optional other-device note. Review can call `fetchFriendPins(date)`, which replaces the same date cache with the full GET response.

The review-open backfill was not added because its only cheap hook is in `src/modes/daily-game.js`, which belongs to lane 4. Lane 4 should call `backfillToday()` when review opens, alongside `fetchFriendPins(date)`.

## Verification

Added `test/friends-data.test.mjs` covering:

- backfill sends exactly today's stored results
- successful and `GUESS_LOCKED` submissions are both completed and cached
- signed-out submission makes no request
- accounts-disabled submission makes no request
- the round integration is gated to a new Daily reveal, after the local save

Results:

- `node --check src/main.js`: pass
- `node --check --input-type=module < src/main.js`: pass
- `node --test test/*.test.mjs`: pass, 15 test files
- `git diff --check`: pass

No deployment, commit, or worker change was performed.
