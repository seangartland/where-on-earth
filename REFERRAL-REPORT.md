# Referral XP and achievements: implementation report

Branch: referral-xp. Implements BRIEF-referral-xp.md in full. Nothing was
deployed and nothing was pushed.

## What changed, per file

### account-worker/migrations/0008_referral_credits.sql (new)
New `referral_credits` table: `invitee_id` (primary key), `inviter_id`,
`status` (`pending` or `paid`), `created_at`, `paid_at`. Plus an index on
`(inviter_id, status)` for the cap and stat queries.

The primary key on `invitee_id` is what enforces "one credit per invited
account, ever": a second accepted invite for the same invitee can only
ever `INSERT OR IGNORE` and silently no-op against the first row.

### account-worker/src/progression.js
- `stats()` now also counts the inviter's paid referrals
  (`referrals: COUNT(*) FROM referral_credits WHERE inviter_id = ? AND
  status = 'paid'`), so referral achievements and progress bars read from
  the same snapshot every other achievement uses.
- `ACHIEVEMENTS` gained three single-threshold entries, same shape as the
  Daily count family, reward `null` (no cosmetic yet):
  - `plus-one` — "Plus One" — Refer 1 friend
  - `travel-agent` — "Travel Agent" — Refer 3 friends
  - `tour-guide` — "Tour Guide" — Refer 5 friends

  Names are proposals; happy to rename if Sean wants different ones.
- `achievementProgress()` gained matching progress entries
  (`current`/`target`/`Referrals`) for the three new ids.
- New exported `processReferralPayout(env, inviteeId, now)`:
  1. Counts the invitee's canonical Daily completions; returns `null`
     unless this is exactly their first ever (so a referral tied to an
     invite accepted after the invitee's first Daily never pays — the
     "first Daily" already happened).
  2. Looks up a `pending` referral credit for that invitee. Returns
     `null` if none exists (already paid, or no referral at all).
  3. Runs a single `UPDATE ... WHERE status = 'pending' AND (SELECT
     COUNT(*) ... status = 'paid') < 5` so the pending check and the
     five-paid-referral cap are enforced atomically in one statement;
     if it didn't flip a row (cap reached), stops there and the credit
     stays `pending` forever, matching "pending referrals past the cap
     never pay."
  4. On a successful flip, inserts a 25 XP `xp_ledger` row for the
     inviter with `source_type = 'referral'` and a
     `source_key = referral:<inviteeId>`, which is unique per invitee so
     a retry can't double-pay (`INSERT OR IGNORE`).
  5. Re-snapshots the inviter's stats and grants any of the three new
     achievements whose threshold is now met, the same
     filter-and-`INSERT OR IGNORE` pattern `processCompletion` already
     uses for Daily achievements.
- `progressionProfile()`'s public `stats` object gained a `referrals`
  field (the summary stat the brief asks for), using the same `summary`
  snapshot already computed for every other stat.

### account-worker/src/friends.js
- `acceptInvite()`'s existing D1 batch gained a fourth statement:
  `INSERT OR IGNORE INTO referral_credits (invitee_id, inviter_id,
  status, created_at) SELECT ... WHERE EXISTS (<the friendship just
  created>)`. It only fires when this call actually created the new
  friendship (same `EXISTS` guard pattern already used by the two
  statements before it), so the idempotent "already friends" early
  return above it is untouched and never creates a duplicate or stray
  credit. Self-invite is already rejected before this point, so no
  credit is ever created for it.
- `submitGuess()` now calls `processReferralPayout(env, id, now)` right
  after `processCompletion`, gated on `canonical` being truthy (i.e.
  only on an actual canonical Daily completion, never on legacy-only
  guesses). The payout result is not added to the HTTP response; the
  brief's "done" list does not ask for a client-visible payout signal,
  so none was added.

### account-worker/test/migrations.test.mjs
Added `0008_referral_credits.sql` to both migration-apply lists in the
idempotency test (fresh schema and production-shaped schema) and renamed
the test description from "0004 through 0007" to "0004 through 0008".
The seed-row count assertion (803) is untouched since the new migration
only adds a table and an index.

### account-worker/test/friends.test.mjs
- `fixture()` now also applies `0008_referral_credits.sql`.
- Added `completeDaily(env, id, date)` and `xpTotal(env, id)` helpers,
  reusing the existing `manifestIds`/`guess`/`post` helpers already in
  this file (mirrors the pattern already used by the "canonical rounds
  ignore client totals" test).
- Added four tests covering all six numbered scenarios in the brief:
  1. **"referral payout: pending on accept, 25 XP on the invitee's first
     canonical Daily, nothing on the second"** — covers brief items 1,
     2, 3.
  2. **"an invitee with two accepted invites pays only the first
     inviter"** — covers item 4.
  3. **"a sixth pending referral never pays once the inviter has five
     paid"** — covers item 5.
  4. **"self-invite stays rejected and creates no referral credit"** —
     covers item 6; the existing self-invite rejection test elsewhere in
     this file was left untouched, this adds the referral-table check
     the brief specifically asks for.

  All other pre-existing tests in this file (friend lifecycle, caps,
  rate limits, guess locking, cascading delete, etc.) ran unmodified and
  still pass, confirming existing friend flows are unchanged.

### src/account/sheet.js (client — flagged per the brief)
One line added in the account-invite area, right after the existing
"Links work once and expire in 7 days." line:

> Earn 25 XP when a friend joins and finishes their first Daily, up to 5
> friends.

Same `account-small-print` class as its neighbor, no new CSS. This is
the only client-side change in this work; nothing else in `src/` was
touched. `src/account/sheet.js` is the exact file the brief calls out as
needing another lane banked first, so flagging it clearly: **this build
touches src/account/sheet.js.**

## The migration

`account-worker/migrations/0008_referral_credits.sql`, numbered after the
latest existing migration (`0007_progression_integrity.sql`). Adds the
`referral_credits` table and its `(inviter_id, status)` index only; it
does not touch any other table.

## A judgment call worth flagging

The brief leaves achievement `category` unspecified for the three new
referral achievements. The client (`src/account/sheet.js`) hardcodes the
three achievement categories it groups by: `consistency`, `precision`,
`breadth`. Since the brief restricts client changes to the one invite-copy
line only, introducing a fourth category (e.g. `social`) would either
require also editing that hardcoded list client-side (out of scope) or
would make the three new achievements never render in the achievement
cabinet (a silent bug). I filed all three under `consistency`, matching
the brief's own framing of them as "single-threshold entries like the
Daily count family" (which are also `consistency`). Functionally this
only affects which heading they're grouped under in the UI; nothing else
depends on the category string.

## Test results

**Game suite** (`node --test "test/*.mjs"` from the clone root):
- Before: 133 pass, 0 fail.
- After: 133 pass, 0 fail.

**Account worker tests** (`node --test test/*.test.mjs` from
`account-worker/`):
- Before: 21 pass, 1 fail.
- After: 25 pass, 1 fail.
- The 4 new passes are the referral tests above.
- The 1 failure, before and after and unrelated to this work: "invite
  landing page carries the inviter name in OG tags and falls back for
  invalid tokens" expects `og-v3.png` but `src/friends.js`'s
  `SHARE_CARD_IMAGE` constant is `og-v4.jpg`. Confirmed this mismatch
  already exists on `main` (checked via `git show
  main:account-worker/test/friends.test.mjs` and
  `main:account-worker/src/friends.js`), so it predates this branch and
  this task. Left untouched: it is unrelated to referrals, and the
  brief's design section says not to redesign anything outside its
  scope; fixing an unrelated stale test assertion was not part of this
  brief.

## Done

Migration, worker changes, achievements, and the one client line are all
committed on `referral-xp`, one commit per step. Game suite is green.
Worker tests are green except the one pre-existing, unrelated failure
documented above. Nothing was deployed; nothing was pushed.
