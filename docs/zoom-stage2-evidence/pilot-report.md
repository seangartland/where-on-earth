# Renderer pilot report

Pilot build for BRIEF-renderer-pilot.md (Astra move 1, step 3). Flag-gated
behind `?pages=1`, partial coverage, no deploy. This report labels every
number by how it was obtained.

## What was built and where

New, additive modules. Nothing in them runs unless `?pages=1` is present and
the round's location resolves inside the staged pilot coverage.

- `src/globe/page-plan.js`: pure, dependency-free window-plan resolution and
  residency/transfer accounting. No DOM, no network, no THREE.
- `src/globe/page-cache.js`: pure LRU cache with per-round pinning, so the
  active round's plan is never evicted.
- `src/globe/page-manifest.js`: browser loader for the two staged manifests
  into the lookup structures page-plan.js resolves against.
- `src/globe/page-store.js`: fetch, decode and GPU-texture-upload lifecycle
  for a resolved plan, instrumented through zoom-trace.js, backed by the
  cache above.
- `src/globe/page-render.js`: builds one small curved quad mesh per resident
  page, added as a child of `globe` (so it inherits the camera/rotation math
  for free), and swaps which level's meshes are visible as the camera zooms,
  with zero fetch/decode/upload at swap time.

Two small, additive touches to existing files:

- `src/game/round.js`: `showRound()` calls `preparePageRound(item)` right
  next to the existing `traceMark('round-start', ...)` call. The function
  returns synchronously after a single flag check when `?pages=1` is absent.
- `src/globe/surface.js`: `updateSatellite(dt)` now calls
  `updatePageRender()` instead of `updateInsets(dt)` only when
  `pageRenderActive()` is true, which is only ever true after a round
  resolved inside the staged pilot coverage with the flag on. `updateInsets`,
  `evaluateInsets`, `startInsetWindow` and every other legacy tile-path
  function are byte-for-byte unchanged.

Tests: `test/page-plan.test.mjs`, `test/page-cache.test.mjs`. Full suite
green: `node --test "test/*.mjs"` reports 168 pass, 0 fail (verified by
running it after every edit in this lane, most recently right before writing
this report).

## How plans resolve

`resolvePlan({ lat, lng, portrait, ... })` in `page-plan.js`:

1. Converts `(lat, lng)` to a z9 tile coordinate and builds a margin-included
   footprint around it: 7 wide x8 tall tiles portrait, 8 wide x7 tall
   landscape. This size was chosen empirically against what is actually
   staged in this clone (see "Known limits" below), not against the larger
   phone-footprint margins feasibility-report.md measured.
2. Converts that footprint to z9 page keys. Verified against
   `docs/zoom-stage2-evidence/revision-manifest.jsonl`: adjacent z9 keys'
   `bounds` are contiguous, not overlapping, so each key is a
   `floor(tile/2)` page-grid index, the same convention z7/z5 context pages
   use at `floor(tile/4)`, not a native tile coordinate.
3. Converts the footprint's geographic bounds to z7 and z5 context page keys
   the same way.
4. Looks up every key in the manifest index. Any miss reports
   `{ inCoverage: false, reason, key }` so the caller falls back to the
   existing tile path. No z9/z7/z5 asset is ever fetched for an out-of-
   coverage round.
5. If the resolved z5 key set is exactly `{5/3/2, 5/3/3}` or `{5/1/2, 5/1/3}`
   (the two windows feasibility-report.md closed with a strip), substitutes
   the matching feasibility strip pair (`M` or `L`) for the normal 4x4 z5
   page. Every other window keeps the regular z5 page.
6. Sums each asset's full RGBA8 mip-chain bytes (`mipChainBytes(w, h)`,
   verified in the test suite to reproduce the feasibility report's
   1,419,688 / 5,635,496 / 2,828,544 byte figures exactly) for residency,
   and each asset's actual encoded byte size for transfer, and checks both
   plus the texture count against the 3,145,728 / 67,108,864 / 40 caps.

`selectRenderPath(...)` wraps this: with the flag off it returns
`{ path: 'tiles', reason: 'flag-off' }` without calling `resolvePlan` at all.

## Cache accounting against the caps

`page-store.js` holds one `createPageCache({ maxTextures: 40, maxBytes:
67108864 })` for the whole session. `prepareRoundPages(plan, token)` touches
every asset in the plan, pins all of them to `token`, then runs eviction:
unpinned entries are evicted oldest-first until both caps are satisfied, or
until every remaining entry is pinned (in which case the active round's own
plan can legitimately exceed a cap, and that is reported rather than
silently dropping pages the round needs). `test/page-cache.test.mjs` proves
the texture-cap eviction, the byte-cap eviction, that a pinned key survives
eviction even over both caps, that `unpin` releases it back to normal LRU
behavior, and that re-touching a key moves it to the most-recently-used end.

## Harness measurements (?pages=1&trace=1)

**Mechanism check only.** These are software-rendered Chromium (swiftshader)
runs on this VM, not Sean's phone, and do not measure the 100/300 ms gates.
They prove the preparation and zero-post-input-work mechanism works end to
end against the real staged assets; only Sean's phone trace can decide the
actual gates. Produced by `scripts/sat/page-trace-probe.mjs`, which calls
`preparePageRound({ lat, lng })` directly (there is no console-exposed way
to force a round's target to a specific coordinate from outside, so the
harness and the phone procedure below both call the function directly)
against each of three locations, then pans/zooms the camera there, and
summarizes with `scripts/sat/page-trace-report.mjs`. Raw traces and reports
are under `docs/zoom-stage2-evidence/pilot-trace-evidence/`.

| Location | Serving path | Plan | Prepare duration | Prepared before first input | Post-input pages fetch/decode/upload |
|---|---|---|---|---|---|
| Madrid (40.4, -3.7) | pages | 24 textures, residency 45,321,840 B, transfer 2,180,033 B, z5 mode strip (M), fits all caps | 983.0 ms | true | 0 |
| Congo landscape (-0.70, 24.6) | pages | 22 textures, residency 56,527,984 B, transfer 1,298,596 B, z5 mode page (regular 4x4), fits all caps | 886.8 ms | true | 0 |
| Buenos Aires (-34.6, -58.4), outside coverage | tiles (reason: z9-gap) | n/a | n/a | n/a | 0 |

Every level change observed in these runs (`zoff -> z7`, `z7 -> z9`) was a
pure visibility swap with zero fetch, decode or upload span recorded against
it, matching the build's intent.

The flag-off / unchanged-baseline claim (no page fetches, no plan work
beyond the flag check, for any round with `?pages=1` absent) is verified by
code inspection, not a fresh capture: `preparePageRound` checks
`pagesEnabled()` first and returns before calling `resolvePlan`, so
`pageRenderActive()` can never become true without the flag, and
`updateSatellite` only skips `updateInsets(dt)` when `pageRenderActive()` is
true. This is a structurally unreachable branch with the flag off, and the
full existing test suite (168 tests, including the round.js and surface.js
dependent suites) passes unchanged after this lane's edits.

## Exact phone-test procedure for Sean

Real rounds pick targets from the whole city/landmark pool, and the staged
pilot coverage is about 11 small reference windows (Madrid, Tokyo, Congo,
Great Lakes, Majuro, ordinary-land, ocean, antimeridian, high-latitude,
boundary, holes). A normal round landing inside that coverage by chance is
very unlikely, so the procedure pins the renderer directly at a known
covered location rather than waiting for a matching round:

1. Open the game at `<host>/?pages=1&trace=1` on your phone.
2. Open a connected remote-debugging console (Safari Web Inspector or
   `chrome://inspect` depending on the phone), and in the page's console run:
   ```js
   const { preparePageRound } = await import('/src/globe/page-render.js');
   await preparePageRound({ lat: 40.4, lng: -3.7 }); // Madrid, in coverage
   ```
3. Spin and zoom the globe to Madrid by hand (drag to spin, pinch to zoom);
   the pilot renderer is bound to the geography you pinned above, not to
   whatever round is on screen. Zoom in past the point where satellite
   detail would normally appear, hold, then zoom back out, then back in
   again.
4. Export the trace from the same console:
   ```js
   copy(JSON.stringify(window.__woeTrace.dump()))
   ```
   and paste the clipboard contents into a `.json` file, or run
   `node scripts/sat/page-trace-report.mjs <that file>` for the summary.
5. Repeat step 2 with `{ lat: -0.70, lng: 24.6 }` (Congo, a landscape-context
   window) and with any coordinate far from the staged list (for example
   `{ lat: -34.6, lng: -58.4 }`, Buenos Aires) to see the outside-coverage
   fallback.

## Known limits

- **Landscape bounded assets are not encoded.** feasibility-report.md Part 2
  closed Congo/Great Lakes/Ocean phone-landscape windows using new
  visibility-bounded z7/z5 assets that were argued, not cut. This pilot was
  told to use the regular revision context pages for landscape windows
  instead, and does: the Congo measurement above resolved `z5Mode: page`
  (the normal 4x4 context page), not a bounded asset. It happened to fit the
  64 MiB cap here only because this pilot's own footprint (8x7 tiles) is
  smaller than the full phone-footprint margins feasibility-report.md
  measured (which found Congo/Great Lakes/Ocean exceeding the cap at 10.6 to
  27.7 MiB over, using the full margin). A pilot plan sized to match that
  full margin would very likely reproduce that overage; this was not tested
  here.
- **Pages are served from the game origin, not the tiles host.** Production
  serving would move pages to `tiles.where-on.earth`; this pilot reads
  `/assets/pages-pilot/...` and `/docs/zoom-stage2-evidence/revision-
  manifest.jsonl` same-origin, which measures renderer preparation behavior
  but not real tile-host latency, TLS, or CDN caching.
- **Seam defects are not repaired.** stage2-revision-report.md flagged
  several pages (notably 5/3/2 against 5/3/3, p99 219 against a control
  range of 47 to 110) as a likely visible discontinuity. Source fidelity is
  a separate lane; this pilot renders whatever pixels are staged.
- **Coverage is limited to the staged page set**, and within that, to
  whatever footprint size (7x8 / 8x7 z9 tiles) actually fits the manifest's
  narrow, per-window-staged domain. Congo's actual staged z9 domain is 8x8
  tiles and Madrid's is 7x8; a differently-sized or differently-centered
  footprint for the same site can fall outside coverage even though the
  site is nominally staged. This is why the harness and phone procedure use
  the exact coordinates verified against this clone's actual files, not
  arbitrary points inside each site's general area.
- **Context pages are split across two staged directories.** 19 of 24 z7
  keys and all 13 z5 keys exist under `assets/pages-pilot/pilot/` (the
  original Stage 2 4x4 pages); 5 z7 keys cut new for the revision
  (`7/17/15`, `7/17/16`, `7/30/15`, `7/5/17`, `7/5/18`) exist only under
  `assets/pages-pilot/revision/`. `page-manifest.js` tries `pilot/` first and
  falls back to `revision/` for context keys; this was discovered by running
  the harness against a 404 and is not visible from the manifest alone,
  since `docs/zoom-stage2-evidence/revision-manifest.jsonl` lists all 588
  keys as present regardless of which directory actually holds the file.
- **Rendering is a simplified flat-quad-per-page mesh, not the shared-shader,
  mip-crossfading sphere patch system docs/zoom-diagnosis-astra.md §4.2
  describes.** Each resident page is one small `MeshBasicMaterial` quad
  (subdivided 4x4 to follow the sphere's curvature) added as a child of the
  globe object. It does not share the main globe shader's satellite color
  mixing, limb darkening or ocean treatment, and levels are hard-cut on
  visibility rather than mip-crossfaded. This proves the prepare-before-
  input latency and zero-post-input-work hypothesis without the larger
  renderer rewrite the full design estimates at 1,200 to 1,800 production
  lines; it is not a visually finished path.
- **The 100/300 ms latency and p95/median gates are not measured here.**
  Only the mechanism (preparation completing before input, zero post-input
  work, residency/transfer/texture accounting) is measured on this VM. The
  deciding measurement is Sean's phone trace via the procedure above.

## Boundaries honored

No deploy. The default (`?pages=1` absent) behavior, the tile path, the
satellite provider config, and every existing data file are unchanged
(verified: full test suite green, and the flag-off path is structurally
unreachable as described above). Nothing was committed; everything in this
report is in the working tree for the orchestrator to verify, bank and
deploy separately. Zero em dashes were used anywhere in this report, the new
code, or its comments.

## Banking errata (2026-11-21, after Sean's first phone trace)

The first production phone trace (woe-trace-1795323112240.json) showed
every round falling back to tiles with reason manifest-load-failed: the
revision manifest was fetched from /docs/zoom-stage2-evidence/, which
the deploy does not publish, so it 404'd in production. The local
harness served the raw repo tree and masked this. Fix: the runtime
manifest now lives at /assets/pages-pilot/revision-manifest.jsonl
(page-manifest.js), with the docs copy kept as the evidence record.
The phone gates remain unmeasured until a trace runs with the page
path actually serving.
