# PvP scaling: report (2026-10-17)

Full plan: `docs/pvp-scaling-plan-opus.md`. Plan only; no code or data changed.

## Headline numbers

| | Today | After Phase 0 (free tier, code only) |
| --- | --- | --- |
| DO requests per daily player per day, head-to-head only | about 241 | about 83 |
| DO requests per daily player, with one 10 player Open Challenge | about 421 | about 117 |
| Daily players before the free 100,000 DO cap breaks | about 415 (H2H) / 237 (mixed) | about 1,200 / 855 |
| One 50 player Open Challenge | about 30,000 DO (30 percent of the free day) | about 1,700 |

The per-player figures rest on stated behaviour assumptions (3 matches a day,
2 minutes waiting per match, 2 home opens, 10 remembered matches); the per-call
costs underneath them are counted from the code.

Workers Paid ($5/month) then removes the daily caps and the hard failure mode:
about $5.45 a month at 1,000 daily players, about $15 at 10,000, about $70 at
50,000 (Phase 0 shape).

## What the table found

The cost is not polling in general. It is four specific fan-outs:

1. **Group sync**: every group join, round start and submission makes one
   PlayerRecords call per participant (`syncMemberships`, group-room.js:55).
   That is about 11N squared DO calls per group.
2. **Auth hop**: every match call pays a second DO request to the global
   PlayerRecords only to check a token the match room already holds.
3. **Match screen poll**: it refetches the pair record on every 10 s tick (4 DO
   per tick) and is **not** paused in a hidden tab (h2h.js:249). The diet's
   hidden-tab pause covers the reveal and group polls only. That corrects the
   brief, which says all open screens pause.
4. **Rows written**: every MatchRoom and group call, even a pure read, writes a
   row (an unconditional `setAlarm`). The free tier also caps rows written at
   100,000 a day, so that cap may bind before the DO request cap. Nobody has
   measured it yet.

Also: the diet comparison of 3.16 vs 2.55 DO per Worker request compares a whole
day of mixed traffic with one suite run, so it does not measure the diet. From
the code, the merge cut exactly 1 DO from every gameplay call (3 to 2).

## Recommendation

Do Phase 0 (ten code-only steps, ordered by payoff per effort in plan section
5a) before spending money. Buy Workers Paid on the stated trigger, or before any
public share push regardless of numbers. Hold the re-architecture (WebSocket
push, sharding PlayerRecords) behind the threshold in 5c. It buys headroom on
one object and a live duel mode, not a lower bill.

## Decisions for Sean

1. **Pull rows written from GraphQL before Phase 0.** Yes: it is mechanical,
   and it decides whether the free ceiling today is half the figure above.
2. **Approve Phase 0 in two or three Worker batches.** Yes: client steps
   first (no contract change), then the Worker steps.
3. **Group home rows may show a stale finished count until the next finish.**
   Accept. The group screen itself stays live.
4. **Waiting screens stop polling after 10 minutes and refresh on return.**
   Accept. Async opponents may play tomorrow.
5. **Room-side auth turns 403 into 401 for a valid non-participant token.**
   Accept. No client change, and the home list keeps its matches.
6. **Workers Paid trigger:** any day above 50,000 on DO, Worker or rows
   written, or before a public push. $5 costs less than one day of PvP failing.
7. **Preflights:** consolidate per-round URLs into one action endpoint rather
   than adding a Vercel proxy.
8. **Hold Phase 2.** Revisit only if live duel goes on the roadmap.

## Method notes

- **Measured from code (Opus, line by line):** every route's Worker requests,
  DO calls and SQL rows in `pvp-worker/src/index.js` (59 `sql.exec` sites) and
  `group-room.js` (3), plus client poll timers and gates in `src/pvp/*.js`, at
  commit 300a004. A first draft of the plan existed in the tree from an earlier
  run. This session re-checked its fan-out claims against the source (MatchRoom
  R3 W1 floor, group room R2 W1 floor, N way sync, join/create/rematch DO
  counts, the record fetch on poll, the unpaused match poll, the in-memory
  terminal cache, group polling until EXPIRED, the reveal poll at 5 s) and
  re-did the model and bill arithmetic. All held.
- **Read from the orchestrator's data:** the 10-16 and 10-17 daily totals from
  the brief, and `shots/accounts-phase1/m4-{before,after}.json` (592 W / 1,872
  DO at 08:12 UTC, 720 / 2,198 at 08:26).
- **Read live:** Cloudflare docs, downloaded as markdown at 15:40 UTC on
  2026-10-17: DO pricing (updated 2026-09-30), DO limits, Workers pricing and
  limits, KV pricing, Cache API, DO WebSockets, D1 pricing, Rate Limiting
  binding. Each fact is marked in plan section 3.
- **Estimated, not measured:** behaviour assumptions (section 2b), table sizes
  behind the rows-read growth figure, Worker CPU per request (2 ms assumed; the
  docs cite 2.2 ms as a cross-Worker average).
- **Could not verify:**
  - whether index rows double billed DO rows written (D1 says so, and the DO
    page says its row rules match D1);
  - whether the free daily DO cap counts WebSocket messages at 20:1;
  - which subrequest limit DO stub calls count against (50 or 1,000 internal);
  - whether `cache.put` works on `workers.dev` (the doc is ambiguous);
  - whether the Cache API itself is free;
  - Rate Limiting binding plan availability and price;
  - browser preflight max-age caps.
- No GraphQL pull was run for rows read or rows written, per the plan-only
  scope. That pull is decision 1.
