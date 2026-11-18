# Animation toggle merge report

Files changed:

- `src/core/config.js`
- `src/core/state.js`
- `src/main.js`
- `src/modes/pack.js`
- `src/modes/daily-game.js`
- `test/postcard-anim-setting.test.mjs`
- `ANIM-TOGGLE-REPORT.md`

The new `postcardAnim` setting defaults to on and is stored as
`where-on-earth-postcard-anim`. If that key has not yet been saved and either
legacy key exists, migration saves the combined value: `packPlacement &&`
`filingAnim`. Therefore, an existing player who turned either legacy animation
off keeps postcard animations off. Once the new key is saved, loading uses it
and does not consult the legacy keys.

Test run: `node --test "test/*.mjs"` completed successfully with 21 test
files passed, 0 failed, in 10.0 seconds. No browser or Chromium checks were
run because this client-only change was covered by the root Node suite and the
brief notes Chromium may be unavailable in the sandbox.
