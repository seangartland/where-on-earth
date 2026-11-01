# Brief: Friends on the Daily, lane 4 of 4: reveal and review rendering

Work in this worktree: /home/hatch/workspace/map-game/woe-friends-lane4. The full design is FRIENDS-DESIGN.md in this directory (approved by Sean); build ONLY lane 4, design section 5 (Daily reveal and review screen) as scoped by section 6a lane 4. Lanes 1 to 3 are DONE and banked on main, and this worktree is branched from main after all three:

- Lane 1 (worker schema and endpoints): 9abe08a. Migration banked as account-worker/migrations/0003_friends.sql.
- Lane 2 (client data layer): bfa406b. Report: FRIENDS-LANE2-REPORT.md in this directory.
- Lane 3 (account sheet Friends section and invite flow): d65263a. Report: FRIENDS-LANE3-REPORT.md.

Do not touch the worker, src/account/friends.js (lane 2's API surface is fixed; consume it), or src/account/sheet.js. The results screen "Compare pins with friends" button opens the account sheet through its existing openAccountSheet entry; that is the only sheet contact in this lane.

## Sean's five rulings (2026-11-01, all as the design suggested)
1. Friend cap: 50 per account, enforced server-side on accept (FRIEND_LIMIT).
2. Sharing opt-out is symmetric: turning off sharing your pins also stops you receiving friends' pins (server-side; the toggle UI was lane 3).
3. Display names: email-only accounts are asked for a name before their first invite or accept (lane 3).
4. Retention: stored guesses are KEPT (no purge); read routes are limited to the design's recent date window.
5. Pin popover shows name, distance, and score RECOMPUTED client-side from the pin. The server never serves a client-reported score to friends. Every distance and score you render for a friend is recomputed on the client from that friend's guess coordinates and the answer, with scoringDistanceKm and distanceScore from src/game/scoring.js, formatted with formatKm. Never render a server-supplied distance or score for a friend; the payloads do not carry one.

## Lane 2 handoff (from FRIENDS-LANE2-REPORT.md, banked code)
- src/account/friends.js exports: submitDailyGuess(result, slot), fetchFriendPins(date), backfillToday(), listFriends(), updateProfile(profile), createInvite(), previewInvite(token), acceptInvite(token), removeFriend(friendId), cachedFriendPins(date). All calls are gated by ACCOUNTS_ENABLED and a signed-in session inside the module. No friend data is persisted; everything is a module-level memory cache.
- The reveal POST path publishes each completed response two ways:
  - cachedFriendPins(date) returns the current in-memory shape { date, locations }. Each location contains mine and friends.
  - A daily-friend-pins window event fires after a successful or GUESS_LOCKED submission. Its detail contains date, locationId, mine, friends, and stored.
- Listen for that event to add reveal pins after the visual timing hook (below). Recompute every friend's distance and score from detail.friends[].guess and the answer. detail.stored.guess is authoritative for the other-device note.
- Review can call fetchFriendPins(date), which replaces the same date cache with the full GET response.
- Lane 2 could not add the review-open backfill: its only cheap hook is in src/modes/daily-game.js, which is this lane's file. Call backfillToday() when review opens, alongside fetchFriendPins(date).
- The pending invite token is banked and wired: src/main.js holds pendingFriendInviteToken and exposes window.getPendingFriendToken and window.clearPendingFriendToken; lane 3's sheet already consumes them. Nothing for this lane there.

## Current code ground (read in this worktree before writing)
- ACCOUNTS_ENABLED in src/core/config.js is now accounts !== '0' (accounts were promoted to enabled for everyone after the design was written; ?accounts=1 still enables, ?accounts=0 opts out). The design's dark-build language means: everything in this lane loads only when ACCOUNTS_ENABLED and signed in, through dynamic imports like the existing account modules, and a session with accounts disabled makes no request to ACCOUNT_API and plays a Daily identical to today.
- The reveal lives in src/game/round.js (revealGuess). The earn toast hook: showEarnToast is called through whenPostcardDone in revealGuess after the flyover settles (src/globe/reveal.js). Friend pins drop at that same moment, never before the player's own pin and answer have landed.
- Lane 2's call site already fires submitDailyGuess right after saveDaily() in the new, non-restoring Daily branch of revealGuess. Restored reveals do not resubmit; review rendering relies on fetchFriendPins and the cache, not on the POST.
- Review lives in src/modes/daily-game.js: enterReview and openRecap, with the recap card markup already in that file and the Pin usage pattern at its results globe (Pin with makeBadgeTexture badges, ANSWER_COLOR for answers). src/globe/pin.js holds the Pin class and makeBadgeTexture (kinds guess and answer today; the friend badge follows the same pattern with the friend's initial).
- Reveal card markup and its styles: follow the existing reveal card structure in the game markup and src/styles/game.css conventions. Shared UI stays shared: reuse existing classes and tokens, no one-off button styles.

## Build (design section 5, reveal and review only)
Reveal, per round:
- Friend pins: the existing Pin class at about 0.7 scale, one neutral colour that is neither the guess colour nor ANSWER_COLOR (#67e8ff); the design suggests a warm off-white, exact colour is a visual-review call after this build, so pick the suggested warm off-white and note it in the report. No pulse, no route lines. Each friend pin carries a badge with the friend's initial, built with the makeBadgeTexture pattern.
- Timing: pins drop in after the player's own pin and answer have landed, after the flyover settles, through the same whenPostcardDone hook the earn toast uses, driven by the daily-friend-pins event (or the cache if the response landed earlier). If the response is slow, pins arrive when it lands, without blocking or delaying anything.
- Framing stays as today (your pin and the answer). Friend pins outside the frame are not chased; the strip says how many there are.
- Friends strip on the reveal card: one compact row under the score line. Up to three chips sorted by distance, "Ana 312 km", then "+4" when there are more. Distance recomputed client-side (ruling 5). Tapping a chip or a friend pin opens a small popover: name, distance, and base score from distanceScore, formatted "Ana · 312 km · 941", and briefly brightens that pin. Tapping "+4" expands the full list in place.
- "Your first guess" note: only in the GUESS_LOCKED case, when detail.stored.guess differs from the local pin: the friends overlay for that round is drawn against the stored guess and labelled "Your first guess (other device)" (design section 2, conflicting replay). The local Daily, its scoring, and the local result stay untouched.
- Empty states, exactly:
  - No friends: no strip at all on the reveal. The results screen gets one quiet text button, "Compare pins with friends", that opens the account sheet's Friends section.
  - Has friends, none have played this location yet: one muted line, "No friends have played this one yet".
  - Offline, worker error, or slow response (over 4 s): nothing is shown, no error text. The Daily never waits on the worker.

Review screen:
- On enterReview: call backfillToday() and one fetchFriendPins(date) for the review date (through lane 2's module, dynamically imported, accounts and signed-in gating lives inside it).
- With no recap open, friend pins are hidden. Opening a round's recap drops that round's friend pins and adds the same friends strip to the recap card (same chips, popover, recompute rules). Closing the recap removes that round's friend pins again.

## Verification
- Add client unit tests per design section 7 in the existing node --test style, at minimum: a friend pin's displayed km equals formatKm(scoringDistanceKm(guess, answer)), chips sort by recomputed distance, and the popover score equals distanceScore of the recomputed distance. Rendering code that cannot be unit tested headlessly should be factored so the recompute and sort logic is testable in isolation.
- Run: node --check src/main.js AND node --check --input-type=module < src/main.js; node --test test/*.test.mjs (all passing, including your new tests).
- Capture at 390px with the existing shots harness pattern: the reveal with friend pins and strip, and a review recap with friend pins, against stubbed account responses (no live worker). If a capture cannot run in your sandbox, say exactly why in the report and what remains unverified, and name the harness's blind spots.
- Confirm a session with ?accounts=0 makes no ACCOUNT_API request and the Daily is unchanged (network log in the headless check, per section 6a's done check).
- Write FRIENDS-LANE4-REPORT.md: what was built (exact files and hooks), the pin colour chosen, test list with results, capture results, and anything the end-to-end verification or Sean's visual review needs to know.
- Zero em dashes in all written output. Do not deploy anything. Do not commit (the orchestrator banks the worktree).
