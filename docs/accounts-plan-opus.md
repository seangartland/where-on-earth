# Where on Earth: accounts plan

Date: 2026-10-16 · Author: Claude Opus 5.5, written directly in session (no delegation)
Status: PLAN ONLY. No code or data changed.

Method: every claim about the current codebase below comes from reading the repo at commit `04b7299` (`src/core/config.js`, `src/core/storage.js`, `src/meta/passport-store.js`, `src/meta/passport.js`, `src/meta/stats.js`, `src/modes/*.js`, `src/pvp/api.js`, `src/pvp/home.js`, `src/main.js`, `src/daily.js`, `src/modes/weekly.js`, `index.html`, `vercel.json`, `deploy.sh`, `pvp-worker/` and the PvP docs) and from the Cloudflare deploy helper `~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py`. Clerk facts in Appendix A were read from Clerk's live pages on 2026-10-16 by the session that wrote the first draft. The session that wrote sections 2 to 8 had no web access (WebFetch and WebSearch were not permitted), so every other price or vendor limit is from the author's knowledge (training data to mid-2026), marked "(unverified)", and listed for a live recheck in section 2e before Sean decides. Byte sizes are my estimates from sample JSON, labelled as estimates. Recommendations marked (judgment) are mine.

## 1. Inventory: player state today

Everything a player has lives in their browser. There is no account, no server copy of any single-player progress, and the only server-side identity is the PvP Worker's device token. The Settings "Reset" danger button (`src/main.js:516`) deletes every `localStorage` key starting `where-on-earth-`, so today one tap, a cleared browser, private mode or a new phone wipes everything.

`config.js` calls the key names and saved shapes "a contract with players' phones". Seven keys are versioned (`VERSIONED_KEYS`, `_v: 1`) and get `storage.js` guards: JSON-only writes, refuse suspicious empty writes, refuse any passport write that shrinks the entry count, and preserve a corrupt value to `<key>.corrupt-backup` instead of overwriting it. The other keys are raw strings or unguarded JSON.

### 1a. Progress keys (the things a player would be upset to lose)

| Key | Written by | Shape | Growth | Account owns? |
|---|---|---|---|---|
| `where-on-earth-passport-v1` | `recordVisit()` in `meta/passport-store.js`, every scored reveal except Trivia | `{ v: 2, visits: { id: base0to1000 }, order: [id...], meta: { id: { b, d, f, t, e, ea, eb1, eb2, eb3 } }, _v: 1 }`. `b` best base score, `d` closest km, `f` first-visit local date, `t` last visit ms, `e` earned tier 1 to 3 (near, bullseye, pinpoint), `ea` first earn ms, `eb1..eb3` first time each tier was reached. Visits logged before `meta` shipped have no meta entry (legacy, undated). | One entry per distinct place, never per play. Capped by content: 805 cities in `assets/locations.json` plus 427 landmarks in `assets/locations-landmarks-sol.json`, so at most 1,232 entries. `order` is capped at 240 ids. Estimate: about 160 bytes per entry, so roughly 200 KB for a player who has seen everything, 10 to 30 KB for a typical player. | **Yes.** The core collection and the main thing worth an account. |
| `where-on-earth-history-v1` | `recordHistory()` in `meta/stats.js`, once per finished Daily | `{ _v: 1, entries: [ { date, total, rounds: [ { base, score, distance } x5 ] } ] }` | One entry per Daily played, trimmed to the last 365 (`HISTORY_LIMIT`). Estimate 250 bytes each, about 90 KB at the cap. Only collects from the first game after it shipped. | **Yes.** Feeds Stats (averages, histogram, longest run). |
| `where-on-earth-streak-v1` | `finishStreak()` in `modes/daily-game.js` | `{ last: 'YYYY-MM-DD', count, _v: 1 }`; extends only when `last` was the local day before | Constant size | **Yes**, with the merge rule in section 4. Note the count can predate history, so it cannot be rebuilt from history alone. |
| `where-on-earth-v1` (`GAME_KEY`) | `saveDaily()` after every Daily round | `{ date, ids: [5 ids], round, results: [ { guess, distance, score, base, distanceExact, postcard } ], complete, _v: 1 }` | Current day only; `loadDaily()` replaces it when the local date rolls | **Yes, the finished or in-progress result for the day** (so a second device shows "played" and cannot replay seen places). The `ids` are derived from the date, not owned. |
| `where-on-earth-expedition-v1` | `completeExpeditionRound()` in `modes/expeditions.js` | `{ progress: { expeditionId: { completed, complete } }, _v: 1 }` | 4 expeditions in `assets/expeditions.json`, 7 stops each | **Yes.** |
| `where-on-earth-weekly-v1` | `completeWeeklyStop()` | `{ weeks: { 'Monday YYYY-MM-DD': { route, played: { stopIndex: dateKey }, badge } }, _v: 1 }` | One entry per week played, never trimmed. Week 0 is Monday 2026-10-19 (`weekly.js`), so this key is about to start growing. Estimate 150 bytes a week, under 8 KB a year. | **Yes.** It is also the data the planned paid catch-up and archive (`docs/expeditions-rethink-opus.md`, recommendation 11) would gate. |
| `where-on-earth-survival-best-v1` | `modes/survival.js` via `safeSetItem` | Raw integer string | Constant | **Yes** (all bests: max wins). |
| `where-on-earth-best-landmarks-survival` | `modes/landmarks.js` (shares `survivalBest()`) | Raw integer string | Constant | **Yes.** |
| `where-on-earth-best-trivia` | `modes/trivia.js` | Raw integer string | Constant | **Yes.** |
| `where-on-earth-countries-best-v1` | `modes/tap-country.js` (Survival: Tap the Country) | Raw integer string | Constant | **Yes.** |
| `where-on-earth-blackout-best-v1-<scope>` | `modes/blackout.js`, one key per scope: `world` plus one per continent with enough countries (`world`, `africa`, `asia`, `europe`, `north-america`, `south-america`, `oceania`, as present) | Raw integer string, countries found | Up to 8 keys | **Yes.** |

Endless writes only the passport (visit, no postcard). Trivia never records a visit (`round.js`: "Trivia is score-only"). PvP records each accepted round's visit once and never awards postcards.

### 1b. PvP identity (device-bound by design)

| Key | Shape | Notes | Account owns? |
|---|---|---|---|
| `where-on-earth-pvp-v1` (`src/pvp/api.js`) | `{ playerId: 'plr_...', playerToken, displayName, matches: [ { matchId, visited: [], ... } ], groups: [ { challengeId, ... } ], _v: 1 }` | Created lazily by `pvpEnsureIdentity()` on the first create or join (`POST /v1/players`). `matches` and `groups` are capped at 30 each (`PVP_MATCH_LIMIT`). Not in `VERSIONED_KEYS`, so no empty-write guard. `docs/pvp-tech-spec-sol.md` line 108 states the intent: no account, no recovery, losing the token loses access to unfinished matches and pair records. | **The link, not the token.** The account maps to one or more `playerId`s on the server (section 5). The raw token stays on the device. |
| `where-on-earth-pvp-invite` in **sessionStorage** (`src/pvp/home.js`) | The invite token from `#invite=` held across a reload | Tab-scoped, transient | No. Device. |

Server side, the `woe-pvp` Worker (`pvp-worker/`, live at `woe-pvp.gartland-79.workers.dev`) stores, in SQLite-backed Durable Objects:
- `PlayerRecords`, **one global instance** (`idFromName("global")`, `pvp-worker/src/index.js:55`): tables `players (player_id, token_hash UNIQUE, created_at, display_name)`, `pair_records` (W/L/ties/points per pair of player ids), `completion_ledger`, `invitations`, `open_matches`, `open_groups`, `group_memberships`, `group_invitations`, tombstones and `rate_limits`.
- `MatchRoom`, one per head-to-head match: the whole match state as one JSON row; each seat stores the player's `tokenHash` and `participant()` checks it on every request. Purged after expiry (7 days).
- `GroupChallengeRoom`, one per Open Challenge.

The token itself is never stored server-side, only `HMAC(PLAYER_TOKEN_KEY, token)`. This matters for section 5: the server cannot hand an existing token to a second device.

### 1c. Device preferences (stay on the device)

| Key | Shape | Why it stays local |
|---|---|---|
| `where-on-earth-muted` | `{ _v: 1, muted }` (legacy `'1'`/`'0'` migrated) | A phone on a train and a laptop at a desk want different answers. |
| `where-on-earth-reveal-view` | `'flyover'` or `'north-up'` | Per-device taste; cheap to set again. Candidate for sync later only if players ask. |
| `where-on-earth-passport-status` | JSON array of `earned`/`seen`/`unvisited` filters | UI state. |
| `where-on-earth-collapsed-continents` | JSON array of continent names | UI state. |
| `where-on-earth-passport-view` | `'places'` or `'countries'` | UI state. |
| `where-on-earth-collection-sort` | One of `completion`, `earned`, `closest`, `alpha` | UI state (Collections is hidden today). |
| `where-on-earth-audit-flags`, `where-on-earth-flags-wiped-v1` | Retired audit mode (`src/modes/audit.js`, quarantined 2026-10-12) | Internal tooling, never synced. |
| `<key>.corrupt-backup` | Raw corrupt value | Recovery copy. The merge in section 4 should read it as a last resort, never upload it blind. |

### 1d. What the inventory implies

- **Small data.** A heavy player's whole progress is a few hundred KB, a typical player's well under 50 KB. Sync can send whole documents at sign-in and small deltas per play; no paging or blob storage is needed.
- **Merge-friendly by construction.** Almost every field is a max, a min, a union or a "first value wins": best score, closest km, earned tier (never downgraded, `readPassport()`), first-earned dates, bests, played stops. That is what makes a lossless guest merge possible (section 4). The two exceptions are `visits[id]` (latest score, drives dot colour) and the streak, which need explicit rules.
- **Dates are the player's local calendar.** `localDateKey()` (`core/format.js`) builds the Daily date, the streak, the first-visit date and weekly stop dates from the device clock. `dayNumber()` (`daily.js`) maps a key to the same game in every timezone. Section 5 keeps this.
- **The "contract" holds.** An account layer must read and write these exact keys and shapes. It is a sync layer beside the existing storage, not a replacement of it, so a signed-out player's game is byte-for-byte today's game.

## 2. Provider shootout

This section gates everything after it. Candidates: **Clerk**, **Supabase Auth**, **Firebase Auth**, and a **Worker-native** route on the existing `woe-pvp` Cloudflare Worker (the auth library better-auth with Cloudflare D1, or hand-rolled email codes and passkeys on the same Worker).

### 2a. Facts about this stack that decide the comparison (verified in the repo, 2026-10-16)

1. **No framework, no bundler for the app.** `index.html` loads `src/main.js` as an ES module with an import map pointing `three` and `topojson-client` at `vendor/`. Any client SDK must load as a plain script or ES module, or be vendored once into `vendor/`.
2. **A backend already exists and already issues bearer tokens.** `src/pvp/api.js:69` sends `authorization: Bearer <playerToken>`, with the token kept in `localStorage` (`where-on-earth-pvp-v1`). The Worker stores only an HMAC of it. Whatever provider wins, this Worker has to trust an account session, because the account-to-`playerId` link, entitlement checks for paid features and push subscriptions all sit beside PvP data.
3. **The Worker deploy path cannot take npm dependencies or D1 today.** `cf_api.py deploy` uploads every `pvp-worker/src/*.js` file unbundled, with a hard-coded binding list of the three Durable Object classes (`MATCHES`, `RECORDS`, `GROUPS`), no D1 binding and no compatibility flags. Wrangler's OAuth login does not complete in this VM (`pvp-worker/README.md`), but `npm run check` (`wrangler deploy --dry-run`) bundles locally. So any npm library inside the Worker means: bundle with Wrangler locally, then teach `cf_api.py` to upload the bundle and a D1 binding. That is a one-time change, but it is a change to a deploy path that works.
4. **The Worker is on another site.** It answers at `woe-pvp.gartland-79.workers.dev`; the game is `www.where-on.earth` (`DEFAULT_ORIGINS`, `pvp-worker/src/index.js:10`). A cookie set by the Worker is third-party on the game page and Safari blocks it. Bearer tokens (today's PvP pattern) avoid cookies entirely. Whether the `where-on.earth` DNS zone is on Cloudflare, which would allow a same-site `api.where-on.earth` route, could not be determined from the repo or this VM (the sandbox resolver returns proxy addresses). That is a question for Sean, but the recommendation below does not depend on it.
5. **The "installed app" is minimal.** There is no web app manifest and no service worker; home-screen mode comes only from `<meta name="apple-mobile-web-app-capable">` (`index.html:31`). On iOS a home-screen web app keeps its storage separate from Safari, so a session created in Safari does not appear in the home-screen app (author's knowledge, consistent with the existing iOS cache-buster in `index.html`; test on device). Web push on iOS needs a manifest, a service worker and a home-screen install, none of which exist yet (section 6).
6. **Guests are already complete without a server identity.** Every single-player key is local (section 1). Guest-first therefore does not need a provider's anonymous-user feature: a guest is a device with no account. A provider's anonymous users are a nice-to-have, not a criterion that can decide the pick.

### 2b. The cross-cutting finding: no full-page redirects

Full-page OAuth redirects leave the game's origin. In an iOS home-screen app, an out-of-scope navigation opens in an in-app browser sheet, and whether the resulting session lands back in the app's own storage is unreliable (author's knowledge; not tested here, must be tested on Sean's iPhone in Phase 0). Magic links have the same flaw in a worse form: the mail app opens the link in Safari, whose storage is not the home-screen app's.

Flows that never leave the page are safe in every context:
- **Email one-time code**, typed where the player already is (iOS offers to autofill codes from Mail).
- **Google Identity Services** button or One Tap, which returns a signed ID token to the page.
- **Sign in with Apple JS** with `usePopup: true`, which returns an ID token to the page.
- **Passkeys** through `navigator.credentials` (WebAuthn), entirely in-page.

So the design rule, for any provider: **email code plus ID-token sign-in for Google and Apple, passkeys as an upgrade, and no redirect or magic-link flows.** Each candidate is judged on whether it supports that set.

### 2c. Scorecard

Legend: facts verified in this repo are unmarked; Clerk facts from the first draft's live read are marked (live 2026-10-16); everything else is (unverified) and listed in 2e.

| Criterion | Clerk | Supabase Auth | Firebase Auth | Worker-native (better-auth + D1) |
|---|---|---|---|---|
| Fit with a framework-less static client | Good. Two script tags from the Clerk Frontend API host, no build (live 2026-10-16). | Good. `supabase-js` loads as an ES module from a CDN or vendored into `vendor/` (unverified). | Good. Modular SDK loads as ES modules from Google's CDN (unverified). | Good. Skip the client library and call about six JSON endpoints with `fetch`, the same way `src/pvp/api.js` talks to the Worker today (judgment). |
| Installed iOS app (2b) | Email code: yes. Google One Tap: yes (`authenticateWithGoogleOneTap`, unverified). Apple: redirect flow as far as the author knows (unverified), so weak in the home-screen app. Session is first-party cookies on a `clerk.` custom domain, which needs a CNAME on `where-on.earth` (A1). | Email code: yes. Google and Apple ID tokens: yes (`signInWithIdToken`, unverified). Session stored in `localStorage` by default (unverified). | Email: magic link only, no email code for primary sign-in (unverified), which fails 2b. Redirect sign-in on Safari needs the auth handler proxied onto the app domain (`/__/auth/*` rewrite in `vercel.json`, unverified). ID-token credentials work. | Email code: yes (better-auth email-OTP plugin, unverified). Google and Apple ID tokens: yes (social `idToken` sign-in, unverified). Bearer session in `localStorage`, identical to today's PvP token. |
| Guest-first, anonymous play | No anonymous users (unverified); fine per 2a.6. | Anonymous sign-ins, convertible later, counted as MAU (unverified). Not needed. | Anonymous auth with account linking (unverified). Not needed. | Anonymous plugin exists (unverified). Not needed; a guest is a device. |
| Methods for a casual mobile audience | Email code, Google, Apple on Hobby (3 social connections max); passkeys are Pro only (live 2026-10-16). | Email code, Google, Apple. Passkey support for primary sign-in: unknown (unverified). | Google, Apple, email link. No passkeys (unverified). | Email code, Google, Apple, passkeys, all as plugins (unverified). Needs our own email sender. |
| Cost at plausible scale (say 2,000 to 50,000 signed-in players a month) | Hobby is free, with a retained-user cap the author recalls as 50,000 (unverified). But the Hobby session lifetime is a fixed 7 days and custom lifetime and passkeys are Pro only (live 2026-10-16). A daily-game audience asked to sign in weekly is a real cost, so realistically Pro at about $25 a month (unverified). | Free to 50,000 MAU, but free projects pause after a week without activity and the built-in mail sender is rate limited for production, so custom SMTP is required (unverified). Pro about $25 a month (unverified). | Free to 50,000 MAU for standard providers (unverified). | $0 per user. Workers Free gives 100,000 requests a day, shared with PvP (`pvp-worker/README.md`, verified there 2026-10-13). D1 free tier about 5 GB and millions of row reads a day (unverified). Workers Paid is $5 a month if needed (README). An email sender's free tier, for example Resend's (unverified). |
| Any provider, production Apple sign-in | Needs Sean's Apple Developer Program membership, about $99 a year (unverified). Same for all four. | same | same | same |
| Data ownership and exit cost | Users live in Clerk. Export exists; Google and Apple links re-attach by verified email after a move (unverified). User ids change on exit, so our tables must key on our own account id, never the vendor's. | Open source; auth schema is plain Postgres and dumps with the database (unverified). Lowest exit cost of the hosted three. | Export via CLI (unverified). Proprietary; Firestore data model is the bigger lock-in. | Every row in Sean's D1. Exit is a SQL dump. |
| Payment enablement | Clerk Billing (Stripe underneath, plus a Clerk fee the author recalls as 0.7%, unverified) or Stripe direct. | Stripe direct, webhook into a function or the Worker. | Stripe direct or the Stripe extension writing to Firestore (unverified). | Stripe direct: Checkout plus a webhook to the Worker writing an entitlement row in D1. better-auth has a Stripe plugin (unverified). |
| Operational burden on a solo builder | Lowest auth code. Adds a vendor, a dashboard, a DNS record and JWT verification in the Worker (about 50 lines hand-written, because the Worker is unbundled, A1). | A second backend (Postgres with row-level security) beside the Worker unless used for auth only; SMTP setup; the pause rule. | A Google Cloud project, the auth-handler rewrite, and a second datastore. | Highest up front: we own the security surface (rate limits on code requests, session rotation), the deploy change in 2a.3, D1 migrations, and sender DNS (SPF and DKIM). Lowest ongoing: no new vendor beyond the email sender. |
| Sean's experience | Has shipped Clerk on FFO. Real, saves ramp-up. | None known. | None known. | None with better-auth; but the Worker and its deploy path are already his. |

### 2d. Recommendation

**Worker-native: better-auth on the existing Cloudflare stack, with a D1 database, bearer-token sessions, email code plus Google and Apple ID-token sign-in at launch, and passkeys as an upgrade.** (judgment)

Why, each reason tied to a fact above:
1. **The Worker has to enforce accounts anyway** (2a.2). Account-to-`playerId` links, Daily verification for any future leaderboard, paid entitlements and push subscriptions all live there. With a hosted provider there are two identity systems and a sync between them (JWKS verification plus a user mirror). Worker-native has one.
2. **It matches the pattern already shipped.** A bearer token in `localStorage` is exactly how PvP authenticates today (`src/pvp/api.js:69`). No cookies means no third-party-cookie problem on `workers.dev` and no dependency on the DNS question (2a.4).
3. **It gets every method 2b wants at no per-user cost,** including passkeys and a session lifetime we choose (rolling 90 days, section 3). On Clerk the same set needs Pro (live 2026-10-16).
4. **Exit cost is zero.** All account data is in Sean's D1.
5. **The sign-in UI has to be ours regardless.** The game's visual bar is high, and the weakest part of the Clerk draft (A2) was a hosted modal inside a styled game. better-auth is headless, so the sheet is built from the game's shared overlay classes from the start.

The honest costs: more to build (section 7 estimates about 3 to 4 build sessions more than Clerk for the auth layer: the scout, the auth endpoints and bundled deploy, the custom sheet, passkeys), a security surface we own (mitigated by using a maintained library rather than hand-rolling), and the deploy change in 2a.3.

**better-auth over hand-rolled:** the error-prone parts (one-time-code attempt limits and expiry, session rotation, linking a Google and an email identity that share an address, the passkey ceremony, Apple's client-secret JWT) are exactly what a library has already been through. Hand-rolled stays the fallback.

**Phase 0 scout gates the pick** (section 7). Workers Free allows about 10 ms of CPU per request and a capped script size (unverified). A test Worker must show better-auth plus D1 bundled under the size cap, typical auth requests under the CPU limit, and an email-code and a Google sign-in completing inside the iPhone home-screen app. If better-auth fails the CPU or size test, fall back to a hand-rolled minimum on the same D1 (email code, Google and Apple ID-token verification with WebCrypto against their published keys, passkeys later). If the iPhone test shows a flow that no Worker-native variant can make work, Clerk takes over.

**What would have to be true for a different pick to win:**
- **Clerk** (runner-up) wins if Sean would rather pay about $25 a month than own auth code; or the scout fails both Worker-native variants; or he wants Clerk Billing's ready-made subscription UI more than a Stripe Checkout link; or his FFO code is directly reusable. Its integration design is Appendix A, and each later section notes the Clerk delta.
- **Supabase** wins only if the backend were moving off the Worker into Postgres. It is not: PvP is built on Durable Objects and works.
- **Firebase** wins only if native Android or iOS apps became the plan. As a web-only pick it is last: no email code (fails 2b), a redirect workaround on Safari, no passkeys.

### 2e. Recheck before Sean decides

Because this session had no web access, these must be read from the live pages and dated before decision 1 in section 8 (about 15 minutes, any session with web access):
- Clerk: Hobby retained-user cap, Pro price, Clerk Billing fee, whether Apple sign-in can run without a redirect.
- Supabase: free MAU, pause rule, built-in mail limits, passkey status. Firebase: MAU tiers and email-code support.
- Cloudflare: Workers Free CPU limit and script size cap, D1 free and paid limits.
- better-auth: current D1 support on Workers, email-OTP, passkey, `idToken` and Stripe plugins.
- An email sender's free tier (Resend or similar). Apple Developer Program price.

None of these can flip the recommendation on its own except a Workers CPU or size limit that the Phase 0 scout would catch anyway.

## 3. Integration design (Worker-native, better-auth)

### 3a. Topology: a second Worker, not a bigger PvP Worker

- **New Worker `woe-account`** in a new repo folder `account-worker/` (beside `pvp-worker/`), with one D1 database `woe-accounts`. It runs better-auth, the sync API (section 5) and later the Stripe webhook.
- **Why separate** (judgment): (1) the PvP Worker's unbundled `cf_api.py` deploy keeps working untouched, and only the new Worker takes the Wrangler bundle step (2a.3); (2) a bad auth deploy cannot break live PvP matches; (3) the PvP client already uses `Authorization: Bearer` for its player token (`src/pvp/api.js:69`), so keeping account sessions on another origin avoids two meanings for one header.
- **Build and deploy:** `wrangler deploy --dry-run --outdir account-worker/dist` bundles locally (no Wrangler login needed, as `npm run check` already shows for PvP), then a new `cf_api.py deploy-account` subcommand uploads `dist/index.js` with a `d1` binding `DB` and the secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, Apple keys, the email sender key). D1 schema changes are SQL files in `account-worker/migrations/`, applied through the D1 API by the same helper.
- **Origin:** `woe-account.gartland-79.workers.dev` at first; `api.where-on.earth` later only if the zone is on Cloudflare (2a.4). The client never depends on cookies, so either works.
- **PvP Worker change (Phase 3 only, section 6):** add the same D1 database as a binding so it can resolve an account session with one indexed lookup. A binding is metadata, not a library, so its deploy stays unbundled.

### 3b. Client: loading with no framework

New folder `src/account/`, all plain ES modules like the rest of `src/`:

| File | Role |
|---|---|
| `account/api.js` | `fetch` wrapper modelled on `pvpApi()` in `src/pvp/api.js`: base `ACCOUNT_API`, JSON in and out, `AccountError` with codes, never throws into gameplay. |
| `account/session.js` | Reads and writes `where-on-earth-account-v1`; `isSignedIn()`, `signOut()`, token refresh. Tiny, imported at boot. |
| `account/sheet.js` | The sign-in sheet (3c). Loaded with `import()` only when an offer is tapped. Injects Google's `https://accounts.google.com/gsi/client` and Apple's JS SDK only at that moment. |
| `account/sync.js` | Upload and download of progress (section 5). Loaded with `import()` after the first frame, and only when signed in. |
| `account/merge.js` | Pure merge functions (section 4), unit-tested with `node --test` (a new suite; `scripts/regression.sh` today runs only Playwright harnesses, so the merge tests are added to it as a new named suite). |

A guest never downloads anything account-related except `session.js` (a few hundred bytes). No third-party script runs on boot, so the link-first first paint is unchanged.

Device key, added to `VERSIONED_KEYS` so it gets the `storage.js` guards:

```js
// where-on-earth-account-v1
{ _v: 1,
  accountId: 'acc_8f3k...',      // ours, never a vendor id
  sessionToken: '...',            // bearer, sent only to ACCOUNT_API
  expiresAt: 1767225600000,       // rolling, see below
  displayName: 'Sean',
  emailHint: 's***@gmail.com',    // for the Settings row, never the full address
  deviceId: 'dev_2c9...',         // random per install, names this device in sync
  lastSyncAt: 1760650000000,
  merged: true }                  // the first-sign-in merge (section 4) completed
```

Endpoints (the client wrapper hides better-auth's own route names, which live under `/api/auth/*`):

```
POST /v1/auth/email/send        { email }                     -> 204
POST /v1/auth/email/verify      { email, code }               -> { session, account }
POST /v1/auth/google            { idToken, nonce }            -> { session, account }
POST /v1/auth/apple             { idToken, nonce, name? }     -> { session, account }
POST /v1/auth/passkey/*         WebAuthn register and login ceremonies
POST /v1/auth/signout           { everywhere?: true }
GET  /v1/me                                                   -> { account, entitlements, pvpPlayers }
GET  /v1/sync  |  POST /v1/sync                               section 5
```

**Session handling:** opaque bearer token, stored only on the device and hashed in D1 (or stored as better-auth stores it; confirm in Phase 0). Rolling 90-day expiry, extended on any authenticated request at most once a day (better-auth `expiresIn` and `updateAge`). A daily player therefore never sees a sign-in prompt again on that device. "Sign out everywhere" deletes all session rows for the account. Rate limits in D1 (or a Durable Object counter): at most 5 code emails per address per hour and 5 wrong codes per code, with codes expiring in 10 minutes.

**Settings touchpoints** (`src/main.js:429` builds the Settings screen): an Account row above Reset showing "Save your progress" (guest) or the name and email hint (signed in), with Sign out. The Reset button (`src/main.js:516`) keeps wiping every `where-on-earth-` key, which now also signs this device out; its confirm text gains one line when signed in: "Your account copy is kept. Sign in again to restore it." Deleting the account itself is a separate, explicit action (`POST /v1/account/delete`), needed anyway for the App Store and privacy rules if the game ever ships natively.

### 3c. Sign-in UI at the game's standard

Custom, because better-auth is headless and because the game's look is the point (judgment):
- **Container:** the existing dialog pattern `div.expedition-panel[role=dialog][aria-modal=true]` used by the Survival hub and More modes (`index.html:189`, `:201`), with the shared close button. No one-off sheet (the centralize-shared-UI rule).
- **Top:** one sentence naming what is at stake in this moment (section 4 lists them), with the player's own numbers, for example "Save your 214 places and 12-day streak".
- **Buttons:** Sign in with Apple and Continue with Google first. Their look is constrained by Apple's and Google's branding rules (Google's button is rendered by its own script), so they get the panel's spacing and order, not custom colours. Then "Use email instead".
- **Email path:** email field, then a 6-digit code field with `autocomplete="one-time-code"` and `inputmode="numeric"`, a resend link with a 30-second timer, and errors inline in the panel. No passwords anywhere.
- **Passkey upgrade:** after a successful sign-in, if `window.PublicKeyCredential` exists, one quiet line: "Sign in with Face ID next time on this phone". Never shown to a guest.
- **Done state:** "Saved. Your progress is now on your account." and the sheet closes back to exactly where the player was (a summary card, the passport).
- **Ships only after** 390px captures of every state (offer, email, code, error, done) pass review, and a live sign-in from the iPhone home-screen app.

### 3d. Play while signed out or offline

- **Signed out is today's game,** byte for byte. No mode, share or feature moves behind sign-in.
- **Local first, always.** Every write still lands in `localStorage` through the unchanged gameplay code. `sync.js` only observes and uploads (section 5), and queues while offline in `where-on-earth-sync-queue-v1`.
- **Account service down:** the sheet says "Sign-in isn't available right now" and the game carries on. Nothing in gameplay awaits an account call.
- **Session expired or revoked:** a quiet "Sign in again to keep syncing" line in Settings and on the home screen, never a modal, and local play continues.

### 3e. Delta if Clerk is picked instead

- Client: Clerk's two script tags, loaded lazily the same way (A1); its prebuilt modal behind our value sheet (A2).
- Session: Clerk cookies on a `clerk.where-on.earth` custom domain (needs the DNS answer from 2a.4); `getToken()` per request to our Worker.
- Server: `woe-account` still exists for sync data. It verifies Clerk's short-lived JWT against Clerk's JWKS with WebCrypto and maps `clerk_user_id` to our own `accountId` in D1 on first sight, so exit cost stays limited to the identity layer.
- Methods and lifetime: passkeys and a session longer than 7 days need Clerk Pro (A3, A4).

## 4. Guest-first policy

**Playing never requires an account.** A shared link opens a playable game exactly as today, and no mode, share format or saved shape changes for a guest. The account is offered at moments where it protects something the player already has, never before they have something.

### 4a. What a guest keeps and what a guest risks

A guest keeps everything they have today, on that device. What they risk, all of it true today:
- **Reset** in Settings (`src/main.js:516`), clearing site data, or private browsing wipes everything.
- **A new or second phone** starts from zero.
- **Adding the game to the iPhone home screen starts from zero.** The home-screen app's storage is separate from Safari's (2a.5), so a Safari player who installs the game loses their passport inside the installed app. This is the sharpest real data-loss path today, and the account is the only bridge across it.
- **Safari storage eviction:** Safari can delete a site's script-written storage after a stretch of days without a visit (author's knowledge, unverified; installed home-screen apps are believed exempt). A lapsed guest may come back to an empty passport.
- **PvP:** losing the device token loses unfinished matches and pair records (`docs/pvp-tech-spec-sol.md` line 108).

### 4b. When sign-in is offered (value moments)

Each offer is the 3c sheet with the player's own numbers in the first line. All are dismissible with one tap and none interrupts a round.

| # | Moment | Where in code | Offer line |
|---|---|---|---|
| 1 | Daily summary when the streak reaches 3, and again at 7 | Summary after `finishStreak()` (`src/modes/daily-game.js:72`) | "Keep your 3-day streak safe on any phone" |
| 2 | Passport crosses 25 places, then 100 | After `recordVisit()` grows `order` | "Save your 25 places" |
| 3 | Weekly badge earned (`record.badge = true`, `src/modes/expeditions.js:109`) | Weekly completion card | "Save your Week 1 badge" |
| 4 | First visit inside the installed home-screen app with an empty passport (`navigator.standalone` true, no `where-on-earth-passport-v1`) | Boot | "Played in Safari before? Sign in to bring your progress here" |
| 5 | Before Reset: the confirm panel gains "Save to an account first" | Settings confirm | "Save first, then reset this device" |
| 6 | PvP: creating or joining a match on a device with no PvP identity, when an account exists elsewhere is likely (any progress already local) | `pvpEnsureIdentity()` (`src/pvp/api.js:121`) | "Use your account name and record" |
| 7 | Always: the Account row in Settings | Settings | "Save your progress" |

**Never offered:** before or during the first game, on a share-link landing before the first round, mid-round, on the very first Daily summary, or more than once per session.

**Frequency cap** (device key `where-on-earth-account-offer`, `{ _v: 1, shown: { moment: ms }, dismissals: n }`): each moment fires at most once; after any dismissal, no automatic offer for 7 days; after 3 dismissals, only moments 4, 5 and 7 remain (the ones the player triggers or where loss is imminent).

### 4c. Merge rules when a guest with local progress signs in

Signing in on a device runs one merge: local document L, account document A (from `GET /v1/sync`), result M written to both. Merges are pure functions in `src/account/merge.js`. The guarantees: **M is never smaller than L or A in any collection, no best goes down, no earned tier goes down, and no first-date moves later.** The merge is idempotent (merging M with L again gives M), so a retry after a dropped connection is safe.

| Data | Rule |
|---|---|
| Passport ids | Union of `visits` keys. Storage's shrink guard (`storage.js`) can never trip, because M only grows. |
| Passport `meta[id]` | `b` max; `d` min; `e` max (never downgraded, as `recordVisit()` does); `ea`, `eb1`, `eb2`, `eb3` earliest present value; `t` latest. `f` earliest present date, except that if either side holds the id as a legacy visit (in `visits` with no `meta`), M keeps it undated, because its true first visit predates every dated one. This mirrors `recordVisit()`'s own legacy rule (`passport-store.js:188`). |
| Passport `visits[id]` (latest score, drives dot colour) | Taken from whichever side has the later `meta[id].t`; legacy on both sides: max. |
| Passport `order` | Union, sorted by `meta[id].t` ascending (legacy ids first, in their existing order), then capped to the last 240 (`PASSPORT_ORDER_LIMIT`). |
| All bests (`survival-best-v1`, `best-landmarks-survival`, `best-trivia`, `countries-best-v1`, each `blackout-best-v1-<scope>`) | Max per key. |
| History (`history-v1`) | Union by `date`. A date on both sides means the same Daily was played twice on two devices; the first play is the honest one, but entries carry no timestamp. Rule: keep A's entry (it reached the account first), and keep L's duplicate server-side only in a `history_conflicts` table, never shown. A replay is not progress, so nothing the player earned is lost. Trim to the last 365. |
| Streak (`streak-v1`) | `last` = the later of the two. `count` = the longest run of consecutive days ending at that `last`, counting a day as played if either side has it in history or as its own `last`. Where that run reaches back to a side's own `last`, that side's `count` extends it backwards (the count can predate history, section 1). Never lower than the count of the side whose `last` is the merged `last`. Example: phone A played Mon to Wed (count 3), phone B played Thu (count 1): M is count 4, last Thu. |
| Today's Daily (`where-on-earth-v1`) | Only when both sides hold the same `date`: complete beats incomplete; both complete, keep A (first write wins) and the summary shows A's result; both incomplete, the one with more rounds played. The `ids` are date-derived and identical. The "cannot replay seen places" property holds because a device that loads a complete game shows "played". |
| Expeditions (`expedition-v1`) | Per expedition: `completed` max; `complete` recomputed as `completed >= stops`. |
| Weekly (`weekly-v1`) | Union of week keys. Per week: `played` union by stop index, earliest date key per stop; `badge` = either side's badge, or recomputed when the union reaches `WEEK_STOPS`. `route` is date-derived; a mismatch keeps A's and logs a conflict. |
| Device preferences (section 1c) | Never merged or uploaded. |
| `<key>.corrupt-backup` | Not merged automatically. If present, the merge uploads it to a `corrupt_backups` table for manual recovery only. |

**PvP at sign-in:** nothing about PvP moves. The device keeps its `playerId` and token, so in-flight matches and Open Challenges continue untouched. The account records a link to that `playerId` (section 6). Two devices with two PvP identities both stay valid and both are linked.

**Order of operations at first sign-in** (crash-safe):
1. Snapshot L: copy every progress key to `where-on-earth-premerge-v1` (one JSON object, device-local, kept 30 days).
2. `GET /v1/sync` for A. Compute M with `merge.js`.
3. `POST /v1/sync` with M and the version of A it was built from. If the account changed in between (another device synced), the server merges M with its newer copy using the same `merge.js` and returns the result (section 5), so there is no reject-and-retry loop.
4. Write M to the local keys through `writeJSON` / `safeSetItem`, so the existing storage guards apply. Set `merged: true` in `where-on-earth-account-v1`.
5. Rebuild in-memory state (`state.passport`, dots) by the same path boot uses, without a reload mid-game.

If the app dies between steps 3 and 4, the next boot sees `merged: false`, re-runs the merge (idempotent) and finishes. The snapshot is the last-resort undo.

**Signing out** leaves the local keys in place (the device keeps playing as a guest with the merged progress). "Sign out and clear this device" is the Reset path.

**Clerk delta:** none. Merge rules depend only on the data, not the provider.

## 5. Server design

### 5a. Where the data lives

Options for the per-user store, judged for this data (small, merge-friendly documents, section 1d):

| Store | Verdict | Reason |
|---|---|---|
| **D1 bound to `woe-account`** | **Use** | SQL across users (support lookups, a future Daily leaderboard, the subscription archive, export), transactions for compare-and-swap sync, the auth tables in the same database, and point-in-time restore (D1 Time Travel, retention per plan, unverified). |
| Workers KV | No | Eventually consistent across locations (up to about a minute, unverified) and no compare-and-swap, so two devices syncing close together silently lose one write. |
| One Durable Object per account | Not now | Strongly consistent and a good fit per user, but no cross-user queries and a second migration story. A later optimization if D1 write volume ever hurts. |
| Extend the PvP Worker's `PlayerRecords` Durable Object | No | It is one global instance (`idFromName("global")`, `pvp-worker/src/index.js:55`) holding all PvP state; adding sync traffic to it concentrates load and blast radius on the live PvP path. |
| The auth provider's own data features | No | Under the recommendation the auth tables are ours anyway; progress still goes in separate tables, never as columns on the auth library's `user` row, so a library upgrade or swap never touches progress. |

**What never goes in auth-provider metadata** (applies fully under the Clerk delta, where user metadata is size-limited and public metadata rides inside the session token, unverified): passport, history, streak, weekly or expedition progress, Daily results, PvP links, push subscriptions, Stripe ids. At most a mirrored `plan` flag for client-side display, with D1 as the source of truth.

### 5b. D1 schema sketch (`account-worker/migrations/0001_init.sql`)

```sql
-- better-auth's own tables (user, session, account, verification, passkey) are
-- generated by the library; user.id is our accountId ('acc_...').

CREATE TABLE devices (
  device_id   TEXT PRIMARY KEY,           -- 'dev_...' from where-on-earth-account-v1
  account_id  TEXT NOT NULL,
  label       TEXT,                       -- 'iPhone (home screen)', from UA at first sync
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);

CREATE TABLE progress_docs (              -- one row per synced localStorage key
  account_id  TEXT NOT NULL,
  key         TEXT NOT NULL,              -- the exact key, e.g. 'where-on-earth-passport-v1'
  doc         TEXT NOT NULL,              -- the exact saved shape from section 1, as JSON
  version     INTEGER NOT NULL,           -- +1 per accepted write
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT NOT NULL,              -- device_id
  PRIMARY KEY (account_id, key)
);

CREATE TABLE daily_results (              -- first write wins per date
  account_id   TEXT NOT NULL,
  date         TEXT NOT NULL,             -- the local date key the game used ('2026-10-16')
  ids          TEXT NOT NULL,             -- JSON array of the 5 location ids
  total        INTEGER NOT NULL,
  rounds       TEXT NOT NULL,             -- JSON, the history-entry rounds shape
  complete     INTEGER NOT NULL,
  completed_at INTEGER,
  device_id    TEXT NOT NULL,
  PRIMARY KEY (account_id, date)
);

CREATE TABLE pvp_links (                  -- section 6
  player_id   TEXT PRIMARY KEY,           -- 'plr_...'
  account_id  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  linked_at   INTEGER NOT NULL
);

CREATE TABLE history_conflicts  (account_id TEXT, date TEXT, doc TEXT, device_id TEXT, at INTEGER);
CREATE TABLE corrupt_backups    (account_id TEXT, key TEXT, raw TEXT, device_id TEXT, at INTEGER);
CREATE TABLE push_subscriptions (account_id TEXT, device_id TEXT PRIMARY KEY, endpoint TEXT,
                                 p256dh TEXT, auth TEXT, created_at INTEGER);   -- section 6
-- entitlements (account_id, product, status, period_end, stripe_customer_id, ...)
-- is defined by the payment addendum, not here.
```

Synced keys (allow-list, enforced server-side): `passport-v1`, `history-v1`, `streak-v1`, `expedition-v1`, `weekly-v1`, the four single bests, and `blackout-best-v1-<scope>` for known scopes, all with the `where-on-earth-` prefix. Today's Daily goes to `daily_results`, not `progress_docs`. Anything else is refused, so device preferences can never leak into the account. Size guard: 512 KB per doc (a complete passport is about 200 KB by the section 1 estimate).

### 5c. Sync model

- **Unit:** one document per key, versioned. The passport uploads as a delta (meta entries whose `t` is newer than `lastSyncAt`, plus any `visits` changes); all other keys are small and upload whole.
- **Upload:** `sync.js` watches progress writes (a thin hook in `writeJSON` / `safeSetItem` that records the key in `where-on-earth-sync-queue-v1`; no gameplay module changes), debounces 3 seconds, then `POST /v1/sync { deviceId, docs: { key: { baseVersion, doc | delta } }, daily? }`.
- **Server, per key, in one D1 transaction:** if `baseVersion` equals the stored version, store and bump. Otherwise merge the incoming doc into the stored one with the same `merge.js` the client uses (the account Worker is bundled, so it imports `../src/account/merge.js` directly; one implementation, two callers), bump, and return the merged doc. The client writes whatever the server returns. With max, min, union and first-wins rules (4c), the order in which devices arrive does not change the result, so there is no reject loop and no lost write.
- **Download:** on boot when signed in (after the first frame), and on `visibilitychange` to visible when the last sync is older than 5 minutes: `GET /v1/sync?have=<key:version,...>` returns only changed docs plus `daily_results` for today and yesterday. The client merges (local as L, server as A) and writes locally.
- **Offline:** the queue persists; flushing is the same upload. Nothing in gameplay waits.
- **Write budget (estimate):** a signed-in Daily player writes about 3 to 5 rows a day (passport, history, streak, Daily result, maybe weekly). 10,000 daily signed-in players is about 50,000 row writes a day, near the D1 free daily write allowance as the author recalls it (unverified); the $5 Workers Paid plan covers far more. Recheck in 2e.

### 5d. The Daily across devices and timezones

- **Identity of a Daily is its date key,** exactly as today: `localDateKey()` on the device, mapped to the same game everywhere by `dayNumber()` (`src/daily.js:82`). The server never substitutes its own clock for the player's calendar, so a player in Sydney and one in Seattle keep playing the same dated puzzle on their own day.
- **Played on one device means played on all.** `daily_results` is first-write-wins per `(account_id, date)`. When a signed-in device loads date D, it checks the local `where-on-earth-v1` and the synced `daily_results` for D; a complete result on the account shows the summary instead of a fresh game. An in-progress result (rounds 1 to 4) resumes from the account copy, so seen places stay seen.
- **Same date, different ids:** `dailyGame(date)` depends on the shipped location list, so two devices on different deploys could derive different ids for one date. The iOS cache-buster (`index.html`) makes this rare. Rule: the stored row wins; the second device shows it as played.
- **Travel:** flying west can make "today" repeat a date already played (shows played, correct); flying east can skip a date (the streak rule already handles a gap exactly as it does today). The merge never invents or removes a day.
- **Future-date guard:** the server refuses a Daily result whose date is later than the current UTC time plus 14 hours (the earliest timezone on Earth), so a wrong device clock cannot seed puzzles ahead of time on the account. The local game is unchanged.
- **The subscription case:** `daily_results` is the per-player record that a monthly subscription's archive or catch-up would read. Product gating is the later plan; this table is the hook.

### 5e. Deletion, export, backups

- `POST /v1/account/delete` removes the account's rows in every table and its sessions, and unlinks PvP identities (PvP pair records stay keyed by `playerId`, as today). The device keeps its local copy unless the player also resets.
- `GET /v1/account/export` returns all of the account's docs as one JSON file: the player's own data, in the same shapes as their phone.
- Backups: D1 Time Travel for point-in-time restore, plus a monthly SQL export into the repo owner's storage (judgment).

**Clerk delta:** identical tables, plus `clerk_users (clerk_user_id PRIMARY KEY, account_id)` in place of better-auth's tables; the Worker resolves `account_id` from the verified Clerk JWT `sub`.

## 6. PvP identity and the path to notifications

### 6a. Today (verified)

- A PvP identity is created on first create or join: `POST /v1/players` returns `playerId` and `playerToken` (`pvp-worker/src/index.js:340`), kept in `where-on-earth-pvp-v1`.
- The name is typed by the player, cleaned to 24 characters (`pvpCleanName()`, `src/pvp/api.js:111`), and **snapshotted per seat**: renaming relabels future matches only (comment above `pvpEnsureIdentity()`). Opponents also see a `displaySuffix` derived from the `playerId`, which separates two players with the same name.
- `authenticate()` (`pvp-worker/src/index.js:71`) resolves the bearer token's HMAC to one `playerId`; `participant()` (line 224) then requires both the seat's `playerId` **and** its `tokenHash` to match. So a match can only be played from the device that holds the token.
- Pair records (`pair_records`) are keyed by the pair of `playerId`s.

### 6b. Account name versus device name

- **One name, owned by the account.** At sign-in, the account's display name defaults to the device's existing PvP name if there is one, else the first name from Apple or Google, else the part of the email before the `@` cleaned by `pvpCleanName()`'s rules. No extra prompt.
- **Renaming in Settings** updates the account and, through the PvP Worker's existing `/name` path, every linked `playerId`. The snapshot rule is unchanged: past and in-flight seats keep the name they were created with.
- **Suffix:** unchanged, still per `playerId`, so nothing an opponent has already seen changes (judgment; a per-account suffix can come later if two-device players cause confusion).
- **Anonymous players keep everything they have today:** device identity, matches, records, the 24-character name. They can play account holders and vice versa; no badge or gate marks the difference. PvP stays link-first: joining a challenge never asks for an account.

### 6c. One player, several devices

Phase 3 (section 7) changes the PvP Worker so an account session is an alternative credential:
1. Add the `woe-accounts` D1 binding to the PvP Worker (metadata only, 3a).
2. `authenticate()` accepts either today's player token or an account session sent in a separate header (`x-woe-session`, so `Authorization` keeps one meaning). A session resolves to the set of `playerId`s in `pvp_links` for that account.
3. `participant()` accepts a seat whose `playerId` is in that set (the token-hash check still applies when a raw player token is used).
4. A device that signs in with no local PvP identity reuses the account's most recent linked `playerId` for new matches, instead of creating a new one. The token is never copied between devices (the server only holds its HMAC, section 1b); the session stands in for it.
5. Guards: refuse a join where both seats would belong to the same account; keep the existing rate limits; a revoked session stops working immediately because it is checked per request.

Result: an in-flight match started on the phone can be finished on the laptop, and the pair record against a friend is one record even across devices, because new matches use one `playerId`. Records already split across two old `playerId`s are summed at read time for the "your record" display (a `WHERE player_id IN (...)` over the linked set).

Round submissions from two devices at once are serialized by the match's single Durable Object; the existing one-submission-per-round rule decides (verify in the Phase 3 build that a second submission for the same round is rejected, not double-counted).

### 6d. The path to notifications

**Status:** no notifications beyond share links and in-app status was APPROVED for the PvP MVP (Sean, 2026-10-13, `docs/pvp-mode-plan-sol.md:260`). Adding them is a new product decision (section 8), not a default of this plan.

**Web push requirements** (author's knowledge, unverified, recheck when the phase starts):
- iOS and iPadOS 16.4 and later support web push **only for a site added to the Home Screen**, which must have a web app manifest (standalone display) and a service worker, and the permission request must come from a tap. Safari tabs on iOS cannot receive push.
- Android and desktop browsers support push from a normal tab.

**What the game lacks today:** a manifest and a service worker (2a.5). Both are needed first:
- `manifest.webmanifest` with `display: standalone`, `start_url: /`, icons from `assets/`, and the existing theme colour `#03060f` (`index.html:29`). Install behaviour for current home-screen users must be checked on device: adding a manifest can change what the existing home-screen icon opens.
- `sw.js` **for push only, with no `fetch` handler**, so it caches nothing. The game already fights stale iOS caches with the version check in `index.html`; a caching service worker would reopen that problem.

**Do accounts gate push?** Not strictly: a push subscription could hang off a device's `playerId`. Accounts make it reach every device a player uses and survive a reinstall, and they make the email fallback possible. The `push_subscriptions` table (5b) is keyed by device and joined to the account.

**Sending:** the PvP Worker sends on match events (opponent finished, it is your turn, a challenge expires in 24 hours) by reading subscriptions for the seat's linked account. Web push needs VAPID signing (ES256) and payload encryption (aes128gcm), both doable with WebCrypto in the unbundled Worker (estimate: about 200 lines with tests), or a small library in the bundled account Worker with the PvP Worker calling it.

**The iOS funnel** (judgment): "Get a ping when Sam finishes" on the PvP waiting screen. If the game is not installed, the sheet shows Add to Home Screen steps (iOS has no install prompt the page can trigger), and offers sign-in so the installed app opens with the player's progress (4b moment 4). Inside the installed app, the next tap asks for push permission.

**Email as the cheaper first step:** the account already holds a verified email. An opt-in "Email me when my opponent finishes" works on every iPhone without install or a service worker, using the same sender as sign-in codes. Recommend it as the first notification, with push after (section 8).

**Clerk delta:** identical, except the PvP Worker verifies a Clerk JWT instead of looking up a session row.

## 7. Sequencing

Effort is in build sessions (one builder session of a few hours), as estimates. Every phase ships dark behind a flag and banks commits per milestone.

| Phase | What | Effort | Gate to the next phase |
|---|---|---|---|
| **0. Scout** | Throwaway Worker `woe-account-scout` with better-auth and D1, bundled by Wrangler and uploaded via the API. Measure bundle size and CPU time per auth request against the Workers Free limits; complete an email-code sign-in and a Google ID-token sign-in from Sean's iPhone in both Safari and the home-screen app. Sean's prerequisites run in parallel (section 8: sender account and DNS records, Google OAuth client, Apple Developer membership). | 1 | Pass: Worker-native confirmed. Fail on size or CPU: hand-rolled minimum on the same plan. Fail on the iPhone flows: Clerk (Appendix A). |
| **1. Backbone** | `account-worker/` (D1 schema 5b, auth endpoints for email code and Google, sync API, Daily results), `cf_api.py deploy-account`, `src/account/` (`api.js`, `session.js`, `sheet.js`, `sync.js`, `merge.js` with `node --test` suite added to `scripts/regression.sh`), Settings Account row, first-sign-in merge. Flag: `ACCOUNTS_ENABLED` in `src/core/config.js`, with a `?accounts=1` override for Sean's testing. | 3 to 4 | Merge tests green (including every row of 4c), two-device sync verified by hand (phone and laptop), 390px captures of the sheet. |
| **2. Offers and polish** | Value-moment offers and frequency cap (4b), Apple sign-in, passkey upgrade, account delete and export, then the flag turns on for everyone. | 1 to 2 | Sean reviews the offer copy and captures on his phone. |
| **Payment addendum** | Separate plan against this provider: Stripe direct, `entitlements` table, webhook in `woe-account`. | (own plan) | Needs Phase 1 live. |
| **3. PvP linking** | D1 binding on the PvP Worker, `authenticate()` and `participant()` changes (6c), name propagation, summed records. | 2 | The `pvp` and `group` regression suites green against the live Worker, plus a cross-device match by hand. |
| **4. Notifications** (only if Sean reopens the 2026-10-13 decision) | Email notifications first (1); then `manifest.webmanifest`, push-only `sw.js`, VAPID sending (2 to 3). | 1, then 2 to 3 | Device test on an installed iPhone. |

Clerk comparison: Phases 0 to 2 would be about 3 sessions instead of 5 to 7 (no auth endpoints, no custom sign-in steps, no passkey work), plus about $25 a month from launch for the session lifetime and passkeys (2c).

### 7a. Migrating existing players' local data

There is nothing to migrate in bulk: no server copy exists today, so no backfill and no forced step. Every existing player keeps playing as a guest on the exact keys and shapes they have. Their first sign-in on each device **is** the migration: the 4c merge, preceded by the `where-on-earth-premerge-v1` snapshot.

New device keys, none of which changes an existing key or shape: `where-on-earth-account-v1` (added to `VERSIONED_KEYS` in `src/core/config.js:34`), `where-on-earth-sync-queue-v1`, `where-on-earth-account-offer`, `where-on-earth-premerge-v1`. All carry the `where-on-earth-` prefix, so the existing Reset path clears them too.

Edge cases the merge tests must cover: legacy passport entries without `meta`, a passport at the 240-id `order` cap, a streak older than history, a `corrupt-backup` key present, weekly data from week 0 (Monday 2026-10-19, which starts before accounts ship), and a Daily in progress during sign-in.

### 7b. Rollback

- **Client:** setting `ACCOUNTS_ENABLED` to false hides every account surface in one deploy. Play is unaffected because local storage stays the source the game reads; sync is purely additive.
- **Device data:** the premerge snapshot is kept 30 days; a support-only "restore pre-sign-in data" path reads it if a merge bug is ever found.
- **Server:** `woe-account` is independent of PvP; a bad deploy is reverted by redeploying the previous bundle. D1 Time Travel restores the database to a point before a bad sync write.
- **PvP (Phase 3):** the player-token path is kept permanently, so reverting the PvP Worker to its previous version leaves every device working; only cross-device play is lost until the fix.

### 7c. Interaction with the current queue

- **Trivia promotion** (slice 1 onward, approved 2026-10-16, `docs/trivia-promotion-recommendation-opus.md`): pure content in `assets/trivia-bank.json`. No overlap with account files; `where-on-earth-best-trivia` is already in the sync list with no shape change. It can proceed first or interleave. Per the standing rule, heavyweight builds run one at a time, so the order is a choice, not a dependency.
- **Pin repair** (held entries such as `anakena-beach`; the pin check awaits Sean's approval, `docs/trivia-promotion-pilot-report.md`): the passport is keyed by id, so pin moves never touch synced data. If a repair changes the playable city list, `dailyGame(date)` can derive different ids for future dates across deploys; 5d's "stored row wins" covers it. No blocker either way.
- **Photo-first mode** (later landmark variant, `future-features.md` item 2, demoted in `docs/feature-impact-review-opus.md`): if it ships with a best score, its key joins the sync allow-list and `merge.js` gets a max rule. Standing rule from Phase 1 on: **every new progress key must be added to the allow-list and the merge with a rule in the same build**, or it stays device-only by default.
- **Deploy cargo:** Phase 1 client code ships dark. Each deploy that carries it names it in the cargo list, per the deploy rule, so no account surface goes live unnamed.

## 8. Decisions for Sean

1. **Provider.** Recommend **Worker-native (better-auth on Cloudflare D1)**, confirmed by the Phase 0 scout, with **Clerk as runner-up**. Tradeoff: you own the data and pay nothing per user, and you get passkeys and long sessions free, but you also own the auth code and it is about 3 to 4 more build sessions. Clerk is faster to stand up and familiar from FFO, but needs Pro (about $25 a month, unverified) to avoid weekly re-sign-in, and sign-in runs through a hosted modal. Before deciding, have the 2e prices rechecked live (this session had no web access).
2. **Phase 0 now, in parallel with trivia slice 1?** Recommend yes: the scout is one small session in new folders, and it settles decision 1 with measurements instead of estimates. Tradeoff: one more item in the queue this week, run one heavyweight build at a time.
3. **Your accounts and DNS.** Needed before Phase 1: an email sender account (Resend or similar) with SPF and DKIM records on `where-on.earth`, a Google Cloud OAuth client, and, for Sign in with Apple, the Apple Developer Program (about $99 a year, unverified). Also: is the `where-on.earth` DNS zone on Cloudflare, Vercel or a registrar? Recommend all three accounts. Tradeoff: Apple costs money every year, and without it iPhone players get Google and email only.
4. **Launch methods.** Recommend email code and Google in Phase 1, Apple in Phase 2, passkeys as an after-sign-in upgrade, and **no magic links or passwords**. Tradeoff: skipping magic links means typing a 6-digit code, but magic links open in the wrong place for home-screen players (2b).
5. **Session lifetime.** Recommend a rolling 90 days, so a daily player never signs in twice on one device. Tradeoff: a lost unlocked phone stays signed in longer; "Sign out everywhere" in Settings covers it.
6. **Offer moments** (4b). Recommend the seven listed, first triggered at a 3-day streak, at most once a session, 7 quiet days after any dismissal, and automatic offers ending after 3 dismissals. Tradeoff: fewer offers mean fewer sign-ups but protect the zero-friction feel you have measured.
7. **Duplicate Daily on two devices** (4c). Recommend the account's copy wins (first to reach the account) and the duplicate is kept out of sight. Tradeoff: a player who did better on the second device does not see that score; the alternative ("best counts") rewards replays and would weaken any future leaderboard.
8. **Cross-device PvP** (Phase 3, 6c). Recommend yes: finish a match on any signed-in device, one record per friend. Tradeoff: it changes the live PvP Worker's auth checks, so it needs full PvP regression and a careful deploy.
9. **Notifications.** This reopens your 2026-10-13 "none for the MVP" decision. Recommend opt-in **email** for "your opponent finished" after Phase 3, then **web push** (manifest plus a push-only service worker) once that has been used. Tradeoff: push on iPhone only works for installed players, and adding a manifest changes install behaviour, so it needs its own device testing.
10. **Rollout.** Recommend shipping Phase 1 dark behind `ACCOUNTS_ENABLED` with your `?accounts=1` testing period, and going live for everyone only with Phase 2's offers. Tradeoff: about a week before players see it, in exchange for the merge being proven on your own devices first.

## Appendix A. Runner-up notes: Clerk on this stack

Written as section 2 of the first draft, before Sean reopened the provider question. Kept because it holds the live-checked Clerk facts and is the integration design if Sean picks Clerk (section 2d). Section references below are updated to the current numbering.

### A1. Loading the SDK in a framework-less module app

The game has no bundler for the app: `index.html` loads `src/main.js` as a module with an import map for `three` and `topojson-client` from `vendor/`. Clerk's current JavaScript quickstart (read 2026-10-16) supports exactly this with two script tags served from the app's Clerk Frontend API host, `@clerk/ui@1/dist/ui.browser.js` and `@clerk/clerk-js@6/dist/clerk.browser.js` (the second carries `data-clerk-publishable-key`), then `await Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } })`. No npm, no build step, nothing added to `vendor/`.

Plan (judgment):
- **Lazy, never on boot.** The game's promise is "a shared link opens a playable game", and `index.html` already fights for first paint (boot messages, the version banner). Clerk is not loaded at startup. A new module `src/account/clerk.js` injects the two script tags only when (a) a local hint key `where-on-earth-account` says this device is signed in, or (b) the player taps an account offer. A guest who never taps one never downloads Clerk. Bundle size was not measured; measure it on a 390px throttled capture before shipping, and if it is large, case (a) loads it after the first round starts, not before.
- **Custom domain for the Frontend API**, e.g. `clerk.where-on.earth` (a CNAME, included on the free Hobby plan per the pricing page). The session cookie is then first-party to `where-on.earth`, which matters on iOS Safari where third-party cookies are blocked.
- **Session token to the Worker.** Signed-in requests to `woe-pvp` send `Authorization: Bearer <await Clerk.session.getToken()>`. The SDK refreshes the short-lived token (its lifetime is a Clerk Dashboard setting); the client always asks `getToken()` right before a request and never caches it. The Worker verifies the JWT itself with WebCrypto (`crypto.subtle.importKey` on the JWK from the Frontend API's JWKS, RS256), checks `exp`, `nbf` and `azp` against the game's origins, and caches the JWKS in memory. This has to be hand-written: `cf_api.py deploy` uploads `pvp-worker/src/*.js` as-is with no bundling, so the Worker cannot import an npm JWT library. Roughly 50 lines, unit-tested with a fixed key pair.
- **One module boundary.** `src/account/` (new): `clerk.js` (load, sign in, sign out, token), `sync.js` (section 5), `merge.js` (section 4, pure functions with tests). Gameplay modules never import Clerk; they keep calling `readJSON` / `writeJSON` / `safeSetItem`, and `sync.js` observes those writes. That keeps the "contract with players' phones" untouched.

### A2. Sign-in UI: Clerk components or custom forms

Two options:

| | Clerk prebuilt (`Clerk.openSignIn()` modal, `appearance` theming) | Custom forms on Clerk's API (`Clerk.client.signIn.create`, `authenticateWithRedirect`) |
|---|---|---|
| Effort | Small: one call plus an appearance object | Medium to large: every step (code entry, resend, errors, account linking, bot checks) is ours |
| Look | Clerk's layout, themable colours, radius and font; "Secured by Clerk" footer stays on Hobby (removal is Pro) | Fully ours: the dark glass panels, gold accent and `.expedition-panel` sheet the rest of the game uses |
| Risk | Generic look inside a very styled game | More code paths to break, on the one flow where a bug loses a signup |

Recommendation (judgment): **our own value sheet in front, Clerk's modal behind it.** The offer (section 4) is a game-styled sheet built from the existing shared overlay classes (the AGENTS rule: reuse shared UI, no one-off), saying exactly what the account saves, with buttons for each method. Tapping a method opens Clerk's prebuilt flow themed to the game (`colorPrimary` the game's gold, dark background, the game's font). This gets Clerk's tested edge cases (verification, automatic account linking when one email uses two methods, bot protection) for little code, and the part players judge, the pitch, is ours. Visual bar: it ships only after a 390px capture of the sheet and the modal, signed in and out, on Sean's phone width. Move to fully custom forms only if that capture fails the game's standard.

### A3. Which sign-in methods

The audience: casual, mobile-first, arriving from share links in group chats, mostly on phones (Sean tests on an iPhone; the game has iOS-specific code such as the `apple-mobile-web-app-capable` meta and the iOS cache-busting version check in `main.js`).

| Method | Verdict | Why |
|---|---|---|
| **Sign in with Apple** | Offer | One tap on iPhone with Face ID, and Hide My Email lowers the trust bar. Needs Sean's own Apple Developer credentials for production (Clerk's shared dev credentials are for development only); confirm the Apple Developer Program membership cost and setup before Phase 1 (not verified here). |
| **Google** | Offer | One tap on Android and for anyone signed into Google on iOS. Hobby allows up to 3 social connections; Apple plus Google uses 2. |
| **Email one-time code** | Offer, as the fallback | Works for everyone with no third-party account. Preferred over the magic link because the code is typed where the player already is. iOS also offers to autofill codes from Mail and Messages. |
| **Email magic link** | Do not offer | A link opens in whatever browser the mail app picks, not necessarily the tab or the installed home-screen app the player came from. On iOS a home-screen web app has its own storage, so the session would land in the wrong place. The code flow avoids this. |
| **Passkeys** | Not at launch | Not included on Clerk's Hobby plan (Pro only, pricing page 2026-10-16). Also the least understood option for a casual audience. Revisit with Pro. |
| Password, SMS | No | Passwords add friction and support load; SMS costs per message and is not on Hobby. |

### A4. Signed out and offline

- **Signed out is today's game.** Every mode reads and writes `localStorage` exactly as now. No feature that works today is moved behind sign-in.
- **Offline or Clerk down.** Writes always land in `localStorage` first (unchanged code paths); `sync.js` queues the delta in a device key `where-on-earth-sync-queue-v1` and flushes when online and signed in. If Clerk's script fails to load, the account sheet says sign-in is unavailable right now and the game carries on. The game must never block on a network call to Clerk or the Worker.
- **Session expiry.** Clerk's Hobby plan has a fixed 7-day session lifetime (pricing page; custom lifetime is Pro). A daily player signed in on Monday is asked to sign in again the next week. Nothing is lost (local data keeps working and the queue holds), but it is a real annoyance: a quiet "Sign in again to keep syncing" row on the home screen, never a modal. This is a decision for Sean (section 8).
