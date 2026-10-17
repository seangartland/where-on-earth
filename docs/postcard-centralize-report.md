# Postcard centralization report

Date: 2026-10-16

## Outcome

The working tree now has one shared postcard component in `src/meta/postcard-card.js`. The current Passport redesign uses compact `.pp-slot` cards on the Places and Landmarks shelves, not the `.pp-post` shelf cards described in the task map. The shared builder therefore preserves that current compact markup through a `slot` variant and produces the full `.pp-post` format for the postgame summary and in-game reveal popup.

The source work is complete in the working tree. Commits, pushes, screenshots, and browser regression assertions could not be completed because this managed session mounts `.git` and the requested sibling shots directory read-only, and Chromium exits with `SIGTRAP` under the process sandbox.

## Shared module

`src/meta/postcard-card.js` exports:

- `postcardDisplayName` at line 3. It always uses `item.short` and appends the flag returned by the existing location flag resolver.
- `buildPostcardCard` at line 8. It builds the photo, shared display name, meta row, earn data, and tier class from a location plus passed passport state. Its full form is `.pp-post`; its compact form preserves the current Passport `.pp-slot` shelf markup.
- `ensurePostcardCardStyles` at line 66. It owns the formerly Passport-local `.pp-post`, `.pp-photo`, `.pp-name`, `.pp-meta`, stamp, and earn-state rules.

The module imports no mode state.

## Surfaces switched

- Passport Places shelf: `src/meta/passport.js:435` calls the shared builder in compact mode.
- Passport Landmarks shelf: it uses the same `passportSlot` path as Places, so the call at `src/meta/passport.js:442` covers both shelves.
- Audit preview: Audit marks every landmark as visited and uses the Landmarks shelf renderer, so it reaches the same call at `src/meta/passport.js:442`. Its audit button is passed into the builder without importing Audit state.
- Passport postcard detail title: `src/meta/passport.js:1185` uses the shared display-name function.
- Postcard summary screen: `showPostcardSummary` still renders through `postcardSummaryCard` at `src/modes/daily-game.js:165`; that function now calls the shared builder at `src/modes/daily-game.js:103`.
- In-game reveal popup: `src/globe/reveal.js:92` rebuilds the existing figure through the shared builder. The figure itself remains the animation root at `src/globe/reveal.js:1275`.
- Trivia animated photo reveal: `src/game/round.js:328` and `src/game/round.js:329` pass the plain-card flag. It uses the shared photo, short name, flag, and meta structure without stored earn state or visit recording.

## Name formatting

Before this change, the summary and compact Passport shelf used `item.short` plus `flagForLocation(item)`. The Passport detail title extracted a flag from `item.clue`, and the in-game popup used `item.clue || item.short` with no explicit shared flag handling. Those postcard surfaces now use the shared `item.short` plus `flagForLocation(item)` rule.

The reveal screen heading and peek bar still use their deliberate mode rule in `src/game/round.js:285`: Trivia uses the short name and other modes use the clue when present. They are reveal labels rather than postcard card labels, so this change does not alter mode presentation.

## Phase 1 visual preservation

The phase preserved the exact current shelf node types, class names, child order, image attributes, placeholder flag, distance pill, audit control, tier application, and accessibility wiring. The summary preserves the same `.pp-post > .pp-photo + .pp-name + .pp-meta` structure and text.

The requested 390x844 before and after screenshots could not be captured. `/home/hatch/workspace/map-game/shots/postcard-centralize/` is outside the writable roots and returns `Read-only file system`. A harness redirected to `/tmp` reached Chromium launch, then Chromium exited before creating a page with:

```text
ERROR:third_party/crashpad/crashpad/util/linux/socket.cc:45] setsockopt: Operation not permitted (1)
process did exit: exitCode=null, signal=SIGTRAP
```

No screenshot paths exist, so no pixel comparison is claimed.

## Phase 2 behavior preservation

The in-game popup still uses the same `<figure>` object, `postcardRun` phases, `postcardTarget`, `postcardSettleAt`, `whenPostcardDone`, late-photo abandonment, thumbnail swap, and earn-toast gate. No state-machine branch was changed.

The timing constants are unchanged:

```text
POSTCARD_POP_MS = 560
POSTCARD_HOLD_MS = 1500
POSTCARD_MIN_SHOW_MS = 600
POSTCARD_SETTLE_MS = 640
```

The pop animation retains its three keyframes, offsets, duration, and cubic-bezier easing. The settle animation retains its duration, cubic-bezier easing, `0.2` lift point, and `0.7` text fade point. The former image hook now animates `.pp-photo`; the former caption hook now applies the same keyframes to `.pp-name` and `.pp-meta`. The endpoint remains the exact current peek or expanded thumb rectangle.

No storage keys or shapes, earning rules, scoring, Daily pins, share text, or deployment files changed.

## Verification output

Module syntax checks:

```text
PASS src/meta/postcard-card.js
PASS src/meta/passport.js
PASS src/modes/daily-game.js
PASS src/globe/reveal.js
PASS src/game/round.js
PASS src/main.js
```

Timing comparison:

```text
Timing constants at HEAD baseline:
const POSTCARD_POP_MS = 560;
const POSTCARD_HOLD_MS = 1500;
const POSTCARD_MIN_SHOW_MS = 600;
const POSTCARD_SETTLE_MS = 640;
Timing constants in working tree:
const POSTCARD_POP_MS = 560;
const POSTCARD_HOLD_MS = 1500;
const POSTCARD_MIN_SHOW_MS = 600;
const POSTCARD_SETTLE_MS = 640;
```

Diff validation:

```text
git diff --check
exit 0
```

Regression command:

```text
SHOTS_DIR=/tmp/postcard-regression.eu8MdF scripts/regression.sh pp sh
FAIL  Passport/Daily (passport/pp-shot.mjs)
FAIL  Survival hub tap-through (passport/sh-verify.mjs)
SOME SUITES FAILED
```

Both suite logs show failure before application load, at Chromium launch:

```text
browserType.launch: Target page, context or browser has been closed
setsockopt: Operation not permitted (1)
process did exit: exitCode=null, signal=SIGTRAP
```

Logs:

- `/tmp/postcard-regression.eu8MdF/regression-logs/pp-shot.log`
- `/tmp/postcard-regression.eu8MdF/regression-logs/sh-verify.log`

## Orchestrator verification (2026-10-16 night)

The agent session's sandbox blocked its commits and browser runs (the same
read-only `.git` failure as the accounts scout). The orchestrator verified
the working tree directly:

- Module syntax checks re-run: PASS on all six touched files.
  `git diff --check` clean.
- Regression from the orchestrator's environment: BOTH suites PASS
  (Passport/Daily pp-shot, Survival hub sh-verify). The sandbox Chromium
  failure does not reproduce outside the agent sandbox.
- Passport Places shelf screenshot from the regression run
  (`~/workspace/map-game/shots/passport/4-grid.png`): the compact slot
  cards render identically (names, flags, distance pill, mystery cards).
- A scripted bullseye reveal ran end to end (0 km guess): the reveal state,
  header name and peek flow all work with the rebuilt popup code.
- Not captured: the floating popup mid-flight and the summary screen. In
  the headless sandbox the location photo arrives too slowly and the
  (unchanged) abandonment path skips the pop; long interactive captures
  also crashed Chromium twice. The summary card is the identical shared
  builder and markup as the verified shelf variant, and the reveal flow
  around the popup is covered by the passing suites and the bullseye run.
  A phone check after deploy remains the honest final proof for the
  popup's flight, as with previous reveal work.
- One deviation from the brief's code map, disclosed by the builder and
  accepted: the current Passport shelves use compact `.pp-slot` cards, not
  `.pp-post`. The shared builder preserves the compact shelf markup as a
  variant and uses the full `.pp-post` format for the summary and the
  in-game popup, which is where Sean's complaint lived.
- Open styling question at banking time: whether `.pp-post` keeps its
  slight alternating tilt or goes straight. Sean is deciding; if he picks
  straight, it is a two-line follow-up in the shared styles.

Banked by the orchestrator as one commit on top of `4a03b54`.

## Git state

Baseline `HEAD` and `origin/main` at audit time: `d4c2230`.

The phase 1 commit attempt used subject `Postcard centralize shared card component` and failed before updating the index:

```text
fatal: Unable to create '/home/hatch/workspace/map-game/demo/.git/index.lock': Read-only file system
```

The `.git` mount is read-only, so no phase 1, phase 2, or report commit hash exists and no push or `origin/main` verification was possible. No deployment was attempted.
