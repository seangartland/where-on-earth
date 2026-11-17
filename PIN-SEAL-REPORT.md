# Friend pin seals report

## Files changed

- `account-worker/src/progression.js`
- `account-worker/src/friends.js`
- `account-worker/test/friends.test.mjs`
- `src/account/friends.js` required no change because it already stores and forwards pin rows without reshaping them.
- `src/game/friend-rows.js`
- `src/globe/pin.js`
- `src/modes/daily-friends.js`
- `test/friend-rows.test.mjs`

## Payload

Each friend row in `locations[locationId].friends` now adds:

```js
seal: { disc: 'navy', initials: null }
```

The worker joins the pin owner's `profile_loadouts`, normalizes `avatar_json` with the same helper used by profile reads, and returns only `disc` and `initials`. Missing, malformed, or legacy loadouts return the default navy seal. Pin sharing eligibility remains unchanged.

## Verification

Before-change counts were not captured from a local run because the checkout work began immediately after reading the brief. The supplied base expectation was 105 root tests. Source test declarations are 105 before this change and 106 after, with one new client data-path test.

After change:

- `node --test test/*.test.mjs`: 17 of 18 test files passed. `test/friends-data.test.mjs` failed before reaching its requests because it sets a local date while `backfillToday` correctly requires the UTC Daily date. This is unrelated to the seal changes.
- `cd account-worker && npm test`: 8 of 9 tests passed. The only failure is the known stale OG invite-image assertion in `test/friends.test.mjs`.
- `cd account-worker && node test/live-email.mjs`: failed as expected because `ACCOUNT_URL` is unset.
- `node --check` passed for all changed source modules, and `git diff --check` passed.

The new worker assertions passed within `friends.test.mjs`: a stored forest seal returns `{ disc: 'forest', initials: 'BO' }`; both missing and legacy loadouts return the default `{ disc: 'navy', initials: null }`.

## Delivery note

The source tree is complete. Git metadata is read-only in this sandbox: `git switch -c pin-seal-build` failed when it could not create `refs/heads/pin-seal-build.lock`, and the final `git add` and `git commit` attempt failed when it could not create `.git/index.lock`. Therefore no branch or commits could be created.

## Seal-to-pin blockers

None found. The client keeps `seal` through row normalization, selects the disc color from `SEAL_DISCS`, uses white badge material tint for seal pins, and preserves the existing non-seal behavior for cached rows without `seal`.
