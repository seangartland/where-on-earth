# Where on Earth: virality review

Date: 2026-10-14. Author: Claude Opus 5.5 (`claude-opus-5-5`), written directly in this run, no delegation. Analysis only: no game code, Worker code or config was changed.

Method: I read `src/main.js` (share builders, streaks, Survival, the PvP and Open Challenge client), `src/daily.js`, the Worker (`pvp-worker/src/index.js`, `group-room.js`, `wrangler.toml`), `vercel.json`, `index.html` meta tags, and the three PvP docs (`pvp-mode-plan-sol.md`, `pvp-tech-spec-sol.md`, `pvp-group-spec-sol.md`), plus `feature-impact-review-opus.md`, `future-features.md`, `daily-archive-design.md` and the 2026-10-14 roadmap brief. Facts marked "in the code" are read from this checkout. Build sizes and spread estimates are my judgment, not measurements. Nothing was built or timed.

## What the spread surface looks like today

Facts from the code that shape every idea below:

- **Daily share** (`shareText()`, `main.js:4884`): `https://where-on.earth`, the date, `Final Score: N` (weighted, out of 10,000), then five lines of base score and emoji tier. This is Sean's finalized text. Every Daily share sends people to the bare home page. It is the highest-volume artifact the game produces, and none of the ideas below change it.
- **Challenge invite links** have the form `www.where-on.earth/pvp/join#invite=<token>`. `vercel.json` redirects `/pvp/join` to `/`. The token is in the fragment, which never reaches a server. So when someone pastes an invite into iMessage, WhatsApp or Discord, the link preview is the generic site card ("A daily geography game. 5 rounds, tap the globe, beat your friends."). The preview never says who is challenging you or that it is a challenge.
- **Open Challenge result share** (`pvpGroupShareText()`, `main.js:7917`) ends with the bare home URL, even while entries are still open. Someone who brags "I placed 2 of 12" in a second chat sends readers to the home page, not into the challenge they could still join. The group spec (section 7) says the share should reuse the group link while entries are open, so this is a gap against the spec.
- **H2H result share** (`pvpShareText()`) also ends with the bare home URL.
- **Postcard share** (`postcardShareText()`, `main.js:10266`): "I got within N km of X on Where on Earth!" plus the home URL. There is no way for the reader to try that place.
- **Survival share** shows rounds survived and the three closest guesses. Runs are random (`survivalPick()` uses `Math.random`), so nobody can play the run that was shared.
- **The free cap**: three open challenges per device, and an Open Challenge holds a slot for up to seven days unless closed (`index.js:143,155`).
- **Image sharing already exists** once: the Passport share renders a canvas to PNG and shares it as a file (`main.js:9121-9136`). That pattern is reusable.

The pattern: the Daily share is strong but ends at the front door, and the social features (challenges, Open Challenge) are mostly separate from the Daily, which is where the daily habit and the group chats already are.

## Ranking

Ranked by expected new players per unit of build effort. Volume matters: an idea that touches every Daily finish beats a better idea that touches only PvP shares, because Daily shares will outnumber challenge invites by a wide margin.

| # | Idea | Size | Rides mostly on |
|---|---|---|---|
| 1 | Daily Board: a standing group board for the Daily | Medium | Open Challenge room pattern, daily pins, scoring parity |
| 2 | Challenge links that preview as challenges | Small-medium | Inspect endpoints, join code |
| 3 | Every result share carries a way in | Small | Existing share builders and links |
| 4 | Release the slot when someone joins | Small | Open-cap reservation code |
| 5 | "Place this one" postcard links | Small-medium | Postcard share, one-off round flow |
| 6 | Seeded Survival: "play my run" | Small-medium | Survival draw, Survival share |
| 7 | Country Blackout share image | Medium | Passport canvas share pattern |

## 1. Top pick: Daily Board

**Mechanic.** Any player can create a Board: one permanent link and six-character code, up to 50 members. Members opt in once, and after that every Daily they finish is posted to each Board they belong to. The results screen shows today's Board under the score: ranked by Final Score, with "not played yet" names listed below, and a Monday-Sunday weekly table where a missed day counts as zero. On Sunday night the weekly winner gets a share card with the Board link.

**Loop.** The creator drops the Board link into the chat where people already paste their Daily results (family, friends, work). Members who already play join with one tap, because nothing about their habit changes: they play the Daily as before and keep pasting the same share text. The Board adds two things the share text cannot. First, a visible "3 of 8 haven't played" list that nudges the stragglers. Second, a weekly result that only exists if you play every day. The weekly winner card goes back into the chat with the join link, and chat members who have been watching the emoji lines for weeks without playing now have a one-tap reason to start. Each new member is likely in other group chats and creates a second Board there. Any player in two Boards links two social graphs.

**Why it is the top pick.** The Daily is the game's main habit, and group chats are where daily games spread. Today the Daily and the social system don't connect: PvP and Open Challenge use their own server-chosen sets, and the Daily is client-only. A Board connects them without touching the Daily or Sean's share text. It runs alongside the existing share rather than replacing it, so nothing that works now is put at risk. It also turns a single share into a weekly one: the share text spreads one day's result, and the Board gives people a reason to come back every day, the weekly card and the straggler list do the recruiting, and every Board is a standing invitation in a chat that already contains non-players. MapTap charges for groups. Keeping the core Board free makes it a reason to choose Where on Earth, and paid extras (longer history, archive days counting toward a separate table) can come later without gating the part that spreads. It is a medium build, but most of the hard parts already exist: the one-link-many-players room, the join code, the 50 cap, the membership index, the device identity and the leaderboard derivation are all in the Open Challenge code.

**Exists vs. to build.**
- Exists: Worker and Durable Objects, `GroupChallengeRoom` as the model (reusable link and code, atomic cap, membership index in `PlayerRecords`, competition ranking), device identity and display names, server scoring (`scoring.js`, with `scoring-parity.mjs` proving it matches the client), the daily pins (same five places per date for everyone), Daily guesses stored in `daily.results`.
- To build: a `BoardRoom` Durable Object (simpler than the group room: no rounds and no timers, just members and one result row per member per date); a submit endpoint that takes the five guesses and recomputes the score on the server from the pinned set for that date; client join landing, opt-in, auto-submit on Daily finish, a Board panel on the results screen and home, and the weekly card.
- Size: medium.

**Risks.**
- The Daily has no timer, so Board scores can include looked-up answers. That is equally true of today's share text. Server recompute at least stops edited totals.
- The server needs each date's five ids, so it depends on the pin backfill fix from the 2026-10-14 brief. If a date was never pinned, the Board cannot verify it. Land the backfill first.
- Device identity: a cleared browser loses membership. Rejoining through the link restores the seat under a new identity but loses old rows. State this plainly in the UI.
- Free tier: each Daily finish is one write per Board plus a few reads. Fine at launch volume, but it is the first feature whose traffic scales with the Daily rather than with PvP, so it brings forward the request-quota triggers in the PvP plan's exit path.
- Name: "Board" is a working name, not a recommendation.

## 2. Challenge links that preview as challenges

**Mechanic.** Give each challenge a short path link, for example `where-on.earth/c/7K2MQR`, built from the join code. A small function at that path asks the Worker's inspect endpoint who created it and returns a page whose preview tags say "Sean challenged you on Where on Earth?" with "Five places, 20 seconds each" (or "Open Challenge: 12 players so far"), then forwards the browser into the existing code-join flow.

**Loop.** The person sending the link is already sending it. What changes is the first thing the recipient sees in the chat: a named, personal challenge instead of a generic site card that looks like an ad. Converting that recipient is the whole point of PvP's acquisition role, and this improves conversion on every invite without asking anyone to do anything new.

**Exists vs. to build.** Exists: join codes, the unauthenticated `inspect` endpoints for both H2H and groups, code entry in the client. To build: the `/c/<code>` route (a Vercel function, which Hobby allows, or a Worker route on a subdomain), two static preview images (Challenge, Open Challenge), and a client path that accepts a code from the URL. Size: small-medium.

**Risks.** Messaging apps cache previews, so a preview showing "12 players" goes stale. Keep the count out, or accept that it ages. The code is already printed in the invite text, so putting it in the path exposes nothing new, but inspect rate limits now also face link-preview crawlers. Do not show the challenger's score in the preview: progressive reveal is built on the invitee not knowing the target in advance.

## 3. Every result share carries a way in

**Mechanic.** Three small changes to the existing builders. The Open Challenge result share uses the group join link while entries are open (as the group spec already says), so "I placed 2 of 12" becomes joinable. The H2H result share offers a "Challenge me too" option that creates a fresh challenge and appends its link. Expedition completion gets a short share ("Finished Capital Cities, 7 of 7 postcards") that links to that expedition.

**Loop.** Result shares are the most-forwarded PvP artifact because people share wins, and they share them beyond the original chat. Today those shares send people to the home page. With a live link, a reader who sees "Sean won by 412" can play Sean immediately, which is the strongest motive a new player has.

**Exists vs. to build.** Exists: all three share builders, the group `shareUrl`, H2H creation. To build: text changes and one optional create step. Size: small.

**Risks.** "Challenge me too" uses one of the sharer's three slots (see idea 4). Keep it a separate button, not automatic, so a plain brag stays a plain brag.

## 4. Release the slot when someone joins

**Mechanic.** Count an H2H challenge against the three-slot cap only until its invitee joins, and an Open Challenge only until its first participant other than the creator joins. Keep the hourly creation rate limit as the spam control.

**Loop.** The people who create the most challenges are the people who spread the game. Today a player who sends three invites is blocked from sending a fourth until one finishes or expires, sometimes seven days later. Freeing the slot as soon as an invite is accepted keeps the best inviters inviting.

**Exists vs. to build.** Exists: the reservation and release paths in `PlayerRecords` (`/reserve`, `/release`, `/group-reserve`, `/group-release`). To build: release on join. Size: small.

**Risks.** This reopens Sean's approved decision 7 (three open challenges, later a subscriber limit of twenty). It weakens the upsell slightly and lets one device keep many live matches. Only Sean can make this call; I'd make it because the cap mostly limits unaccepted invites, which cost the Worker almost nothing.

## 5. "Place this one" postcard links

**Mechanic.** The postcard share links to that place: `where-on.earth/?p=kyoto`. The reader gets a single unscored round on that city: "Sean got within 3 km. Where would you put Kyoto?" Then they see the reveal, with both distances side by side, and a "Play today's Daily" button.

**Loop.** A postcard share is a brag about one place. The reader can answer it in ten seconds, which makes it the cheapest possible first round, and the comparison ("you were 240 km off") makes them want a real game. The Daily button then hands them into the main habit.

**Exists vs. to build.** Exists: postcard share, the one-off round flow that Expeditions use (`oneOff` reveal with no Daily weighting), location data in the client. To build: URL parameter handling, the one-round screen with the sharer's distance, the hand-off button. Optional: per-place preview images through the same function as idea 2. Size: small without previews, medium with them.

**Risks.** Postcard shares are low volume. The round must not earn a postcard, or the link becomes a free-postcard farm. The sharer's distance travels in the URL and can be edited, which is harmless for an unscored round.

## 6. Seeded Survival: "play my run"

**Mechanic.** Each Survival run gets a seed, and the Survival share includes a link that replays the same sequence of places: "I survived 14 rounds. Same places, your turn." The recipient's run-over screen shows how far they got against the sharer's mark.

**Loop.** Survival's number is impressive but not comparable today, because everyone gets different places. A seeded run makes it a direct challenge with no server, and the recipient's own result produces a new seeded link to pass on.

**Exists vs. to build.** Exists: Survival, its share text (not the Daily text, so it can change), a seeded generator in `daily.js` (`randomFrom`, `hashSeed`). To build: replace `Math.random` in the Survival band and place draw with a seeded generator, URL handling, the "vs. mark" line. Size: small-medium.

**Risks.** A known seed shows the sharer's run in order, so a recipient who replays can learn the sequence. That is fine for bragging rights and is why it should never feed a leaderboard. Seeded runs also earn postcards for a known set of places; small, but decide whether seeded runs earn.

## 7. Country Blackout share image

**Mechanic.** When a Blackout run ends, share an image of the globe with found countries blacked out, the count, and the scope (for example "Europe 31/44"), using the same canvas-to-file path as the Passport card.

**Loop.** The image explains itself without a caption, which suits feeds and group chats where the emoji text needs context. People who see a half-dark Europe want to try theirs.

**Exists vs. to build.** Exists: Blackout, its text share, the Passport PNG share pattern. To build: capturing or redrawing the globe state into a card. Size: medium (getting a clean globe image out of the WebGL view is the real cost).

**Risks.** It only reaches Tap the Country players, a secondary mode. Share sheets that do not accept files fall back to text, so the image is a bonus, not a guarantee.

## Rejected

- **Changing the Daily share text** (per-player link, "challenge me" line, image instead of text): Sean finalized it. The bare URL is also part of why it gets pasted: it looks clean and safe. Ideas 1 and 2 add reach next to it, not inside it.
- **Paste-to-compare for the Daily** (paste a friend's share text, see a round-by-round comparison): zero backend, but it only serves people already in the chat, parsing pasted text from every messaging app is fragile, and the Board does the same job properly.
- **Public global Daily leaderboard**: no accounts, no timer on the Daily, and lookups are free. The top of a public board would fill with cheaters on day one, and a public leaderboard doesn't bring in players the way a friend's chat does.
- **Referral rewards** (postcards or cosmetics for invites): device identity makes self-referral trivial, and paying for invites rewards spam over real challenges. It also cheapens the Passport.
- **"Your friend just played" notifications**: no push or email infrastructure, and the plan rejected it for the MVP. The group chat already does this job for free.
- **An official weekly public Open Challenge**: the 50-player cap, no moderation and no account identity make it a cheating showcase rather than a community event.
- **Discord bot or embeddable widget**: real maintenance for a niche channel. Revisit only if Boards show that a specific community wants it.
- **Live duels, spectating, teams**: the PvP plan already defers them, and none spreads better than an async link.
- **More achievements or modes on their own**: no spread mechanic. They keep current players around but don't bring new ones in.

## Suggested order

0. Pin backfill (already the first item in the 2026-10-14 brief, and a hard prerequisite for idea 1).
1. Ideas 3 and 2 together: small, they fix the PvP links that already go out today, and they make every later share better.
2. Idea 4, if Sean reopens the cap decision.
3. Idea 1, the Daily Board, as the main build.
4. Ideas 5, 6 and 7 as filler between larger releases.

All sizes are estimates. Before building idea 1, it would be worth measuring how many Daily finishers currently use the share button, if any analytics exist. I found none in the client.
