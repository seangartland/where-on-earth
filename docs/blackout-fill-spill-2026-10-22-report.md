# Blackout fill spill — Canada (2026-10-22)

## Result

The leading hypothesis is confirmed. Canada's Natural Earth draw geometry has one 2,000.83 km segment along the 49th parallel. The outline renderer converted its endpoints to 3D and normalized linear interpolants between them, which traces the endpoint great circle. At the segment midpoint that curve is 92.04 km north of the lon/lat-space mask edge. This is the center-deep, end-zero band in the report screenshot.

The blackout mask stroke was a second, much smaller contributor. Its 1.5-texel centered stroke expanded the mask by 0.75 texel, or 7.33 km across a horizontal edge at either supported mask resolution. It cannot explain the tapered shape and is only 8% of the midpoint outline error, but it did paint outside the border.

Both confirmed causes are fixed. Outline draw geometry is now densified in lon/lat space to at most 50 km before conversion to 3D. Blackout masks are filled without an outward stroke.

## Measurements

### Shipped Canada geometry

The decoded `CAN` rings contain 12,103 segments. For the 35 segments whose endpoints are both within 0.1° of 49°N, great-circle lengths in descending order are:

`2000.83, 33.89, 22.74, 18.21, 15.27, 14.94, 14.93, 13.46, 13.03, 12.18, 12.10, 11.15, 10.73, 10.59, 10.10, 8.84, 8.53, 8.51, 8.38, 8.33, 8.30, 8.26, 8.24, 7.79, 7.22, 6.46, 6.22, 6.16, 6.10, 5.31, 5.11, 5.05, 4.95, 4.03, 3.80 km`.

The outlier runs from `[-95.1771, 48.9927]` to `[-122.7530, 48.9925]`. It is also the longest segment anywhere in Canada's geometry. The next-longest segment anywhere in Canada is 1,039.28 km on the Alaska/Yukon meridian; the next-longest 49°N candidate is only 33.89 km.

### Renderer interpolation error

`buildCountryOutline()` previously did this for each source segment:

1. Convert its two lon/lat endpoints to unit 3D vectors.
2. Add samples at no more than 1.2° angular spacing with `a.lerp(b, t).normalize()`.

Normalized linear interpolation stays on the endpoints' great-circle plane. More samples smooth the curve but do not make it follow a constant-latitude/rhumb segment.

For the 2,000.83 km segment:

- endpoint mean latitude: 48.992600°N
- rendered midpoint: 49.820313°N, 108.965078°W
- northward separation: **92.04 km**
- endpoint central angle: 17.9938°
- old renderer subdivisions: 15 (about 133.39 km each), all on the same wrong great circle

At the selected 50 km lon/lat densification threshold the source segment becomes 41 pieces, each 48.80 km. The maximum residual great-circle bow within one piece is **0.054 km (54 m)**. A 25 km threshold would use 81 pieces and reduce this to 0.014 km, but provides no visible benefit at substantially more draw segments.

### Mask dilation

The equirectangular mask has 2,048 latitude texels whether its canvas is 4096×2048 or 2048×1024, so one latitude texel is:

`π × 6371.0088 / 2048 = 9.773 km`

For Canada, `min(ISLAND_BLOB_TEXELS, geom.diagKm / 1000)` reaches the 1.5-texel cap. A canvas stroke is centered on the path, so its outward contribution is:

`1.5 / 2 × 9.773 = 7.33 km`

The phone screenshot's center spill is approximately 75 px deep (cyan core near y=1375; satellite transition near y=1450). At that framing this is approximately 95–100 km, consistent with the 92.04 km outline bow plus the 7.33 km dilation and inconsistent with dilation alone. The taper to zero at the long segment's endpoints specifically identifies the great-circle bow.

## Changes

- `src/globe/outlines.js`
  - Added `densifyOutlineLine()` with a 50 km maximum draw segment.
  - Applied it only inside `buildCountryOutline()`.
  - Decoded rings, hit testing, scoring, areas, and stored topology are unchanged.
  - This is the shared outline builder used by Daily reveal country borders, region/state borders, Blackout, and Tap the Country.
- `src/modes/blackout.js`
  - Removed the mask-path stroke; `blackoutFill()` now uses the exact even-odd fill only.
  - No small-island inset/surface behavior was changed.
- `shots/blackout/blackout-spill-capture.mjs`
  - Added a `/opt/meta-chromium` Playwright capture and pixel-measurement harness.
  - It captures current fixed behavior and request-time emulated legacy behavior in one run without modifying source files.
  - Cases: Canada, dense-vertex France control, and Colorado through the US-state outline path.
  - Outputs combined PNGs and `measurements.json` under `shots/blackout/spill-proof/`.

No protected file (`src/main.js`, `src/meta/passport.js`, or `src/meta/stats.js`) was touched.

## Before/after rendered measurement

Completed by the orchestrator on 2026-10-23. Two harness defects had to be fixed first, neither of them product code:

1. An earlier addendum blamed Playwright version skew (demo 1.64.1 vs the `.pw-setup` 1.63.0 driver) and switched the import. That was not the cause; the timeout persisted with the `.pw-setup` driver. (The import change is harmless and stays.)
2. The actual cause, found from the page's own console error once error listeners were attached: the harness MIME map had no `mjs` entry, so `src/meta/passport-grouping.mjs` (the game's one `.mjs` module) was served as `application/octet-stream`, the module graph failed strict MIME checking, and the instrumented modules never loaded. The orchestrator added `mjs: 'text/javascript'` to the map (one line) and the script then ran end to end through all six combined captures (before/after for Canada, the France control, and Colorado). The browser died during the final in-page `analyze` step, after every capture PNG was saved, so `measurements.json` was not written; the measurements below were computed by the orchestrator from the saved PNGs instead.

Rendered spill, Canada, orchestrator-measured from `shots/blackout/spill-proof/before-canada.png` and `after-canada.png` (per-column scan of the border band, columns 250-700: cyan outline row vs dark fill pixels below it; 95th percentile; framing 3.22 km/px at dist 1.70):

- Before: p95 spill 30 px = **96.6 km**, max 31 px. Matches the geometry prediction of about 99 km (92.04 km bow + 7.33 km dilation).
- After: p95 spill **0.0 km**, max 3 px at a single column (line width and antialiasing). The fill edge and the drawn border coincide; in the after capture the border visibly curves with the true parallel instead of running straight.

The France control and Colorado state captures are saved alongside (`before-/after-france-control.png`, `before-/after-colorado-state.png`) and show no regression; the Colorado shot confirms state outlines use the same corrected draw path.

## Verification completed here

- `node --check --input-type=module < src/globe/outlines.js` — pass
- `node --check --input-type=module < src/modes/blackout.js` — pass
- `node --check shots/blackout/blackout-spill-capture.mjs` — pass
- `node --test test/*.test.mjs` — 6/6 tests pass

There are no existing outline- or blackout-specific unit tests in `test/`; the new capture is the focused regression check.
