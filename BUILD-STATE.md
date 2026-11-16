# Traveler progression build state

## UI build — worktree checkpoint (2026-11-16)

- Daily client date selection, rollover checks, account sync dates, and canonical
  backfill submission now use a UTC date key. The selection algorithm is
  unchanged; a boundary test fixes the shared UTC date at an instant that is
  evening in UTC-8 and morning in UTC+14.
- Migration `0006_achievement_community.sql` adds a cache for public
  achievement percentages. Completion processing refreshes it from canonical
  accounts and earned records; the API exposes only a thresholded display
  string (minimum 50 eligible and one earner, with sub-one-percent as `<1%`),
  never cohort counts.
- Added a local Paper Atlas renderer/catalog (48 default selectable IDs plus
  the server-gated Postmark frame), profile/cabinet/customize account-sheet
  surfaces, and server profile display names. The renderer is deterministic
  SVG layer markup from stored part IDs; it is not yet an exported per-part
  SVG asset catalog or a four-browser golden/contact-sheet QA pipeline.
- No migration was applied, no deployment/network action was attempted, and
  `.git` remains read-only. Muse must stage/commit all worktree changes.

## Status

- **Phase 0 — complete.** The trust foundation landed as `77dd515`; its
  canonical Daily rows are the only progression input.
- **Phases 1–2 — resumption implementation in this worktree (2026-11-16).**
  Migration `0005_traveler_progression.sql` adds an immutable, idempotent XP
  ledger, achievement ownership, and server-owned loadouts.  No migration was
  applied to D1.  The sandbox cannot write `.git`, so Muse must bank this
  checkpoint.
- **Local commit is blocked by sandbox permissions.** The worktree is writable,
  but `.git` is read-only (`index.lock` cannot be created); Muse must stage and
  commit this checkpoint before banking it. This sandbox also has no network
  access; no fetch, push, deploy, or production D1 write was attempted.

## Authoritative-data audit

The current account worker schema and code do **not** meet the approved
progression trust boundary.

| Required fact | Worker evidence | Finding |
| --- | --- | --- |
| Canonical round record | `daily_guesses` in `migrations/0003_friends.sql` stores `date`, `slot`, `location_id`, `distance_km`, and `score`. | The values are supplied by the client, not calculated by the worker. |
| Completion boundary | `src/sync.js` inserts the first client-uploaded `daily_results` row with client `total`, `rounds`, and `complete` using `INSERT OR IGNORE`. | It is not a five server-validated-round completion. The first device wins but can submit arbitrary totals/results. |
| Round validation | `src/friends.js:validGuess` only range-checks client `distanceKm` and `score`; `submitGuess` persists them unchanged. | Distance, postcard/bullseye eligibility, and score are untrusted. |
| UTC semantics | `src/friends.js:validDate` parses midnight UTC and accepts a date from 36 hours before through 14 hours after the worker clock. Client sync uses the browser-local date. | Date strings are UTC-shaped, but the Daily selection/completion authority is not a single server-defined UTC day. |
| Countries/continents/history | `daily_guesses` and `daily_results` contain no server location metadata, country, continent, or immutable server scoring inputs. | Countries, breadth achievements, and sampled historic aggregates cannot be derived authoritatively. History exists only as the above client claims. |

This differs from the plan’s assumed verified server-recorded Daily guesses.
Building XP, profiles, backfill, or achievements from these fields would violate
the standing requirements that displayed stats be server-derived and that
client-submitted totals never be trusted. A unique completion row alone would
prevent a second submission, but would still permanently award a forged first
submission, so it is not a safe partial implementation.

## Required unblock before Phase 0 can continue

1. Provide a server-owned Daily manifest keyed by UTC date and slot, including
   location ID, answer coordinates, country, and the product’s continent
   taxonomy.
2. Make the worker calculate distance and score from a submitted guess against
   that manifest, and persist immutable server-calculated round rows.
3. In one transaction, derive a completion only after exactly five distinct
   valid slots; enforce `UNIQUE(user_id, daily_date)` and generate idempotent
   aggregate/ledger work from that completion.
4. Establish which historic rows, if any, satisfy that contract. Only those
   rows may be backfilled; current `daily_guesses`/`daily_results` cannot be
   promoted to friend-visible progression history.

Once that source exists, the Phase 0 aggregate checks must compare canonical
completion/round rows against raw rows for sampled accounts: total score,
bullseyes (`distance < 25` and score `= 1000`), country count, and
consecutive-UTC-date streak. The migration must be written in this repository
but not applied to production D1.

## Verification

- Source audit completed against `account-worker/migrations/0001_init.sql`,
  `0003_friends.sql`, `src/sync.js`, and `src/friends.js`.
- Root suite: `node --test "test/*.mjs"` passed **18/18**.
- Account-worker suite: direct execution ran **6** tests (**5 pass, 1 fail**).
  The failure predates this checkpoint and is unrelated to progression:
  `account-worker/test/friends.test.mjs` expects an `og-v3.png` invite image,
  while `account-worker/src/friends.js` currently emits `og-v4.jpg`. It was
  not changed under the surgical-change rule.
- Production D1 was not inspected or written: unavailable in this sandbox and
  explicitly out of scope.
- No sampled production aggregate checks can be truthfully produced until an
  authoritative source exists.

## Remaining work

- Wire the authenticated progression endpoints into the full profile/cabinet
  and Paper Atlas builder surfaces.  The server contract, validation, and
  compact results XP line are present; this checkpoint does not yet contain
  the full visual profile/cabinet or the 48 SVG art assets.
- Do not add retroactive grants: Sean waived historic Daily XP and no legacy
  rows are promotable. Profiles must keep the friendly zero state supplied by
  the endpoint (`level: 1`, zero stats), not a missing-history label.
- Keep the noted client UTC-date alignment as follow-on work.

## Progression resumption verification (2026-11-16)

- `progression.js` calculates the Daily-only ledger entries from a completed
  canonical five-round row: 100 completion XP, score XP capped at 50,
  postcards capped at 25, and bullseyes capped at 15.  Keys include the UTC
  Daily date and `INSERT OR IGNORE` makes retries/two devices idempotent.
- It derives levels from the published curve (no mutable level column),
  server-derived stats, the 18 consistency/precision/breadth achievements,
  and validates loadout ownership.  Practice/PvP and legacy rows have no path
  into this code.  Pack/collection/social progression remains excluded.
- Added unit coverage for level thresholds, XP caps and strict 24.999/25 and
  149.999/150 semantics through the scoring predicates, and avatar config
  validation/Postmark's level-10 gate. Existing trust tests retain manifest,
  canonical completion, and scoring boundary coverage.
- `node --check` passed for every edited JS module. Account-worker tests pass
  except the pre-existing invite-image assertion: the test expects
  `og-v3.png`, while unchanged worker code emits `og-v4.jpg`. Root tests were
  not rerun after that worker-suite failure in the combined command.

## Trust-foundation implementation (2026-11-15)

- **Manifest path: 2a (exact worker replication).**
  `account-worker/src/daily.js` mirrors the client selector in `src/daily.js`,
  including its seeded shuffle, 29-day exclusion, country diversity rule, and
  the 36 checked-in pinned dates. `account-worker/data/daily-locations.json`
  is a 803-location snapshot of the complete eligible Daily pool from
  `assets/locations.json`; every entry has an ID, answer coordinates, country,
  and existing `continent` value. Migration `0004_daily_trust.sql` seeds the
  equivalent D1 `daily_locations` table, retaining source order as
  `pool_index`. `daily-trust.test.mjs` proves all five slots equal the client
  picks for 60 UTC dates, including pinned dates.
- **Server scoring and canonical storage.** A valid manifest-matching guess is
  scored in the worker from its submitted coordinates with the same haversine
  radius and `Math.round(1000 * exp(-(km / 3500)^1.13))` curve as
  `src/game/scoring.js`. The pool contains only point-city targets: no eligible
  Daily entry has an extent geometry or `extentKm`, so point-distance scoring is
  exactly the client path. Tests compare sampled scores to the client function,
  and cover strict `<25 km` bullseyes and `<150 km` postcards at 24.999/25 and
  149.999/150. `canonical_daily_rounds` stores only worker-calculated distance,
  score, country, and continent; client-supplied score and distance remain only
  in the legacy `daily_guesses` compatibility table.
- **Canonical completion and aggregates.** In the same D1 batch as a canonical
  round insert, an idempotent `INSERT OR IGNORE ... SELECT` creates one
  `canonical_daily_completions` row only after exactly five distinct slots are
  present. It stores the server total and is unique on `(account_id,
  daily_date)`. Aggregate helpers test total, bullseye count, distinct-country
  count, and UTC-date consecutive streaks from canonical facts. The legacy
  `daily_results` sync path is unchanged and cannot create or influence either
  canonical table.
- **History verdict: no legacy rows are promotable.** Contrary to the initial
  expectation, `daily_guesses` does retain client-supplied guess `lat`/`lng`.
  A row whose `(date, slot, location_id)` happens to match the current derived
  manifest could therefore be *mechanically* re-scored from the location data.
  It still has no server-time manifest binding and its target ID, coordinates,
  distance, and score were all accepted as client claims, so it cannot prove a
  valid Daily round and must not enter canonical/progression history.
  `daily_results` is wholly client supplied. Neither table is a valid
  progression-backfill source.
- **Unverified production work.** No production D1 data was inspected or
  written, and production sampled aggregate checks remain impossible until this
  migration is deployed. The client still selects a local-calendar date; this
  phase scores the exact UTC date submitted against the server's same-date
  manifest, but a follow-on client UTC-date alignment is needed before treating
  non-UTC client-day play as a product-complete canonical flow.

## UI build check-back verification (2026-11-15 22:55 PT)

- Lane finished (Codex gpt-5.6-terra, log ~/workspace/map-game/.progression-ui-lane.log, 105,757 tokens). Worktree banked by Muse as the UI checkpoint commit; see git log origin/main.
- Verdict: INCOMPLETE. Frontier review NOT dispatched; no deploy. Chain stopped at the verification gate per Sean's 2026-11-15 instruction.
- Root suite: 105/105 pass (104 baseline + 1 new UTC boundary test). Account-worker suite excluding live-email.mjs: 11 pass / 2 fail of 13. Known og-v3.png/og-v4.jpg failure plus a NEW failure introduced by this lane: canonical rounds test fails with "no such table: achievement_community" because refreshCommunityPercentages in processCompletion assumes migration 0006 has been applied and the test harness (and any pre-migration deploy) has no such table.
- WS1 UTC alignment: done, boundary test present (UTC-8 evening / UTC+14 morning share the UTC date).
- WS2 community percentage: threshold function and tests pass in isolation (49 vs 50, 0 earners, <1%); API exposes only the display string, no counts. Gaps: refresh runs on canonical completion, not a separate scheduled job; stored percentage column rounds <1% to 1 (display path recomputes correctly); the missing-table failure above must be fixed (guard or test-harness migration) before deploy.
- WS3 Paper Atlas kit: catalog IDs count to 48 default + Postmark = 49, matching AVATAR-SPEC counts, but implementation is a single deterministic inline-SVG renderer (src/account/avatar.js, 25 lines), NOT 48 exported sanitized per-part SVG assets. Build-time QA per AVATAR-SPEC section 9 (sanitizer/export preset, golden fixtures for four reference travelers, compatibility matrix, contact sheet at sizes) was not run and is reported not implemented by the lane itself. FAIL.
- WS4 avatar builder: avatar-only customizer via the validated loadout endpoint; server validateAvatar rejects invalid/Postmark-below-10; no Randomize (correct). Gaps: no Titles or Calling Cards tabs (LEVELING-PLAN section 4 Customize covers Titles, Cards, and Avatar); locked-after-owned ordering is trivially satisfied for avatar parts only because Postmark is last in its slot.
- WS5 profile: own/friend views present; friend server endpoint deletes xpToNext and client omits XP/edit controls. Gaps: own achievements summary sorts by earned-flag in definition order, not three most recent by earnedAt; no calling-card treatment beyond the header background; no results/share identity integration (lane admits).
- WS6 cabinet: Consistency/Precision/Breadth only, no Collection/Social stubs (correct); community % omitted below threshold via the display helper. Gap: no numeric progress per achievement, only condition text.
- WS7 Friends today compact identity: NOT DONE (lane admits). The results Friends today rows in src/modes/daily-game.js are unchanged (initial, name, delta, score; no avatar/title/Lv, no density rules, no identity tap-through). Only the account-sheet friends list gained a profile tap-through.
- Exclusions held in the diff: no deploy, no prod D1 writes, no home-screen changes, no rarity/difficulty, no backfill.

## UI completion pass (2026-11-16)

1. **Paper Atlas assets — PARTIAL.** Added 49 standalone runtime SVGs under
   `assets/avatar/`: all 48 Phase 1 selectable parts plus the level-10
   Postmark frame. `src/account/avatar.js` now stacks those named files by
   server-stored part ID in the required layer order; it no longer builds a
   monolithic inline SVG. Static export checks passed: 49 SVGs, all use a
   512 viewBox and namespaced IDs, and no SVG contains script, animation,
   text, raster image, external reference, or embedded font. The runtime
   assets are individually far below the specified byte caps.

   | Section 9 Phase 1 production-gate rule | Result | Evidence / remaining issue |
   | --- | --- | --- |
   | Locked rig, palette, source template, sanitizer/export preset, manifest, naming, compact rule | **FAIL** | The checked-in runtime exports and static sanitizer check exist, but editable source masters, a versioned asset manifest/content hashes, and an approved export preset are not present in this worktree. |
   | 48 defaults + linked layers + Postmark exported within budgets | **PASS** | `find assets/avatar -name '*.svg'` reports 49; exports are standalone sanitized SVG layers and are sub-kilobyte files. |
   | Four reference-cast golden combinations reconstructed from catalog parts | **FAIL** | No browser renderer or golden-fixture/contact-sheet harness is available in this sandbox, and no prior golden fixtures exist to extend. |
   | Compatibility matrix, review checklist, browser/size contact sheet | **FAIL** | No Chromium/WebKit/Firefox executables or image-review harness is installed; the required multi-browser visual proof cannot be produced truthfully here. |

   Per the brief's stop-on-approximation rule, the art-QA item is banked as
   partial rather than claiming production art approval. The remaining gate
   is visual-production QA, not a client/server fallback.
2. **Friends Today — DONE.** Results rows now render a 28px Paper Atlas
   avatar, name, title, and `Lv N`; title truncates and is hidden under 370px
   before level/score. The identity button opens the friend's profile, while
   score remains non-interactive. The row has a 28px minimum, within the
   requested approximately +8px growth.
3. **Community refresh migration safety — DONE.** Both refresh and profile
   reads first check `sqlite_master` for `achievement_community`, so an
   unmigrated worker no-ops cleanly. Refresh remains in `processCompletion`,
   not a scheduled job: each completion recomputes the same cache from
   canonical records, so retries/two-device submissions are safe and
   idempotent. Threshold/display behavior is unchanged.
4. **Profile completion — DONE.** Own achievements use earned timestamp
   descending order and show the three newest. Profile headers and the
   existing results/share card take the equipped calling-card treatment; no
   second results panel was added.
5. **Cabinet progress — DONE.** Own cabinet rows show current/threshold
   numeric progress for unearned items alongside condition, reward, earned
   date, and any allowed community percentage. Friend profiles still omit
   unearned cabinet progress.
6. **Customize tabs — DONE.** Titles, Calling Cards, and Avatar tabs use the
   existing loadout endpoint, preserve server-side ownership validation, and
   disable locked choices while showing the plain approved condition.

### Completion-pass verification

- `node --check` passed for all edited JavaScript files.
- Root suite available in this worktree: **18/18 pass** (`node --test
  "test/*.mjs"`). The checkpoint's claimed 105-test root inventory is not
  present in this checkout, so 105/105 cannot be rerun here.
- Account worker direct suite excluding live-email: **7 checks total: 6 pass,
  1 fail**, where the only failure remains the known unchanged og-image
  assertion (`og-v3.png` expected, `og-v4.jpg` emitted). The canonical-round
  completion test passes, including the former missing-community-table path.
- No migration was applied, deployed, fetched, pushed, or used against
  production D1.
