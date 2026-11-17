# Monogram seal build report

Git metadata is read-only in this checkout. Creating the requested `seal-build`
branch and making commits failed because Git could not create a ref lock. The
working tree contains the complete implementation.

## Changed files

- `src/account/avatar.js`: replaces raster-avatar composition with code-drawn
  SVG medallion seals, including initials derivation, disc colors, motifs, and
  level-derived bronze, silver, and gold rings.
- `src/account/sheet.js` and `src/styles/game.css`: replace the Avatar
  customizer with the Seal tab, with a 96 px preview, disc swatches, motif
  locks, initials input, and readable Star seal motif cabinet text.
- `src/modes/daily-game.js`: supplies friend display name and level to the 28
  px compact seal renderer.
- `account-worker/src/progression.js` and `account-worker/src/friends.js`:
  validate and persist seals, return the default seal for legacy stored avatar
  objects, and remove frame ownership.
- `account-worker/test/progression.test.mjs`: converts catalog validation
  coverage to seal validation coverage.
- `shots-ux/capture.mjs`: stubs the requested level-8 Maya seal and writes to
  `shots-seal/` when invoked with `SEAL_SHOTS=1`.

## Validation rules

`validateSeal(value, earnedIds)` requires an object, rejects legacy objects
with `backdrop` or `skinTone`, rejects unsupported versions, defaults omitted
disc and motif to navy and globe, and accepts only the four configured discs.
Motifs must be configured and are allowed only when globe or when their mapped
achievement id is in `earnedIds`. Initials are null or one or two letters and
are normalized to uppercase. Invalid values return null. Profile reads map
legacy stored avatar JSON to the default v2 seal.

The `new-stamp` reward changed from `frame:five-stamp` to `motif:star`. The
cabinet displays that value as `Star seal motif`.

## Tests

Before and after, `node --test "test/*.mjs"` reports 18 test files, 17 pass,
and 1 failure: `test/friends-data.test.mjs`. Before and after, the worker
suite reports 4 test files, 3 pass, and 1 failure: `test/friends.test.mjs`.
The converted `test/progression.test.mjs` passes. These failures were already
present at the base checkout. The brief's noted og-image assertion was not the
failure surfaced by this checkout.

Syntax checks passed for all changed JavaScript files and `git diff --check`
passes.

## Harness captures

The harness is ready to create these six `before-*` and six `after-*` paths:

- `shots-seal/{before,after}-account.png`
- `shots-seal/{before,after}-profile.png`
- `shots-seal/{before,after}-cabinet.png`
- `shots-seal/{before,after}-customize-seal.png`
- `shots-seal/{before,after}-customize-titles.png`
- `shots-seal/{before,after}-friend-profile.png`

Capture execution is blocked in this sandbox before the page loads. Chromium
exits during launch with `setsockopt: Operation not permitted` from crashpad,
including with the harness's supplied flags, so no image files were produced.

## Remaining references

No functional avatar-part, avatar-catalog, frame ownership, or old reward
references remain in `src/`, `account-worker/`, or the harness. The old
`assets/avatar/` files remain unreferenced historical assets. Other uses of
the word postmark describe postcard and passport stamps, not avatar frames.
