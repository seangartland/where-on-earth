# Zoom loading round 3 report

## Yardstick

Added `scripts/sat/yardstick-deep-zoom.sh`. It derives z9 Web Mercator tiles
from the centered game-window math for San Francisco, Paris, and Rapa Nui. A
window is 6 by 4 visible tiles plus the game's one-tile margin, or 8 by 6
total. It issues fresh cache-key requests at concurrency 18 and reports
wall-clock window time, TTFB median/p90, and `cf-cache-status: MISS` share.
It also runs the no-margin control for the US window.

The sandbox run was blocked before reaching the tile host: its configured
`hatch-egress-proxy:3128` refused connections. The script now marks that as
`NETWORK_UNAVAILABLE`; zero TTFB values from the failed attempt are not
measurements. The orchestrator must run this from the clone on the VM:

```sh
scripts/sat/yardstick-deep-zoom.sh zoom3-vm-$(date +%s)
```

The required pre-change three-location baseline is therefore pending the VM
run, not fabricated here:

| Window | Site | Total | TTFB median/p90 | MISS share |
| --- | --- | --- | --- | --- |
| margin-1 | US, San Francisco | pending VM network run | pending | pending |
| margin-1 | Europe, Paris | pending VM network run | pending | pending |
| margin-1 | Remote, Rapa Nui | pending VM network run | pending | pending |
| margin-0 | US control | pending VM network run | pending | pending |

The supplied 2026-11-17 VM baseline remains the only valid available network
evidence here: cold z9 MISS TTFB was 0.88 to 1.17 s, while z7/z8 HIT TTFB was
0.54 to 0.77 s. It establishes a 0.34 to 0.63 s per-tile miss penalty, but it
does not substitute for the requested three-window result.

## Changes

- Visible tiles are sorted center-out by Euclidean distance to the focal tile;
  the margin retains a 1000-point penalty. `test/tile-priority.test.mjs`
  proves visible-before-margin and center-first ordering.
- A pinch or wheel zoom now builds only the arriving rung's focal 3 by 3 as
  low-priority prefetches immediately. It shares the existing 18-request
  burst pool, never starts ahead of queued visible tiles, and can use a slot
  ahead of the current rung's low-priority margin. It remains disabled on a
  slow connection, save-data, unsupported game modes, and at maxZ.
- At maxZ only, removed the one-tile margin. This reduces the representative
  8 by 6 window from 48 requests to its 6 by 4, 24-request visible core. With
  18 concurrent cold requests this removes a third request wave in the
  homogeneous case, from three waves to two. Small pans retain the lower-rung
  imagery already visible beneath the progressive maxZ buffer until the next
  maxZ window starts. Lower rungs keep their margins.
- Slow mode still selects one lower ladder rung, but its request cap is now
  12 rather than 6. The supplied high-latency MISS range is origin-wait
  dominated, so halving concurrency lengthens a cold window instead of
  reducing a demonstrated bandwidth bottleneck. This is a reasoned retune;
  the unavailable VM yardstick prevents a measured 6-versus-12 comparison.

The requested margin timing comparison could not be externally measured in
this sandbox. The 24-request reduction is real in the generated window list,
but the orchestrator should retain this maxZ margin change only after the
yardstick's `margin-1` and `margin-0` rows show a meaningful landing-time
win and a manual small-pan check confirms lower-rung coverage is acceptable.

## Tiered Cache case

The supplied cold-MISS versus HIT data implies that converting a MISS into an
upper-tier hit can remove roughly 0.34 to 0.63 s of TTFB for each affected
tile. Once the VM script gives a window MISS share `m`, a 48-tile old maxZ
window has about `48m` such opportunities, subject to the 18-request parallel
waves rather than simple addition. Tiered Cache should reduce repeated R2
origin trips and make cold windows approach edge-HIT behavior; it cannot make
the client ordering change faster at the network layer. The VM's measured
MISS share and p90 are the values Sean should use to judge the free dashboard
toggle.

## Verification

`node --check src/globe/surface.js` passed. The new focused test passed.
`node --test test/*.test.mjs` passed all 20 test files. `git diff --check`
passed. The browser/Chromium manual pan check cannot run in this sandbox.
The sandbox exposes `.git` read-only, so the complete worktree is left for
the orchestrator to commit.

## Orchestrator verification addendum (Muse, 2026-11-17 22:50 PT)

The yardstick was run from the VM as instructed, plus independent window
runs with real URLs (no cache-busting) at concurrency 18: Chicago z9 core
24 tiles, wall 13.1s; San Francisco z9 full 48, wall 25.8s; SF core 24
immediately after (all edge HITs), wall 13.3s. Per-tile TTFB medians were
8.2-8.6s in every run, INCLUDING the all-HIT run, and single fetches at
the same hour measured ~3.0s TTFB for a tile and 2.9s for the game
homepage, against 0.54-1.17s for identical single-tile probes at 22:16
the same evening. Conclusion: this VM's egress path was degraded during
the measurement window, so the absolute numbers measure the path, not
the tile service or a phone, and no clean margin-1 vs margin-0 ratio can
be claimed from them. What survives independent of the path: at
concurrency 18, 48 tiles need three request waves and 24 need two, so
removing the maxZ margin removes one full wave of latency from every
cold maxZ landing; the earlier same-evening probes put a cold MISS at
0.88-1.17s vs a HIT at 0.54-0.77s. The maxZ margin change is KEPT on
that structural basis, with the small-pan behavior resting on the
existing lower-rung composite beneath the progressive buffer. The
yardstick script stays in the tree for a clean-network re-run; the
ticket's real verdict remains Sean's phone feel after deploy, as with
rounds 1 and 2. Muse's own runs: root suite 111/111.
