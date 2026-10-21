# Passport header overlap fix

## Diagnosis

The Passport Cities renderer creates each continent as a `section.pp-group`
with the `h3.pp-group-head` before its `ul.pp-dex`
(`src/meta/passport.js:659-676`). The header was not collapsed or transformed.

The shared header rule at `src/meta/passport.js:1581` used `position: sticky`,
with `top: calc(var(--pp-toolbar-top) + var(--pp-toolbar-h))` and `z-index: 1`.
Once the section reached that offset, the header was taken out of normal scroll
placement and painted above its own grid. That is why the Europe panel appeared
to float over the first row of postcard slots.

## Regression verdict

Pre-existing. The relevant `.pp-group-head` rule is identical in `6e30b46` and
the shipped `7630c4f` bundle. Tonight's bundle did not cause this overlap.

## Fix

Removed only `position: sticky`, its `top` offset, and its `z-index` from
`.pp-group-head` at `src/meta/passport.js:1581`. The header remains before the
grid in document flow, so every continent header reserves its own height both at
the top of the Passport and after scrolling.

## Verification

Passed:

- `node --check src/meta/passport.js`
- `git diff --check`
- `git diff 7630c4f -- src/meta/passport.js`, which contains only the removal
  of the three sticky-positioning declarations.

Attempted the required 390 by 844 Passport harness capture at top and scrolled:

`node harness.mjs passport` from
`/home/hatch/workspace/map-game/shots/airmail-review`

The capture could not run in this sandbox. Chromium exited before opening a
page because Crashpad socket setup returned `Operation not permitted`. No new
top or scrolled image is claimed from this environment. The flow result follows
directly from the DOM order and the removal of the sticky positioning from the
group-header rule.
