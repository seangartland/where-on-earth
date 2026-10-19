# G1 repair and tune round

Date: 2026-10-19

## Outcome

The Antarctic z8 and z9 release blocker was repaired at the compositing
mechanism. The 20 acceptance windows were re-finished from the existing
untoned quarterly cache, without acquisition, resampling, Process API use, a
base render, or 10 m work. Nine windows are fully sourced and have no observed
release-gate failure. Eleven low-coverage windows remain **coverage-limited**;
they are not scored as passes or fails.

The fresh blind comparison is at
`scripts/sat/work/ab-tune-round/ab.html`, with an embedded offline build at
`scripts/sat/work/ab-tune-round/ab-standalone.html` and the withheld mapping at
`scripts/sat/work/ab-tune-round/ab-key.json`. Both comparison builds are
source-blind: the page uses only opaque `p-*` and `q-*` asset names, and the
standalone build embeds the JPEG data.

## Antarctic diagnosis and repair

Evidence was inspected before changing the repair:

- The raw selected and individual Q1-Q4 rasters for `6/21/45`, `8/84/186`,
  and `9/171/375` contain coherent observed ice and water. In particular, the
  Q1 z8/z9 imagery does not contain the flat Natural Earth-shaped gray lobes
  seen in the old finished mosaics.
- The old finished z8/z9 rasters switch between that observed imagery and the
  Blue Marble ocean precisely at the per-window Natural Earth land/ice-shelf
  mask. The Antarctic ice margin is seasonal and does not match that static
  polygon. Valid dark water and bright ice on either side of the polygon were
  therefore clipped into gray lobes, halos, and hard geometric edges even
  though the selected raster reported zero nodata.
- A draft brightness-based rejection was also tested and rejected: it removed
  legitimate moderate-brightness ice while leaving the underlying coastline
  mismatch visible.

The repaired polar path uses the selected raster wherever its observations
band is positive and falls back to the continuous ocean source only where the
selected raster has no observation. It does not apply the Natural Earth
coastline to polar windows. Southern high-latitude detail again prefers Q1,
the local summer quarter; highest-observation fallback remains unchanged.

`qa.json` now records `maskEdgeQa` per window. Polar windows declare
`mode: "observations"`, require `geometricMaskPixels: 0`, count boundaries of
real source gaps separately, and label nonzero-nodata windows
`coverageLimited`. Thus a geometric polar-mask composite is no longer cleared
merely because nodata is zero. The fully sourced Antarctic z8 and z9 windows
both pass this invariant with zero source-gap edge pixels. Antarctic z6 has
5,097 source-gap edge pixels and is explicitly coverage-limited.

## Ocean continuity and finish tuning

Ocean luminance is normalized before the finish curve. A zoom-dependent local
low-frequency estimate is removed from the single global Blue Marble sample,
which suppresses its broad acquisition-panel changes while retaining local
bathymetric contrast. This is upstream of the tone curve; the curve is not
being used as a seam repair.

The selected finish settings follow the review's requested trial magnitudes:

| Scope | Final setting |
| --- | --- |
| Global land | gain 2.9 (unchanged), gamma 0.90, saturation 1.05 |
| Global ocean | offset 0.08, scale 0.65, gamma 0.92, chroma 0.64 |
| Bay z8 | gain 3.19 (+10%), gamma 0.87 |
| Iceland z4/z6 | gain 3.09 (+6.6%), gamma 0.87 |
| Sydney z9 | gain 2.65, saturation 0.99 |
| Antarctic z4/z6/z8/z9 | gain 2.75 (-5.2%), highlight knee 0.66 |

Fiji z9 retains visible turquoise reef/coast separation at ocean chroma 0.64.
The global land gain was not increased.

## Acceptance-window mapping

“Assessable” means the cached quarterly sources cover every pixel in the
768-by-768 window. “Coverage-limited” means the visual may still expose source
footprints; it is deliberately not called a pass or fail. Page-scale visual
inspection refers to the newly generated opaque A/B panels.

| Site | Zoom | Prior | Round result | Gate evidence |
| --- | ---: | --- | --- | --- |
| Bay Area | 4 | fail | coverage-limited | 85.1% nodata; ocean normalization removes the former broad tone blocks where source is present, but the window is not scoreable. |
| Bay Area | 6 | weak | coverage-limited | 35.6% nodata; not scoreable. |
| Bay Area | 8 | fail | assessable | Zero nodata; local +10% gain/gamma trial restores land midtones; no page-scale ocean boundary observed. |
| Bay Area | 9 | pass | assessable | Zero nodata; clean coast and no mask geometry. |
| Iceland | 4 | fail | coverage-limited | 32.8% nodata; not scoreable. |
| Iceland | 6 | weak | coverage-limited | 22.4% nodata; not scoreable. |
| Iceland | 8 | weak | assessable | Zero nodata; terrain, snow, and coast remain distinct; no page-scale boundary observed. |
| Iceland | 9 | pass | assessable | Zero nodata; coherent ice margin and terrain. |
| Fiji | 4 | fail | coverage-limited | 90.9% nodata; not scoreable. |
| Fiji | 6 | fail | coverage-limited | 81.2% nodata; not scoreable. |
| Fiji | 8 | weak | coverage-limited | 38.9% nodata; not scoreable. |
| Fiji | 9 | weak | assessable | Zero nodata; ocean chroma reduction retains turquoise reef separation and removes the excessive cyan cast. |
| Sydney | 4 | fail | coverage-limited | 73.1% nodata; not scoreable. |
| Sydney | 6 | pass | coverage-limited | 6.3% nodata; retained as coverage-limited despite the prior pass. |
| Sydney | 8 | weak | assessable | Zero nodata; clean coast and no page-scale ocean boundary observed. |
| Sydney | 9 | fail | assessable | Zero nodata; local gain 2.65 and saturation 0.99 remove the prior exposure/color excess. |
| Antarctic Peninsula | 4 | fail | coverage-limited | 71.0% nodata; no static polar mask is applied, but the window is not scoreable. |
| Antarctic Peninsula | 6 | fail | coverage-limited | 29.4% nodata and 5,097 source-gap edge pixels; the old coast-mask lobes are gone, but source footprints remain visible. |
| Antarctic Peninsula | 8 | fail | assessable | Zero nodata and zero source-gap edges; no geometric gray fill or static mask edge remains. |
| Antarctic Peninsula | 9 | fail | assessable | Zero nodata and zero source-gap edges; no gray lobes or hard polygon blocks remain; polar knee/gain preserve more ice texture. |

On the available evidence there are no failures among the nine assessable
windows. The round does **not** claim that the eleven coverage-limited windows
clear the gate; they require the still-running source download before a final
G1 decision. No full base render was started.

## Verification

- `node --check` passes for `finish.mjs`, `run.mjs`, and
  `make-local-ab.mjs`.
- `node scripts/sat/local/selftest.mjs --python .venv-sat/bin/python` passes,
  including deterministic repeat finishing, cache evidence validation, seam
  QA, and the no-network finish-path check.
- The tune run finished 20 detail windows and 174 tiles. Its
  `scripts/sat/work/s2gm2025/finished/tune-round/qa.json` has overall status
  `passed`; the base entry says `base render explicitly disabled`.
- The A/B builder completed 20 opaque panels. No page asset URL contains a
  source name; the standalone build contains no asset URLs.

