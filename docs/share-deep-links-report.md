# Share deep links report

## Changes

- `src/core/format.js`: `formatGameShare` now accepts an optional `url`, defaulting to `SHARE_URL`, so existing share text is unchanged unless a caller supplies a mode URL.
- `src/modes/blackout.js`: Country Blackout shares `?mode=blackout` and exports its existing scope-picker opener.
- `src/modes/survival.js`: Classic Survival shares `?mode=survival`.
- `src/modes/tap-country.js`: Tap the Country shares `?mode=tap-country`.
- `src/modes/landmarks.js`: Landmark Survival shares `?mode=landmarks`.
- `src/modes/trivia.js`: Trivia shares `?mode=trivia`.
- `src/pvp/h2h.js`: Challenge shares `?mode=challenge`.
- `src/main.js`: Valid mode URLs wait for the mode data to settle, call the established entry opener, and remove only `mode` with `history.replaceState`. Unknown and missing modes leave the normal home screen unchanged. The Daily share path was not changed.

## Landing map

| Mode | Existing opener |
| --- | --- |
| `blackout` | `showBlackoutPicker` |
| `survival` | `startSurvival()` |
| `tap-country` | `startBorders()` |
| `landmarks` | `startSurvival(landmarksSource)` |
| `trivia` | `startTrivia` |
| `challenge` | `showPvpHome` |

## Verification

Syntax checks passed for every touched JavaScript file:

```text
node --check --input-type=module < src/core/format.js
node --check --input-type=module < src/main.js
node --check --input-type=module < src/modes/blackout.js
node --check --input-type=module < src/modes/survival.js
node --check --input-type=module < src/modes/tap-country.js
node --check --input-type=module < src/modes/landmarks.js
node --check --input-type=module < src/modes/trivia.js
node --check --input-type=module < src/pvp/h2h.js
```

The formatter assertion passed:

```text
formatGameShare default and mode URL outputs verified byte-for-byte.
```

`git diff --check` passed. Chromium is not installed in this sandbox, so no browser launch or screenshot was attempted.

## Git handoff

Could not commit: `.git/index.lock` could not be created because the `.git` filesystem is read-only. Push was not attempted after the failed commit.
