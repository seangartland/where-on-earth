# PvP scaling plan (Opus, 2026-10-17)

Plan only. No code or data was changed to write it. Evidence base: a line by
line read of `pvp-worker/src/index.js` (422 lines, 59 `sql.exec` sites),
`pvp-worker/src/group-room.js` (149 lines, 3 `sql.exec` sites) and the client
poll code in `src/pvp/{api,home,h2h,play,group}.js` at commit `300a004`.
Pricing and limits were read live from developers.cloudflare.com on
2026-10-17 around 15:25 UTC and re-read at 15:40 UTC by downloading each
page's `index.md` (section 3).

Short version: the binding cost is not request volume in general, it is four
specific fan-outs in the code. Group membership sync costs N Durable Object
calls per group event (a 50 player Open Challenge costs about 30,000 DO
requests, 30 percent of the free day, on its own). Every match-scoped call
pays a second DO hop to the global PlayerRecords object only to check a token
the match room already holds. The match screen poll re-fetches the pair record
on every tick and does not pause in a hidden tab. Every MatchRoom read also
writes a row (an unconditional `setAlarm`). Fixing those four, plus poll
backoff and CORS preflight reduction, is code-only on the free tier and moves
the free ceiling from roughly 240 to 415 daily players today to roughly 850 to
1,200. Workers Paid then turns the hard daily cap into a bill of about $15 a
month at 10,000 daily players. Re-architecture (WebSocket push,
sharding PlayerRecords) does not pay on cost at any traffic in sight and is held
behind a stated threshold.

## 1. Fan-out table (measured from the code)

### 1a. How the counts were taken

- **W**: inbound Worker requests the route itself costs. Each `fetch` from
  `src/pvp/api.js` is one. CORS preflights are listed separately in 1e because
  they are a property of the browser, not the route.
- **DO**: Durable Object requests. Every `internal(stub, ...)` call is one
  `stub.fetch`, which Cloudflare bills as one DO request. Calls made by a DO to
  another DO count the same. Alarm invocations count as DO requests too
  (verified, section 3).
- **Rows**: logical SQL rows per call, counted from the statements: R = rows
  read, W = rows written. `setAlarm` is billed as one row written (verified,
  section 3), so it is included. Full scans are written as `|table|`, the
  current row count of that table. Billed counts can be higher: Cloudflare
  states DO SQLite rows match D1 counting, and D1 bills an extra written row per
  index touched. Every table here has a TEXT primary key (an index), so billed
  writes are likely about 2x the logical figure. That multiplier is inferred
  from the D1 doc and is not instrumented.
- Shorthand for repeated pieces:
  - `AR` = `authenticateAndRate` (index.js:83): 1 DO to PlayerRecords
    `/auth-rate` (index.js:136). R2 (players by `token_hash`, rate_limits by
    bucket), W1 (rate_limits upsert).
  - `AUTH` = `authenticate` (index.js:71): 1 DO `/auth` (index.js:135). R1.
  - `RATE` = `rateLimit` (index.js:76): 1 DO `/rate` (index.js:152). R1 W1.
  - `NAME` = `/name` (index.js:151): 1 DO. R1 W1, written on every create and
    join even when the name is unchanged.
  - `MR` = one call into a MatchRoom. Every MatchRoom fetch (index.js:286)
    runs `load()` (R1), then `due()` which, when nothing changed, still runs
    `schedule(this.load())` (R1) and `setAlarm` (W1) because a non-terminal
    match always has a future `expiresAt` and a terminal one a future `purgeAt`
    (index.js:246, 273), then `load()` again (R1). Floor per MatchRoom call:
    **R3 W1, even for a pure read**.
  - `GR` = one call into a GroupChallengeRoom. `load()` R1, `due()` runs
    `schedule(state)` with `setAlarm` W1 (group-room.js:58, 81), `load()` R1.
    Floor: **R2 W1**.
  - `SYNC(N)` = `syncMemberships` (group-room.js:55): one PlayerRecords
    `/group-membership-upsert` DO call **per participant**, each W1. N DO,
    N rows.

### 1b. Head-to-head routes

| Route (index.js line) | W | DO | Storage calls, rows | Notes |
| --- | --- | --- | --- | --- |
| `POST /v1/players` (368) | 1 | 2 | RATE; `/player` INSERT W1 | once per device |
| `POST /v1/matches` create (384, createMatch 344) | 1 | 4 | AR; NAME; `/reserve` (162): 2 DELETE scans + 2 COUNT scans over `open_matches` and `open_groups` (R = 2 x (\|open_matches\| + \|open_groups\|)), W3 inserts; MR `/init` (289) R1 W2 | `expires_at` and `player_id` are not indexed, so `/reserve` scans both tables twice |
| `POST /v1/invitations/inspect` (385) | 1 | 3 | RATE; `/resolve-invite` (213): DELETE scan over `invitation_tombstones` (R = \|tombstones\|), PK read R1; MR `/invite-preview` R3 W1 | unauthenticated |
| `POST /v1/matches/:id/join` (387) | 1 | 6 (7 for a rematch) | AUTH; RATE; `/resolve-invite`; MR `/join` (293) R3 W3, which calls `/consume-invite` (206, DELETE scan over `invitations` by unindexed `match_id`) and for a rematch `/rematch-claimed` on the source room (another MR); NAME | auth and rate are still two calls here; the diet did not merge them |
| `GET /v1/matches/:id` state (395) | 1 | **2** | AR R2 W1; MR `/state` (308) R3 W1 | the poll route |
| `POST .../rounds/:n/start` (397) | 1 | 2 | AR; MR `/start` (309): R3, save W1, two `setAlarm` W2 | |
| `PUT .../rounds/:n/submission` (399) | 1 | 2, or 4 on the match-completing submission | AR; MR `/submission` (316): R5 W4; on completion `due()` adds `/release` (207, 2 scans over `invitations`) and `/apply-completion` (219, R2 W2 to W3), plus 2 more saves | |
| `POST .../abandon` (401) | 1 | 3 | AUTH; MR `/abandon`; `/release` | rare |
| `POST .../rematches` (403) | 1 | 5 | AR; MR `/rematch-reserve`; `/reserve`; MR `/init`; MR `/rematch-finalize` | 2 to 3 DO if the rematch already exists |
| `GET /v1/records/:id` (417) | 1 | 2 | AUTH R1; `/record` (230) R1 | no rate limit; **called by the client on every match screen load, including every poll tick** (h2h.js:244) |
| MatchRoom alarm (341) | 0 | 1 per fire, +1 on expiry | completed match: one fire at `purgeAt` (30 days), `deleteAll`; expired match: fire at `expiresAt` with `/release`, then a purge fire a week later; a round timeout: one fire at `acceptUntil + 1` | rounds submitted in time never fire an alarm, because the next `schedule` moves the alarm back to `expiresAt` |

### 1c. Open Challenge (group) routes, N = participants at the time of the call

| Route (index.js line) | W | DO | Storage calls, rows | Notes |
| --- | --- | --- | --- | --- |
| `POST /v1/group-challenges` create (369, createGroup 351) | 1 | 6 | AR; NAME; GR `/init` R1 W2; `/group-reserve` (173, same scans as `/reserve`); GR `/reserved` + SYNC(1) | |
| `POST /v1/group-invitations/inspect` (370) | 1 | 3 | RATE; `/group-resolve-invite` (scan over group tombstones); GR `/invite-preview` | |
| `POST .../:id/join` (373) | 1 | 5 + N (6 + N on the first join) | AUTH; RATE; resolve; GR `/join` + `releaseSlot` (first non-creator join) + SYNC(N); NAME | |
| `GET /v1/group-challenges` list (371) | 1 per page | 2 per page | AR; `/group-list` (201): reads all of the player's membership rows to sort by unindexed `last_activity_at` | 20 per page; the client walks every page (api.js:164) |
| `GET .../:id` state (375) | 1 | 2 (2 + N if a timeout or settle is materialized) | AR; GR `/state` R2 W1 | the group poll route |
| `POST .../rounds/:n/start` (377) | 1 | **2 + N** | AR; GR `/start` R2 W3; SYNC(N) | |
| `PUT .../rounds/:n/submission` (379) | 1 | **2 + N** (3 + 2N on the settling submission) | AR; GR `/submission` R3 W4; SYNC(N) | |
| `GET .../rounds/:n/results` (381) | 1 per page | 2 per page | AR; GR `/results` | 25 per page; read once per round reveal (play.js:194) |
| `POST .../close` (383) | 1 | 3 + N | AR; GR `/close`; `/group-release`; SYNC(N) | |
| Group alarms (144) | 0 | expiry: 2 + N; purge: 2; each round timeout: 1 + N | expiry runs `/group-release` and SYNC(N); purge runs `/group-membership-remove`, a DELETE scan over all of `group_memberships` (`challenge_id` is not a PK prefix) | `SETTLED` groups still take the expiry alarm |

**The group multiplier.** Per participant over a full game: one join plus five
starts plus five submissions is 11 syncs, each costing N DO calls and N rows,
so a group of N costs about 11N squared DO requests in sync alone:

| Group size N | Sync DO requests per group (11N^2) | Share of the free 100,000 DO day |
| --- | --- | --- |
| 5 | 275 | 0.3 percent |
| 10 | 1,100 | 1.1 percent |
| 25 | 6,875 | 6.9 percent |
| 50 (cap) | 27,500 | 27.5 percent |

The same sync writes the same number of rows into PlayerRecords, against a
100,000 rows-written free day. At N = 50 a single SYNC is 50 DO-to-DO calls
from one invocation. Workers Free allows 50 subrequests per invocation and
1,000 "subrequests to internal services" (both verified); the limits page does
not say which bucket a DO stub call falls in, or whether the "six simultaneous
open connections" rule applies to stub calls, so the effect on a 50 way
`Promise.all` is **unverified**. If stub calls count against the 50, the
largest groups already lose membership updates silently, because every sync
call ends in `.catch(() => {})`.

### 1d. Client call patterns (src/pvp, measured from the code)

| Screen / trigger | Requests per occurrence | DO | Gate |
| --- | --- | --- | --- |
| Match screen open (`showPvpMatch` -> `loadPvpMatch`, h2h.js:233) | state + record = 2 W | 4 (2 if no opponent yet) | |
| Match screen poll while `their-turn` or `waiting` (h2h.js:247) | every 10 s: state + record = 2 W | **4 per tick = 1,440 per hour** | checks `pvpMatchScreen.hidden` only. **Not paused when the tab is hidden**; the diet added `document.hidden` to the reveal and group polls, not this one |
| Reveal poll while the opponent has not played the round (play.js:218) | every 5 s: state = 1 W | 2 per tick = 1,440 per hour | paused when hidden (diet) |
| Timeout resolve (play.js:243) | 1 to 5 state reads, 1.5 s apart | 2 each | |
| Group screen poll (group.js:121) | every 10 s: state = 1 W | 2 per tick = 720 per hour | paused when hidden (diet); **keeps polling a SETTLED group until it EXPIRES** (group.js:135) |
| Challenge home open (`refreshPvpList`, home.js:306) | one state read per remembered non-terminal match (up to 30 remembered) + one group-list call per 20 groups | 2 per match + 2 per page | the terminal skip uses `pvpUi.states`, an in-memory Map (home.js:42). **It does not survive a page load**, so the first home open after every load re-reads every remembered match, finished ones included |
| Record catch-up (h2h.js:228) | +1 record read 2.5 s later if the record lags | 2 | |

### 1e. CORS preflights (Worker requests that cost no DO)

Every API call sends either an `Authorization` header, a JSON body, or `PUT`,
so every call is preflighted unless the browser has a cached preflight for that
exact URL. The Worker answers `OPTIONS` with `access-control-max-age: 600`
(index.js:70). Each round uses distinct URLs (`/rounds/1/start`,
`/rounds/1/submission`, ...), so a full match costs each player about 10
uncached preflights on top of its 16 or so real requests. Preflights are free of
DO cost, which is why the observed DO per Worker ratio (2.55 to 3.2) understates
DO per real call. They matter after Phase 0: once DO per call drops to about 1,
preflights make the Worker cap bind first (section 2c). Browser caps on
max-age (Chromium 7,200 s; others differ) are from memory and **unverified**.

### 1f. Per match lifecycle totals, current code

A completed head-to-head match, no waiting on any screen (the floor):

| Who | Calls | DO |
| --- | --- | --- |
| Challenger | create 4; match screen 2 (no opponent yet); 5 x (start 2 + submit 2) = 20; back to match screen 2; later home open 2; open the match 4 | 34 |
| Invitee | inspect 3; join 6; match screen 4; 5 x 4 = 20; completing submission +2; final screen 4 | 39 |
| Alarm | purge fire at 30 days | 1 |
| **Total** | about 32 W real + about 20 preflights | **74 DO, about 37 per player per match** |

Waiting costs on top, per minute on screen: 24 DO on the match screen (with an
opponent), 24 DO on the reveal, 12 DO on the group screen.

## 2. Model: DO requests per daily player per day

### 2a. Calibration against the observed days

- 2026-10-16: 2,218 W, about 7,175 DO (ratio 3.2), Sean plus test traffic.
- 2026-10-17 08:12 UTC snapshot 592 W / 1,872 DO; 08:26 after one suite run
  720 W / 2,198 DO (`~/workspace/map-game/shots/accounts-phase1/m4-*.json`);
  15:24 UTC 723 W / 2,204 DO. So between 08:26 and 15:24 UTC there were 3 W and
  6 DO: **no organic PvP traffic today**. The model below therefore cannot be
  calibrated against organic play; it is built from the table plus stated
  behaviour assumptions.
- The 10-16 day cannot be split into play vs suites vs idle polling from the
  totals. The table shows how one user reaches 7 percent: a match screen left
  open in a foreground (or unthrottled background) tab while waiting costs
  1,440 DO per hour, so about 4 hours of waiting plus a few matches and suite
  runs covers it.
- On the diet measurement: 3.16 was a whole day of mixed old-Worker traffic
  (1,872 / 592); 2.55 was one suite run on the new Worker (326 / 128). The two
  are different workloads, so the ratio change is not the diet's effect. From
  the table, the merged auth+rate cut exactly 1 DO from every gameplay call
  (3 to 2, a third), and nothing else on the server.

### 2b. Assumptions (stated, not measured)

| Symbol | Assumption | Value |
| --- | --- | --- |
| M | H2H matches a daily player takes part in per day | 3 |
| Reveal dwell | seconds the first player in a round spends on the reveal before Next | 10 s (2 reveal polls), for one of the two players per round |
| Wait | minutes the first finisher spends on the match screen waiting | 2 min per match, foreground |
| Remembered | matches in the device list | 10, of which 2 non-terminal |
| Home opens | per day, one page load | 2 |
| G | Open Challenges joined per daily player per day | 0 (H2H profile) or 1 of size N = 10 (mixed profile) |

### 2c. Arithmetic, current code

Per player per match: 37 (floor) + reveal polls (2 polls x 2 DO x 5 rounds = 20
for the first player, so 10 averaged over both) + wait (12 ticks x 4 DO = 48 for
the first finisher, 24 averaged) = **71 DO**.

Home: first open re-reads all 10 remembered matches (20 DO) + group list (2);
second open re-reads the 2 non-terminal (4) + list (2) = **28 DO**.

H2H profile: 3 x 71 + 28 = **241 DO per daily player per day**.

Group of 10, per participant: syncs 10.5N = 105, own calls (join 5, 5 starts and
5 submits at 2 each = 20, 5 result pages at 2 = 10) = 35, 3 minutes on the group
screen = 36, a tenth of the per-group overhead (create 6, close 13, expiry 12,
purge 2 = 33) = 3. Total about **180 DO**.

| Profile | DO per daily player | Free DO cap breaks at (100,000 / x) |
| --- | --- | --- |
| H2H only | 241 | **about 415 daily players** |
| H2H + one 10 player group | 421 | **about 237 daily players** |
| One idle hour on a waiting match screen | +1,440 | each such player counts as 6 typical ones |
| One 50 player group | about 29,900 per group | 3 such groups a day use 90 percent of the cap |

Worker requests per H2H player per day are about 3 x (16 real + 10 preflight
+ 17 poll) + 14 home = about 145, so today the DO cap binds first (241 vs 145).

The second free cap nobody has measured yet: **rows written, 100,000 per day**.
Every MatchRoom and GroupChallengeRoom call writes at least one row
(`setAlarm`), every AR writes one, every sync writes N. Logical rows written are
therefore roughly equal to DO requests, and if the index multiplier applies
(likely, see 1a) billed rows written are about double. If so, **rows written
breaks before DO requests, at about half the player counts above**. This needs
the GraphQL storage numbers before anyone trusts the DO-cap figure (decision 1).

## 3. Cloudflare pricing and limits (read live 2026-10-17)

Sources, all fetched as markdown from developers.cloudflare.com on 2026-10-17
around 15:25 UTC:
[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (updated 2026-09-30),
[DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (2026-06-01),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (2026-10-02),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-10-12),
[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/) (2026-04-21),
[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) (2026-08-14),
[DO WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (2026-04-21),
[Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) (2026-10-12).

| Item | Free | Paid ($5/month minimum) | Status |
| --- | --- | --- | --- |
| Worker requests | 100,000 / day | 10M / month included, +$0.30 per million; no daily limit | verified, Workers pricing + limits |
| Worker CPU | 10 ms per invocation | 30M CPU ms / month included, +$0.02 per million ms | verified. The limits page cites an average of about 2.2 ms per request across Workers; ours is not measured |
| Subrequests | 50 per invocation; 1,000 to internal services | 10,000 per invocation | verified, Workers limits. Which bucket DO stub calls use: **unverified** |
| Static assets, subrequests | free, not billed | same | verified |
| DO requests | 100,000 / day | 1M / month included, +$0.15 per million | verified. Includes HTTP requests, each RPC session, WebSocket messages and **alarm invocations** |
| DO duration | 13,000 GB-s / day | 400,000 GB-s / month, +$12.50 per million GB-s | verified. Billed at 128 MB while active or idle but not hibernation-eligible; idle hibernation-eligible objects are not billed |
| DO SQLite rows read | 5M / day | 25B / month included, +$0.001 per million | verified |
| DO SQLite rows written | 100,000 / day | 50M / month included, +$1.00 per million | verified. `setAlarm` = 1 row written; deletes count as writes |
| DO SQLite storage | 5 GB total | 5 GB-month, +$0.20 per GB-month | verified. Storage billing began January 2026 (target 2026-01-07) |
| Free tier overrun behaviour | further operations of that type **fail with an error** until 00:00 UTC | billing instead of failure | verified, DO and KV pricing |
| Index rows count as extra writes | D1 doc says yes; DO doc says its row rules match D1 | | **inferred, not verified for DO** |
| Per object throughput | soft limit 1,000 requests per second per object, then "overloaded" errors | same | verified, DO limits FAQ |
| Per object storage | 1 GB (FAQ text) | 10 GB | verified, though the limits table and FAQ disagree on the free figure |
| WebSocket connect | 1 DO request (and 1 Worker request for the Upgrade) | same | verified |
| WebSocket messages | incoming billed at 20:1 (100 messages = 5 requests); outgoing free; protocol pings free; auto-responses free | same | verified for billing ("for compute requests billing-only"; the page adds that the ratio "does not affect Durable Object metrics and analytics"). **Whether the free daily 100,000 cap counts messages at 20:1 or 1:1 is not stated: unverified; assume 1:1 to be safe** |
| WebSocket hibernation | no duration charge while hibernated; clients stay connected; constructor reruns on wake | same | verified. Not stated as paid-only; availability on Free is **unverified** but DOs themselves are on Free |
| Workers KV | 100,000 reads / day, **1,000 writes / day**, 1,000 deletes, 1,000 lists, 1 GB | 10M reads +$0.50/M, 1M writes +$5.00/M, 1 GB +$0.50/GB-month | verified |
| Cache API | 50 calls per request; per data center only, no replication; `cache.put` not tiered | 1,000 calls per request | verified. The page says Workers **on custom domains** have functional cache operations, but a later paragraph describes `.workers.dev` cache key behaviour, so whether `cache.put` works for woe-pvp on `workers.dev` is **unverified (the doc is ambiguous)**; plan as if it needs a custom domain |
| Cache API price | no separate charge listed; a cache hit served by a Worker still costs the Worker request | | verified that the Worker request is still counted (Workers pricing: "Since Cloudflare Workers runs before the Cloudflare cache, the caching of a request still incurs costs"); Cache API itself has no price line: **unverified that it is free** |
| Rate Limiting binding | documented (`ratelimit` binding, 10 or 60 s windows, local per location, eventually consistent) | | **plan availability and price not stated on the page: unverified** |

What each lifts, for this game: Workers Paid removes both daily caps and the
hard-failure mode, and costs pennies at our shape (section 5b). WebSocket
hibernation removes polling but not the per-connection cost, and our waits are
async (hours), so it helps only live screens. KV's 1,000 writes a day on Free
rules it out for counters. The Cache API needs a custom domain, still costs the
Worker request, and caches per data center.

## 4. Structural options, judged against the table

Each line: what changes in the table, and the verdict.

**4.1 Group sync fan-out (adopt, highest payoff).**
(a) Batch: one `/group-membership-upsert-batch` call carrying all N rows. SYNC
goes from N DO to 1 DO; rows stay N. A 50 player group drops from about 27,500
to about 550 sync DO. Also removes the subrequest risk in 1c.
(b) Coarsen: on start and submission, upsert only the acting player's row
(1 DO, 1 row); upsert all N rows only when ranks or counts change for everyone
(a player finishes, close, settle, expire). Per participant the sync cost
becomes about 11 DO and N rows once, instead of 10.5N DO and 10.5N rows.
Trade-off: other players' home rows show a stale finished count until the next
finish event. Verdict: adopt both; (b) needs decision 3.

**4.2 Identity and rate checks that cost no PlayerRecords call (adopt, broadest
payoff).** Match and group rooms already store each participant's `tokenHash`
and compare it in `participant()` (index.js:252, group-room.js:44). For
match-scoped routes (state, start, submission, abandon, results, close) the
Worker can hash the bearer token itself and let the room find the participant
by `tokenHash`, with the room keeping its own in-memory per-player request
counter for the 120, 20 and 30 per minute limits. When no participant matches
the hash, the room answers 401 `UNAUTHORIZED`, the same code the Worker returns
today. Effect: those routes go from
2 DO to **1 DO**, with no token format change and no client change. Global
routes fold auth into the call they already make: `/record` (2 to 1),
`/group-list` (2 to 1 per page), create (AR + NAME + `/reserve` into one call,
4 to 2), join (AUTH + RATE + resolve + NAME into one call, 6 to 3).
In-memory counters reset when an object is evicted; for per-match abuse limits
that is acceptable, and a rejected request costs 1 DO either way. Behaviour
change: a valid token that is not a participant of that match now reads as 401
instead of 403. Keeping 401 for the unknown case matters because the home list
forgets a match on 403 `FORBIDDEN` (home.js:317), so returning 403 for a bad
token would silently drop a device's matches. Rejected alternatives: signed
stateless tokens (needs a token migration and touches the accounts work, buys
nothing over 4.2 for match routes); KV counters (1,000 writes a day on Free,
eventually consistent); the Rate Limiting binding (plan availability
unverified, and it would only replace the counter, not the auth hop).

**4.3 Poll discipline (adopt).**
- Drop the record fetch from every poll: fetch it on first load and once on the
  transition to COMPLETED. Match screen tick 4 DO to 2 (1 after 4.2).
- Pause the match screen poll on `document.hidden` and refresh once on
  `visibilitychange`. Removes background polling entirely.
- Backoff: 10, 20, 40, 60 s, capped at 60 s, reset on any visible change or on
  return to the tab; stop after 10 minutes and show the existing state with a
  refresh on return. A 2 minute wait drops from 12 ticks to 4; a 30 minute wait
  from 180 ticks to 10 before stopping.
- Reveal poll: 5, 10, 20 s, stop after 2 minutes.
- Group screen: stop polling once the group is SETTLED, or once the viewer has
  finished and entries are closed; same backoff otherwise.
- Jitter: no request saving, only smoothing. Add it with the backoff (one line)
  but count no savings.
- "Live window only" polling (poll only during the opponent's 20 s round):
  rejected as a separate mechanism. The client cannot know when an async
  opponent starts, and backoff with a stop covers the case.

**4.4 Persist terminal match state on the device (adopt).** Store COMPLETED,
EXPIRED and ABANDONED states in `pvpStore` (localStorage) instead of the
in-memory Map. Home open goes from 2 DO per remembered match to 1 DO per
non-terminal match (after 4.2). This is the client-side version of "cache
terminal data at the edge", and it costs zero requests.

**4.5 Write-maintained read model for the home list (defer).** PlayerRecords
already keeps `group_memberships` for groups. Doing the same for matches would
make home one call regardless of match count, but costs writes on every match
transition. With 3 player caps on open challenges and 4.4 in place, a home open
reads about 2 non-terminal matches, so the read model saves about 1 DO per home
open while adding at least 4 writes per match. It does not pay at current
shape. Revisit only if lists grow (for example, an account-wide match history).

**4.6 Edge caching of immutable and terminal data, Cache API or KV (reject
now).** Terminal state views are per viewer and auth-gated; the Cache API is
per data center and needs a custom domain (the DNS answer is still pending);
a cache hit still costs the Worker request, which after Phase 0 is the binding
cap. 4.4 does the same job for free on the device. Revisit for genuinely public
shared data (for example, a public group leaderboard) after a custom domain.

**4.7 Server push with hibernating DO WebSockets (hold for Phase 2).** Per
connection: 1 Worker request, 1 DO request, plus incoming messages at 20:1;
server-to-client pushes are free. A waiting screen would cost about 1 DO per
visit instead of 1 per tick. But after 4.3 a typical wait costs about 4 DO, so
push saves about 3 DO per match while adding a reconnect path (iOS suspends
background sockets) and a new protocol on both rooms. It pays only for a live
duel (both players in the same 20 s round), which is a product decision. The
"your turn" signal for async waits that last hours is a notification problem,
not a socket problem.

**4.8 DO granularity (keep per match; shard PlayerRecords later).** One object
per match and per group is right: natural lifetime, isolation, and it is where
the 4.2 check lives. The scaling risk is the **single global PlayerRecords**
(`idFromName("global")`, index.js:55): every create, join, list, record,
membership write and, today, every authenticated call goes through one
single-threaded object with a 1,000 requests per second soft limit. After 4.2
it sees only about a quarter of traffic. Sharding it (memberships and names by
player, records by pair key, invitations by credential hash) is a Phase 2 item
behind the threshold in 5c.

**4.9 SQL shape (adopt the cheap parts in Phase 0).**
- Keep the loaded state in memory inside MatchRoom and GroupChallengeRoom
  (the object is single-threaded) and stop the double and triple `load()`:
  rows read per call 3 to 1 or 0.
- Call `setAlarm` only when the computed time differs from the last one set
  (track it in memory): rows written per read 1 to 0. This is what protects the
  rows-written cap.
- Add indexes in PlayerRecords for the scanned columns: `open_matches(player_id)`,
  `open_matches(expires_at)`, `open_groups` likewise, `invitations(match_id)`,
  `group_invitations(challenge_id)`, `group_memberships(challenge_id)`,
  `group_memberships(player_id, last_activity_at)`, tombstones `(purge_at)`.
  Today `/reserve`, `/consume-invite`, `/release` and `/resolve-invite` read
  whole tables, so rows read grows with players times table size: at about
  400 daily players that is on the order of 2.5M rows read a day (estimate from
  modelled table sizes), half the 5M free cap and growing quadratically.
- Prune `rate_limits` (never deleted today) and `completion_ledger` (grows
  forever) on an alarm. Storage is small; this is hygiene.
- "Stop re-reading full match state to render a list row": the DO request is
  what binds, not the payload, so a lighter summary view saves CPU and bytes
  but no DO requests. Fold it into 4.9 only if CPU on Free (10 ms) becomes a
  measured problem.

**4.10 Cut CORS preflights (adopt in Phase 0, because it becomes binding).**
Collapse per-round URLs into one action endpoint per match and per group
(`POST /v1/matches/:id/actions` with `{op, round}`) so the browser keeps one
cached preflight per match, and raise `access-control-max-age` to 7,200.
Effect: about 10 preflights per player per match drop to about 2. Alternative:
a same-origin proxy through Vercel rewrites removes preflights entirely but
moves traffic onto Vercel's own limits (not checked here). Recommend the URL
change; keep the old routes for one client version.

**4.11 Smaller merges (adopt with 4.2).** Fold `/release` and
`/apply-completion` into one PlayerRecords call on completion (4 to 3 on the
last submission), and merge RATE + resolve on the two inspect routes (3 to 2).

## 5. Phased path

### 5a. Phase 0: free tier, code only, ordered by payoff per effort

Every step is independently shippable and testable with the existing pvp and
group suites. Measure DO, Worker, rows read and rows written per suite run
before and after each Worker deploy (same suite, same workload, unlike the M4
comparison).

| Step | Change | Effort | Effect |
| --- | --- | --- | --- |
| 0.0 | Pull per-namespace DO requests, rows read, rows written and OPTIONS share for 10-16 and 10-17 from GraphQL (decision 1) | mechanical | settles which free cap binds first |
| 0.1 | Client: drop record fetch from the poll; pause the match screen poll when hidden | trivial | waiting cost 24 to 12 DO per minute; background 0 |
| 0.2 | Worker: batch group sync (4.1a) | small | 50 player group about 30,000 to about 3,000 DO |
| 0.3 | Client: poll backoff with stop for match, reveal and group screens; stop on SETTLED (4.3) | small | 2 minute wait 12 ticks to 4 |
| 0.4 | Client: persist terminal states (4.4) | small | home first open 20 to 2 DO at 10 remembered |
| 0.5 | Worker: room-side auth and rate (4.2) and the merges (4.11) | medium | every gameplay call 2 to 1 DO |
| 0.6 | Worker: in-memory state and conditional `setAlarm` (4.9) | small | rows written on reads 1 to 0 |
| 0.7 | Worker: PlayerRecords indexes and pruning (4.9) | small | removes quadratic rows read |
| 0.8 | Worker + client: action endpoint and max-age (4.10) | medium | preflights 10 to 2 per player per match |
| 0.9 | Worker: coarsened group sync (4.1b) | small | group sync per participant about 11 DO, flat in N |

After Phase 0, same assumptions as 2b:

- Per player per match: challenger create 2, screen 1, 10 round calls, back to
  screen 1 plus record 1, home 1, open 2 = 18; invitee inspect 2, join 3, screen
  2, 10 round calls, completion +1, final screen 2 = 20; alarm 1; so about
  **19.5 per player per match**. Reveal polls with backoff about 4 averaged, wait
  with backoff about 2 averaged: **about 25.5**.
- Home: two opens, non-terminal only, 1 DO each, plus list: **about 6**.
- H2H profile: 3 x 25.5 + 6 = **about 83 DO per daily player per day**.
- Group of 10, per participant: own calls (join 3, 10 round calls, 5 result
  pages) about 18, syncs about 11, polls about 4, overhead about 1 = **about
  34** (and still about 34 at N = 50).
- Worker requests per H2H player per day: about 3 x (16.5 real + 2 preflights
  + 6 polls) + 8 home = **about 82**, so after Phase 0 the Worker and DO caps
  bind at about the same point. Without 0.8 the Worker cap binds first, at
  about 105 W per player (about 950 players).

| Profile | DO per daily player, today | After Phase 0 | Free ceiling today | Free ceiling after Phase 0 |
| --- | --- | --- | --- | --- |
| H2H only | 241 | 83 | about 415 | **about 1,200** |
| H2H + one 10 player group | 421 | 117 | about 237 | **about 855** |

These ceilings assume rows written does not bind first. Step 0.6 is what makes
that assumption true; 0.0 checks it.

### 5b. Workers Paid ($5 per month)

Trigger (recommend): any one day above 50,000 on either DO requests, Worker
requests or rows written, or the 7 day average above 35,000; **or** before any
public launch or share push, whichever comes first. On Free an overrun is an
outage (every PvP call fails until 00:00 UTC), and launches are exactly when
spikes happen.

Effect: no daily caps, no hard failure. Note that Paid includes only 1M DO
requests a month, less than Free's 100,000 a day, but overage is $0.15 per
million, so the money is small. At Phase 0 shape (about 117 DO and 84 W per
daily player per day, 30 days; overage rounded up to whole millions as the
pricing page states; CPU assumed 2 ms per Worker request, not measured):

| Daily players | DO / month | W / month | Approximate bill |
| --- | --- | --- | --- |
| 1,000 | 3.5M | 2.5M | about $5.45 ($5 + 3M billable DO x $0.15) |
| 10,000 | 35M | 25M | about $15 ($5 + $5.10 DO + $4.50 W + $0.40 CPU) |
| 50,000 | 176M | 126M | about $70 ($5 + $26.25 DO + $34.80 W + $4.44 CPU) |

Rows written after 0.6 sit well under 50M a month at 10,000 players; duration
stays far under 400,000 GB-s because request-response objects are only billed
while handling requests (wall times per request were not measured). Current
code on Paid would cost roughly 3x the DO line, still small: the case for
Phase 0 is the free ceiling and the PlayerRecords bottleneck, not the bill.

Ceiling on Paid: the global PlayerRecords object. After 0.5 it handles about a
quarter of DO traffic. At 10,000 players that is about 280,000 calls a day,
about 3 per second on average and perhaps 30 at a 10x peak, far from the 1,000
per second soft limit.

### 5c. Phase 2: re-architecture, held behind a threshold

Hold until one of these is true:

- PlayerRecords peak above 200 requests per second, or any "overloaded" error
  from it (a fifth of the soft limit), which at the shape above is on the order
  of 50,000 or more daily players;
- the monthly Cloudflare bill above $50;
- a live duel mode is approved (needs push).

Contents: shard PlayerRecords (memberships and names per player, records per
pair, invitations per credential hash); hibernating WebSockets for live
screens (4.7); the home read model (4.5) if lists have grown. Expected effect
on DO per daily player: small, about 83 to 75 for the H2H profile (push removes
the remaining poll ticks). What it buys is headroom on the single object
(sharding removes the per-object ceiling entirely) and the live duel, not a
lower bill.

## 6. Decisions for Sean

1. **Measure rows written before Phase 0.** Recommend yes: a mechanical
   GraphQL pull (per-namespace DO, rows read, rows written, OPTIONS share) for
   10-16 and 10-17. If rows written already runs near 2x DO requests, the
   free ceiling today is half the figure above and 0.6 moves up the order.
2. **Approve Phase 0 as one plan, deployed in two or three Worker batches.**
   Recommend yes, client steps 0.1, 0.3, 0.4 first (no contract change), then
   Worker 0.2, 0.5, 0.6, 0.7, then 0.8 and 0.9.
3. **Group home rows may show a slightly stale finished count and rank** until
   the next finish, close or expiry (4.1b). Recommend accept; the group screen
   itself stays live.
4. **Waiting screens stop polling after 10 minutes** and refresh when the
   player returns (4.3). Recommend accept; the async game does not need a
   screen to watch an opponent who may play tomorrow.
5. **Room-side auth changes one edge case**: a valid token that is not in the
   match gets 401 instead of 403 (4.2); unknown tokens keep 401 so the home
   list never forgets matches on a bad token. Recommend accept; no client
   change needed.
6. **Workers Paid trigger**: recommend the trigger in 5b, and buy it before any
   public share push regardless of numbers. $5 a month is cheaper than one day
   of PvP failing at 00:00 UTC.
7. **Preflight fix: URL consolidation vs a Vercel same-origin proxy.**
   Recommend consolidation (stays inside Cloudflare, no new limits to check).
8. **Hold Phase 2** behind the 5c threshold. Recommend hold; revisit only if
   live duel is put on the roadmap.
