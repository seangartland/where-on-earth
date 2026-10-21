# Expedition summary fix report

## Stack capture

The review harness could not launch Chromium in this sandbox, so it could not
emit a browser `pageerror` stack. Chromium exited before creating a page with
`setsockopt: Operation not permitted` from Crashpad.

The required node-level reproduction, using the expedition-shaped haul result,
produced the same error and stack:

```text
TypeError: Cannot read properties of undefined (reading 'toLocaleString')
    at postcardScore (file:///home/hatch/workspace/map-game/review-work/[eval1]:1:71)
    at file:///home/hatch/workspace/map-game/review-work/[eval1]:1:97
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:223:26
    at async ModuleLoader.executeModuleJob (node:internal/modules/esm/loader:220:20)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
```

The reproduced call was `(result.base ?? result.score).toLocaleString()` with
`{ distance: 0, distanceExact: 0, postcard: { kind: 'new', tier: 3 } }`.

## Root cause

Classic expedition haul entries are created with `distance`, `distanceExact`,
and `postcard`, but have neither `base` nor `score`. The existing base-or-score
fallback therefore still evaluated to `undefined` before calling
`toLocaleString()` in `postcardSummaryCard`.

## Exact diff

```diff
-  score.textContent = (result.base ?? result.score).toLocaleString();
+  score.textContent = (result.base ?? result.score ?? 0).toLocaleString();
```

## Verification

```text
$ node --input-type=module -e "function postcardScore(result) { return (result.base ?? result.score).toLocaleString(); } try { postcardScore({ distance: 0, distanceExact: 0, postcard: { kind: 'new', tier: 3 } }); } catch (error) { console.error(error.stack); }"
TypeError: Cannot read properties of undefined (reading 'toLocaleString')
    at postcardScore (file:///home/hatch/workspace/map-game/review-work/[eval1]:1:71)
    at file:///home/hatch/workspace/map-game/review-work/[eval1]:1:97
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async node:internal/modules/esm/loader:223:26
    at async ModuleLoader.executeModuleJob (node:internal/modules/esm/loader:220:20)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

$ node --input-type=module -e "function postcardScore(result) { return (result.base ?? result.score ?? 0).toLocaleString(); } console.log(postcardScore({ distance: 0, distanceExact: 0, postcard: { kind: 'new', tier: 3 } }));"
0

$ node --check --input-type=module < src/modes/daily-game.js

$ node --check --input-type=module < src/game/round.js

$ node --check --input-type=module < src/modes/expeditions.js
```

I also attempted `node harness.mjs expeditions` from
`/home/hatch/workspace/map-game/shots/airmail-review`. It could not run because
Chromium exited at launch with the sandbox socket restriction above, before the
expedition step or screenshot could execute. Consequently, an
`expedition-complete` screenshot cannot be verified in this environment.

```text
$ node harness.mjs expeditions
browserType.launch: Target page, context or browser has been closed
[err] crashpad/util/linux/socket.cc:45 setsockopt: Operation not permitted
```
