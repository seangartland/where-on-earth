# Where on Earth: accounts plan (Clerk)

Date: 2026-10-16 · Author: Claude Opus 5.5, written directly in session (no delegation)
Status: PLAN ONLY. No code or data changed.

Method: every claim about the current codebase below comes from reading the repo at commit `04b7299` (`src/core/config.js`, `src/core/storage.js`, `src/meta/passport-store.js`, `src/meta/passport.js`, `src/meta/stats.js`, `src/modes/*.js`, `src/pvp/api.js`, `src/pvp/home.js`, `src/main.js`, `src/daily.js`, `src/modes/weekly.js`, `index.html`, `vercel.json`, `deploy.sh`, `pvp-worker/` and the PvP docs) and from the Cloudflare deploy helper `~/workspace/custom-connectors/custom.cloudflare/bin/cf_api.py`. Clerk and Cloudflare prices and limits were read from their live pages on 2026-10-16 (section 7). Byte sizes are my estimates from sample JSON, labelled as estimates. Recommendations marked (judgment) are mine.

## 1. Inventory: player state today

Everything a player has lives in their browser. There is no account, no server copy of any single-player progress, and the only server-side identity is the PvP Worker's device token. The Settings "Reset" danger button (`src/main.js:516`) deletes every `localStorage` key starting `where-on-earth-`, so today one tap, a cleared browser, private mode or a new phone wipes everything.

`config.js` calls the key names and saved shapes "a contract with players' phones". Seven keys are versioned (`VERSIONED_KEYS`, `_v: 1`) and get `storage.js` guards: JSON-only writes, refuse suspicious empty writes, refuse any passport write that shrinks the entry count, and preserve a corrupt value to `<key>.corrupt-backup` instead of overwriting it. The other keys are raw strings or unguarded JSON.

### 1a. Progress keys (the things a player would be upset to lose)

| Key | Written by | Shape | Growth | Account owns? |
|---|---|---|---|---|
| `where-on-earth-passport-v1` | `recordVisit()` in `meta/passport-store.js`, every scored reveal except Trivia | `{ v: 2, visits: { id: base0to1000 }, order: [id...], meta: { id: { b, d, f, t, e, ea, eb1, eb2, eb3 } }, _v: 1 }`. `b` best base score, `d` closest km, `f` first-visit local date, `t` last visit ms, `e` earned tier 1 to 3 (near, bullseye, pinpoint), `ea` first earn ms, `eb1..eb3` first time each tier was reached. Visits logged before `meta` shipped have no meta entry (legacy, undated). | One entry per distinct place, never per play. Capped by content: 805 cities in `assets/locations.json` plus 427 landmarks in `assets/locations-landmarks-sol.json`, so at most 1,232 entries. `order` is capped at 240 ids. Estimate: about 160 bytes per entry, so roughly 200 KB for a player who has seen everything, 10 to 30 KB for a typical player. | **Yes.** The core collection and the main thing worth an account. |
| `where-on-earth-history-v1` | `recordHistory()` in `meta/stats.js`, once per finished Daily | `{ _v: 1, entries: [ { date, total, rounds: [ { base, score, distance } x5 ] } ] }` | One entry per Daily played, trimmed to the last 365 (`HISTORY_LIMIT`). Estimate 250 bytes each, about 90 KB at the cap. Only collects from the first game after it shipped. | **Yes.** Feeds Stats (averages, histogram, longest run). |
| `where-on-earth-streak-v1` | `finishStreak()` in `modes/daily-game.js` | `{ last: 'YYYY-MM-DD', count, _v: 1 }`; extends only when `last` was the local day before | Constant size | **Yes**, with the merge rule in section 3. Note the count can predate history, so it cannot be rebuilt from history alone. |
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
| `<key>.corrupt-backup` | Raw corrupt value | Recovery copy. The merge in section 3 should read it as a last resort, never upload it blind. |

### 1d. What the inventory implies

- **Small data.** A heavy player's whole progress is a few hundred KB, a typical player's well under 50 KB. Sync can send whole documents at sign-in and small deltas per play; no paging or blob storage is needed.
- **Merge-friendly by construction.** Almost every field is a max, a min, a union or a "first value wins": best score, closest km, earned tier (never downgraded, `readPassport()`), first-earned dates, bests, played stops. That is what makes a lossless guest merge possible (section 3). The two exceptions are `visits[id]` (latest score, drives dot colour) and the streak, which need explicit rules.
- **Dates are the player's local calendar.** `localDateKey()` (`core/format.js`) builds the Daily date, the streak, the first-visit date and weekly stop dates from the device clock. `dayNumber()` (`daily.js`) maps a key to the same game in every timezone. Section 4 keeps this.
- **The "contract" holds.** An account layer must read and write these exact keys and shapes. It is a sync layer beside the existing storage, not a replacement of it, so a signed-out player's game is byte-for-byte today's game.

## 2. Clerk integration for this stack

### 2a. Loading the SDK in a framework-less module app

The game has no bundler for the app: `index.html` loads `src/main.js` as a module with an import map for `three` and `topojson-client` from `vendor/`. Clerk's current JavaScript quickstart (read 2026-10-16) supports exactly this with two script tags served from the app's Clerk Frontend API host, `@clerk/ui@1/dist/ui.browser.js` and `@clerk/clerk-js@6/dist/clerk.browser.js` (the second carries `data-clerk-publishable-key`), then `await Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } })`. No npm, no build step, nothing added to `vendor/`.

Plan (judgment):
- **Lazy, never on boot.** The game's promise is "a shared link opens a playable game", and `index.html` already fights for first paint (boot messages, the version banner). Clerk is not loaded at startup. A new module `src/account/clerk.js` injects the two script tags only when (a) a local hint key `where-on-earth-account` says this device is signed in, or (b) the player taps an account offer. A guest who never taps one never downloads Clerk. Bundle size was not measured; measure it on a 390px throttled capture before shipping, and if it is large, case (a) loads it after the first round starts, not before.
- **Custom domain for the Frontend API**, e.g. `clerk.where-on.earth` (a CNAME, included on the free Hobby plan per the pricing page). The session cookie is then first-party to `where-on.earth`, which matters on iOS Safari where third-party cookies are blocked.
- **Session token to the Worker.** Signed-in requests to `woe-pvp` send `Authorization: Bearer <await Clerk.session.getToken()>`. The SDK refreshes the short-lived token (its lifetime is a Clerk Dashboard setting); the client always asks `getToken()` right before a request and never caches it. The Worker verifies the JWT itself with WebCrypto (`crypto.subtle.importKey` on the JWK from the Frontend API's JWKS, RS256), checks `exp`, `nbf` and `azp` against the game's origins, and caches the JWKS in memory. This has to be hand-written: `cf_api.py deploy` uploads `pvp-worker/src/*.js` as-is with no bundling, so the Worker cannot import an npm JWT library. Roughly 50 lines, unit-tested with a fixed key pair.
- **One module boundary.** `src/account/` (new): `clerk.js` (load, sign in, sign out, token), `sync.js` (section 4), `merge.js` (section 3, pure functions with tests). Gameplay modules never import Clerk; they keep calling `readJSON` / `writeJSON` / `safeSetItem`, and `sync.js` observes those writes. That keeps the "contract with players' phones" untouched.

### 2b. Sign-in UI: Clerk components or custom forms

Two options:

| | Clerk prebuilt (`Clerk.openSignIn()` modal, `appearance` theming) | Custom forms on Clerk's API (`Clerk.client.signIn.create`, `authenticateWithRedirect`) |
|---|---|---|
| Effort | Small: one call plus an appearance object | Medium to large: every step (code entry, resend, errors, account linking, bot checks) is ours |
| Look | Clerk's layout, themable colours, radius and font; "Secured by Clerk" footer stays on Hobby (removal is Pro) | Fully ours: the dark glass panels, gold accent and `.expedition-panel` sheet the rest of the game uses |
| Risk | Generic look inside a very styled game | More code paths to break, on the one flow where a bug loses a signup |

Recommendation (judgment): **our own value sheet in front, Clerk's modal behind it.** The offer (section 3) is a game-styled sheet built from the existing shared overlay classes (the AGENTS rule: reuse shared UI, no one-off), saying exactly what the account saves, with buttons for each method. Tapping a method opens Clerk's prebuilt flow themed to the game (`colorPrimary` the game's gold, dark background, the game's font). This gets Clerk's tested edge cases (verification, automatic account linking when one email uses two methods, bot protection) for little code, and the part players judge, the pitch, is ours. Visual bar: it ships only after a 390px capture of the sheet and the modal, signed in and out, on Sean's phone width. Move to fully custom forms only if that capture fails the game's standard.

### 2c. Which sign-in methods

The audience: casual, mobile-first, arriving from share links in group chats, mostly on phones (Sean tests on an iPhone; the game has iOS-specific code such as the `apple-mobile-web-app-capable` meta and the iOS cache-busting version check in `main.js`).

| Method | Verdict | Why |
|---|---|---|
| **Sign in with Apple** | Offer | One tap on iPhone with Face ID, and Hide My Email lowers the trust bar. Needs Sean's own Apple Developer credentials for production (Clerk's shared dev credentials are for development only); confirm the Apple Developer Program membership cost and setup before Phase 1 (not verified here). |
| **Google** | Offer | One tap on Android and for anyone signed into Google on iOS. Hobby allows up to 3 social connections; Apple plus Google uses 2. |
| **Email one-time code** | Offer, as the fallback | Works for everyone with no third-party account. Preferred over the magic link because the code is typed where the player already is. iOS also offers to autofill codes from Mail and Messages. |
| **Email magic link** | Do not offer | A link opens in whatever browser the mail app picks, not necessarily the tab or the installed home-screen app the player came from. On iOS a home-screen web app has its own storage, so the session would land in the wrong place. The code flow avoids this. |
| **Passkeys** | Not at launch | Not included on Clerk's Hobby plan (Pro only, pricing page 2026-10-16). Also the least understood option for a casual audience. Revisit with Pro. |
| Password, SMS | No | Passwords add friction and support load; SMS costs per message and is not on Hobby. |

### 2d. Signed out and offline

- **Signed out is today's game.** Every mode reads and writes `localStorage` exactly as now. No feature that works today is moved behind sign-in.
- **Offline or Clerk down.** Writes always land in `localStorage` first (unchanged code paths); `sync.js` queues the delta in a device key `where-on-earth-sync-queue-v1` and flushes when online and signed in. If Clerk's script fails to load, the account sheet says sign-in is unavailable right now and the game carries on. The game must never block on a network call to Clerk or the Worker.
- **Session expiry.** Clerk's Hobby plan has a fixed 7-day session lifetime (pricing page; custom lifetime is Pro). A daily player signed in on Monday is asked to sign in again the next week. Nothing is lost (local data keeps working and the queue holds), but it is a real annoyance: a quiet "Sign in again to keep syncing" row on the home screen, never a modal. This is a decision for Sean (section 8).
