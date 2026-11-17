# Progression UX redesign report

Date: 2026-11-16

## Theme tokens verified in code

- Paper: `--mail-paper` from `#faf3e1` to `#f0e4c6`, with `#fffdf6` for stamp-white details.
- Ink: `--mail-ink` at `#22355c`, `--mail-ink-2` for secondary copy, and established navy `#1e4e9c`.
- Brand: cream `#f6edd8`, yellow `#ffcb05`, dark-shell gold `--gold` at `#ffc76a`, and paper gold `--mail-gold` at `#b27c20`.
- Shell: dark glass at `rgba(5,12,29,.82)`, pale blue borders, offset shadows, and the blurred globe backdrop.
- Type: locally hosted Luckiest Guy for branded display moments, system sans for body text and controls.
- Form: compact paper corners, pill actions, circular postal marks, thin ink rules, and soft offset shadows found in the pack, Passport, Daily results, friends, and Settings surfaces.

## What changed

- Signed-in account: now a cream passport sheet over the dark globe. Friend rows use ink rules and clearer hierarchy. Existing copy, controls, ids, handlers, and friend data flow are unchanged.
- Profile: stronger calling-card hierarchy, a linear XP track derived from the existing level curve and `xpToNext`, a ruled stats manifest, earned seals, and clearer cabinet and customize actions.
- Cabinet: all 18 definitions remain grouped under Consistency, Precision, and Breadth. Groups show earned counts. Earned, locked, progress, reward, date, and community percentage states remain data-driven.
- Customize: titles and cards use a compact two-column grid. Avatar editing now has a live preview, vertical slot list, and focused option grid. Artwork, catalog, save payload, ownership, level 2 title choice, and level 10 Postmark gating are unchanged.
- Friend profile: shares the upgraded identity card, stats, and seals while remaining read-only with no XP or edit controls.
- Daily XP: presentation only, now a compact gold status pill with no result-card layout change.

No copy changed. No home surface, home profile button, avatar artwork, route, API call, session behavior, or progression rule changed.

## Screenshots

The deterministic 390x844 harness is at `shots-ux/capture.mjs`. It stubs a signed-in mid-level account, mixed achievement states, community percentages, friends, and own and friend progression. It targets before and after files for account, profile, cabinet, customize titles, customize avatar, and friend profile.

Chromium could not run in this managed sandbox. `/opt/meta-chromium/chrome` failed during crashpad setup with `Operation not permitted`; the available headless shell failed in sandbox host shutdown with the same restriction. No screenshots were substituted. The harness is ready for check-back capture where Chromium processes are permitted.

## Verification

- `node --check src/account/sheet.js`: passed.
- `node --check shots-ux/capture.mjs`: passed.
- `git diff --check`: passed.
- Em dash check across changed and new files: no matches.
- Impeccable detector: run once. Its new top-stripe and CSS-checkmark findings were removed or rewritten. The remaining pack stripe finding was pre-existing and outside scope.
- `node --test "test/*.mjs"`: 17 of 18 test files passed. `test/friends-data.test.mjs` could not complete because its nested `spawnSync` is blocked by this sandbox. A no-isolation diagnostic is invalid for this suite because files deliberately replace shared DOM and storage globals.

The brief expected 105 passing tests. This checkout exposes 100 individual tests when forced into one process, plus file wrappers in the normal isolated runner. The 105 count could not be reproduced here.

## Changed files

- `src/account/sheet.js`
- `src/styles/game.css`
- `shots-ux/capture.mjs`
- `UX-REPORT.md`

No commit was created.

The requested report destination `/home/hatch/workspace/map-game/UX-REPORT.md` is outside this session's writable root. The complete report is left here for relocation by the check-back runner.

## Check-back addendum (Muse, 2026-11-16)

- Independent test run on the final tree: `node --test "test/*.mjs"` passes 105/105. The lane's 100-count and blocked file were sandbox artifacts.
- Screenshots captured by the check-back at 390x844, zero page errors, no horizontal overflow, before and after for all six surfaces. The capture harness needed three fixes to run outside the sandbox: full Chromium instead of the headless shell, api.where-on.earth added to the stubbed account hosts, and the mjs MIME type (src/meta/passport.js imports passport-grouping.mjs; served as octet-stream the module graph stalls and the game never boots). PNGs are banked at ~/workspace/map-game/woe-ux-shots/.
- Two contrast defects found in the after shots and fixed in game.css: the View cabinet button inherited the muted .text-button color and washed out on the paper sheet (now a navy pill), and the profile back button sits on the navy calling card (now cream there; it stays ink on paper in the cabinet and customizer). Re-captured and verified.
