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
