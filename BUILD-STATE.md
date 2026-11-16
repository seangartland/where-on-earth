# Traveler progression build state

## Status

- **Phase 0 — blocked at trust-foundation discovery (2026-11-15).** No
  user-facing progression code has shipped, and Phases 1–2 have not started.
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

- Finish Phase 0 after the authoritative Daily source is supplied.
- Then implement and test Phase 1 (Daily-only ledger/profile/loadout/avatar
  starter kit) and Phase 2 (the 18 Existing-derived achievements). None of
  that work has been started to avoid shipping a progression system based on
  untrusted client data.

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
