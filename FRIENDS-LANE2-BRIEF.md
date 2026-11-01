# Brief: Friends on the Daily, lane 2 of 4: client data layer

Work in this worktree: /home/hatch/workspace/map-game/woe-friends-lane2. The full design is FRIENDS-DESIGN.md in this directory (approved by Sean). Lane 1 (worker schema and endpoints) is DONE and banked on main at 9abe08a; its report is FRIENDS-LANE1-REPORT.md in this directory. Build ONLY lane 2: the client data layer. No UI rendering (that is lane 4), no account sheet changes (that is lane 3, running in parallel in a different worktree; do not touch src/account/sheet.js or its CSS).

## Sean's five rulings (2026-11-01, all as the design suggested)
1. Friend cap: 50 per account, enforced server-side on accept (FRIEND_LIMIT).
2. Sharing opt-out is symmetric: turning off sharing your pins also stops you receiving friends' pins (enforced server-side; the toggle UI is lane 3).
3. Display names: email-only accounts are asked for a name before their first invite or accept (the ask is lane 3; lane 1 provides the profile routes).
4. Retention: stored guesses are KEPT (no purge); read routes are limited to the design's recent date window.
5. Pin popover shows name, distance, and score RECOMPUTED client-side from the pin (lane 4); the server never serves a client-reported score to friends. Your data layer must follow this: friend payloads carry only friendId, displayName, guess lat/lng, submittedAt; never trust or forward a server score for a friend.

## Banking note from lane 1
Lane 1's migration was banked as account-worker/migrations/0003_friends.sql (0002 is the Google auth exchange migration that landed on main after lane 1 branched). The worker routes are live in code on main: GET /v1/friends, POST /v1/friends/profile, POST /v1/friends/invites, POST /v1/friends/invites/preview, POST /v1/friends/invites/accept, POST /v1/friends/remove, POST /v1/daily/guesses, GET /v1/daily/friends?date=YYYY-MM-DD. Do not change worker code in this lane.

## Lane 1 handoff (from FRIENDS-LANE1-REPORT.md)
- Send deviceId on every guess using the existing dev_ identifier format.
- Treat 200 as stored or identical replay, 409 GUESS_LOCKED as a completed submission whose stored and friends data are authoritative, and 409 SLOT_CONFLICT as having no friend data.
- Friend-visible server payloads intentionally omit distance and score. Recompute both from each returned pin (lane 4 does the display; your layer just passes pins through).
- The POST response supplies only the just-submitted location. The GET response supplies every location the requester has stored for the requested date.
- An empty friends array is the normal response for no matching friend guesses, removal, or either side opting out.

## Build (design sections 2, 3, 5 and 6a lane 2)
- New src/account/friends.js, loaded only when ACCOUNTS_ENABLED and signed in, through dynamic imports exactly like the existing account modules. Uses only accountApi, readAccountSession, isSignedIn (read src/account/api.js and src/account/session.js in this worktree for the exact current signatures; ACCOUNT_API is now https://api.where-on.earth per config).
- Expose: submitDailyGuess(result, slot), fetchFriendPins(date), backfillToday(), and the friends management calls (listFriends, updateProfile, createInvite, previewInvite, acceptInvite, removeFriend) wrapping the lane 1 routes.
- Call sites, and only these:
  1. src/game/round.js: in the Daily branch of revealGuess, right after the existing local save (saveDaily()), fire-and-forget submitDailyGuess for the just-locked result. Never for a restoring reveal, never for any non-Daily mode. The Daily reveal renders exactly as today whether the call succeeds, fails, or is slow; no awaiting that blocks rendering, no error text.
  2. src/account/sync.js: one backfill call at the end of firstSignInMerge, re-sending today's stored results from state.daily.results (server idempotency makes re-sends free).
  3. src/main.js: one boot read of ?friend=<token> when ACCOUNTS_ENABLED, kept in memory only, stripped from the URL with history.replaceState (the ?reset=daily pattern). Expose the pending token for lane 3 to consume; do not build the accept UI.
- No new localStorage keys. Friend data and the pending invite token live in memory only.
- Also call backfillToday() on review open if there is an existing cheap hook for it without touching lane 4's files (src/modes/daily-game.js is lane 4; if the only hook is there, note it in your report instead of editing that file).

## Verification
- Client unit tests per design section 7: submitDailyGuess is never called when ACCOUNTS_ENABLED is false, when signed out, for a restored reveal, or from any non-Daily mode; backfill sends exactly today's stored results and treats 200 and 409 GUESS_LOCKED as done. Add tests under test/ in the existing node --test style.
- Run: node --check src/main.js AND node --check --input-type=module < src/main.js; node --test test/*.test.mjs (all passing, including your new tests).
- Write FRIENDS-LANE2-REPORT.md: what was built (exact exports and call sites), test list with results, and anything lane 4 needs to know (especially how the reveal call site hands friend pins to a future renderer: where the POST response is stored or what callback or event lane 4 should hook).
- Zero em dashes in all written output. Do not deploy anything. Do not commit (your sandbox .git is read-only; the orchestrator banks the worktree).
