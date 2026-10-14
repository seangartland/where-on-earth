# Async PvP MVP technical specification

Status: build-ready specification for the approved asynchronous, unrated, direct-challenge MVP.

This specification replaces conflicting proposals in `pvp-mode-plan-sol.md` with the decisions recorded on 2026-10-13: five unweighted rounds, 20 seconds per round, seven-day expiry, progressive per-round comparison, no photo-finish rule, visits without postcards, a free cap of three open challenges, and no notifications beyond share links and in-app status. The current authoritative catalog contains 805 playable city entries.

## 1. Terms and invariants

- `playerId` is a public, opaque identifier for one browser identity.
- `playerToken` is the corresponding secret bearer credential. It is never placed in URLs, logs, pair keys, or response bodies after issuance.
- `matchId` is the Cloudflare Durable Object ID for one match. It has at least 128 bits of entropy and is safe to expose in authenticated API paths.
- `inviteToken` is a separate random 256-bit secret in the share URL. It can claim only the empty invitee seat.
- `joinCode` is a case-insensitive six-character convenience code. It is not an authorization secret by itself and is rate-limited.
- Challenger means the player who creates the match. Invitee means the player who claims its second seat.
- A resolved round is either a valid submitted guess or a server-created timeout with zero points.
- All timestamps are Unix milliseconds in UTC. Server time is authoritative.
- A match always uses five distinct location IDs, the same order for both players, one unweighted integer score from 0 through 1,000 per round, and a total from 0 through 5,000.
- The Worker recomputes distance and score from the submitted coordinates and the pinned answer. It never accepts a client-computed distance, score, start time, deadline, or total.
- API JSON uses camelCase. Unknown request fields are rejected with `400 INVALID_REQUEST` so client and server version drift is visible.

## 2. Match and player state machines

### 2.1 Match states

| State | Meaning | Entry | Exit |
|---|---|---|---|
| `OPEN` | The challenger exists and the invitee seat is empty. | Successful match creation. | First valid join changes it to `ACTIVE`; either participant action can advance play; challenger abandonment changes it to `ABANDONED`; expiry changes it to `EXPIRED`. |
| `ACTIVE` | Both seats are claimed and at least one player may be playing or waiting. | Successful invite claim. | When both players have five resolved rounds it changes atomically to `COMPLETED`; either player can abandon it; expiry changes it to `EXPIRED`. |
| `COMPLETED` | Both players have five resolved rounds, totals and winner are final, and the pair record write has been requested. | Automatic finalization in the transaction that resolves the last required round. | Terminal. Match storage is purged after the retention window. |
| `ABANDONED` | A participant explicitly ended an unfinished match. There is no winner and no W/L update. | Authenticated abandonment. | Terminal. Match storage is purged after the retention window. |
| `EXPIRED` | The match did not complete by `expiresAt`. There is no winner and no W/L update. | Alarm or any later request materializes expiry. | Terminal. Match storage is purged after the retention window. |

`OPEN` does not mean the challenger must wait. The challenger may play all five rounds before an invitee joins. Once the invitee seat is claimed, it cannot be changed.

SPEC CHOICE: explicit abandonment cancels the whole friendly match rather than awarding a forfeit. Reason: the approved MVP is unrated and the plan defines no forfeit policy.

### 2.2 Per-player progress states

Each participant has one of these progress states inside an `OPEN` or `ACTIVE` match:

- `NOT_STARTED`: round 1 has not been started.
- `PLAYING`: at least one round has started or resolved, and fewer than five are resolved.
- `FINISHED`: all five rounds are resolved, including timeouts.

Rounds are strictly sequential per player. Round `n + 1` cannot start until round `n` is resolved. Leaving between rounds has no penalty. Leaving during a started round does not pause its deadline.

### 2.3 Round states

For each participant, each round is one of:

- `LOCKED`: an earlier round that has been validly submitted or timed out.
- `READY`: the participant's next round, not yet started.
- `STARTED`: the server has issued `startedAt`, `deadlineAt`, and `acceptUntil`.
- `UNAVAILABLE`: a later round that cannot start yet.

Transitions are:

1. `READY` to `STARTED` only through `POST /matches/:matchId/rounds/:round/start` by that participant.
2. `STARTED` to `LOCKED` through the first valid submission received by `acceptUntil`.
3. `STARTED` to `LOCKED` as a timeout when server time is later than `acceptUntil`. The timeout stores no guess, `distanceKm: null`, `score: 0`, and `outcome: "TIMEOUT"`.
4. Resolving round 5 changes that participant to `FINISHED`. Resolving the second participant's round 5 also completes the match in the same Durable Object transaction.

Starting and submission endpoints are idempotent as described below. A client refresh can resume a started round but cannot obtain a new deadline.

### 2.4 Expiry and abandonment

`expiresAt` is exactly seven days after successful match creation and never extends on join, play, refresh, or rematch. At `expiresAt`:

- no new join, round start, submission, or abandonment mutation is accepted;
- any unresolved rounds stay unresolved rather than being filled with zeros;
- the match becomes `EXPIRED`, has no winner, and does not update pair W/L records;
- reads return the terminal state until purge;
- the match no longer counts against the challenger's open-challenge cap.

An authenticated challenger may abandon an `OPEN` match. Either authenticated participant may abandon an `ACTIVE` match. Abandonment is rejected after completion or expiry and is idempotent for the participant who already caused it. It immediately invalidates the invitation and stops all play. It does not alter pair records.

## 3. Authentication, identity, and authorization

### 3.1 Identity issuance

The client creates an identity once and stores the returned `playerId` and `playerToken` in `localStorage`. `PlayerRecords` stores a player row with the public ID, a keyed hash of the token, creation time, and last display name. The raw token is returned once and never stored. The token is a cryptographically random 256-bit value encoded as base64url.

`POST /v1/players`

Request:

```json
{
  "displayName": "Sean"
}
```

Response `201`:

```json
{
  "playerId": "plr_01J...",
  "playerToken": "secret-base64url-token",
  "displayName": "Sean",
  "createdAt": 1791849600000
}
```

Display names are trimmed Unicode strings from 1 through 24 grapheme clusters. Control characters, bidi overrides, markup, and leading or trailing whitespace are rejected. Names are labels, not unique handles. A match snapshots each participant's display name when their seat is created or claimed. Changing the local name affects later matches only.

All authenticated endpoints require `Authorization: Bearer <playerToken>`. A valid token authorizes actions only as that player. MatchRoom stores the participant's `playerId` and token hash, then checks both before returning private state or accepting mutations.

There is no password, email, account, token refresh, cross-device sync, or recovery flow. Clearing site data, using another browser, losing the device, or overwriting the token permanently loses access to that identity's unfinished matches and pair records. Copying local storage manually also copies the identity. The UI must describe this as device-bound history, not an account.

### 3.2 Pair identity

Pair records use `pairKey = HMAC(serverPairKey, min(playerIdA, playerIdB) + ":" + max(playerIdA, playerIdB))`. Stable public player IDs provide ordering; secret player tokens never appear in the key. The record stores each side by `playerId`, so wins can be rendered from either perspective.

Self-challenges are forbidden by comparing the authenticated joiner's `playerId` with the challenger `playerId`.

## 4. HTTP API contract

### 4.1 Common behavior

The public base is `https://woe-pvp.gartland-79.workers.dev/v1`. All responses are JSON and include `Cache-Control: no-store`. CORS allows only configured production and preview origins. Mutations require `Content-Type: application/json`. Request bodies are capped at 8 KB.

Errors use this shape:

```json
{
  "error": {
    "code": "ROUND_LATE",
    "message": "The round deadline has passed.",
    "details": {
      "round": 3,
      "outcome": "TIMEOUT"
    }
  }
}
```

Common status codes are `400` malformed input, `401` missing or invalid player token, `403` valid identity without authority for the resource, `404` unknown resource, `409` state conflict, `410` expired or purged invitation, `422` semantically invalid coordinates, `429` rate or open-cap limit, and `503` service disabled or temporarily unavailable.

### 4.2 Health

`GET /health`

Unauthenticated. Response `200`:

```json
{
  "ok": true,
  "service": "woe-pvp",
  "apiVersion": 1
}
```

### 4.3 Create a match

`POST /v1/matches`

Authenticated. The Worker checks the player's open count, selects and pins the set, creates the MatchRoom, and adds the match to the player's open-match index atomically enough to prevent concurrent creates from exceeding the cap. The body supplies the current display label and client version, not rules.

Request:

```json
{
  "displayName": "Sean",
  "clientVersion": "2026.10.13"
}
```

Response `201`:

```json
{
  "matchId": "128-bit-or-stronger-object-id",
  "status": "OPEN",
  "role": "CHALLENGER",
  "joinCode": "7K2MQR",
  "shareUrl": "https://where-on-earth.example/pvp/join#invite=opaque-invite-token",
  "rules": {
    "version": 1,
    "rounds": 5,
    "roundSeconds": 20,
    "graceMilliseconds": 2000,
    "maximumScore": 5000
  },
  "catalogVersion": "sha256:...",
  "createdAt": 1791849600000,
  "expiresAt": 1792454400000
}
```

The fragment form keeps `inviteToken` out of normal server, CDN, and referrer logs. The client reads the fragment and sends it in the join body.

If the player already has three open challenges, response `429 OPEN_CHALLENGE_CAP` is:

```json
{
  "error": {
    "code": "OPEN_CHALLENGE_CAP",
    "message": "You already have 3 open challenges.",
    "details": {
      "limit": 3,
      "openCount": 3
    }
  }
}
```

### 4.4 Inspect an invitation

`POST /v1/invitations/inspect`

Unauthenticated but rate-limited. It accepts exactly one of `inviteToken` or `joinCode`. It reveals only enough to present the acceptance screen.

Request:

```json
{
  "inviteToken": "opaque-invite-token"
}
```

or:

```json
{
  "joinCode": "7K2MQR"
}
```

Response `200`:

```json
{
  "matchId": "...",
  "challenger": {
    "displayName": "Sean",
    "displaySuffix": "7K2"
  },
  "expiresAt": 1792454400000,
  "rules": {
    "rounds": 5,
    "roundSeconds": 20,
    "maximumScore": 5000
  }
}
```

Unknown codes return the same `404 INVITATION_NOT_FOUND` response as revoked or never-issued codes. Expired known invitations return `410 INVITATION_EXPIRED`. Rate limiting is by coarse network signal and code or token hash. No player ID, results, locations, or progress is disclosed.

### 4.5 Join a match

`POST /v1/matches/:matchId/join`

Authenticated. The request must contain the invitation credential used to discover the match. A short code alone is accepted only when it resolves to this exact `matchId`.

Request:

```json
{
  "inviteToken": "opaque-invite-token",
  "displayName": "Alex",
  "clientVersion": "2026.10.13"
}
```

The short-code form replaces `inviteToken` with `"joinCode": "7K2MQR"`. Supplying both returns `400 INVALID_REQUEST`.

Response `200`:

```json
{
  "matchId": "...",
  "status": "ACTIVE",
  "role": "INVITEE",
  "joinedAt": 1791853200000,
  "expiresAt": 1792454400000
}
```

A retried join by the already-bound invitee returns the same `200`. Another identity receives `409 SEAT_TAKEN`. The challenger receives `409 SELF_CHALLENGE`. Expired matches return `410 MATCH_EXPIRED`; abandoned matches return `410 MATCH_ABANDONED`; malformed credentials return `404 INVITATION_NOT_FOUND`. The successful claim invalidates the invite token and removes the short code mapping.

### 4.6 Read participant-specific match state

`GET /v1/matches/:matchId`

Authenticated and allowed only for a participant. Before reading, MatchRoom materializes any passed round timeout and match expiry. The representation is viewer-specific and never leaks a location before that viewer starts its round or an opponent result before the reveal condition is met.

Response `200` while playing:

```json
{
  "matchId": "...",
  "status": "ACTIVE",
  "role": "INVITEE",
  "createdAt": 1791849600000,
  "expiresAt": 1792454400000,
  "catalogVersion": "sha256:...",
  "rulesVersion": 1,
  "players": [
    {
      "role": "CHALLENGER",
      "playerId": "plr_01J...",
      "displayName": "Sean",
      "displaySuffix": "7K2",
      "progress": "FINISHED",
      "resolvedRounds": 5,
      "visibleTotal": null
    },
    {
      "role": "INVITEE",
      "playerId": "plr_01K...",
      "displayName": "Alex",
      "displaySuffix": "P9D",
      "progress": "PLAYING",
      "resolvedRounds": 2,
      "visibleTotal": 1784
    }
  ],
  "viewer": {
    "nextRound": 3,
    "progress": "PLAYING",
    "total": 1784
  },
  "rounds": [
    {
      "round": 1,
      "viewerResult": {
        "outcome": "SUBMITTED",
        "guess": { "lat": 48.85, "lng": 2.35 },
        "distanceKm": 8,
        "score": 998,
        "submittedAt": 1791853300000
      },
      "opponentResult": {
        "outcome": "SUBMITTED",
        "guess": { "lat": 49.1, "lng": 2.7 },
        "distanceKm": 34,
        "score": 993,
        "submittedAt": 1791850100000
      }
    },
    {
      "round": 3,
      "state": "READY"
    }
  ],
  "result": null
}
```

For unresolved or hidden data, the field is omitted rather than filled with a misleading zero. Each resolved viewer round also includes the same `answer` object returned by submission so refresh can restore the reveal and apply the local Passport visit. `visibleTotal` for the opponent stays `null` until match completion because a total across all opponent progress could disclose rounds the viewer has not locked. On completion, `result` contains both totals, `winnerRole` with `CHALLENGER`, `INVITEE`, or `TIE`, the integer margin, and all five comparison rows. Each comparison row contains the answer plus both results, including a zero and `TIMEOUT` outcome where applicable.

### 4.7 Start a round

`POST /v1/matches/:matchId/rounds/:round/start`

Authenticated participant only. `round` is 1 through 5 and must be the participant's next round. No request body is required beyond `{}`. MatchRoom first resolves an expired previous round, if any, then validates sequence and atomically stores the start.

Response `200`:

```json
{
  "round": 3,
  "location": {
    "id": "paris-france",
    "short": "Paris",
    "clue": "Paris, France",
    "image": "https://thumb.wikimedia.org/..."
  },
  "startedAt": 1791854000000,
  "deadlineAt": 1791854020000,
  "acceptUntil": 1791854022000,
  "serverNow": 1791854000000
}
```

The answer coordinates, country, fact, difficulty, other round IDs, and opponent result are not returned here. Repeating start for the same `STARTED` round returns the original timestamps and location with `200`. Starting a resolved round returns `409 ROUND_ALREADY_RESOLVED`. Starting out of sequence returns `409 ROUND_SEQUENCE`. A terminal match returns `409 MATCH_TERMINAL`, except an expired match returns `410 MATCH_EXPIRED`.

### 4.8 Submit a round

`PUT /v1/matches/:matchId/rounds/:round/submission`

Authenticated participant only.

Request:

```json
{
  "submissionId": "client-generated-uuid",
  "guess": {
    "lat": 48.85,
    "lng": 2.35
  }
}
```

Latitude must be finite and within -90 through 90. Longitude must be finite and within -180 through 180. MatchRoom calculates the great-circle distance with Earth radius 6371.0088 km and calculates `round(1000 * exp(-((km / 3500) ^ 1.13)))`. The distance used for scoring is not rounded first.

Response `200`:

```json
{
  "round": 3,
  "outcome": "SUBMITTED",
  "answer": {
    "id": "paris-france",
    "short": "Paris",
    "clue": "Paris, France",
    "country": "France",
    "fact": "...",
    "image": "https://thumb.wikimedia.org/...",
    "lat": 48.8566,
    "lng": 2.3522
  },
  "viewerResult": {
    "guess": { "lat": 48.85, "lng": 2.35 },
    "distanceKm": 1,
    "score": 1000,
    "submittedAt": 1791854011000
  },
  "opponentResult": {
    "outcome": "SUBMITTED",
    "guess": { "lat": 49.1, "lng": 2.7 },
    "distanceKm": 34,
    "score": 993,
    "submittedAt": 1791850100000
  },
  "matchStatus": "ACTIVE",
  "nextRound": 4
}
```

`opponentResult` is omitted when the opponent's same round is unresolved. The first accepted submission locks the round. Repeating the same `submissionId` returns the stored response with `200`. Any later submission ID for that round returns `409 ROUND_ALREADY_RESOLVED` and does not reveal more data than a normal state read.

If the request arrives after `acceptUntil`, MatchRoom first stores the timeout and returns `409 ROUND_LATE` with the stored zero result. A later state read returns that timeout. Invalid coordinates return `422 INVALID_COORDINATES` without consuming the round if received on time.

The last required round submission or timeout atomically sets `COMPLETED`, calculates totals and winner, and returns the full completed `result`. There is no separate client-authoritative completion call.

SPEC CHOICE: completion is automatic rather than a `POST /complete` endpoint. Reason: it prevents a match from remaining unfinished after both players have five server-resolved rounds.

### 4.9 Abandon a match

`POST /v1/matches/:matchId/abandon`

Authenticated participant only. Request:

```json
{
  "reason": "PLAYER_LEFT"
}
```

`reason` is currently fixed to `PLAYER_LEFT` and is stored only for service diagnosis. Response `200` includes `status: "ABANDONED"` and `abandonedAt`. Completed matches return `409 MATCH_COMPLETED`; expired matches return `410 MATCH_EXPIRED`.

### 4.10 Create a rematch

`POST /v1/matches/:matchId/rematches`

Authenticated participant only, and allowed only after the source match is `COMPLETED`. It creates a new `OPEN` match owned by the caller, with a new invitation and new five-location set. The normal three-open-challenge cap applies. Request:

```json
{
  "displayName": "Sean",
  "clientVersion": "2026.10.13"
}
```

Response `201` has the same shape as match creation and adds:

```json
{
  "rematchOf": "completed-match-id",
  "series": {
    "seriesId": "original-match-id",
    "completedGames": 1,
    "players": [
      { "playerId": "plr_01J...", "wins": 1 },
      { "playerId": "plr_01K...", "wins": 0 }
    ],
    "ties": 0,
    "label": "Rematch"
  }
}
```

Only one open rematch may descend directly from a completed match. The first successful request is canonical; retries by either participant return that same rematch with `200`. If the canonical rematch has already been claimed, a later request returns `409 REMATCH_EXISTS` with its `matchId` but no invitation secret to a player who did not create it. After a 1-1 split in two completed non-tied games, the next canonical rematch is labeled `Decider`. Series framing ends after the third completed game. New matches exclude the source match's five location IDs where every difficulty band still has another eligible candidate.

Source matches that are unfinished, expired, or abandoned return `409 MATCH_NOT_COMPLETED`. The creating player's open-cap failure returns `429 OPEN_CHALLENGE_CAP`. A rematch is otherwise an ordinary match with a new seven-day expiry and the same rules and catalog snapshot current at its creation.

### 4.11 Read a pair record

`GET /v1/records/:opponentPlayerId`

Authenticated. The caller may read only the pair record containing their own `playerId` and the path opponent. Response `200`:

```json
{
  "opponent": {
    "playerId": "plr_...",
    "displayNameLastSeen": "Alex",
    "displaySuffix": "P9D"
  },
  "record": {
    "played": 7,
    "wins": 4,
    "losses": 2,
    "ties": 1,
    "pointsFor": 28740,
    "pointsAgainst": 27610,
    "lastPlayedAt": 1791855000000,
    "lastMatchId": "..."
  }
}
```

Counts are returned from the caller's perspective. No existing record returns `200` with `record: null`. Asking for the caller's own ID returns `400 SELF_RECORD`.

## 5. Progressive reveal and async asymmetry

The reveal condition is symmetric and round-local:

> A participant may see the opponent's result for round N only after both participants have resolved round N.

Once eligible, the visible opponent result includes outcome, submitted guess coordinates when present, server-computed distance, score, and submission time. This allows the existing reveal map to show both pins. It never reveals an unresolved opponent round or a later resolved opponent round that the viewer has not yet locked.

In the normal async order, the challenger finishes first. When the invitee submits round N, that response immediately includes the challenger's round N result. The challenger already locked round N earlier, so the corresponding rule is that their next authenticated state read immediately includes the invitee's round N result. If the invitee happens to play first for a round, the same rule reverses naturally: the challenger sees the invitee result in the challenger's submission response, and the invitee sees the comparison on the next state read.

SPEC CHOICE: use the same both-locked condition for both roles instead of special role-based behavior. Reason: it resolves async timing without giving either role information before committing its own guess.

The opponent's partial total is hidden. After completion, both totals, the winner, margin, and all five comparison rows are visible. There is no photo-finish label or threshold behavior.

## 6. Server-side round timing

The client clock is display-only. The server follows this sequence:

1. A successful start request commits `startedAt = serverNow`, `deadlineAt = startedAt + 20,000`, and `acceptUntil = deadlineAt + 2,000` in MatchRoom storage before responding.
2. The client displays time remaining from `deadlineAt - serverNow`, advances it with a monotonic clock, and corrects it on every API response. Device wall-clock time is never submitted or trusted.
3. MatchRoom accepts a valid submission if the request is received and handled at or before `acceptUntil`. The two-second fixed grace covers transport and Worker scheduling. It is not extended per retry and is not based on a client timestamp.
4. At visible zero, the client disables new guesses and waits for the authoritative response or state read. A request that reaches the server during grace can still be accepted. This small discrepancy favors a guess already in flight.
5. After `acceptUntil`, the next alarm or request atomically writes the timeout result with score zero. A late guess can never replace it.

MatchRoom keeps one Durable Object alarm scheduled for the earliest of the current participants' `acceptUntil` values, `expiresAt`, or retention purge time. On alarm, it materializes all due timeouts, completes the match if that produces both finished participants, then schedules the next due event. Every mutation and state read performs the same due-event check before other work, so alarm delay cannot extend a deadline.

Backgrounding, closing, refreshing, losing connectivity, and clock skew do not pause a started round. Unstarted later rounds remain available until match expiry.

## 7. Location snapshot and set selection

### 7.1 Worker catalog supply

The Worker build consumes a generated, versioned snapshot derived from the same `demo/assets/locations.json` deployed with the main site. The snapshot contains only fields needed by PvP: `id`, `short`, `clue`, `fact`, `lat`, `lng`, `difficulty`, `category`, `image`, and `country`.

The deployment pipeline must:

1. validate unique IDs, finite coordinates, difficulty 1 through 10, nonempty image, and category `city` eligibility using the same production exclusions as `isPlayableLocation` and `isLaunchExcluded`;
2. emit canonical JSON and compute its SHA-256 digest as `catalogVersion`;
3. upload or bind that immutable snapshot with the Worker deployment;
4. run a smoke check that each paired difficulty band is nonempty before promoting the Worker.

The checked-in catalog currently has 805 eligible entries. This count is observed from the file, not hard-coded into runtime rules. Current paired-band counts are 141, 184, 208, 176, and 96 respectively.

SPEC CHOICE: bundle the compact snapshot with each Worker deploy rather than fetch the live site at match creation. Reason: deployment creates a reviewable version boundary and removes a runtime dependency on Vercel availability or cache state.

### 7.2 Match set generation

At creation, the Worker draws exactly one eligible location from each band: 1-2, 3-4, 5-6, 7-8, and 9-10. It uses cryptographically secure randomness, then shuffles the five selected locations so play does not always rise in difficulty.

Selection rules, in order:

1. No location ID repeats within a match.
2. Prefer five distinct countries by drawing without replacement from countries already unused.
3. If a band has no candidate in an unused country, draw any remaining location in that band. Record `countryFallback: true` for diagnostics.
4. Do not personalize from Passport data.

The MatchRoom stores `catalogVersion`, `rulesVersion`, and a private copy of the five full snapshot records at creation. Storing the records, rather than only IDs, guarantees that removal, coordinate correction, clue change, or image change in a later deploy cannot alter an existing match. Only the current round's public prompt fields are returned at start. The answer fields are returned after that participant's round resolves.

Rematch avoidance and best-of-three lineage remain compatible fields but are not required by this core match protocol unless the client exposes the already-approved rematch flow. If present, selection should exclude the immediately preceding linked match's five IDs when each band still has a candidate.

## 8. PlayerRecords and completion consistency

### 8.1 Record schema

The singleton `PlayerRecords` Durable Object stores one row per canonical pair:

```text
pair_key TEXT PRIMARY KEY
player_a_id TEXT NOT NULL
player_b_id TEXT NOT NULL
player_a_name TEXT NOT NULL
player_b_name TEXT NOT NULL
played INTEGER NOT NULL
a_wins INTEGER NOT NULL
b_wins INTEGER NOT NULL
ties INTEGER NOT NULL
a_points INTEGER NOT NULL
b_points INTEGER NOT NULL
last_played_at INTEGER NOT NULL
last_match_id TEXT NOT NULL
updated_at INTEGER NOT NULL
```

It also stores a completion ledger keyed by `matchId`. Applying a completion and updating the pair row occur in one PlayerRecords transaction. Replaying the same completion is a no-op. A different payload for an existing `matchId` is rejected and alerted.

MatchRoom stores `recordsWriteState` as `PENDING`, `APPLIED`, or `RETRY`. On completion it calls PlayerRecords with match ID, both IDs and names, totals, winner, and completion time. If the call fails, the match remains `COMPLETED`, marks `RETRY`, schedules an alarm with bounded exponential backoff, and retries until acknowledged. The result response may include `recordUpdatePending: true`; gameplay results do not wait on the aggregate write.

The read route derives the canonical pair key from the caller and opponent IDs, fetches the row, then reverses A/B counts when needed. Match state is the source of truth for the individual completed game. PlayerRecords is the source of truth for the running pair aggregate.

### 8.2 Scaling and exit path

The singleton is the approved MVP shape. Migrate to one records Durable Object per player when any of these measured triggers occurs:

- completion writes or record reads sustain contention that materially increases p95 latency;
- the singleton approaches documented per-object throughput or storage limits;
- operational metrics show retries building faster than they clear;
- product scope needs efficient per-player opponent lists or server-side match history, which a pair-key-only singleton cannot provide cheaply.

The sharded form writes a mirrored, idempotent pair row to each player's object and keeps the completion ledger for reconciliation. Do not migrate based only on projected growth.

For an off-Workers exit, provide an authenticated administrative export that pages canonical pair rows plus the completion ledger as newline-delimited JSON or SQLite export files into controlled object storage. Freeze or dual-write completion updates during cutover, import into the replacement database, compare row counts and aggregate checksums, then move reads and finally writes. Public clients never receive this export capability. Stable `playerId`, canonical pair ordering, and `matchId` idempotency keys must be retained so records can move without reinterpretation.

## 9. Open-challenge cap and subscriptions

The free cap is three open challenges per creator. For cap purposes, an open challenge is any match that player created in `OPEN` or `ACTIVE` state and that is neither `COMPLETED`, `ABANDONED`, nor `EXPIRED`. It counts even if the creator has finished and is waiting for the invitee. Matches a player accepts do not count against creation capacity, and accepted matches are unlimited.

PlayerRecords, or a separate player index in that Durable Object, maintains each creator's set of open match IDs. Before counting, it removes entries whose MatchRoom terminal state or expiry is confirmed. Creation reserves a slot before creating the room and releases it if initialization fails. Completion, abandonment, and expiry send an idempotent release. This closes concurrent-create races without scanning all MatchRooms.

The MVP enforces three for every identity. It does not trust a premium flag in local storage and does not implement the planned subscriber cap of 20. When a general account and billing system supplies a server-verifiable entitlement, the cap check may choose the entitled limit. Subscriptions, billing, entitlement issuance, and cross-device cap evasion are outside this specification.

## 10. Passport behavior

Passport is client-local. The PvP service stores no Passport visits, best accuracy, postcards, tiers, or collection state.

After the server accepts or materializes a PvP round result, the client may call the existing visit-recording path with the pinned location ID, server score, and server distance to:

- mark the location visited;
- update the local best score and best distance if improved;
- update local visit recency and first-visit metadata.

The client must pass the equivalent of `canEarn = false`. It must not award or upgrade a postcard, set an earned tier or earned timestamp, show a postcard earn or upgrade animation, include the round in Daily history or streaks, or treat a win as a Passport reward. Replaying a state response must be idempotent with respect to best values and must not create repeated reward UI.

## 11. Retention, cleanup, and storage estimate

MatchRoom sets an alarm at creation and reschedules it as described in the timer section.

- At seven days after creation, an unfinished match becomes `EXPIRED` and its invitation mappings and open-cap entry are removed.
- `COMPLETED` MatchRooms retain full match data for 30 days after completion so result links and retrying PlayerRecords writes work.
- `EXPIRED` and `ABANDONED` MatchRooms retain only terminal metadata, participant IDs, display labels, token hashes, and timestamps for seven days after the terminal transition. The hashes are needed to authenticate terminal reads. Guesses, location records, round timing, and invitation secrets are deleted at the terminal transition.
- At the retention deadline, the alarm deletes all MatchRoom storage. Later reads return `404 MATCH_NOT_FOUND`. An invitation lookup returns `410` only while a terminal mapping or tombstone remains, then the generic `404`.
- Invite-token and short-code indexes are deleted on successful join, abandonment, or expiry.
- Pair records and their completion ledger persist independently and are not deleted when a MatchRoom is purged.

SPEC CHOICE: incomplete expired matches do not retain detailed round history. Reason: no final result depends on it and prompt deletion minimizes unnecessary location and guess retention.

Storage sizes are engineering estimates, not measurements of the final implementation. Compact JSON plus five copied location records, two participant records, ten result slots, indexes, and SQLite overhead should be budgeted at roughly 10-20 KB per active or completed match. At 100,000 simultaneously retained full matches this is roughly 1-2 GB before platform accounting overhead, below the scaffold README's documented 5 GB free storage allowance but large enough to require alerts. Terminal incomplete matches should be below 2 KB after compaction. Pair records are roughly 0.5-1 KB per unique pair plus completion-ledger rows. Validate these estimates with SQLite storage metrics during beta and alert at 50, 70, and 85 percent of the applicable quota.

## 12. Existing client integration points

Do not redesign the UI. Add integration at these existing boundaries:

- Add the PvP entry to the existing home mode area alongside Daily and other mode entry controls. Challenge creation, join-code entry, and invitation acceptance are new screens, but use the shared home navigation and confirmation controls.
- Add a separate `versus` state object. It owns match ID, role, participant identity, server state, catalog version, current round, server timing offset, round results, and pending request IDs. Do not place PvP data in the persisted Daily object.
- Reuse the existing round screen, photo and clue presentation, globe tap input, pending-guess marker, great-circle route, answer-pin reveal, distance display, base `distanceScore` visual scale, and five-round result breakdown.
- Server values are authoritative. Local `distanceKm` and `distanceScore` may animate the reveal immediately only after an accepted response and must match the server result. The displayed PvP score is the unweighted base score, never `scoreGuess` with Daily `WEIGHTS`.
- Adapt `showRound()` through a narrow mode branch that reads the server-issued current location and shows `Round N of 5` with no multiplier. Starting the visual round occurs only after the start endpoint returns.
- Adapt the reveal entry so PvP uses the accepted server answer and result, then overlays the opponent result when present. The globe and reveal animation remain unchanged.
- Bypass the existing Daily persistence, streak, history, postcard summary, and `showResults()` mutations. Use a PvP result presenter backed by the completed server state.
- Record the local Passport visit once per accepted or timed-out round with postcard earning disabled. A timeout may record no visit because there is no guess result to apply.
- Persist `playerId`, `playerToken`, display name, recent opponent public IDs, and active match IDs in local storage. Persist no invitation secret after a seat is successfully claimed unless the creator still needs the share URL.
- On page load or refresh, read the match state first. If a round is `STARTED`, restore it against the original server deadline. If it timed out while the page was gone, reveal the server-created zero and continue.

The live production behavior shows the photo before the guess. PvP uses that behavior unchanged.

## 13. Abuse, privacy, and edge cases

- Replayed submissions: `submissionId` makes an exact retry idempotent. A different submission after lock receives `409`; no guess can be changed.
- Double joins: MatchRoom serialization makes the first valid distinct invitee claim win. Same-player retries succeed idempotently. Others receive `SEAT_TAKEN`.
- Self-challenges: an identity cannot claim its own invite. The service returns `SELF_CHALLENGE` without consuming the invitation.
- Link guessing: the primary invitation has 256 bits of random entropy and the match ID has at least 128 bits. Both are generated with a cryptographic RNG. Responses do not confirm private match data without the invitation credential.
- Short-code guessing: six characters are convenience, not strong secrecy. Inspect and join are rate-limited per coarse network signal and credential hash, with progressive cooldown. Codes reveal only the acceptance preview and disappear after claim.
- Clock skew: device wall time is ignored. The client uses server timestamps plus a monotonic elapsed clock for display. The server decides acceptance by receipt time.
- Concurrent starts: MatchRoom serialization stores one start and returns the same deadline to retries.
- Start followed by disconnect: the server timeout still occurs. Later rounds remain playable until expiry.
- Malformed or impossible coordinates: rejected before the round is consumed. `NaN`, infinity, strings, excess nesting, and out-of-range values are invalid.
- Duplicate display names: UI shows the stable three-character suffix derived from `playerId` when names collide. Names grant no authority.
- Cleared local storage: the service does not recover credentials or disclose private state. The player may still open an unclaimed invitation as a new identity, but cannot recover a former participant seat.
- Public answer data and external lookup: the game is not cheat-proof. Server authority prevents protocol edits, not searching clues, inspecting the public catalog, using another device, or modifying the client. No rating or anti-cheat claim is made.
- Service outage: single-player modes remain available. Challenge creation may be hidden by a kill switch, and existing PvP screens show a retryable service error without manufacturing local results.
- Pair-write failure: completion remains final and visible. The idempotent records update retries separately.
- Match expiry racing a request: the Durable Object checks `expiresAt` before processing the mutation. Expiry wins when server time is at or beyond `expiresAt`.

Basic rate limits apply to identity creation, match creation, invitation inspection, joins, starts, submissions, and state polling. Limits should be tuned from beta measurements and must return `429` with `Retry-After`. Do not store raw IP addresses as player history.

## 14. Explicitly out of scope

- Live duels, WebSockets, presence, ready checks, synchronized starts, and reconnect-forfeit policy
- Ratings, Elo, ranked queues, public matchmaking, ladders, and photo-finish behavior
- Email, push, SMS, or other notifications
- Server enforcement of subscriptions or the future subscriber cap
- Accounts, cross-device recovery, password or email identity, friends, blocks, and moderation appeals
- Groups, multi-attempt challenges, free-for-alls, teams, tag-team, spectators, and chat
- Tap the Country PvP
- Passport postcard awards, PvP reward currencies, and paid competitive advantages
- A claim that browser play is cheat-proof

## 15. Build verification criteria

Before release, automated and manual tests must prove:

1. all state transitions, terminal-state rejection, seven-day expiry, abandonment, and purge alarms;
2. 20-second server deadlines, two-second fixed grace, timeout zeros, refresh during a round, slow requests, and clock skew;
3. first-write-wins submissions, idempotent retries, join races, self-join rejection, and short-code rate limits;
4. one location from each paired difficulty band, five distinct IDs, country fallback behavior, catalog pinning, and unchanged old matches after a snapshot deploy;
5. no opponent round result before both players lock that round, immediate invitee comparison against an earlier challenger result, and later challenger visibility on state read;
6. server recomputation matches the production great-circle and base scoring functions across fixed vectors and boundary coordinates;
7. automatic completion, ties, winner totals, idempotent PlayerRecords writes, retry after records failure, and caller-relative record reads;
8. exactly three created open matches allowed, concurrent fourth creation rejected, accepted invitations excluded from the cap, and terminal matches releasing capacity;
9. PvP writes visits and best accuracy locally but never earns or upgrades a postcard, changes Daily history, or changes a streak;
10. token loss is unrecoverable, nonparticipants cannot read match state, invitation secrets do not enter URL query strings or logs, and CORS rejects unknown origins;
11. completed match storage purges after 30 days, incomplete terminal details are removed, and pair records survive every MatchRoom purge;
12. single-player modes remain functional when the PvP service is unavailable.
