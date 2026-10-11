# z4 composite review: `assets/eox-z4-base-2k.jpg`

Opus 5.5, 2026-10-10. Done directly, with no delegation. `src/main.js` was not modified and nothing was deployed.

## Verdict: NO-GO

Between about 66°N and 56°S (tile rows 3-10, all from R2) the composite looks good. It's one consistent EOX 2025 mosaic with no visible tile seams. At both poles, though, there is a **build bug**: all 38 EOX gap-fill tiles were fetched with x and y swapped, so they show imagery from the wrong part of the world. The worst result is Siberian forest tiles sitting inside Antarctica. The bug is in `download.py`, and the fix is one line and a rebuild.

## How this was checked

| Check | Method |
|---|---|
| Overall appearance, seams, poles | **Looked at** the full 2048x1024 image plus 2x crops of the south-west, south-east and north strips (`shots-satellite/z4-review/{south-west,south-east,north}.png`). |
| Root cause of polar defects | **Read** `.build-tmp/z4-composite/{download.py,build.py}`, then **measured**: each downloaded `eox/{x}_{y}.jpg` against the R2 tile at the *transposed* position `r2/{y}_{x}.jpg`. Every pair I tested where the transposed tile exists in R2 is **pixel-identical (mean abs diff 0.0)**: `(4,13)`, `(4,14)`, `(3,12)`, `(7,0)`. |
| On-globe look at 390px | **Headless Chromium** (swiftshader), 390x844 @2x. Harness `shots/passport/z4-base-shot.mjs` patches `loadSatBase` **in memory only** to load the composite, and blocks tile requests so only the base shows. 1 base request, `uSatMix` reached 1, no page errors. Shots: `shots-satellite/z4-review/globe-390-*.png`. |
| Not checked | The home screen didn't respond to my synthetic drags, so all three globe shots show the same mid-latitude view. **The poles were reviewed on the flat image only, not on the globe.** I didn't test on a real device. |

## Blocking issues

1. **EOX gap-fill tiles are transposed (root cause, affects all 38).** At `download.py:53` the EOX WMTS path is `.../GoogleMapsCompatible/{z}/{row}/{col}` (z/y/x), but the code builds `4/{x}/{y}`. R2 really is z/x/y (`main.js` `url: (z, y, x) => .../${z}/${x}/${y}`), so the R2 tiles are correct. Only the EOX tiles are wrong. What it causes:
   - **Green forest and tundra tiles inside Antarctica**, at about 75-82°S, 135-90°W (`4/{3,4}/{12,13,14}` positions). These are the most visible defect.
   - **Ocean-blue rectangles on the Antarctic ice** at rows 11-15, for example `(5,15)`, `(11,15)`, `(12,15)`, `(0,13..15)`.
   - **A white bar across the Arctic Ocean** at about 80-85°N, 115-180°E (`(13..15, 0)`). These are Antarctic tiles, from row 13-15 col 0.
   - **The "darker tile" patches in the Arctic and the Southern Ocean** that the build log lists as a "source-vintage/illumination difference" are this same bug. They're tiles from other latitudes, not a vintage difference.
   - **The south pinch cap** is smeared grey and blue, because the 85°S edge row it blurs includes those wrong ocean tiles.
   - **Fix:** change the URL to `.../4/{y}/{x}.jpg`, delete `eox/`, re-download the 38, and rebuild. Then spot-check: `eox/4_13.jpg` should be Antarctic coast or ice, not forest.

2. **The south pole needs a second look after the rebuild.** With the cap fed by the correct edge row it should come out near-white. Confirm that before shipping.

## Non-blocking issues (fix if cheap, otherwise ship)

3. **Residual S2 speckle.** Thin magenta, yellow and green flecks survive along the 79-80°S band in the south-east (about 0-150°E). The mask (`max > 150 && chroma > 45`) misses lower-chroma noise. It's small on the globe. A looser chroma threshold restricted to pixels with high luminance would catch it.
4. **Snow-fill step.** The synthetic snow is (250,250,250) and the EOX interior is flat 255, so in the 1:1 crop the snow-filled tiles read as a slightly grey rectangle against pure white. Use 255, or sample the neighbour median as `polar-fill-opus.md` §5 specifies.
5. **Credit string is stale.** At `main.js:736` it still says "Base NASA Blue Marble", and that text is visible at the bottom of the 390px shots. It needs updating when the base swaps (already listed as a follow-on in `z4-full-globe-cost-opus.md`). This isn't an image issue, but it ships with the same change.

## What's good

- Rows 3-10 (all R2 EOX 2025) look clean. I saw no tile-grid seams or colour steps in the mid-latitudes. The colour grade is consistent, and it clearly reads as EOX Sentinel-2 cloudless (deep navy ocean, warm Sahara and Australia). On the 390px globe it reads as a proper satellite Earth, a big improvement on the solid blue.
- The reprojection is correct: Greenland, Svalbard and the Antarctic Peninsula are in the right places and shapes, the north cap pinch has no pinwheel, and the file is 281 KB.
- Leaving out the unknown-source R2 tiles (snow-filled instead) follows the spec.

## Re-review checklist after the rebuild

- No green or brown tiles south of 60°S, and no white tiles north of 79°N.
- The Arctic north of Eurasia is continuous ocean, plus Severnaya Zemlya and Franz Josef Land.
- The south cap is near-white with no blue smear.
- Rerun `node shots/passport/z4-base-shot.mjs` for the on-globe check. If someone wants a polar check on the globe, it needs a camera hook or the game screen, because the home screen ignores drags.
