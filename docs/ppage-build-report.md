# Passport full-page build report

## Scope and verification

The current Passport is a `section` with `screen stats-screen passport-screen` classes. It inherits the shared stats frame from `src/meta/stats.js`: an internally scrolling, safe-area-padded overlay with a translucent backdrop. Its `.pp-card` is a 440px maximum-width, rounded `glass` card. The Passport open and close functions already retain their existing behavior, including the X button, backdrop tap, Escape handling, focus restoration, and `game-passport` body class. No Passport-specific slide-up animation exists in the current code, so no animation behavior was changed.

## CSS changes

Only `src/meta/passport.js` changed. The new rules are scoped to `.passport-screen` and `.passport-screen .pp-card` inside `@media (max-width: 560px)`.

- `.passport-screen` now uses `100dvw` by `100dvh`, zero padding, an opaque `#0b1120` background, and its existing internal vertical scroll surface.
- `.passport-screen .pp-card` now has the same full dynamic viewport dimensions, no maximum width, margin, border, radius, shadow, or glass blur. It uses the same opaque `#0b1120` background.
- The card's existing 14px top and 20px bottom padding rhythm is retained and augmented with `env(safe-area-inset-top, 0px)` and `env(safe-area-inset-bottom, 0px)`.
- `.pp-toolbar` now reads `--pp-toolbar-top`, and `.pp-group-head` adds that offset to its toolbar offset. Desktop keeps the default `0px`; the mobile Passport sets it to the top safe-area inset so sticky controls remain below the device cutout.

The 560px breakpoint leaves the shared `.stats-screen`, `.stats-card`, `.glass`, and all other modal or sheet selectors unchanged. The full-width card lets the existing three-column flexible grid use the available width without changing grid columns or card sizing.

## Checks

- `node --check --input-type=module < src/meta/passport.js` passed. Node 24 accepts `--input-type=module` with stdin, not a file argument.
- `git diff --check` passed.
- `node --test test/passport-grouping.test.mjs test/account-merge.test.mjs` passed: 2 tests, 0 failures.
- Grep confirmed every added frame selector begins with `.passport-screen`, and no shared stats, panel, sheet, or modal selector was widened.
