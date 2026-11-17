# Progression visibility report

## Delivered changes

- Added server progression payload fields: `totalXp`, `xpIntoLevel`, and
  `levelSpan`. These are computed from the existing server helpers.
- Daily canonical submission responses now include `progressionAward` only
  when the XP ledger actually gains the completed Daily award. The block has
  `base`, `score`, `postcards`, `bullseyes`, `total`, `xpBefore`, `xpAfter`,
  `levelBefore`, and `levelAfter`.
- Added the shared progression view with unlock helpers, reward labels, the
  XP bar, and the level strip support. The profile, Passport home summary,
  and Daily result screen use it.
- Added Daily award breakdown and dismissible level-up messaging. Results use
  the canonical submission award and never synthesize an award for other
  game flows.
- Replaced customizer and cabinet ownership labels with unlock provenance and
  friendly catalog-derived reward labels.
- Added progression helper tests and worker assertions for reconciled awards
  and profile fields.

## Files changed

- `account-worker/src/progression.js`
- `account-worker/src/friends.js`
- `account-worker/test/progression.test.mjs`
- `account-worker/test/friends.test.mjs`
- `src/account/friends.js`
- `src/account/progression-view.mjs`
- `src/account/sheet.js`
- `src/meta/passport.js`
- `src/modes/daily-game.js`
- `src/styles/game.css`
- `test/progression-view.test.mjs`
- `shots-ux/capture.mjs`

## Verification

- Root test run: 18 passing files, 1 failing file. The failure is the known
  pre-existing `test/friends-data.test.mjs` failure.
- Worker test run: 3 passing files, 1 failing file. The failure is the known
  pre-existing `test/friends.test.mjs` failure, which includes the OG invite
  assertion and live-email coverage described in the brief.
- JavaScript syntax checks passed for the edited client, worker, shared view,
  and harness modules.

## Harness and captures

`PROG_SHOTS=1 node shots-ux/capture.mjs after` now selects `shots-prog/` and
contains paths for `home-passport-bar`, `results-award`, `results-levelup`,
`profile-block`, `customize-titles`, and cabinet labels at 390 by 844. The
results states are driven through stubbed canonical submission award payloads,
including a level-crossing award.

This environment could not produce image files: Chromium exited during launch
with `setsockopt: Operation not permitted` and `SIGTRAP`, before a page was
created. No captures were fabricated. Re-run the command in an environment
where the supplied Chromium can launch to populate `shots-prog/` and confirm
zero page errors.

## Git state

The checkout exposes `.git` as read-only. Creating the required
`progression-visibility` branch failed when Git could not create its ref lock,
and commits could not be made. The complete implementation remains in the
worktree for commit in a writable checkout.
