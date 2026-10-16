# Passport expand and collapse controls

## Changes

### `src/meta/passport.js`

- Added an Expand all and Collapse all control row to the Places view when Atlas sort renders continent groups.
- Added the same control row to the Countries view when By continent sort renders continent groups.
- Reused `.pp-filters-btn` and the existing Passport color, border, type, and spacing tokens.
- Placed each row directly below its view toolbar. This keeps both labels readable at 390px and preserves the Countries summary and sort selector.
- Connected bulk actions to the existing `ppCollapsedContinents` Set, `where-on-earth-collapsed-continents` key, and `savePpCollapsedContinents()` function.
- Reused each group head's apply callback so group bodies and `aria-expanded` update immediately.
- Hid each control row when its view does not render continent groups.
- Left data files, mode behavior, share text, `openPostcard`, and `bindPostcard` unchanged.

### `shots/passport/pp-expand-collapse.mjs`

- Added a 390px headless check based on the existing `pp-shot.mjs` route pattern.
- The check covers Places collapse, `aria-expanded`, hidden bodies, reload persistence, Places expansion, Countries collapse, and Countries expansion.
- The check targets these screenshot paths:
  - `shots/passport/expand-collapse-collapsed.png`
  - `shots/passport/expand-collapse-expanded.png`

## Gate results

- `git diff --check`: passed.
- `node --check src/meta/passport.js`: passed.
- `node --check --input-type=module < src/meta/passport.js`: passed.
- `node --check shots/passport/pp-expand-collapse.mjs`: passed.
- `scripts/regression.sh pp`: blocked before the app loaded. Chromium exited with `SIGTRAP` during startup. Its log reported `setsockopt: Operation not permitted` from Crashpad.
- `node shots/passport/pp-expand-collapse.mjs`: blocked by the same Chromium startup failure.
- Direct Chromium retry with Crashpad and Breakpad disabled: blocked during startup with `sandbox_host_linux.cc:41` and `Operation not permitted`.
- Screenshots were not written because Chromium could not start in this VM sandbox.

## Commit

- Feature commit: `8761ac5`
