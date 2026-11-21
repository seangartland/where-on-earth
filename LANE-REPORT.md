# Lane report: zoom Stage 1, instrumentation + experiment Arm B

Branch: `zoom-stage1`. Design authority: `docs/zoom-diagnosis-astra.md` (copied
into this repo from the design lane's checkout, since this build branch
forked before that commit landed; see Deviations). Brief: `BRIEF-zoom-stage1.md`.
Scope: Stage 1 only (instrumentation + experiment-arm harness). No page
redesign (stages 2-5), no deploys.

## What was built

### Deliverable 1: zoom trace (`src/globe/zoom-trace.js`)

Bounded 20,000-event ring buffer, off by default, enabled by `?trace=1`.
`traceMark(type, data)`, `traceSpanStart(type, data)` / `traceSpanEnd(id, data)`
pair spans by id (not call order), and `window.__woeTrace = { dump(), clear() }`
return/reset the buffer. The enabled check is read live off `location.search`
(the same convention `getSatProvider()` already uses in `surface.js`), not
memoized at import time, so the module costs nothing extra when disabled and
stays testable without a DOM.

Instrumented, marks/spans only, no logic changes:
- `src/globe/surface.js`: `pickInsetWindow` (requested/selected z, rejections,
  camera dist/targetDist), `startInsetWindow` (window-build, superseded
  aborts), `fetchInsetTile` (dispatch/headers/body-complete/abort, bytes,
  pool, cache tier), `loadInsetTile` (enqueue, LRU hits, spec-hits),
  `decodeInsetTile` (decode span, native vs ancestor), `pumpInsetUploads`
  (upload-submit), `finishInsetTile` (window-ready + native-source coverage
  fraction, fade-start, mip span), `tripInsetBreaker` (breaker-trip),
  `requestInsetBundle` (bundle span + request/success/failure with member
  count and bytes), `prefetchDailyTiles`/`pauseDailyPrefetch`/
  `resumeDailyPrefetch`/`pumpDailyPrefetch` (dispatch/pause/resume/fetch),
  and `updateInsets` (a throttled camera sample, fade-end detection).
- `src/globe/pin.js`: `input-start`/`input-end` on the first/last pointer of
  a gesture, `input-wheel` per wheel notch.
- `src/main.js`: `frame-presented`, the first `renderer.render` call after a
  window's `awaitingFirstFrame` flag is set in `finishInsetTile`.
- `src/game/round.js`: `round-start` on every `showRound()` call, used by
  the report to segment the trace into rounds.

`tile-bundle-worker/src/index.js`: fixed the bug Astra §1 found — the member
`Promise.all` sat outside the function's only `try`, so one failing member
(a 404 source tile) rejected the whole handler instead of returning the
intended `response('bundle failed', 500)`. Both the member fetches and
`buildTileBundle` now share one `try`/`catch`. Added `Server-Timing`
(`assembly;dur=`, `cache;desc=hit|miss`, `member;dur=<slowest>`) and
`Timing-Allow-Origin: *` on every response. Verified with
`test/tile-bundle-worker.test.mjs` (a member-failure case, a success case,
and a cache-hit case) — code only, not deployed.

### Deliverable 2: trace report (`scripts/sat/zoom-trace-report.mjs`)

Plain node, no dependencies, usage line in the header comment. Splits a
dumped trace into rounds on `round-start` marks and prints, per round: a
critical-path table (busy wall-clock time per stage — `window-pick`,
`tile-fetch`, `decode`, `bundle`, `mip`, `daily-fetch`, `speculative-fetch` —
computed as the **union** of overlapping spans, never their sum), request
counts and bytes by pool (`visible`, `prefetch`, `bundle`, `daily`,
`speculative`), window churn (builds/aborts; wasted bytes is explicitly
`not measured`, see Deviations), native-vs-fallback coverage of ready
windows, time from the last input mark to `window-ready` and to
`frame-presented`, and `?warm=ladder` used-vs-wasted bytes. The pure
functions (`pairSpans`, `unionDuration`, `splitRounds`,
`requestCountsByPool`, `bytesByPool`, `windowChurn`, `nativeCoverage`,
`timeFromLastInputTo`, `criticalPathSpans`, `specHitBytes`, `buildReport`)
are exported for `test/zoom-trace.test.mjs`.

### Deliverable 3: Arm B, `?warm=ladder`

Split into a pure core, `src/globe/warm-ladder.js` (param gate, the
Save-Data/coordinate gate, the focal-first 3×3-per-rung footprint math, and
a THREE-free job queue with round tokens), and the wiring in `surface.js`
(`scheduleWarmLadder`/`stopWarmLadder`/`warmLadderParam`, which resolve keys
through the existing `tileProvider`/`tileURL` and land blobs in the existing
`inset.lru` via `lruPut`). `src/game/round.js`'s `showRound()` — the
narrowest point every mode (Daily, PvP, Expedition, Survival, Endless,
Trivia, Pack) passes through to announce its new target — calls
`scheduleWarmLadder(item.lat, item.lng, ++warmLadderToken)` when `?warm=ladder`
is set and the item has finite coordinates, else `stopWarmLadder()`.

- Rungs: the provider's own ladder (`[5,7,8,9]`) plus z10 **per tile**,
  gated by `inPilotZ10(10, x, y)` on each of the 3×3 candidates, not the
  whole footprint — so no request ever targets a cell outside the pilot
  (where default z10 is mostly 404s and would be pure waste).
- Every job is traced as pool `speculative` with bytes; `loadInsetTile`'s
  LRU-hit path checks `inset.specKeys` and records a `spec-hit` mark with
  bytes the moment a later visible load consumes a speculatively-fetched
  tile, so the report can compute used vs. wasted bytes.
- Never pauses on input: `pin.js`'s pointerdown/wheel handlers have zero
  reference to the warm-ladder module (verified by
  `test/warm-ladder.test.mjs`'s source-regex check) — only
  `pauseDailyPrefetch`/`prioritizeInsetZoom` are called there, unchanged.
  `stopWarmLadder()` only clears not-yet-dispatched jobs (the same "stops
  new dispatch, not already active requests" contract Daily prefetch's own
  pause already uses); it runs at the start of every `showRound()`, which is
  what "stops at round end" means for a pool that has no abort-on-pause of
  its own.
- No coordinates (Borders returns `null` from `currentItem()`; PvP's
  pre-reveal item is `{ id, short, clue }` with no lat/lng) → `stopWarmLadder()`,
  nothing scheduled.
- `navigator.connection.saveData` → `shouldScheduleWarmLadder` returns false,
  nothing scheduled.

### Deliverable 4: tests

`test/zoom-trace.test.mjs` (5 tests): ring-buffer eviction past 20,000 in
order, span pairing by id (including out-of-order closes), disabled mode is
a true no-op, and a synthetic overlapping-events trace proving the report's
`unionDuration` merges parallel spans instead of summing them (two decodes
0–100ms and 50–180ms sum to 230ms naively but union to the correct 180ms).

`test/warm-ladder.test.mjs` (9 tests): the param gate is exact; Save Data
and missing coordinates both disable scheduling; focal-first ordering per
rung; a known/cached tile is dropped from the plan; z10's per-tile pilot
gate; the queue respects its concurrency and round tokens; `stop()` drops
only not-yet-dispatched jobs; `round.js` wires the gate and both
functions from `showRound()`; `pin.js` has zero textual reference to the
warm-ladder module.

`test/tile-bundle-worker.test.mjs` (3 tests, not explicitly named in the
brief but added to verify the Deliverable 1 worker fix): member failure
returns the graceful response, a success case assembles and round-trips via
`unpackTileBundle`, a cache hit skips origin fetches — all via stubbed
`fetch`/`caches` globals, no network.

Full suite: `node --test "test/*.mjs"` → **152/152 passing** (135 baseline +
17 new). Baseline (pre-change, same command) was 135/135.

Default-path verification (the brief's hard rule): a headless boot of
`https://game.local/` with no query params produced zero page errors and
`window.__woeTrace.dump()` stayed at length 0 (object exists, inert). A
boot with `?trace=1` showed the on-screen "Export trace" button and
produced a valid downloadable JSON array end to end (Playwright `download`
event, 3544 bytes, parsed as an array).

## Harness evidence (`docs/zoom-stage1-evidence/`)

Harness: `scripts/sat/zoom-trace-probe.mjs`, a Playwright script following
this repo's `shots-ux/capture.mjs` pattern (local static route for
`game.local`, `--use-angle=swiftshader` software rendering, the Hatch WebGL
domain-policy flags) and the proxy-through-to-real-tiles approach of the
outside-repo `~/workspace/map-game/woe-zoom-live-shots/probe-timing.mjs`
(not importable from here, so reproduced rather than imported, per the
brief). It boots with `?trace=1`, pins the camera directly on Tokyo
(35.7, 139.7) then Madrid (40.4, -3.7) at `dist = targetDist = 1.05`
(re-asserted every 50ms against idle auto-spin/easing), waits 25s, dumps
`window.__woeTrace`, and runs `zoom-trace-report.mjs` over each dump.
Outputs: `{tokyo,madrid}-trace.json` (raw dump) and `{tokyo,madrid}-report.txt`
(the report's text output).

**Tokyo** (z9 window, default mosaic — Madrid's pin lands inside the pilot,
Tokyo's does not): one `window-build` at t≈7.1s picked z9 directly
(`requestedZ: 10 → selectedZ: 9`), 35 tiles / 15 visible. Over the
remaining ~23s: 42 `tile-fetch` dispatches (36 completed, 27×200/9×404 —
consistent with Astra's documented z9 holes) totalling 22.4s of busy
wall-clock time (union, not sum) on that stage alone; a bundle request was
also sent and came back as a **graceful `bundle-failure`** (the worker's
fixed error path — a good confirming sign the fix behaves correctly under
a real 404 member, not a crash); `daily-fetch` (17.6s busy) and
`tile-fetch` overlapped heavily, which is exactly the kind of parallel
work the union calculation is for. 28 decodes completed (310ms busy) but
only 14 of 28 decoded bitmaps had been uploaded by dump time, and the
window never reached `ready` in the 25s window.

**Madrid** (z10 pilot window): one `window-build` at t≈4.9s picked z10
directly, 40/40 visible tiles, no bundle request (z10 is excluded from
bundling by design — pilot tiles stay per-tile). 40 dispatches, 39
completed, all 200s (no holes in the pilot footprint, unlike Tokyo's
default z9). `tile-fetch` busy 17.4s, `daily-fetch` busy 13.9s (overlapping).
39/39 decodes completed; 30/40 uploaded by dump time; the window also
never reached `ready` within 25s.

**Reading these numbers**: neither window reached `ready` inside the 25s
capture window, so **native-coverage-of-ready-windows is not available**
from this run for either site, and the "time from last input to
ready/frame" fields are `n/a`. This is consistent with Astra §6's own
explicit limitation — "software-rendered headless is only for
request/state correctness, never absolute performance acceptance" — and
with the sandbox's network path to `tiles.where-on.earth` adding latency
that a real phone's edge-cached path would not have. What this run **does**
establish, as request/state-correctness evidence: every instrumented event
type fires correctly end to end (window-pick, window-build, tile-fetch,
tile-headers, tile-body-complete, decode, upload-submit, bundle, daily
pool, fade-start), the report's union-vs-sum critical path correctly shows
heavy overlap between pools, and the bundle worker's fixed error path
returns the graceful response under a real 404 member instead of crashing.
It does not establish millisecond-level phone timings — that is exactly
what the phone-baseline steps below are for.

## Phone-baseline steps for the owner

1. Open the game on the phone with `?trace=1` appended to the URL (e.g.
   `https://where-on.earth/?trace=1`).
2. Play a round as usual (clue, pin, zoom in, Lock in, reveal).
3. Tap the small "Export trace" button fixed to the bottom-right corner of
   the screen (only present with `?trace=1`). It downloads
   `woe-trace-<timestamp>.json` through the normal iOS Safari download
   sheet — no tethered inspector needed.
4. Send that file back; run `node scripts/sat/zoom-trace-report.mjs woe-trace-<timestamp>.json`
   for the per-round breakdown, or inspect the raw JSON directly.

(`window.__woeTrace.dump()`/`.clear()` are also available from a connected
Web Inspector, if one is ever available, but the export button is the
primary path since the owner tests on a phone without one.)

## Deviations from Astra's spec, with reasons

- **`docs/zoom-diagnosis-astra.md` was copied into this repo**, not
  inherited by history. This build branch (`zoom-stage1`) forked from the
  same commit the design lane (`woe-zoom-design-build`) also forked from;
  the design doc was committed on that sibling branch after the fork point
  and was not yet pushed anywhere this branch's remote could fetch it. The
  content is byte-identical to the design lane's checkout at the time of
  this build.
- **Cache-tier granularity**: events record `cacheTier` as `'lru'` (served
  from the in-memory blob cache, no fetch) or `'network'` (a real `fetch()`
  happened). Astra §6 also asks for a distinct `'SW'` tier; the Service
  Worker intercepts requests before they reach `fetchInsetTile`, and
  distinguishing a SW cache hit from a true network response at the
  `fetch()` call site needs Resource Timing heuristics (`transferSize`),
  which Astra §6 itself flags as limited cross-origin in Safari. Stage 1
  keeps the "marks only, no logic changes" instrumentation thin and reports
  both as `'network'`; a later stage can add the Resource Timing
  correlation Astra describes.
- **Abort byte-loss is not measured.** `windowChurn.wastedBytes` is always
  reported as `null` ("not measured"), never a fake zero. Measuring actual
  bytes-in-flight at abort time would need a streaming read of the response
  body (`response.body.getReader()` with running byte counts), which is a
  logic change to the fetch path, not a mark — out of scope for "thin
  instrumentation, no logic changes."
- **Critical-path granularity is per-stage, not per-visible-pixel.** Astra
  §2 describes the correct latency model as a per-pixel dependency graph
  (dispatch → source-chain completion → decode → upload → display). Stage
  1's report computes the union of overlapping spans **per stage type**
  (`tile-fetch`, `decode`, …), which already prevents the specific failure
  Astra warns about (summing parallel requests into a false total) but does
  not reconstruct the full chain for one specific pixel. Tile-level events
  are not tagged with the window generation they belong to, so the report
  cannot yet isolate "the chain for window gen N's slowest visible tile"
  from a round with multiple window builds. This is a reasonable stage-1
  scope boundary given the brief's "marks only" instruction; a later stage
  could add a `gen` field to tile-level marks to close this gap.
- **Fade-end detection samples once per `updateInsets` tick** (same
  300-500ms throttle as window evaluation), not every render frame, to
  avoid an unconditional per-frame trace call. `frame-presented` is the one
  mark that does run from the main render loop, but it is gated by a cheap
  boolean flag (`awaitingFirstFrame`) set only on the rare `window-ready`
  edge, not by re-evaluating trace state every frame.
- **Harness evidence did not reach `window-ready`** for either site in the
  25s capture window (software rendering + sandboxed network path); see
  the Harness evidence section above for what it does and does not
  establish.
