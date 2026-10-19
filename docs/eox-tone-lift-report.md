# Targeted land tone-lift pass

Date: 2026-10-19

## Outcome

The acceptance plan was re-finished twice from the existing untoned quarterly
caches: once with the tuned G1 settings unchanged and once with the targeted
land shadow lift enabled. Both runs completed all 20 acceptance windows plus
the base window and passed finish QA. No acquisition, network, Process API, or
PU path was used.

The lifted base is at
`scripts/sat/work/s2gm2025/finished/tone-lift/lifted/base-ours.jpg`. The blind
20-panel comparison is at `scripts/sat/work/ab-review-2/ab.html`, its embedded
offline build is `ab-standalone.html`, and the separately withheld mapping is
`ab-key.json`. Presented asset names and URLs are opaque `p-*`/`q-*` names;
the standalone page embeds its images.

## Method

The lift is confined to `landTone` after the existing gain, gamma, highlight
knee, saturation, and contrast operations. Global `landGain` remains 2.9 and
all existing `WINDOW_TONE` settings remain active. The ocean function and its
normalization were not changed. The polar observations composite and
`maskEdgeQa` logic were not changed.

For normalized post-tone land luminance `Y`, the additive lift is:

```
L(Y) = strength * (1 - Y / cutoff) ^ curve,  Y < cutoff
L(Y) = 0,                                      Y >= cutoff
```

`L(Y)` is added equally to all three channels, preserving their chroma
differences except where final channel clipping is unavoidable. The configured
parameters are `strength = 0.07`, `cutoff = 0.55`, and `curve = 2.0`.
`landShadowLift` is the CONFIG switch, selected by
`--land-shadow-lift on|off`. Thus the maximum lift is 17.85 8-bit levels and
the lift is exactly zero from luminance 140.25 upward, well below the 0.72
global highlight knee. Sydney z9 (`9/471/306`) sets `landShadowLift: false` in
its existing window override because its tuned exposure is a hard constraint.

## Measured land luminance

Statistics use Rec. 709 luminance on the uncompressed finished land component,
for observed land pixels with mask alpha at least 0.5. Each cell is
**baseline / lifted**, in 8-bit luminance units.

| Window | p10 | p50 | p90 | Mean |
| --- | ---: | ---: | ---: | ---: |
| base | 24.2 / 36.4 | 115.2 / 115.7 | 255.0 / 255.0 | 139.0 / 143.4 |
| 4/0/6 | 36.6 / 46.3 | 96.4 / 98.2 | 159.5 / 159.5 | 97.7 / 101.1 |
| 4/6/3 | 21.0 / 33.9 | 44.5 / 52.8 | 255.0 / 255.0 | 119.7 / 126.0 |
| 4/15/6 | 16.4 / 30.4 | 23.4 / 35.9 | 34.9 / 45.0 | 24.9 / 37.0 |
| 4/12/9 | 28.3 / 39.6 | 61.8 / 67.3 | 99.5 / 101.0 | 67.4 / 73.6 |
| 4/3/9 | 23.0 / 35.5 | 42.6 / 51.3 | 104.9 / 106.0 | 59.3 / 67.1 |
| 6/9/24 | 39.9 / 49.0 | 97.0 / 98.7 | 163.3 / 163.3 | 99.9 / 103.1 |
| 6/27/15 | 25.3 / 37.3 | 36.3 / 46.1 | 80.1 / 83.4 | 53.5 / 62.5 |
| 6/63/33 | 16.9 / 30.7 | 23.2 / 35.7 | 32.8 / 43.2 | 24.2 / 36.5 |
| 6/57/36 | 30.2 / 41.1 | 63.3 / 68.7 | 100.6 / 102.1 | 65.2 / 71.0 |
| 6/21/45 | 6.7 / 22.9 | 61.9 / 67.5 | 254.0 / 254.0 | 112.3 / 119.2 |
| 8/39/96 | 12.7 / 27.5 | 25.8 / 37.6 | 72.1 / 76.3 | 35.4 / 45.9 |
| 8/114/66 | 16.5 / 30.4 | 37.1 / 46.8 | 254.0 / 254.0 | 71.3 / 79.8 |
| 8/252/138 | 16.9 / 30.7 | 24.2 / 36.4 | 34.5 / 44.7 | 25.1 / 37.2 |
| 8/234/153 | 14.3 / 28.6 | 27.0 / 38.6 | 51.6 / 58.7 | 30.5 / 41.6 |
| 8/84/186 | 5.7 / 21.9 | 28.8 / 40.0 | 255.0 / 255.0 | 110.3 / 118.7 |
| 9/81/195 | 24.0 / 36.2 | 50.1 / 57.5 | 87.3 / 89.8 | 53.6 / 61.0 |
| 9/228/132 | 30.8 / 41.7 | 41.6 / 50.4 | 156.9 / 156.9 | 61.7 / 69.7 |
| 9/507/279 | 16.7 / 30.6 | 24.2 / 36.4 | 34.8 / 44.9 | 25.1 / 37.2 |
| 9/471/306 | 13.0 / 13.0 | 19.3 / 19.3 | 47.0 / 47.0 | 25.1 / 25.1 |
| 9/171/375 | 41.3 / 50.1 | 247.6 / 247.6 | 255.0 / 255.0 | 195.2 / 196.9 |

Dark and mixed-tone windows generally gain materially at p10/p50 while bright
mixed-window p90s are unchanged or move only slightly. The all-dark,
narrow-range Fiji windows (`4/15/6`, `6/63/33`, `8/252/138`, `9/507/279`)
also rise about 10 levels at p90; these are coverage-limited at z4/z6/z8 and
the z9 result should be judged in the blind panel. Sydney z9 is identical at
all four measures, so its highlights do not regain the old excess.

## Ocean, seams, and mask QA

`oceanLuminance` records the `oceanAt` result over every pixel location in each
window, independently of the land composite. Baseline and lifted p10, p50,
p90, mean, and pixel count are exactly equal for every one of the 21 windows;
the maximum absolute delta for every statistic is **0**. This directly checks
that the ocean source path did not move. Full per-window values are retained in
each set's `qa.json`.

Seam QA (mean absolute RGB difference):

| Boundary | Baseline | Lifted |
| --- | ---: | ---: |
| 4/0/6 → 4/3/9 | 17.720 | 17.883 |
| 4/3/9 → 4/6/3 | 115.684 | 115.386 |
| 4/12/9 → 4/15/6 | 7.307 | 7.222 |

Both QA files have overall status `passed`. All 21 `maskEdgeQa` entries pass
in both sets. The polar entries remain in `observations` mode with zero
geometric-mask pixels. Antarctic z8 (`8/84/186`) and z9 (`9/171/375`) retain
zero source-gap edge pixels in both sets; coverage-limited Antarctic z6 retains
5,097 in both sets. The 11 previously identified coverage-limited windows
remain coverage-limited; the tone pass does not change that evidence.

Visual inspection of the base and representative detail pairs found no new
coastal halos or obvious color cast. The equal-channel luminance shift makes
very dark colors slightly less saturated by construction; no material color
shift was apparent in the reviewed panels. The uniformly dark Fiji p90 shift
is the main open judgment item. Existing base-source limitations around the
Antarctic fringe are unchanged and are not caused by this pass.

## Deliverables and verification

The baseline and lifted roots are:

- `scripts/sat/work/s2gm2025/finished/tone-lift/baseline/`
- `scripts/sat/work/s2gm2025/finished/tone-lift/lifted/`

Each contains 174 detail tiles, `base-ours.jpg`, and `qa.json`. Three unscaled,
native-pixel crops from the lifted 2048×1024 base are under `lifted/crops/`:

| Crop | Pixel box (`x, y, width, height`) |
| --- | --- |
| Europe | `956, 102, 268, 212` |
| East Asia | `1592, 198, 284, 200` |
| South America | `556, 438, 274, 394` |

Verification completed:

- `node --check` passes for the modified finish and A/B scripts.
- `node scripts/sat/local/selftest.mjs --python .venv-sat/bin/python` passes,
  including deterministic finish, cache evidence, seam QA, and no-network
  finish-path checks.
- Both cached acceptance finishes completed 21 of 21 windows and 174 tiles.
- The blind builder completed 20 panels; page image URLs contain only opaque
  asset names and the standalone build has no asset URLs.
