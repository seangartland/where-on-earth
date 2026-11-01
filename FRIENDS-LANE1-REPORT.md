# Friends on the Daily: lane 1 report

Date: 2026-11-01

## Built

Added `account-worker/migrations/0002_friends.sql` with:

- `profiles` for the friend display name and reciprocal pin-sharing setting
- `friendships` with two directed rows per mutual friendship
- `friend_invites` with only SHA-256 token hashes at rest, use metadata, and seven-day expiry
- `daily_guesses` with immutable per-account, date, and location guesses plus the unique date and slot constraint
- `friend_attempt_events` for the shared preview and accept limit of 30 attempts per account per hour

Added `account-worker/src/friends.js` and dispatched it through the existing authenticated and CORS-wrapped `/v1` path in `account-worker/src/index.js`.

Routes and payloads match `FRIENDS-DESIGN.md`:

- `GET /v1/friends`
- `POST /v1/friends/profile`
- `POST /v1/friends/invites`
- `POST /v1/friends/invites/preview`
- `POST /v1/friends/invites/accept`
- `POST /v1/friends/remove`
- `POST /v1/daily/guesses`
- `GET /v1/daily/friends?date=YYYY-MM-DD`

There are no contract differences from the design. `GUESS_LOCKED` includes `code`, `stored`, and `friends`. Successful submissions include `stored` and `friends`. The date read returns only the requester's stored locations, each with `mine` and `friends`.

The implementation also provides these required properties:

- Tokens contain 128 random bits, use base64url in transit, and are SHA-256 hashed before storage.
- Invite creation, attempt limiting, token consumption, friendship creation, and friend-cap checks use guarded D1 writes. Friendship creation and removal batch both directed rows.
- Email-only accounts start without a display name. A Google-backed account lazily defaults to the first word of its Google profile name when valid.
- Names are trimmed, contain 1 to 20 Unicode characters, and reject control characters.
- Guess coordinates are rounded to four decimal places before the immutable insert.
- Identical guess replays return the original row unchanged. Coordinate or slot changes for the same location return `GUESS_LOCKED`. Reusing a slot for another location returns `SLOT_CONFLICT` without pins.
- Both pin read shapes use the same shared SQL query. It is anchored on the requester's stored guesses, joins the live friendship graph, requires the friend's matching stored guess, and applies reciprocal sharing to both sides.
- Stored distance and score are never selected by a friend-facing query.
- Old guesses are retained. Reads and writes are limited to the approved recent date window.
- `GET /v1/friends` exposes exactly `me`, `friends`, and `openInvites`; friend rows expose exactly `friendId`, `displayName`, and `since`.

## Verification

Added `account-worker/test/friends.test.mjs`. It applies both migrations to an in-memory SQLite database through a small D1-compatible `prepare`, `bind`, `first`, `all`, `run`, and `batch` harness. Node's built-in SQLite engine executes the same SQL constraints and foreign-key cascades. Miniflare was attempted, but this managed sandbox prevents its local runtime from listening on `127.0.0.1` with `EPERM`, so it could not be used here.

The worker tests cover:

- authentication on every new route
- name validation and `NAME_REQUIRED`
- 128-bit token shape and hashed-at-rest storage
- create, preview, accept, single use, expiry, self-accept, and the unified invalid-token response
- mutual edge creation, idempotent existing-friend accept, two-way removal, and the 50-friend cap
- the 10-open-invite cap and shared 30-per-hour preview and accept limit
- guess validation and date-window validation on both read and write routes
- coordinate rounding, identical replay, immutable conflict, and slot conflict
- no pins before the requester guesses the matching date and location
- no pins from non-friends, friends without a matching guess, or either side of an opt-out
- exact safe keys in the friends list response
- retroactive pin loss in both directions after removal, including an older retained date
- cascading deletion of profiles, invites, guesses, and friendship edges

Results:

- `cd account-worker && npm test`: pass
- `cd account-worker && WRANGLER_LOG_PATH=/tmp/woe-wrangler.log npm run bundle`: pass, Wrangler dry-run completed
- `node --test test/*.test.mjs`: pass, 14 root game test files
- `git diff --check`: pass
- No deployment was performed.

## Lane 2 handoff

- Send `deviceId` on every guess using the existing `dev_` identifier format.
- Treat `200` as stored or identical replay, `409 GUESS_LOCKED` as a completed submission whose `stored` and `friends` data are authoritative, and `409 SLOT_CONFLICT` as having no friend data.
- Friend-visible server payloads intentionally omit distance and score. Recompute both from each returned pin.
- The POST response supplies only the just-submitted location. The GET response supplies every location the requester has stored for the requested date.
- An empty `friends` array is the normal response for no matching friend guesses, removal, or either side opting out.
- No client files under `src/` were changed in this lane.
