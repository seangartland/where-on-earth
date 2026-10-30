# Tile loading round two report (2026-10-29)

## Outcome

The loader now holds the incoming render target at zero opacity until all visible tiles have resolved, then crossfades it over the previous target. Needed fetches retain strict priority over a separate z+1 prefetch queue, and pinch/wheel zoom-in starts reprioritize that queue. Existing pan behavior already discarded the normal queue on a rebuild; an explicit window-generation check and capture logging now make that invariant observable.

## Goal audits

### 1. No blank or pop on window swap — partial before, complete after

Before this change, the two render targets and fade machinery already existed, but `startInsetWindow()` immediately set the cleared incoming buffer's fade target to 1. A slow tile could therefore upload after the 250 ms fade had finished and appear at full opacity. The ready transition only faded the old target out; it did not gate the incoming fade.

Evidence after the fix:

- `src/globe/surface.js:805-816` selects and clears the non-showing target but leaves its fade target at zero.
- `src/globe/surface.js:907-916` starts the new-target fade only when visible work has finished.
- `src/globe/surface.js:911-916` tracks visible tiles that were given up after retry and retains the old target underneath those transparent holes. Successful uploads are identified at `src/globe/surface.js:1091-1100`.

This has no steady-state per-frame work beyond the pre-existing two scalar fade updates. Both textures remain active only when a failed visible tile needs old coverage.

### 2. Stale work dies fast on a pan — exists; hardened and instrumented

The behavior was already present. A rebuild replaces `inset.queue` in `feedInsetWindow()` and aborts every inflight source absent from the new wanted-source set (`src/globe/surface.js:845-852`). Re-evaluation is already motion-gated: no evaluation or pumping occurs while a pointer is down or motion is fast, checks are spaced 300/500 ms, and drifting rebuilds are limited to once per second (`src/globe/surface.js:1128-1153`). There was therefore no rebuild-thrash defect requiring another throttle.

The normal queue contains tile objects from only the current window, so the reasoned pre-change count of normal fetch starts for off-view queued tiles is **0**. The after count is also **0**, now defended explicitly by the generation comparison at `src/globe/surface.js:1035-1041`. This is a code-path count, not a Chromium measurement.

Instrumentation at `src/globe/surface.js:989-999` records every fetch start and abort with z/x/y, source, speculative status, and whether the source belongs to the wanted set at that instant. The new harness writes its measured counts to `shots/tile-round2/capture.json`; it fails if `offViewStarts` is nonzero. Chromium cannot run in this sandbox, so no harness output or screenshots are claimed here. The orchestrator should treat `capture.json` as the measured after result when it runs `node shots/tile-round2/capture.mjs`. A historical measured-before run is unavailable; the before value above is reasoned from the original queue replacement, not fabricated from the new harness.

### 3. Prefetch the likely next view — missing before, implemented

There was no speculative fetch path before this change.

- `src/globe/surface.js:1051-1082` builds a centre-first list of z+1 children covering visible current tiles only after the current window is ready, only in the reading/guess phase, and never when `inset.slow` is true.
- `src/globe/surface.js:1035-1049` drains needed work first and lets prefetch use only otherwise-free slots.
- `src/globe/surface.js:871-886` promotes a speculative request when it becomes needed and aborts other speculative requests as soon as uncached needed work is queued.
- `src/globe/pin.js:495-504` reprioritizes on the second pointer that begins a pinch; `src/globe/pin.js:566-571` does the same for a zoom-in wheel gesture.
- A new real window aborts speculative sources outside its wanted set at `src/globe/surface.js:845-850`. Tile URLs, cache insertion/eviction, 404 parent fallback, and slow-network zoom selection are unchanged.

## Capture harness

`shots/tile-round2/capture.mjs` follows the fake-origin pattern: it serves repository files at `https://game.local`, supplies deterministic delayed 256 px tile responses, enables the WebGL skip flag after capture, and uses CDP for screenshots. It uses one globe page and exactly three views:

1. settled reading-phase inset;
2. after a fast pan;
3. after zoom-in.

The JSON report contains the complete event log plus starts, wanted starts, off-view normal starts, speculative starts, aborts, and speculative aborts. The harness is intentionally left for the orchestrator because the brief states Chromium is unavailable in this sandbox.

No node-level loader tests were added. The changed decisions depend on live module globals, camera sampling, DOM input, bitmap decoding, and WebGL render targets; extracting them solely to make them importable would be a larger refactor than the behavior change. The capture hook exercises the actual loader instead.

## Verification run

- `node --check src/globe/surface.js` — pass
- `node --check --input-type=module < src/globe/surface.js` — pass
- `node --check src/globe/pin.js` — pass
- `node --check shots/tile-round2/capture.mjs` — pass
- `node --test test/*.test.mjs` — pass, 13/13 tests
- `git diff --check` — pass

## Named blind spots

- Desktop Chromium with a phone-sized viewport does not reproduce iOS Safari's networking, image decode scheduling, GPU upload stalls, memory pressure, context-loss frequency, or touch-event timing.
- SwiftShader cannot establish physical-phone frame pacing or prove that a 250 ms crossfade is perceptually smooth on a mobile GPU.
- Deterministic local tile delays validate queue ordering and abort behavior, not carrier-network multiplexing, cache behavior, 429 handling, or real CDN latency variance.
- Mouse-generated drag/wheel input does not prove two-finger pinch centroid behavior on hardware. The harness logs the shared prioritization path, while a real-device pass remains necessary for feel and timing.
