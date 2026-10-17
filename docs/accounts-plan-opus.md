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
