# Pack audit fixes report (2026-10-29)

Implemented D1–D8 from `.build-tmp/pack-fixes-brief.md` without changing the storage key, pack odds, share formats, assets, or data files.

## D1 — Daily guard

- Changed the daily reward guard to reject equal or older ISO dates and made the scoped mutation start from a fresh store read (`src/meta/pack-store.js:76`).
- Proof: `daily skips never reward an older date when completions alternate` alternates two dates across five awards and ends at +8 (`test/pack-store.test.mjs:101`).

## D2 — Timer clamp

- After normal accrual, a running clock is capped at `now + STAMINA_PERIOD` (`src/meta/pack-store.js:30`).
- Proof: `accrual clamps a clock restored from the distant future` spends, advances 30 days, spends the minted bank, restores the old clock, and asserts at most 12 hours remain (`test/pack-store.test.mjs:110`).

## D3 — Re-read before write

- `spend`, skip spending, daily awards, result saves, and completion now re-read the pack record and then apply only their own mutation (`src/meta/pack-store.js:40`, `src/meta/pack-store.js:54`, `src/meta/pack-store.js:76`, `src/meta/pack-store.js:178`, `src/meta/pack-store.js:186`).
- The tear completion path re-reads before the lock/spend checks and again before marking the selected pack torn (`src/modes/pack.js:443`).
- Proof: `fresh mutations preserve another actor and expose the tear lock` uses two interleaved records, preserves the first actor's torn state and the second actor's result, and verifies another pack cannot tear (`test/pack-store.test.mjs:272`).

## D4 — Corrupt record recovery

- A corrupt primary value is still preserved by the storage layer; `readPack` then removes the unusable primary entry and persists a fresh record (`src/meta/pack-store.js:101`).
- Proof: `a corrupt pack record is backed up, replaced, and remains spendable only twice` verifies backup, reload persistence, and the finite bank (`test/pack-store.test.mjs:146`).

## D5 — Skip spend correctness

- Added normalized `skipCredit` milliseconds. Overflow when a skip reaches the two-pack cap is retained, applied to the next countdown started from cap, and then cleared (`src/meta/pack-store.js:40`, `src/meta/pack-store.js:54`, `src/meta/pack-store.js:101`).
- The select-screen tick now rebuilds its stamina and skip actions every second, so visibility and labels do not go stale (`src/modes/pack.js:249`).
- Proof: `skip credit survives filling the bank and shortens the next countdown` pins the stored=1, 4h15m, spend-5 case to 45 minutes credit and an 11h15m next clock (`test/pack-store.test.mjs:123`). The pre-existing stored=0 rollover test remains green. `pack copy is stamina-based and selection ticks rebuild skip actions` checks the refresh path (`test/pack-passport-action.test.mjs:18`).
- Deliberately left: no partial-spend control or stepper was added.

## D6 — Normalize on read

- `readPack` coerces stored stamina to an integer in 0..2, skips to a non-negative integer, clamps credit, and starts a valid 12-hour countdown when a non-full bank has no finite `nextAt` (`src/meta/pack-store.js:101`).
- Proof: `read normalizes stamina, skip balances, and a missing countdown` covers both `{stored:0,nextAt:null}` and the string balance `"12" + 4 = 16` (`test/pack-store.test.mjs:135`).

## D7 — Migration hygiene

- A successful same-day legacy pack migration removes `where-on-earth-pack-v1-torn` after reading its state (`src/meta/pack-store.js:130`).
- Proof: `legacy pack from today migrates its results and torn state` now also asserts the legacy key is absent (`test/pack-store.test.mjs:174`).
- Deliberately left: starter grant amounts are unchanged.

## D8 — Copy and counters

- Home progress counts only packs that are torn or have at least one result (`src/meta/pack-store.js:229`, used by `src/modes/pack.js:55`). Proof: `home progress ignores merely dealt packs` (`test/pack-store.test.mjs:292`).
- Finished packs report `Complete`, not `In progress`, on selection (`src/meta/pack-store.js:217`, `src/modes/pack.js:240`). Proof: `a finished pack is complete rather than in progress` (`test/pack-store.test.mjs:286`).
- Passport pack collection totals now use `meta.e > 0` within the live pack pools (`src/meta/passport-packs.js:19`, passed from `src/meta/passport.js:566`). Proof: `only earned postcards count as collected and landforms route before landmarks` (`test/passport-packs.test.mjs:24`).
- Removed the Daily-era pack header comments, changed the slot aria-label to `Pack cards`, and removed the always-hidden ready line and its orphaned CSS (`index.html:159`, `src/modes/pack.js`, `src/styles/game.css`). Proof: `pack copy is stamina-based and selection ticks rebuild skip actions` (`test/pack-passport-action.test.mjs:18`).
- Deliberately left: the Passport fallback section title and all other player-facing strings are unchanged.

## Verification

- `node --test test/*.test.mjs` — pass (13 test files).
- `git diff --check` — pass.

Design risks R1–R4 were not changed. No commit, push, or deployment was performed.
