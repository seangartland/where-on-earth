# Brief: Friends on the Daily, lane 1 of 4: worker schema and endpoints

Work in this worktree: /home/hatch/workspace/map-game/woe-friends-build. The full design is FRIENDS-DESIGN.md in this directory (written by Opus, approved by Sean with the rulings below). Build ONLY lane 1: the worker side. Do not touch game client code (src/) beyond reading it.

## Sean's five rulings (2026-11-01, all as the design suggested)
1. Friend cap: 50 per account, enforced on accept if either side is full (FRIEND_LIMIT).
2. Sharing opt-out is symmetric: a profile setting to stop sharing your pins also stops you receiving friends' pins.
3. Display names: email-only accounts are asked for a name before their first invite (the ask itself is client work in lane 3; lane 1 provides the profile name field and its update route per the design).
4. Retention: stored guesses are KEPT (no purge); read routes are limited to the design's recent date window so old pins are not browsable.
5. Pin popover shows name, distance, and score RECOMPUTED client-side from the pin (lane 4); the server never serves a client-reported score to friends (per the design).

## Build (design sections 2, 3 and the worker parts of 4)
- D1 migration per the design: profiles (display name, sharing opt-out flag), friendships (two rows per pair, written/deleted together in one batch), friend_invites (128-bit tokens, SHA-256 hashed at rest, single-use, 7-day expiry), daily_guesses keyed (account_id, local date, location_id) with slot, guess lat/lng, client-reported distance/score as record-only, submitted-at.
- Routes in account-worker (new friends module, following the existing /v1 conventions and auth): create invite, preview invite, accept invite, list friends (names + since only), remove friend, submit daily guess (authenticated; first write wins: identical replay is a no-op success, conflicting write returns 409 GUESS_LOCKED; validation per the design: slot 0-4, locationId pattern, coordinate ranges, finite bounded distance/score), fetch friends' pins for a round and for a date (the design's two read shapes) via ONE shared pins query anchored on the requester's own stored guess, honoring the opt-out both ways and the retention read window.
- Rate limits per the design (preview/accept 30/hour per account via a D1 counter, one error code for unknown/used/expired tokens).
- Integrity rules are hard requirements, enforced server-side exactly as the design states: pins returned only for (date, location) the requester has a stored guess for; only accepted friends (live join, so removal is retroactive instantly); nothing date/location-keyed is returned to a requester who has not guessed it; no played-today/counts/last-played fields anywhere.

## Verification
- Tests for every integrity rule above plus the lock/replay/conflict behavior, the cap, the opt-out symmetry, the invite lifecycle (single-use, expiry, unified error), and removal retroactivity, using the worker's existing test setup if one exists or a local D1/miniflare harness you set up in the worktree; state what you used.
- Existing worker behavior unbroken; the game's existing test suite (node --test test/*.test.mjs) is untouched by this lane but run it once to confirm no accidental damage.
- Write FRIENDS-LANE1-REPORT.md: what was built (routes + payloads as built if they differ from the design at all), test list with results, and anything lane 2 needs to know.
- Zero em dashes in all written output. Do not deploy anything.
