# Where on Earth PvP mode: decision plan

Status: plan only. No game or infrastructure changes are included.

## Recommendation

Ship **unrated asynchronous friend challenges first**. One player creates a five-round challenge, plays it, and shares a link or six-character code. The other player plays the same five locations within seven days. Both get a round-by-round comparison and a match winner after both finish.

Back it with a small Cloudflare Worker and one SQLite-backed Durable Object per match. The first release needs ordinary HTTPS requests, not live sockets. The room model still gives Where on Earth a clean path to live duels in phase 2 without replacing the match protocol or moving the static Vercel frontend.

The MVP should have:

- no accounts, global profiles, Elo, public matchmaking, groups, or paid competitive advantage;
- a device identity stored locally, a player-chosen display name, an unguessable challenge link, and a short code for entering on another device;
- five unweighted rounds, 60 seconds per round, the same locations in the same order, and a total out of 5,000;
- server-selected location IDs balanced across the existing difficulty bands, server-recorded starts and submissions, and no claim that the game is cheat-proof;
- one normal rematch button and one best-of-three prompt after a 1-1 split;
- result sharing, but no spectators, chat, friends list, groups, free-for-alls, ranking, or Passport rewards yet.

This is the smallest version worth shipping because it creates the actual social loop, “I played you, here is who won,” while respecting the game's current reality: a static client, no accounts, local-only identity, public answer data, and an existing round flow built around a single player. Live play is more exciting, but it immediately adds presence, synchronization, disconnect rulings, reconnect state, synchronized timers, waiting UX, and low-concurrency matchmaking. Those are the wrong first risks for a game that has never operated a backend.

Success for the MVP means two people can complete the same challenge hours apart, the server accepts each device's result only once, both see the same final comparison, and an expired or malformed link fails clearly. It does not mean creating a trusted competitive ladder.

## Grounding in the current game

`src/main.js` is a client-side mode controller rather than a general match engine. `gameMode` governs screens, while Daily, classic Survival, Tap the Country, Endless, and Expeditions each keep separate state. The guess and reveal path is shared, including great-circle distance and `distanceScore(km)`, which produces a base score from 0 to 1,000. The Daily then applies round weights of 1, 1, 2, 3, and 3. Classic Survival independently draws one of ten difficulty bands and ends on a guess over 150 km. Tap the Country has its own country bands and ends on one miss.

Passport state, Daily history, streaks, best runs, settings, and current-game state all live in `localStorage`. `recordVisit()` writes Passport progress during reveal. There is no player record the server could currently trust or restore. The location catalog is downloaded to the browser, including coordinates, so obscuring a match's five IDs would not hide the answers from a motivated player.

The PvP implementation should eventually add a separate `versus` state object and route its rounds through the shared globe input, distance, and reveal primitives. It should not add PvP branches to the persisted Daily object or pretend local Passport identity is an account.

Two facts in the brief differ from this checkout and must be resolved before build approval:

- The brief says the collection contains 811 city locations. The checked-in `assets/locations.json` contains 779 playable records as of 2026-10-13. Match selection must use the deployed catalog version, not a number hard-coded from either source.
- The brief says the player sees a photo plus place-name clue before guessing. In this checkout, `showRound()` sets the text clue and `revealGuess()` loads the photo into the reveal. PvP should inherit the production round presentation at build time. Sean should separately confirm whether pre-guess photos are intended.

## 1. Format

### MVP: asynchronous friend challenges

The creator starts a challenge immediately and shares it before or after finishing. The invited player can accept at any time during a seven-day window. The challenge is locked to two device identities. A finished player sees “waiting for Sean” and their own result, but not the other player's per-round guesses until the other player finishes. Hiding partial results prevents the second player from knowing the score they need on each round.

Async fits Where on Earth better than live for the first release:

- Sharing a Daily result is already natural behavior for a daily game. A challenge link extends that behavior without requiring two people to be free together.
- It avoids an empty matchmaking problem. Every invite has a known opponent.
- It does not require long-lived connections, reconnect rules, or a second player waiting through the existing reveal and postcard animation.
- It can preserve the game's polished single-player round experience instead of compressing it to keep a live opponent engaged.

### Phase 2: live direct duels

Live duels should use the same match record, location-set generator, scoring, device identity, and result screens. WebSockets add ready state, simultaneous round starts, opponent lock-in status, authoritative deadlines, forfeits, and reconnect handling. Live play unlocks visible tension, short rematch sessions, damage or health presentation, and eventually public events. It should launch as direct invitation only before any public matchmaking.

Do not launch async and live together. That would make it hard to tell whether failures come from the core match design or real-time operations.

## 2. Identity without accounts

On first use, create a random device ID and secret and store both in `localStorage`. Ask for a display name when creating or accepting the first challenge. Store the name locally and copy it into each match participant record. Names are labels, not unique handles. Show a short device suffix only when both players choose the same name, for example `Sean · 7K2`.

A challenge has:

- an unguessable URL token as the primary invitation and authorization mechanism;
- a human-friendly six-character code as a convenience for typing on another device;
- separate creator and invitee participant tokens, never a shared write token;
- a server-side status and expiry.

Opening a creator link on the same device resumes the creator's match. Opening it elsewhere must not silently become the creator. The share link should be an invitation link that can claim only the empty opponent seat. The creator's private resume credential remains in local storage. Codes should be rate-limited and should reveal no match details until accepted.

This provides continuity on one browser, not an account. Clearing site data, using private browsing, changing browsers, or changing devices loses the identity and access to unfinished matches. Display names can be copied. Bans apply to a device token or network pattern and are easy to evade. There is no trustworthy cross-device win record, friend graph, entitlement record, or persistent Elo.

That is acceptable for unrated friendlies. It is not acceptable for a meaningful global ladder. Persistent rated identity, cross-device recovery, subscriptions, durable blocks, and appeals should wait for optional accounts. Do not label a device-only number “Elo.”

## 3. Infrastructure and round dealing

### Options considered

| Option | Cost shape | Complexity | Fit |
|---|---|---|---|
| Pure encoded link, no store | Essentially zero | Lowest | Cannot automatically compare results, reserve two seats, hide the creator's score, expire a challenge reliably, or prevent edited submissions. It produces a puzzle link, not a satisfying versus match. |
| Minimal HTTP store on Cloudflare Worker and Durable Objects | Free-tier friendly at small scale, then usage-based compute and storage | Low to moderate | Best MVP fit. One strongly consistent object owns one match, validates transitions, expires it, and can later accept WebSockets. Static Vercel client calls a separate API origin. |
| Durable Objects with PartyServer | Similar Cloudflare cost, less room boilerplate | Moderate | Good phase 2 option, but use current PartyServer on the project's own Cloudflare account. Hosted PartyKit is shutting down in October 2026, so a new dependency on the hosted service would be a mistake. |
| Firebase Realtime Database plus anonymous auth | Generous small-project allowance, then storage and download charges | Moderate | Quick client integration, but introduces Firebase auth, security rules, and a shared database model before realtime is needed. Its free Realtime Database limit is 100 simultaneous connections, which is awkward for an event test. |
| Supabase Realtime plus anonymous identity/database | Free allowance, then a base plan and realtime overages | Moderate to high | Strong choice if accounts and relational social data are imminent. It is more platform than an async two-seat match needs. Current free limits include 200 concurrent realtime connections. |
| Conventional WebSocket service | Fixed or instance-based hosting plus operations | Highest | Maximum control, but requires process lifecycle, scaling, room routing, persistence, and monitoring. Poor fit for a first backend attached to a static site. |

Cloudflare documents Durable Objects as a fit for multiplayer coordination, makes SQLite-backed objects available on the free and paid Workers plans, and recommends WebSocket hibernation to avoid duration charges while rooms are idle. A single object is also inherently serialized, which simplifies “claim the second seat once” and “submit this round once.” See [Durable Objects overview](https://developers.cloudflare.com/durable-objects/), [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), and [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/). Firebase's current free Realtime Database allowance includes 1 GB stored, 10 GB per month downloaded, and 100 simultaneous connections; Supabase currently lists 200 free concurrent Realtime connections and two million included messages. See [Firebase billing](https://firebase.google.com/docs/database/usage/billing), [Firebase connection limits](https://firebase.google.com/docs/database/faq-and-troubleshooting), [Supabase limits](https://supabase.com/docs/guides/realtime/limits), and [Supabase Realtime pricing](https://supabase.com/docs/guides/realtime/pricing).

### Recommended MVP service

Use a Cloudflare Worker API with one SQLite-backed Durable Object per challenge. Keep the Vercel deployment unchanged except for an API base URL and content-security/CORS configuration.

The object stores only what the match needs: match ID, rules version, catalog version, five location IDs, player names and hashed participant credentials, per-round start and submission timestamps, guesses, server-recomputed distances and scores, status, rematch lineage, and expiry. Apply a retention limit, proposed as deletion 30 days after completion and 7 days after an unaccepted challenge expires. Do not store Passport data, exact device secrets, IP addresses as player history, or general analytics in the match object.

The server chooses the set at creation. The client requests each round as it starts. This does not make coordinates secret because the full catalog is public, but it avoids unnecessarily putting all five answer IDs into the normal UI state at match start. It also lets the server timestamp each round. Cache the five photos or asset URLs normally so image loading does not consume the clock.

For live phase 2, the same object can accept hibernating WebSockets. PartyServer is worth evaluating then as a programming layer, but the hosted PartyKit platform should not be selected because its official shutdown notice says hosted projects and room data are removed on 23 October 2026. See [PartyKit's shutdown notice](https://blog.partykit.io/posts/hosted-platform-shutdown).

## 4. Anti-cheat realism

Where on Earth cannot make browser play cheat-proof. A player can search the clue or photo, inspect network traffic, read the public location JSON, alter client code, call an API outside the UI, use another device, or share answers. Obfuscating IDs or coordinates only slows casual inspection. It does not create security.

The server can still protect match integrity at the protocol level:

- choose the set and recompute distance and score from submitted latitude and longitude;
- allow one accepted submission per participant per round;
- issue server start and deadline timestamps and reject late submissions;
- keep the opponent's guesses and scores hidden until both finish;
- rate-limit challenge creation, code lookup, seat claims, and submissions;
- bind writes to participant tokens and reject impossible state transitions;
- record client version and coarse integrity flags for diagnosis, not as proof of cheating.

The timer is a pace rule, not an anti-lookup guarantee. Backgrounding the tab must not pause it. The client should use the server deadline and a monotonic local display; the server decides whether a submission was on time. Give a small fixed network grace, such as two seconds, only to submissions sent before the visible deadline. Test this under slow mobile networks before setting the final value.

MapTap's decision to deal all five locations at match start avoids between-round latency but exposes every answer early. Its “disconnect equals loss, no reconnect” rule closes one specific exploit in a live rated context at a high fairness cost. Do not import that rule into the async MVP. Async players are expected to leave and return between rounds, but an already-started round's 60-second server deadline continues. If the network fails, that round receives zero after the deadline; later unstarted rounds remain playable.

Friendly play needs proportionate controls and honest copy: “For fun with friends. Please do not look up answers.” No invasive telemetry, webcam, tab-locking, or punitive global bans.

Rated play would need accounts, server authority, live synchronized rounds, strict reconnect and forfeit rules, abuse reporting, moderation, anomaly review, and a published competitive policy. Even then it would deter cheating rather than prevent it. Do not add rating until those costs are accepted.

## 5. Match design

### Set selection

Use five distinct, playable city locations from the deployed catalog. Exclude landmarks and any production exclusions that apply to the Daily. Generate this fixed difficulty pattern:

1. one location from bands 1–2;
2. one from bands 3–4;
3. one from bands 5–6;
4. one from bands 7–8;
5. one from bands 9–10.

Randomize their play order so the match does not always ramp upward. Enforce five distinct countries where the pool permits it. Avoid repeating a location either participant has faced in the immediately preceding rematch or rubber match. Do not personalize based on either device's Passport because local collections differ, can be edited, and are unavailable to the service. A rules version and catalog version make old matches reproducible after the location file changes.

This pattern makes each match broad and legible without pretending the bands are perfectly equal measures of head-to-head difficulty. Before build, measure how many eligible records exist in each paired band and how often the country constraint needs a fallback.

### Scoring and winner

Use each round's existing unweighted base `distanceScore`, rounded to 0–1,000. Add all five for a total out of 5,000. Highest total wins.

Do not use the Daily's 1, 1, 2, 3, 3 weights. They make late rounds dominate and would combine unpredictably with a randomized difficulty order. Do not use per-round wins, which discard meaningful distance margins and create ties. Do not use damage in the MVP. Health bars are excellent live theater, but damage conversion, healing, comeback multipliers, and early knockouts obscure the direct connection to the score players already understand.

Show both players' score, distance, and map pins after both have submitted that round, or in async play after both have finished the full match. The result screen leads with total score and margin, then a five-row comparison.

Photo-finish protection should affect rating, not the winner. In unrated MVP play, a one-point win is still a win and is labeled “Photo finish.” Use a provisional threshold of **10 total points or fewer out of 5,000**. This is close enough to feel exceptional while allowing for integer rounding. If rating is later added, matches within that threshold should count as a draw for rating purposes, not “half Elo.” Elo updates are already proportional to actual versus expected outcome; arbitrarily halving a normal update is harder to explain and tune. Sean can revisit the threshold using the observed distribution of match margins.

### Timer

Use 60 seconds per round from the server acknowledging the round start. The clock continues while the tab is hidden. A player may leave between rounds indefinitely until the seven-day match expiry. The first round should not start merely by opening the invitation; it starts only after the player presses “Start match.”

### Tap the Country

Tap the Country can work as a later PvP variant, but not with one-miss-eliminates-the-run rules. Both players should receive the same ten countries, selected across the country difficulty bands, with 15 seconds each. A correct tap earns one point; ties break by total response time on correct answers. This is simple, scales to groups, and is more suitable for a future free-for-all than distance scoring.

Keep it out of the MVP because it needs a separate set generator, score model, result comparison, and fairness testing for small countries and tap tolerance. It also earns no Passport postcard today because there is no city location behind the answer.

### Rematches

The result screen offers “Rematch” to either player. It creates a linked challenge with the same rules and new locations, preserving seat order only for display. If the series becomes 1-1, label the next rematch “Decider” and show the best-of-three series score. Stop automatic series framing after the decider. Players may still rematch normally. Do not create simultaneous open rematches: the first accepted rematch becomes canonical for that match pair.

## 6. Social, retention, and Passport

The MVP social object is the challenge, not a friend account. Recent opponents can be listed locally from completed matches, with “Challenge again.” This convenience disappears with browser storage and does not imply mutual friendship or online presence.

Share cards should include both display names, final score, margin, series score when relevant, and a “Play me” challenge link only when the sharer explicitly creates a new open challenge. Do not put answer locations or round scores in a share preview while a match is unfinished.

Defer these features in this order:

1. **Groups and multi-attempt challenges:** phase 2 can let one seed set accept up to a capped number of entries and show a leaderboard after each player finishes. This directly answers the strongest stated community demand and works asynchronously.
2. **Scheduled free-for-alls:** phase 3, after live rooms and operational monitoring are proven. Start with announced windows, not continuous queues, so players concentrate at the same time.
3. **Teams and tag-team:** phase 3 or later. They require accounts or stable group membership, presence, team communication rules, and careful scoring.
4. **Spectating:** after live play is healthy. Delay spectator state by one round or until both guesses lock to prevent answer leakage. Read-only result sharing provides most of the early value at far lower risk.

PvP rounds should **record a visit and best accuracy locally, but should not award or upgrade postcards**. The Passport is a long-term collection across the location catalog. Unlimited rematches would let two friends farm five known postcards repeatedly, weakening both the collection and any future subscription value. Recording a visit keeps the globe and personal history truthful without turning PvP into the optimal collection grind. The result reveal may show “Visited” but should not run the postcard earn animation. Daily and classic Survival remain the postcard-earning modes.

If Sean wants PvP to contribute more strongly later, use a capped separate reward such as one cosmetic versus stamp for completing a weekly challenge. Do not make ordinary location postcards dependent on winning, because that would punish the weaker friend and encourage boosting.

## 7. Monetization fit

Free players need a complete social loop. Recommend:

- free: create up to three open async challenges at once, accept unlimited direct invites, complete unlimited accepted matches, rematch, and share results;
- subscriber: up to twenty open challenges, saved match history beyond the local recent list once accounts exist, group challenges, group administration, private group leaderboards, and expanded event creation when those features ship;
- available to everyone: fair scoring, the same location pool, normal timers, live direct invitations when phase 2 ships, and entry to official scheduled events.

An “open” challenge is created and not yet completed or expired. The cap controls backend clutter and mirrors real utility rather than rationing completed play. Never sell stronger hints, more time, better matchmaking, rating protection, or access to harder locations. Do not charge either participant merely to accept a friend's direct challenge. A subscriber may sponsor the higher capacity of a group or event, but invitees should be able to participate free.

Because there are no accounts today, the MVP should not attempt subscriber entitlements inside PvP unless the general subscription system already supplies a server-verifiable entitlement token. A localStorage premium flag is not adequate. Launch the three-open-challenge free limit first, and activate the subscriber limit only when general identity and billing can enforce it across devices.

## 8. Roadmap

### MVP: async direct challenge

Scope:

- Cloudflare Worker plus one Durable Object per match;
- device ID and display name stored locally;
- invitation URL and short code;
- two players, five balanced city rounds, 60 seconds each, seven-day expiry;
- server selection, round deadlines, result validation, and total-score winner;
- waiting, final comparison, share, rematch, and best-of-three decider;
- local recent opponents;
- visits but no postcard earning;
- basic rate limits, retention deletion, service metrics, and a kill switch that hides challenge creation if the service is unhealthy.

Verification gate: test challenge claim races, duplicate submission, expired rounds, expired matches, refresh between rounds, cleared localStorage, slow and lost mobile connections, catalog changes, same display names, score recomputation, result privacy before completion, and all five difficulty-pair fallbacks. Run a small invitation-only beta before putting PvP on the home screen.

### Phase 2: strengthen the friend network

- live direct duels over Durable Object WebSockets;
- ready checks, simultaneous starts, opponent lock state, constrained reconnect, and live rematches;
- async group challenges and leaderboards;
- optional accounts, only if the general product adopts them, with device-to-account linking and block/report tools;
- match history and group subscriber benefits;
- test the ten-round Tap the Country variant;
- observe match margins, completion rate, invite conversion, timeout rate, rematch rate, and support burden before considering rating.

Live reconnect recommendation: allow one reconnect to the same round while its original deadline continues. Do not pause the opponent or reset the timer. A player absent at deadline scores zero for that round. Repeated absence can forfeit the match after two missed rounds. This is fairer for mobile browsers than immediate disconnect loss and still removes any benefit from disconnecting.

### Phase 3: competitive and event play

- scheduled free-for-alls, initially Tap the Country because its discrete answers and short rounds fit large rooms;
- team and tag-team experiments inside established groups;
- delayed spectating;
- public matchmaking only if concurrency supports acceptable waits;
- a rated queue only after accounts, moderation, reconnect policy, anomaly review, and enough match volume exist;
- if rating ships, separate it from Friendlies, treat photo finishes as rating draws, and publish placement and inactivity rules.

## Main risks

1. **The async loop may lack urgency.** Measure invite acceptance, time to completion, and rematch rate. Strong waiting and result notifications are limited without accounts or push permission.
2. **Cheating may poison perceived fairness.** Position MVP as friendlies, keep opponent details hidden until completion, and do not add rating prematurely.
3. **Backend operations are new for this product.** Start with HTTP, strict match schemas, retention, spending alerts, rate limits, health metrics, and a client fallback that leaves all single-player modes usable during an outage.
4. **The existing round UX may be too slow for live play.** Postcard and flyover animations are a reward in solo play but waiting costs in live play. Phase 2 needs measured, synchronized reveal pacing or a shortened versus reveal.
5. **No-account identity is fragile.** Make loss and non-portability clear. Do not build social promises that device identity cannot keep.
6. **Difficulty bands may not yield fair sets.** Both players receive the same set, so direct fairness is strong, but repeated high-variance matches can feel arbitrary. Analyze match outcomes by band before changing selection or scoring.
7. **Catalog and clue assumptions are unsettled.** Resolve the 779-versus-811 count and pre-guess-photo discrepancy before implementation estimates are approved.

## Decisions Sean must make before build approval

1. Approve async unrated direct challenges as the MVP, with live direct duels deferred to phase 2.
2. Approve a separate Cloudflare Worker and Durable Objects service alongside the static Vercel frontend.
3. Confirm that five unweighted rounds and total score out of 5,000 should replace Daily weighting in PvP.
4. Confirm 60 seconds per round, a seven-day match expiry, and zero for a started round that times out.
5. Confirm the photo-finish label at 10 points or fewer, with no special effect until rating exists.
6. Confirm that PvP records Passport visits but cannot earn or upgrade postcards.
7. Confirm the free cap of three open challenges and defer subscriber enforcement until server-verifiable subscriptions exist.
8. Resolve whether production PvP presents a photo before the guess and which deployed catalog count/version is authoritative.
9. Decide whether the MVP needs notifications beyond share links and in-app status. Email or push would materially expand identity, consent, and infrastructure scope and is not recommended for the first release.

## Decisions recorded (Sean, 2026-10-13)

1. **Format: APPROVED.** Async unrated direct challenges as the MVP, live direct duels deferred to phase 2.
2. **Infrastructure: APPROVED (Sean, 2026-10-13).** Proceed with the Worker + Durable Objects setup. Sean's follow-up question is answered by design: a Durable Object per match holds that match, but pair records (your running W/L against a specific player) live in a separate persistent records store keyed by player token, written when a match completes, so they survive match expiry. Retention is not limited to one game.
3. **Scoring (five unweighted rounds, total out of 5,000): APPROVED (Sean, 2026-10-13).**
4. **Timer and expiry: DECIDED.** 20 seconds per round (Sean, replacing the proposed 60). Seven-day match expiry approved. A started round that times out scores zero (bundled in the question Sean answered; recorded as carried unless he objects).
5. **Photo finish: REJECTED.** No photo-finish label and no threshold effect. Close matches are just close.
6. **Passport: DECIDED.** PvP does not earn postcards. (Visit recording stays at the plan's default, recorded visits, unless Sean says otherwise.)
7. **Free cap: APPROVED.** Three open challenges for free players; subscriber enforcement deferred until server-verifiable subscriptions exist.
8. **Photo and catalog: RESOLVED.** The live game presents the photo before the guess (the plan's code read was wrong on this point), and the authoritative catalog is the 811 locations deployed 2026-10-13.
9. **Notifications: APPROVED as recommended (Sean, 2026-10-13).** None beyond share links and in-app status for the MVP.

All nine decisions are settled. The next artifact is a technical specification for the match state machine, HTTP contract, data retention, and client integration points. It should still precede any implementation.

## Scaling and exit path for player records (Sean's concern, 2026-10-13)

Sean flagged that pair-keyed records grow combinatorially as the player base grows, and asked for a plan to move that store off Workers when it outgrows the free tier. The honest shape of the problem:

- Pair rows only ever exist for pairs who have actually played each other, and each row is a few hundred bytes, so raw storage is not the wall (the free 5 GB holds millions of records).
- The real walls are the free plan's 100,000 requests/day shared across everything, and one records object serializing every write through a single instance.
- Step 1, still on Cloudflare: shard records per player (keyed by player token, one row per opponent, in D1 or per-player objects). Writes spread across players instead of funneling through one object, and growth stays linear in matches actually played.
- Step 2, off Workers (the exit Sean asked for): the client only speaks HTTP to a versioned contract, so the backend is replaceable without a client rewrite. Target is a small SQLite or Postgres service on Sean's own hardware (the Pi already runs cloudflared, which can expose it through a tunnel with no open ports) or a cheap VPS. Migration is a table export (SQLite out, SQLite in) plus an endpoint cutover.
- Move triggers: sustained volume above roughly 1,000 matches/day, record writes becoming a latency problem, or the free request quota being hit more than once in a week.
- The MVP ships with the simple pair-records object anyway. At launch volumes it is nowhere near any of these walls, and the contract-first design is what keeps the exit cheap.
