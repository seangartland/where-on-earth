# Where on Earth PvP group challenge specification

Status: implementation plan and technical specification for an asynchronous multi-player challenge on the existing PvP Worker. The existing one-to-one H2H mode and its API remain unchanged.

## 1. Product summary and decisions

A creator makes one group challenge and receives one reusable share link and one reusable six-character code. The creator and every accepted participant play the same pinned set of five locations in the same order. Each participant gets one attempt, each round has the existing server-authoritative 20-second clock plus 2-second submission grace, and the server scores every guess. Finishers are ranked by total score out of 5,000.

The mode is asynchronous. Players do not need to be online together. A participant may leave between rounds and resume before the challenge expires. The creator can play immediately, before anyone joins.

SPEC CHOICE: use `Open Challenge` in product copy until Sean selects the final name.

DECIDED (Sean, 2026-10-14): the name is **Open Challenge**. The remaining SPEC CHOICE defaults in this document stand as written.

SPEC CHOICE: allow at most 50 distinct participants per challenge, including the creator. The limit is enforced atomically by the challenge Durable Object.

SPEC CHOICE: accept new participants until the fixed seven-day expiry or until the creator closes entries early. Closing entries does not stop accepted participants from finishing before expiry.

SPEC CHOICE: show participant totals and progress live. Rank only finishers. Show partial players in a separate unranked `In progress` section with their current total and resolved-round count.

SPEC CHOICE: reveal another player's result for round N only after the viewer has resolved round N. This keeps the H2H progressive rule while allowing live leaderboard totals.

SPEC CHOICE: creating a group challenge consumes one of the creator's three open-challenge slots. Joining a group challenge never consumes a slot. Closing entries, expiry, or settlement releases the creator's slot.

SPEC CHOICE: do not create pair records, group records, wins, losses, Elo, or persistent global leaderboard entries for group challenges in the MVP.

## 2. Architecture and data model

### 2.1 Use a new `GroupChallengeRoom` Durable Object

Add one SQLite-backed `GroupChallengeRoom` Durable Object per group challenge on the same Worker. Reuse the H2H code's authentication, input validation, scoring, location selection, catalog snapshot, rate limiting, invitation index, open-cap reservation, CORS, and error envelope where their behavior is identical.

Do not extend `MatchRoom`. The live `MatchRoom` assumes exactly two player roles, consumes the invitation after the first join, stores one opponent, completes when both players finish, calculates one winner and margin, supports pair rematches, and writes a pair record. Group behavior would put branches through every important transition and risk changing H2H. A separate object preserves H2H behavior and gives group joins, entry closure, leaderboard reads, and N-player cleanup their own state machine.

`PlayerRecords` remains the global identity and index object. Extend its open-challenge reservation rows with a resource type, or use a common reservation table keyed by resource ID, so H2H and group creations share the same limit of three. Its invitation mapping must also store `kind: "GROUP"` so inspect routes to the correct object. It does not store group results.

### 2.2 Challenge state

The object stores:

```text
challengeId
rulesVersion
catalogVersion
createdAt
expiresAt
entriesClosedAt: null | timestamp
entriesClosedBy: null | creator playerId
status: OPEN | CLOSED | SETTLED | EXPIRED
creatorPlayerId
participantCap: 50
inviteHash
joinCode
locations[5]
countryFallback
participants[]
purgeAt
```

`OPEN` accepts joins and play. `CLOSED` rejects new identities but lets existing participants play. `SETTLED` means entries are closed and every accepted participant has resolved all five rounds. `EXPIRED` means the fixed expiry passed. `SETTLED` and `EXPIRED` are terminal. A full challenge stays `OPEN` for existing play but rejects new joins with `409 CHALLENGE_FULL`; the creator may still close it.

Each participant stores:

```text
playerId
tokenHash
displayName
displaySuffix
role: CREATOR | PARTICIPANT
joinedAt
rounds[5]
finishedAt: null | timestamp
```

Rounds reuse the H2H `UNAVAILABLE`, `READY`, `STARTED`, and `LOCKED` states and the same result schema. A participant's progress is `NOT_STARTED`, `PLAYING`, or `FINISHED`. Rounds are sequential per participant.

### 2.3 Leaderboard derivation

The leaderboard is derived from participant round results in `GroupChallengeRoom`; it is not a second source of truth. For each participant, `currentTotal` is the sum of resolved round scores, with timeout results contributing zero. `resolvedRounds` is the count of submitted or timed-out rounds.

Finished rows are ordered by:

1. total descending;
2. `finishedAt` ascending;
3. `joinedAt` ascending;
4. `playerId` ascending as a stable final key.

Equal totals share the same competition rank, so totals `4800, 4800, 4700` have ranks `1, 1, 3`. `finishedAt` affects display order only and is not a scoring tie-breaker. Partial players have `rank: null` and appear in an unranked `In progress` section ordered by `joinedAt`. The server derives this view on reads. With at most 50 participants and five rounds each, no materialized leaderboard table is needed.

## 3. HTTP contract

### 3.1 Common behavior

The API keeps the H2H conventions: `/v1` base path, bearer `playerToken`, camelCase JSON, unknown request fields rejected, 8 KB request limit, `Cache-Control: no-store`, configured CORS origins, and the existing error envelope. The existing `/v1/players` endpoint issues identity for both modes.

Group endpoints use `challengeId`, not `matchId`, to prevent clients from confusing resource types. All mutations are idempotent where stated. Server timestamps are Unix milliseconds in UTC.

### 3.2 Create

`POST /v1/group-challenges`

Authenticated. Reserve one shared open-challenge slot, select and pin the locations, create the room with the creator as its first participant, and register the reusable invitation.

Request:

```json
{
  "displayName": "Sean",
  "clientVersion": "2026.10.14"
}
```

Response `201`:

```json
{
  "challengeId": "128-bit-or-stronger-object-id",
  "status": "OPEN",
  "role": "CREATOR",
  "joinCode": "7K2MQR",
  "shareUrl": "https://where-on-earth.example/pvp/group/join#invite=opaque-invite-token",
  "rules": {
    "version": 1,
    "rounds": 5,
    "roundSeconds": 20,
    "graceMilliseconds": 2000,
    "maximumScore": 5000,
    "participantCap": 50
  },
  "catalogVersion": "sha256:...",
  "createdAt": 1791936000000,
  "expiresAt": 1792540800000
}
```

The creator participant is created as `NOT_STARTED`. Creation does not start round 1. A retry strategy must use a request id or room initialization check so a network retry cannot consume two cap slots or create two challenges. A player with three combined open H2H and group creations receives the existing `429 OPEN_CHALLENGE_CAP` shape.

### 3.3 Inspect

`POST /v1/group-invitations/inspect`

Unauthenticated and rate-limited. Accept exactly one of `inviteToken` or `joinCode`. The invite token stays in the URL fragment and is sent in the body.

Request:

```json
{ "inviteToken": "opaque-invite-token" }
```

Response `200`:

```json
{
  "challengeId": "...",
  "kind": "GROUP",
  "creator": {
    "displayName": "Sean",
    "displaySuffix": "7K2"
  },
  "status": "OPEN",
  "participantCount": 12,
  "participantCap": 50,
  "expiresAt": 1792540800000,
  "rules": {
    "rounds": 5,
    "roundSeconds": 20,
    "maximumScore": 5000
  }
}
```

Inspection exposes no locations, scores, player list, or round progress. Unknown or revoked credentials return `404 INVITATION_NOT_FOUND`. Expired invitations return `410 INVITATION_EXPIRED`. A valid but closed challenge returns `409 ENTRIES_CLOSED` with public creator, count, cap, and expiry details so the landing page can explain why joining is unavailable. A full challenge returns `409 CHALLENGE_FULL` with count and cap.

### 3.4 Join

`POST /v1/group-challenges/:challengeId/join`

Authenticated. The invitation remains valid after a successful join because all friends use the same link or code.

Request:

```json
{
  "inviteToken": "opaque-invite-token",
  "displayName": "Alex",
  "clientVersion": "2026.10.14"
}
```

The code form replaces `inviteToken` with `joinCode`. Response `200`:

```json
{
  "challengeId": "...",
  "status": "OPEN",
  "role": "PARTICIPANT",
  "joinedAt": 1791939600000,
  "expiresAt": 1792540800000
}
```

The object serializes the cap check and participant insert. A retry by an already-bound player and token returns the original join response, including after entries close or the challenge fills. A second token claiming the same `playerId` fails authentication. An identity already present cannot create another attempt.

If the creator calls join with the shared credential, return `200` with `role: "CREATOR"` and the creator's original `joinedAt`; the client treats this as resume, not a new participant. New identities receive `409 ENTRIES_CLOSED` after closure, `409 CHALLENGE_FULL` at 50 participants, and `410 CHALLENGE_EXPIRED` after expiry. Invalid credentials return `404 INVITATION_NOT_FOUND`.

### 3.5 Read state and leaderboard

`GET /v1/group-challenges/:challengeId`

Authenticated participant only. The object first materializes elapsed round timeouts, expiry, and settlement. Response while the viewer is playing:

```json
{
  "challengeId": "...",
  "status": "OPEN",
  "role": "PARTICIPANT",
  "createdAt": 1791936000000,
  "expiresAt": 1792540800000,
  "catalogVersion": "sha256:...",
  "rulesVersion": 1,
  "entries": {
    "open": true,
    "participantCount": 12,
    "participantCap": 50,
    "closedAt": null
  },
  "viewer": {
    "progress": "PLAYING",
    "resolvedRounds": 2,
    "nextRound": 3,
    "total": 1784
  },
  "rounds": [
    {
      "round": 1,
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
        "outcome": "SUBMITTED",
        "guess": { "lat": 48.85, "lng": 2.35 },
        "distanceKm": 1,
        "score": 1000,
        "submittedAt": 1791939700000
      }
    },
    { "round": 3, "state": "READY" }
  ],
  "leaderboard": {
    "finishers": [
      {
        "rank": 1,
        "playerId": "plr_01J...",
        "displayName": "Sean",
        "displaySuffix": "7K2",
        "role": "CREATOR",
        "total": 4720,
        "resolvedRounds": 5,
        "finishedAt": 1791939000000
      }
    ],
    "inProgress": [
      {
        "rank": null,
        "playerId": "plr_01K...",
        "displayName": "Alex",
        "displaySuffix": "P9D",
        "role": "PARTICIPANT",
        "total": 1784,
        "resolvedRounds": 2
      }
    ]
  }
}
```

Totals and resolved-round counts are visible for every participant. Per-round detail for another participant is omitted from the base leaderboard. For each round the viewer has resolved, `rounds[N].participantResults` contains results for all other participants who have also resolved that round. It omits players who have not resolved it. For a viewer-unresolved round, the response contains no answer and no other participant result, even if totals make approximate performance inferable.

To keep the normal response bounded, `participantResults` may be returned by the following paginated endpoint once a challenge approaches the cap:

`GET /v1/group-challenges/:challengeId/rounds/:round/results?cursor=<opaque>&limit=25`

Authenticated participant only. Return `403 ROUND_NOT_UNLOCKED` unless the viewer has resolved that round. Each page includes the answer, the viewer result, eligible participant results, and `nextCursor`. The implementation must choose one delivery path and keep the state response below Worker response limits. The client must not require all detail pages to render the leaderboard.

### 3.6 Start and submit rounds

Reuse the H2H shapes under the group resource:

- `POST /v1/group-challenges/:challengeId/rounds/:round/start`
- `PUT /v1/group-challenges/:challengeId/rounds/:round/submission`

Start returns `round`, the prompt-only `location`, `startedAt`, `deadlineAt`, `acceptUntil`, and `serverNow`. Submit accepts `submissionId` and `guess`, then returns `round`, `outcome`, full `answer`, `viewerResult`, `challengeStatus`, and `nextRound`. It may also include `participantResults` for that round, subject to the same pagination rule.

All H2H validation and idempotency rules apply: rounds 1 through 5, sequential start, original timestamps on repeated start, first valid submission wins, same `submissionId` returns the stored response, later IDs receive `409 ROUND_ALREADY_RESOLVED`, invalid coordinates do not consume an on-time round, and a late request materializes a zero-point timeout before returning `409 ROUND_LATE`.

### 3.7 Close entries

`POST /v1/group-challenges/:challengeId/close`

Authenticated creator only. Body is `{}`. It atomically sets `entriesClosedAt`, removes the invitation mappings, and releases the creator's open-cap reservation. Existing participants retain access and may finish before expiry.

Response `200`:

```json
{
  "challengeId": "...",
  "status": "CLOSED",
  "entriesClosedAt": 1792022400000,
  "participantCount": 12,
  "expiresAt": 1792540800000
}
```

Creator retries return the same response. Non-creators receive `403 CREATOR_ONLY`. Closing a settled or expired challenge returns its current terminal state without mutation. There is no reopen operation in the MVP.

### 3.8 List challenges

`GET /v1/group-challenges?scope=mine&cursor=<opaque>&limit=20`

Authenticated. `PlayerRecords` maintains a lightweight membership index on successful creation and join. Return challenges where the caller is creator or participant, newest activity first, with at most 20 per page and an opaque cursor.

Each list item contains `challengeId`, creator display label, caller role and progress, status, current total, participant count, finished count, caller rank if finished, `createdAt`, `expiresAt`, and `lastActivityAt`. It contains no round answers or other participant results. Purge removes the membership index entries. `scope=created` may filter to creator-owned challenges; no public browse endpoint exists.

## 4. Set selection and catalog pinning

Use the exact H2H selection and snapshot behavior:

- load the catalog snapshot bundled with the deployed Worker and record its content-derived `catalogVersion`;
- choose five distinct playable city locations, one from each paired difficulty range 1-2, 3-4, 5-6, 7-8, and 9-10;
- prefer five distinct countries and record `countryFallback` if the constraint cannot be met;
- shuffle the five selected locations so difficulty does not predict round order;
- store the complete five-location snapshot in the room at creation so a later catalog deployment cannot change prompts, answers, images, or scoring for that challenge;
- return only the current round's prompt on start and the full answer only after that participant resolves the round.

Every participant receives the same five IDs in the same order. Do not personalize the set from Passport data. The server uses the pinned coordinates and the H2H distance formula to recompute an integer score from 0 through 1,000 per round.

## 5. Timing, completion, and partial play

Each participant owns an independent server-timed run through the shared set. Starting a round stores `startedAt`, `deadlineAt = startedAt + 20,000`, and `acceptUntil = deadlineAt + 2,000`. Backgrounding, refreshing, disconnecting, or closing the tab does not pause the clock. Leaving between rounds has no penalty.

The Durable Object alarm is the earliest of any unresolved participant `acceptUntil + 1`, the challenge expiry, and the purge time. Any request also materializes due timeouts before reading or mutating state. An elapsed started round becomes a locked `TIMEOUT` worth zero and unlocks that participant's next round.

A participant is finished immediately when all five of their rounds are resolved, whether by guesses or timeouts. Their total and leaderboard rank are then final with respect to their own score, but their displayed rank may move as later players finish. They may read the live leaderboard until the object is purged.

The group challenge does not wait for all 50 possible seats. While entries are open, it has no global completion moment. If the creator closes entries and every accepted participant finishes, the room becomes `SETTLED`. Otherwise it remains `CLOSED` until expiry. At expiry, it becomes `EXPIRED`; unresolved rounds remain unresolved rather than being filled with zeros, partial players remain in the unranked section, and finished rankings remain valid.

Partial totals are visible live but partial players never receive a rank and cannot displace finishers. The UI labels them `In progress`, `Not started`, or `Expired before finishing`, as appropriate. A player who finishes after entries close but before expiry joins the ranked finishers normally.

## 6. Retention and cleanup

The room schedules alarms for round deadlines, expiry, and purge. Closing entries immediately deletes the invite hash and short-code mapping and releases the creator's cap slot. Reaching 50 participants stops new joins but retains the invitation mapping until close or expiry so inspection can return `CHALLENGE_FULL` consistently.

At seven days after creation, the room atomically:

1. changes to `EXPIRED` unless already `SETTLED`;
2. removes invitation mappings and the open-cap reservation idempotently;
3. deletes pinned locations, raw guesses, answer coordinates, per-round response caches, token hashes, and unresolved timer state;
4. retains a compact result snapshot containing challenge metadata, participant display labels, roles, joined and finished timestamps, resolved-round counts, totals, final ranks for finishers, and expiry state;
5. sets `purgeAt` to seven days after expiry.

A `SETTLED` challenge keeps full round detail until the earlier of its fixed expiry or 30 days after settlement. At the fixed expiry it uses the same compaction above, then retains the compact leaderboard for seven more days. This keeps the cleanup schedule bounded even if all participants finish on day one.

At `purgeAt`, delete all room storage and the membership index rows. Later authenticated reads return `404 CHALLENGE_NOT_FOUND`. No group result is copied into pair records or permanent player history. Analytics, if added separately, must not contain guesses, tokens, or location answers.

## 7. Client integration

Keep H2H intact and present both formats from the PvP home:

- Keep the existing direct challenge card and its copy unchanged.
- Add an adjacent `Open Challenge` card with the summary `One link, one map set, up to 50 players` and a create action.
- Show the combined open-cap count near creation actions so it is clear that creator-owned H2H and group challenges share three slots.
- Add `Your open challenges` and `Challenges you joined` list sections from the group list endpoint. Do not mix group leaderboard rank into H2H pair records.

Creation reuses the current display-name and identity setup, then routes directly to the group lobby. The lobby shows the reusable link, code, expiry, participant count, creator close control, the creator's `Start` or `Resume` action, and the live leaderboard.

The join landing reuses the H2H invitation parsing, code-entry, identity, display-name, expiry, and rules UI. It adds a `Group challenge` label and participant count. Joining routes to the same lobby rather than a two-player waiting screen. Returning participants opening the shared link resume their existing seat.

Gameplay reuses the existing five-round globe input, prompt, server deadline, reveal, scoring, and Passport visit behavior. The reveal screen shows the viewer's result immediately and may show already-unlocked participant results without delaying the next-round action.

After round 5, route to a dedicated group leaderboard screen. It shows ranked finishers first and an `In progress` section below, highlights the viewer, updates on refresh or modest polling, and offers round-by-round comparison only for rounds the viewer has resolved. The share action reuses the original group link while entries are open. After close, it shares a result card without a join credential.

## 8. Abuse and edge cases

- Duplicate join requests are idempotent by authenticated `playerId` and token. They never create a second row or consume another seat.
- The creator is participant one at creation. Calling join or opening the shared link on the creator identity resumes that seat and cannot create another attempt.
- A participant gets one attempt. Clearing local storage creates a new identity and can claim another seat, which device-only identity cannot reliably prevent. State this limitation in operational notes rather than claiming strong anti-cheat protection.
- Resharing the link is expected. The room, not the number of recipients, enforces the 50-participant cap atomically. The fifty-first distinct identity receives `409 CHALLENGE_FULL`.
- A creator may play their own challenge. This is the intended creator attempt, not a self-invite error. They cannot join again as the same identity.
- Display names are not unique. Show the existing short player suffix when names collide, and make all keys and mutations use `playerId`.
- Concurrent close and join are serialized by the Durable Object. Whichever transaction commits first determines whether that new identity joins.
- Concurrent joins at seats 49 and 50 are serialized. Exactly one can take the final seat if one seat remains.
- A full room can still be closed, played, inspected as full, and read by participants.
- Closing entries never aborts a started round and never removes accepted participants.
- Expiry wins over a simultaneous start or submission once server time reaches `expiresAt`. No grace extends the seven-day challenge lifetime.
- Submission grace accepts network-delayed requests only through `acceptUntil`; it does not add visible play time.
- Invitation lookup is rate-limited by coarse network signal and credential hash. Creation, joins, starts, submissions, state reads, close, list, and detail pagination receive endpoint-appropriate limits.
- The service rejects malformed coordinates and recomputes distance, score, totals, progress, and rank. Client-provided scores or timestamps are ignored.
- Public catalog data and browser code make determined cheating possible. This remains an unrated friends mode with no claim of cheat-proof play.
- Lost local credentials cannot be recovered. The shared invitation does not grant access to an existing participant's private round state.
- A creator who closes before sharing has a valid one-player challenge. They may finish and receive rank 1; no minimum opponent count is required.
- If every accepted participant has finished when close commits, the room becomes `SETTLED` immediately.

## 9. Explicitly out of scope

- Any change to existing H2H rules, endpoints, rooms, rematches, pair records, or UI behavior
- Accounts, cross-device recovery, emails, passwords, friends, teams, clubs, and private group membership
- Public discovery, searchable challenges, global leaderboards, ratings, Elo, seasons, prizes, and tournaments
- Live synchronized starts, presence, WebSockets, chat, reactions, spectator mode, and push notifications
- Multiple attempts, retries, best-of series, rematches, rotating sets, custom round counts, custom timers, and creator-selected locations
- Removing participants, banning identities, invite allowlists, approval queues, and reopening closed entries
- Pairwise group records, permanent group history, Passport postcards, and server-side Passport synchronization
- Strong anti-cheat, tab policing, answer obfuscation presented as security, and enforcement against a player creating a new device identity
- Tap the Country, teams, elimination brackets, damage, health, weighted scoring, and photo-finish rules
- Exporting leaderboards, moderation tooling, analytics dashboards, and administrative mutation endpoints
