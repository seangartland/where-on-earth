# Friends on the Daily: design

Date: 2026-11-01. Status: design only. Nothing in this document has been built; no code, schema or config was changed to write it.

Source brief: `docs/FRIENDS-DESIGN-BRIEF.md`. Feature origin: `future-features.md`, "Friends on the Daily (post-accounts)".

## 0. What the code does today (the ground this stands on)

Read from the repo on 2026-11-01:

- **Worker** (`account-worker/src/index.js`): one Cloudflare Worker, better-auth 1.7.10 on a D1 binding `DB`, `bearer()` plus `emailOTP()` plugins, optional Google. Thin `/v1/*` wrappers sit over better-auth: `/v1/auth/email/send`, `/v1/auth/email/verify`, `/v1/auth/google`, `/v1/auth/signout`, `GET /v1/me`, `GET|POST /v1/sync`. Errors are `{ code: 'SCREAMING_SNAKE' }` with an HTTP status. CORS is an origin allowlist (`where-on.earth`, `www.`, `game.local`), methods `GET, POST, OPTIONS`, headers `authorization, content-type`. Routes in `sync.js` get the account with `auth.api.getSession({ headers })` and return 401 `UNAUTHORIZED` without one; `index.js` copies CORS headers onto their responses.
- **D1** (`migrations/0001_init.sql`): better-auth tables (`user`, `session`, `account`, `verification`), plus `devices`, `progress_docs`, `daily_results` (one row per account and date, `INSERT OR IGNORE`, first write wins), `pvp_links`, and the backup tables. `user.name` is `NOT NULL`; what better-auth puts there for an email-code sign-up is not verified here.
- **Client gate** (`src/core/config.js`): `ACCOUNTS_ENABLED` is true only with `?accounts=1`. `ACCOUNT_API` is hard-coded to `https://woe-account.gartland-79.workers.dev`. All account code is dynamically imported behind that flag (`src/main.js` settings row, boot sync, visibility sync). `src/account/api.js` `accountApi(path, { method, body, token })` is the one fetch helper; it throws `AccountError(code)`.
- **Account sheet** (`src/account/sheet.js`): three render states (`email`, `code`, `signed-in`). The signed-in state is a single "Progress saved" card with a Done button.
- **The Daily**: the date key is the player's **local** calendar date (`localDateKey()`), not UTC. The five ids come from `dailyGame(date)`: a pinned set in `assets/daily-pins.json` (repaired by `resolvePinnedIds`) or `dailyIds(date, locations)`. Both are deterministic, so everyone on the same date key gets the same five ids. Ids are slugs such as `aberdeen-scotland`. Scoring is client-side: `scoringDistanceKm` then `distanceScore`/`scoreGuess` (`src/game/scoring.js`). Lock-in calls `revealGuess(guess)` (`src/game/round.js`), which writes `state.daily.results[round] = { guess: {lat,lng}, distance, score, base, distanceExact, postcard }` and saves `where-on-earth-v1`. The post-game review (`src/modes/daily-game.js` `enterReview`/`openRecap`) re-drops all ten pins.
- **Note on what is already public:** the answer coordinates for every Daily location ship in `assets/locations.json` and the selection code ships in the bundle. A determined cheater can already read today's answers. The integrity rules below are not about hiding answers; they make sure the friends feature itself never becomes a hint channel, and that what friends see is the guess you were actually locked into.

## 1. Friends model

**Recommendation: mutual friendship, formed by a single-use invite link. No search, no email lookup, no usernames, no request inbox.**

- **How it works.** In the account sheet, "Invite a friend" creates an invite token and opens the share sheet (`navigator.share`, copy-link fallback) with `https://where-on.earth/?accounts=1&friend=<token>` (the `accounts=1` part is dropped at go-live). The friend opens it, signs in if needed, sees "Add **Ana** as a friend?" and taps Add. The two accounts are now friends both ways, immediately.
- **Why this one.**
  - *Mutual, not follows:* the payload is someone's guess pins. One-way follows would let anyone with a link watch a player who never agreed. Mutual means both sides consented.
  - *Link, not email or username:* email lookup turns the worker into an "is this address a player?" oracle and couples friends to the Resend go-live; usernames need a uniqueness, squatting and moderation story that this feature does not otherwise need. A link is how this game already spreads (share text, PvP challenge links).
  - *Accept on open, no pending requests:* possession of a token the inviter chose to send is the inviter's consent; tapping Add is the invitee's. That removes the request inbox, the accept/decline UI and any notification need.
- **Accept / decline:** accept is the Add tap. Decline is not tapping it; the token expires.
- **Remove:** either side removes; the friendship is deleted both ways. No notification to the other side.
- **Block:** not built. Nobody can reach you without a token you created, so after a remove, the other person cannot re-add you unless you send them a new invite. Block can be added later if a real case appears.
- **Tokens:** 128 random bits, base64url, single-use, expire after 7 days. At most 10 unexpired, unused invites per account; creating an 11th fails with `INVITE_LIMIT`. An invite cannot be accepted by its own creator (`SELF_INVITE`) or by an existing friend (returns the existing friendship, idempotent).
- **Cap:** 50 friends per account (`FRIEND_LIMIT` on accept if either side is full). It keeps the pins query bounded and the globe readable. The number is a Sean decision (section 6c).
- **Display name:** friends need a name to show. A new `profiles.display_name` (1 to 20 characters, trimmed, no control characters, not unique) is what friends see. It is never the email. Default: the first word of the Google profile name when the account has one; otherwise unset, and the sheet asks for a name before the first invite or accept. The email hint stays private.

## 2. Daily-guess storage

### Schema (new migration `0002_friends.sql`)

```sql
CREATE TABLE IF NOT EXISTS profiles (
  account_id   TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  display_name TEXT,
  share_pins   INTEGER NOT NULL DEFAULT 1,
  updated_at   INTEGER NOT NULL
);

-- Two rows per friendship, (a,b) and (b,a), written and deleted together in one batch.
CREATE TABLE IF NOT EXISTS friendships (
  account_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  friend_id  TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_invites (
  token_hash  TEXT PRIMARY KEY,           -- SHA-256 of the token; the raw token is never stored
  inviter_id  TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_by     TEXT,
  used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS friend_invites_inviter_idx ON friend_invites (inviter_id, expires_at);

CREATE TABLE IF NOT EXISTS daily_guesses (
  account_id   TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  date         TEXT NOT NULL,             -- the player's local Daily date key, YYYY-MM-DD
  slot         INTEGER NOT NULL,          -- 0..4, the round index
  location_id  TEXT NOT NULL,
  lat          REAL NOT NULL,             -- rounded to 4 dp (~11 m) before insert
  lng          REAL NOT NULL,
  distance_km  INTEGER NOT NULL,          -- as reported by the client (record only, see below)
  score        INTEGER NOT NULL,          -- as reported by the client (record only)
  device_id    TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,          -- server clock, ms
  PRIMARY KEY (account_id, date, location_id),
  UNIQUE (account_id, date, slot)
);
CREATE INDEX IF NOT EXISTS daily_guesses_lookup_idx ON daily_guesses (date, location_id, account_id);
```

`daily_results` and `/v1/sync` are untouched. `daily_guesses` is a separate table because the reveal needs to look up one location across many accounts, which the JSON `rounds` column in `daily_results` cannot index, and because its write timing (every lock-in) and its immutability rule differ from the sync document.

Distance and score are stored as a record but **never shown to friends from the server**. The viewing client recomputes distance and score from the friend's pin and the answer it already holds (`scoringDistanceKm` and `distanceScore`), so the number on screen always matches the pin on screen and no client-reported number is trusted.

### When a guess is written

At lock-in, from the client, authenticated with the bearer session, only when `ACCOUNTS_ENABLED` and `isSignedIn()`. The call happens in the Daily branch of `revealGuess` right after the existing local save (`saveDaily()`), not restoring, not any other mode. It is fire-and-forget for the game: the Daily reveal renders exactly as today whether the call succeeds, fails or is slow.

Backfill: guesses that never reached the server (offline, signed out at the time, worker down) are re-sent from `state.daily.results` for today's date on the next reveal, on review open, and after `firstSignInMerge()`. This needs no new localStorage key; the server's idempotency makes re-sends free. A player who plays logged out and signs in later the same day gets their guesses stored; their guesses were locked before any friend data existed for them, so the integrity rules hold.

### Validation on write

- `date` matches `YYYY-MM-DD` and lies in `[UTC date of (now − 36 h), UTC date of (now + 14 h)]`. The upper bound reuses the existing `tomorrowUtcLimit()` rule (UTC+14 is the furthest local date); the lower bound allows UTC−12 players finishing late plus an offline backfill margin. Outside: 400 `INVALID_DAILY_DATE`.
- `slot` is an integer 0 to 4; `locationId` matches `^[a-z0-9-]{1,80}$`; `lat` in [−90, 90], `lng` in [−180, 180], all finite; `distanceKm` and `score` finite non-negative integers within 0 to 20040 and 0 to 1000. Otherwise 400 `INVALID_GUESS`.
- The worker does **not** check that `locationId` is really in that date's five. Doing so would mean bundling `locations.json` and `daily-pins.json` into the worker and redeploying it on every pool change (quarantines land weekly), and a stale worker would reject honest guesses. It is not needed for integrity: a fabricated location id only locks the faker's own guess for an id nobody else plays, and returns nobody.

### Idempotency and conflicts

The first stored row for `(account, date, location_id)` is **immutable**. That one rule is what makes the reveal safe (section 3).

- **Replay** (same account, date, location, slot, and lat/lng equal after rounding): 200 with the stored row. No change. This is the normal retry and backfill path.
- **Conflicting replay** (same account, date, location, but different coordinates; typically the same Daily played on a second device before sync caught up): 409 `GUESS_LOCKED`, body includes the stored guess. The stored guess stays. This matches the accounts plan's "first to reach the account wins" for duplicate Dailies. The client keeps its local Daily untouched (scoring and the local result are frozen); the friends overlay for that round is drawn against the **stored** guess, labelled "Your first guess (other device)" if it differs from the local pin, because that stored guess is what friends see.
- **Slot conflict** (same account, date, slot, different location; for example a pool change mid-day) : 409 `SLOT_CONFLICT`, nothing stored. The other slots are unaffected.
- Implementation: one `INSERT ... ON CONFLICT DO NOTHING`, then `SELECT` the row by `(account_id, date, location_id)` and compare; if no row exists after the insert, the `UNIQUE (account_id, date, slot)` constraint fired, which is the slot conflict.

## 3. Reveal API contract

All routes: `/v1/...`, `Authorization: Bearer <session token>`, JSON bodies, `{ code }` errors, the existing CORS wrapper, 401 `UNAUTHORIZED` without a session. Each new route lives in a new `account-worker/src/friends.js` and is dispatched from `index.js` the same way `sync.js` is.

### Submit a guess (and get friends' pins for it in the same call)

`POST /v1/daily/guesses`

```json
{ "date": "2026-11-01", "slot": 2, "locationId": "salta-ar",
  "guess": { "lat": -24.81, "lng": -65.41 },
  "distanceKm": 37, "score": 994, "deviceId": "dev_..." }
```

200:

```json
{ "stored": { "date": "2026-11-01", "slot": 2, "locationId": "salta-ar",
              "guess": { "lat": -24.81, "lng": -65.41 }, "submittedAt": 1793541600000 },
  "friends": [
    { "friendId": "u_abc", "displayName": "Ana", "guess": { "lat": -24.1, "lng": -64.9 }, "submittedAt": 1793530000000 }
  ] }
```

409 `GUESS_LOCKED` returns the same shape with the stored (first) guess in `stored` and the friends list, because the requester does have a stored guess. 409 `SLOT_CONFLICT` returns `{ code }` only, no friends.

### Fetch friends' pins for a date

`GET /v1/daily/friends?date=2026-11-01`

200:

```json
{ "date": "2026-11-01",
  "locations": {
    "salta-ar": { "mine": { "lat": -24.81, "lng": -65.41 },
                  "friends": [ { "friendId": "u_abc", "displayName": "Ana", "guess": { "lat": -24.1, "lng": -64.9 }, "submittedAt": 1793530000000 } ] }
  } }
```

`locations` contains **only** location ids the requester has a stored guess for on that date; a location with no friend guesses appears with `friends: []`. Used by the review screen, by a restored reveal (`revealGuess(..., true)`), and to pick up friends who played after you. Date window as on write; outside it: 400 `INVALID_DAILY_DATE`. There is no per-location parameter: the requester cannot name a location to ask about.

### Friends management

| Route | Body | Response |
|---|---|---|
| `GET /v1/friends` | | `{ me: { displayName, sharePins }, friends: [{ friendId, displayName, since }], openInvites }` |
| `POST /v1/friends/profile` | `{ displayName?, sharePins? }` | `{ me }`; 400 `INVALID_NAME` |
| `POST /v1/friends/invites` | | `{ token, expiresAt }`; 409 `NAME_REQUIRED`, 429 `INVITE_LIMIT` |
| `POST /v1/friends/invites/preview` | `{ token }` | `{ inviterName }`; 404 `INVITE_INVALID` (unknown, used or expired, one code for all three) |
| `POST /v1/friends/invites/accept` | `{ token }` | `{ friend: { friendId, displayName, since } }`; 404 `INVITE_INVALID`, 400 `SELF_INVITE`, 409 `FRIEND_LIMIT`, 409 `NAME_REQUIRED` |
| `POST /v1/friends/remove` | `{ friendId }` | 204; removing a non-friend is also 204 |

Tokens travel in POST bodies, not paths or query strings, so they do not land in access logs. The client builds the share URL itself from `token`.

### The integrity rules, and how each is enforced server-side

Both pin-returning routes (`POST /v1/daily/guesses` and `GET /v1/daily/friends`) read through **one** shared SQL query, so the rules exist in one place:

```sql
SELECT mine.location_id, g.account_id AS friend_id, p.display_name, g.lat, g.lng, g.submitted_at
FROM daily_guesses mine
JOIN friendships f  ON f.account_id = mine.account_id
JOIN daily_guesses g ON g.account_id = f.friend_id
                    AND g.date = mine.date
                    AND g.location_id = mine.location_id
JOIN profiles p     ON p.account_id = g.account_id AND p.share_pins = 1
WHERE mine.account_id = ?1 AND mine.date = ?2
  [AND mine.location_id = ?3]                -- POST only: the location just stored
  [AND requester's own share_pins = 1]       -- only if Sean picks reciprocal sharing (6c)
```

1. **A friend's pin for a location only after the requester has a stored guess for that date and location.** The query is driven from the requester's own `daily_guesses` row (`mine`). No row, no join, no result. The POST route runs the query only after its own insert-or-find has produced the requester's row. The GET route takes no location parameter, so the only locations it can ever return are ones the requester has already guessed.
2. **Only friends who have themselves submitted for that location.** The inner join to `g` on the same date and location id; a friend without a row simply produces no row. No placeholder, no "has played" flag for friends who have not guessed it.
3. **Nothing usable as a pre-guess hint.**
   - Immutability: the requester's stored guess cannot be changed after pins are returned (section 2), so seeing pins can never improve the requester's own stored guess. Probing with a junk guess burns that location for the day.
   - No pre-guess surface: `GET /v1/friends` returns names and `since` only: no "played today", no counts, no last-played time, no scores. No route returns anything keyed by a date or location the requester has not guessed.
   - No aggregate leaks: no friend counts per location, no "3 friends played this" before the guess.
   - Time zones: a friend in UTC+13 may already be on tomorrow's date key. Their pins for tomorrow's locations reach you only after you have stored your own guess for tomorrow's date and that location, which you cannot do without playing it.
   - Error codes never vary by friend state: the GET route never 404s on "no friends played", it returns `friends: []`.

Honest limit: since the answers ship in the client, nothing here stops someone reading the bundle. A player can also store a junk guess from a script, read friends' pins, then play a good local game; the result is that friends see the junk pin, which only fools themselves. There is no leaderboard to corrupt.

## 4. Abuse and privacy

- **No answer-fishing:** covered by rule 3. The cheapest probe (store a guess, read pins) costs the prober their own stored guess for that location, permanently.
- **No graph scraping:** there is no search, no lookup by email, name or id, and no endpoint that takes another account's id except `remove`, which only deletes the caller's own edges and returns 204 either way. `GET /v1/friends` returns the caller's own list only. Invite tokens are 128-bit and single-use; `preview` and `accept` share a per-account limit of 30 attempts per hour (`RATE_LIMITED`), stored in a D1 counter table the same way `email_send_events` limits OTP mail, and `preview` returns one code for unknown, used and expired.
- **Friends only, no public surface:** every route needs a session; pins are returned only across a `friendships` edge; nothing is added to the static site, share text, or any page that renders without auth. No public profiles, no leaderboards.
- **Opt-out:** a "Share my Daily pins with friends" toggle in the account sheet, on by default, stored in `profiles.share_pins`. Off hides all of your stored guesses, past and future, from every friend from the next request on; your guesses are still stored so your own reveal keeps working. Whether turning it off also hides friends' pins from you (reciprocal) is a Sean decision; recommendation: reciprocal, so nobody lurks.
- **Removed friend, retroactively:** removal deletes both `friendships` rows in one batch. Since every pin read goes through the live join, the removed person immediately loses access to all of your pins, for every past date, and you to theirs. Nothing is cached server-side. On the client, friend pins live only in memory for the current reveal or review, never in localStorage, so nothing survives a reload.
- **Account deletion:** `ON DELETE CASCADE` on every new table removes profile, edges, invites and guesses with the user row. (There is no delete-account route today; that is an existing gap, not part of this feature.)
- **Retention:** recommendation: keep stored guesses (they are small and feed the player's own history later) but let the read routes reach only the date window in section 2, so old pins are not browsable. A purge schedule is a Sean decision.
- **Display names:** free text shown only to accepted friends; escaped on render with the existing `escapeHtml` pattern. No moderation needed because there is no public surface.

## 5. Client design

Everything below loads only when `ACCOUNTS_ENABLED` and the player is signed in, through dynamic imports in a new `src/account/friends.js`, exactly like the existing account modules. Logged out or without `?accounts=1`, the Daily is byte-for-byte today's Daily. No localStorage keys are added or changed: friend data and the pending invite token are held in memory only; the share setting lives on the server.

### On the Daily reveal (per round)

- **When:** after the local reveal has rendered, the lock-in POST returns friends for that location. Pins drop in after the player's own pin and answer have landed (after the flyover settles, the same hook the earn toast uses), so the player's own moment comes first.
- **Pins:** friend pins are the existing `Pin` class at about 0.7 scale, in one neutral colour that is neither the guess colour nor `ANSWER_COLOR` (`#67e8ff`): a warm off-white is the suggestion; the exact colour is a visual-review call. No pulse, no route lines (routes stay yours alone). Each friend pin carries a badge with the friend's initial, built with the `makeBadgeTexture` pattern.
- **Framing:** the camera framing stays as today (your pin and the answer). Friend pins outside the frame are not chased; the strip below says how many there are.
- **Friends strip on the reveal card:** one compact row under the score line: up to three chips sorted by distance, "Ana 312 km", then "+4". Distance is recomputed on the client with `scoringDistanceKm(friendGuess, answer)` and formatted with `formatKm`. Tapping a chip or a friend pin opens a small popover: name, distance, and the base score from `distanceScore` ("Ana · 312 km · 941"), and briefly brightens that pin. Tapping "+4" expands the full list in place.
- **"Your first guess" note:** only in the `GUESS_LOCKED` case above.
- **Empty states:**
  - No friends: no strip at all on the reveal (no nag mid-game). The results screen gets one quiet text button, "Compare pins with friends", that opens the account sheet's Friends section.
  - Has friends, none have played this location yet: a single muted line "No friends have played this one yet". The review screen refetches, so later players appear there.
  - Offline, worker error, or slow response (over 4 s): nothing is shown, no error text. The Daily never waits on the worker.

### On the review screen

On `enterReview`, one `GET /v1/daily/friends?date=` fetch. With no recap open, friend pins are hidden (ten of your own pins is already busy). Opening a round's recap drops that round's friend pins and adds the same friends strip to the recap card.

### Account sheet

The signed-in state of `sheet.js` grows a Friends section beneath the existing "Progress saved" copy:

- "Your name for friends" (inline edit; required before the first invite or accept).
- "Invite a friend" button: creates an invite and opens the share sheet; copy-link fallback with a "Link copied" status line. Small print: "Links work once and expire in 7 days."
- Friends list: name and a remove control per row (confirm in place: "Remove Ana? You'll stop seeing each other's pins."). Empty: "No friends yet. Invite someone to see their pins on the Daily reveal."
- Toggle: "Share my Daily pins with friends".
- Close buttons and controls reuse the existing shared classes (`icon-close`, `primary`, `text-button`, settings segmented/toggle styles); no new one-off button styles.

### Opening an invite link

`?friend=<token>` is read once at boot when `ACCOUNTS_ENABLED`, kept in memory, and stripped from the URL with `history.replaceState` (the `?reset=daily` pattern). Signed in: the sheet opens on an "Add Ana as a friend?" card (from `preview`) with Add and Not now. Signed out: the sheet opens on the sign-in step with the line "Sign in to accept a friend invite" (preview needs a session, so the inviter's name shows only after sign-in), and the accept card follows `completeSignIn`. For the Google redirect path, the redirect `callbackURL` must carry `?accounts=1&friend=<token>`; today it is `${origin}/`, which also drops `accounts=1`, so the dark build has to preserve the query there.

## 6. Build order

### (a) Buildable and testable dark now, behind `?accounts=1`

Lanes run in order 1, then 2 and 3 in parallel (they touch different files), then 4. Each lane commits at its milestones.

**Lane 1: worker schema and endpoints.** Writes: `account-worker/migrations/0002_friends.sql`, new `account-worker/src/friends.js`, route dispatch lines in `account-worker/src/index.js`, new `account-worker/test/friends.test.mjs`. Reads nothing from other lanes.
1. Migration exactly as in section 2, plus a `friend_attempt_events (account_id, created_at)` table for the invite rate limit.
2. `friends.js`: the routes in section 3, the one shared pins query, validation and error codes as listed, SHA-256 token hashing via `crypto.subtle`, friendship insert/delete as a `DB.batch` of both rows.
3. Tests per section 7, run with `node --test` against Miniflare (already in `node_modules` via wrangler) with the migrations applied.
Done when: `npm test` in `account-worker/` passes and `npm run bundle` succeeds.

**Lane 2: client data layer.** Writes: new `src/account/friends.js`; one call site in `src/game/round.js` (Daily branch of `revealGuess`, after `saveDaily()`); one backfill call at the end of `firstSignInMerge` in `src/account/sync.js`; one boot read of `?friend=` in `src/main.js`. Uses only `accountApi`, `readAccountSession`, `isSignedIn`. Exposes `submitDailyGuess(result, slot)`, `fetchFriendPins(date)`, `backfillToday()`, and the friends management calls. No UI.

**Lane 3: account sheet Friends section and invite flow.** Writes: `src/account/sheet.js` and the matching styles in the existing account sheet CSS. Copy exactly as in section 5. Builds against the lane 1 contract; it can stub `accountApi` responses while lane 1 is unfinished.

**Lane 4: reveal and review rendering.** Writes: `src/modes/daily-game.js` (review), the reveal card markup and styles, the friend `Pin` usage. Depends on lane 2's functions. Visual polish of colours and chip layout is a frontier visual review after the build, with a 390 px capture.

Each lane's done check includes `node --check src/main.js` and `node --check --input-type=module < src/main.js`, and that a session without `?accounts=1` makes no request to `ACCOUNT_API` (network log in the headless check).

### (b) Waits for accounts go-live

- Applying `0002_friends.sql` to the production D1 and deploying the worker (with the rest of accounts).
- Real email-code sign-in for invitees: the Resend sender, domain and secret are Sean's step; until then only sink-mode (test) and Google sign-in work.
- Dropping `accounts=1` from the invite URL and the gate.
- Real two-person, two-phone test with real accounts.

### Decisions only Sean can make

1. Friend cap: 50 recommended.
2. Opt-out reciprocity: recommended reciprocal (turn off sharing, stop seeing).
3. Default display name for email-only accounts: recommended "ask before first invite or accept" over a generated name.
4. Retention of stored guesses: recommended keep, reads limited to the recent window; or a purge period.
5. Whether a friend's pin shows their base score in the tap popover, or distance only.

## 7. Test plan

### Worker tests (`account-worker/test/friends.test.mjs`, Miniflare D1 with both migrations)

Accounts are created through the existing sink path: `POST /v1/auth/email/send`, read the code from `mail_sink`, `POST /v1/auth/email/verify`, keep the bearer token. Fixture: A, B, C. A and B are friends; C is not a friend of A.

Integrity rules:
- **Rule 1 (requester must have guessed):** B stores a guess for (D, L). A calls `GET /v1/daily/friends?date=D` with no guesses: `locations` is `{}`. A stores a guess for (D, L2): response and GET contain only `L2`, never `L`. A then stores (D, L): B's pin appears. Also: A stores (D′, L) on a different date: B's (D, L) pin does not appear.
- **Rule 2 (only friends who submitted):** with B not having played L, A's `friends` for L is `[]`. C (not a friend) stores (D, L): never in A's results. B with `share_pins = 0`: absent. After `remove`, B absent for D and for an older date already stored (retroactive loss), and A absent from B's results.
- **Rule 3 (no pre-guess hint):** `GET /v1/friends` response keys are exactly `me, friends, openInvites`, and each friend has exactly `friendId, displayName, since` (snapshot of keys, so a later field addition fails the test). Immutability: A stores (D, L) at point P1, then posts (D, L) at P2: 409 `GUESS_LOCKED`, stored is P1, and a subsequent GET still shows P1. Identical replay returns 200 with no change and the same `submittedAt`. Slot conflict: (D, slot 2, L) then (D, slot 2, L3): 409 `SLOT_CONFLICT`, no `friends` key in the body.
- Every route without a token: 401 `UNAUTHORIZED`. Dates outside the window: 400 on both routes.

Friends graph:
- Invite create, preview, accept: mutual rows exist both ways. Second accept of the same token: 404 `INVITE_INVALID`. Expired token (clock moved via an injectable `now`): 404. Self-accept: 400. Accept when already friends: idempotent 200. Eleventh open invite: 429. Fifty-first friend: 409. Thirty-first preview/accept attempt within an hour: 429. Unknown, used and expired tokens all return the same body.
- Name validation; `NAME_REQUIRED` on invite and accept without a name.
- User deletion cascades all four tables.

### Client unit tests (`test/*.test.mjs`, node)

- Distance recompute: a friend pin's displayed km equals `formatKm(scoringDistanceKm(guess, answer))`.
- `submitDailyGuess` is never called when `ACCOUNTS_ENABLED` is false, when signed out, for a restored reveal, or from any non-Daily mode.
- Backfill sends exactly today's stored results and treats 200 and 409 `GUESS_LOCKED` as done.

### End to end locally (dark path)

1. Run the worker with `wrangler dev --local` in `account-worker/` (local D1, migrations applied with `wrangler d1 migrations apply --local`, `EMAIL_SENDER=sink`).
2. Drive the game with `shots/passport/pp-shot.mjs`-style Playwright on the `https://game.local` fake origin (already in the worker's CORS allowlist), at 390 px, routing requests for `https://woe-account.gartland-79.workers.dev/*` to the local `wrangler dev` port. `ACCOUNT_API` stays unchanged.
3. Two browser contexts, A and B. Sign both in through the sink (read the code from local D1). A creates an invite; B opens `/?accounts=1&friend=<token>` and accepts.
4. B plays today's Daily. A plays round 1: assert B's pin and chip appear only after A's lock-in (no friend request before the lock-in in the network log), with the recomputed distance. A opens review: B's pins appear per recap.
5. A removes B; B reloads review: A's pins are gone.
6. Load the game without `?accounts=1` and play a round: zero requests to the account API, Daily identical to baseline screenshots.

What this harness cannot show: real email delivery, the Google redirect on a real phone, and iOS share-sheet behaviour. Those are the go-live checks in 6(b).
