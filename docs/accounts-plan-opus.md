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

The honest costs: more to build (section 7 estimates about 4 to 6 build sessions more than Clerk for the auth layer), a security surface we own (mitigated by using a maintained library rather than hand-rolling), and the deploy change in 2a.3.

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
| `account/merge.js` | Pure merge functions (section 4), unit-tested with Node like `scripts/regression.sh` tests today. |

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
