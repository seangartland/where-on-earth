# Brief: zoom Stage 1, instrumentation + experiment Arm B (Sonnet build lane)

Design authority: `docs/zoom-diagnosis-astra.md` in this repo (Astra, summit
lane, approved by Sean 2026-11-21). Read its section 2 (budget), section 6
(proof plan), section 7 stage 1, and the Arm B description in sections 4.4
and 6 before writing code. Sean approved Stage 1 only: instrument the
current path and build the experiment arms' harness. The page redesign
(stages 2-5) is NOT approved and is out of scope.

Hard rule: with no query params, behavior must be identical to today. Every
new behavior is param-gated. The full existing suite must stay green.

## Deliverable 1: zoom trace (`src/globe/zoom-trace.js`)

- Bounded ring buffer, 20,000 events, off by default. Enabled by `?trace=1`.
  When disabled, every API call is a no-op and no listeners are attached.
- API: `traceMark(type, data)`, `traceSpanStart(type, data)` /
  `traceSpanEnd(id, data)` or an equivalent span pair, and
  `window.__woeTrace = { dump(), clear() }` where dump() returns the events
  as a JSON-serializable array with monotonic timestamps (performance.now).
- Event coverage, per Astra section 6: input start/end (pin.js), camera
  target/current distance, window pick start/end with requested z, selected
  z, and rejection reasons, tile enqueue/dispatch/response-headers/
  body-complete with bytes, provider, zoom, cache tier (SW, LRU, network),
  bundle request/success/failure with member count and duration, decode
  start/end per tile, upload submit, window ready, first presented frame
  after ready (main.js), native-source coverage fraction of the ready
  window (native z vs ancestor fallback, from the tile source levels the
  loader already tracks), mip generation, fade start/end, abort with reason
  and bytes wasted, circuit-breaker trips, Daily prefetch dispatch and
  pause/resume.
- Instrument the existing functions in `src/globe/surface.js`
  (pickInsetWindow, startInsetWindow, fetchInsetTile, loadInsetTile,
  decodeInsetTile, pumpInsetUploads, finishInsetTile, the bundle request
  path, prefetchDailyTiles), input events in `src/globe/pin.js`, and the
  presented-frame point in `src/main.js`. Keep instrumentation thin: marks
  only, no logic changes.
- `tile-bundle-worker/src/index.js`: add Server-Timing (assembly total,
  cache hit/miss, slowest member) and make a member failure return the
  intended graceful error response instead of rejecting the handler (Astra
  section 1 found the await outside the try). CODE ONLY: do not deploy the
  worker; the orchestrator deploys.

## Deliverable 2: trace report (`scripts/sat/zoom-trace-report.mjs`)

- Reads an exported trace JSON file, prints: per-round critical-path spans
  (the dependency chain, never a sum of parallel work), request counts by
  pool (visible, bundle, daily prefetch, speculative), bytes by pool, window
  churn (builds, aborts, wasted bytes), time from last input to ready and to
  first presented frame, and native vs fallback coverage of ready windows.
- Plain node, no dependencies. Usage line in its header comment.

## Deliverable 3: Arm B, never-paused ladder prefetch (`?warm=ladder`)

Test-only experiment arm, per Astra sections 4.4 and 6:

- At round start (hook the shared round-start path in `src/game/round.js`;
  find how modes announce a new target and use the narrowest shared point),
  if `?warm=ladder` is set and the target has coordinates: compute the
  target's max-zoom footprint with the existing footprint math and enqueue
  its ladder tiles (z5/z7/z8/z9 footprints, plus z10 where inPilotZ10) into
  the EXISTING tile fetch path so compressed blobs land in the existing LRU.
  Focal (center) tiles first.
- These jobs are speculative: visible-window work preempts them; they never
  pause on pointer/wheel input (that is the point of the arm); they stop at
  round end. Record every job in the trace as pool `speculative` with bytes,
  and record when a later visible window consumes a speculatively fetched
  tile (a `spec-hit` mark) so the report can compute used vs wasted bytes.
- If the target has no coordinates (possible in PvP), do nothing.
- Save Data (`navigator.connection.saveData`) disables the arm.

## Deliverable 4: tests

- `test/zoom-trace.test.mjs`: ring bounds (oldest evicted past 20,000),
  disabled mode is a true no-op, span pairing, and a synthetic overlapping-
  events trace run through the report's span logic proving parallel work is
  not summed (extract the report's pure functions for testability if needed).
- `test/warm-ladder.test.mjs` or equivalent: param off schedules nothing;
  param on schedules focal-first jobs at round start; input pause does not
  cancel them; round end does; saveData disables. Use the repo's existing
  test style (node --test, extracted-module pattern where imports are
  impractical).
- Run the whole suite: `node --test "test/*.mjs"` must pass end to end.

## Evidence and report

- Run the local harness pattern (see shots-ux/capture.mjs and
  ~/workspace/map-game/woe-zoom-live-shots/probe-timing.mjs outside the repo;
  if you cannot read outside the clone, recreate a minimal equivalent from
  capture.mjs): boot with `?trace=1`, pin Tokyo and Madrid at max zoom,
  export the trace, run the report, and save outputs under
  `docs/zoom-stage1-evidence/` in the repo.
- Write `LANE-REPORT.md` in the repo root: what was built per deliverable,
  suite results, the harness trace findings for Tokyo and Madrid (critical
  path, biggest span, native coverage), exact phone-baseline steps for the
  owner (open the game with ?trace=1 appended, play a round, then run the
  named export in Safari Web Inspector or the in-page method you provide;
  if dump() via console is the only path, add a tiny `?trace=1` on-screen
  export button that downloads the JSON, since the owner tests on a phone
  without a tethered inspector), and every deviation from Astra's spec with
  reasons.
- Commit in logical commits on this branch (zoom-stage1) with clear
  messages. Do not deploy anything. Do not touch the page redesign.
