# Polar fill for the pre-composited z4 globe base (2048×1024 equirect)

Opus 5.5, 2026-10-10. **Method:** I measured the manifest locally (`.harvest-2025/eox-manifest-valid.json`). I made live GETs against EOX `s2cloudless-2025_3857` and against R2 (`tiles.where-on.earth/tiles/…?v=3`, which needs a browser UA, because a bare urllib request gets a 403). I compared tile bytes by md5 to work out which vintage each R2 tile is. I computed pixel stats with numpy and looked at contact sheets myself. Nothing was built. Artifacts are in `docs/polar-fill/`: `z4-north-rows-r2.jpg` and `z4-south-rows-r2.jpg` (magenta = absent in R2), plus `z4-polar-vintage.json`.

## TL;DR

**The deeper-zoom idea doesn't work, and we don't need it.** The polar gap is mostly an artifact of the harvest, not a hole in EOX's data. EOX serves real z4 JPEGs for 38 of the 46 "missing" z4 tiles. Most are flat Arctic or Southern Ocean blue. They were never harvested because the manifest is a location-driven 3×3 set, not a coverage map. Fetch those tiles, use z4 alone from 85.05°N to 85.05°S, fill the two small blank Antarctic areas with snow colour, and pinch-fill the caps beyond ±85.05°. Don't use z5–z8.

## 1. Do z5–z8 have polar coverage where z4 doesn't?

**No. I measured this two ways.**

- **Manifest:** zero z5–z8 tiles have a missing z4 ancestor (I checked all 10,737 deeper tiles). At the poles the deeper levels are much sparser than z4: z5–z8 have only 3–15 tiles per polar row (3×3 blocks around a few locations such as Svalbard and Antarctic stations), against 3–16 of 16 at z4. The manifest can't show "coverage" at all, because it only lists what the 3×3 location harvest wanted.
- **EOX live:** EOX is a pyramid. Under a z4 tile that is blank (116 B PNG), every child I probed at z5, z6 and z7 is also blank (e.g. `4/8/15`). Under a z4 tile that exists, the children exist. A deeper level can't have data where its z4 parent is blank.

**What's actually behind the 46 "missing" z4 tiles (live EOX 2025):**

| Tiles | What EOX returns |
|---|---|
| North rows 0–1 (79–85°N): 21 tiles | JPEG, almost all uniform ocean, mean RGB ≈ **(18, 33, 59)**, std 1–3. Exceptions with land/ice: `4/10/1`, `4/12/1` (Severnaya Zemlya / Franz Josef area), `4/11/1`, and `4/11/2` (partial) |
| South rows 11–13 off Antarctica: 9 tiles | JPEG, ocean or coast |
| South rows 13–15 deep interior | Mixed: some JPEG (often flat white 255, which is a fill colour, not imagery), and **8 are true blank PNG**: `4/{4,6,7,8,9,10,13,14}/15` (82.7–85.05°S) |

**Southern extras I found that you should know about:**
- **R2 holds 13 south-polar z4 tiles that match neither EOX 2025 nor any EOX year I checked** (2016 404s; 2018–2025 don't match): row 14 x=2,3,7–14 and row 15 x=2,3,7,8,9. For those positions EOX 2025 now returns blank. They have textured snow. I don't know where they came from. **Before we ship them in a public asset, someone needs to confirm they're from a source we're allowed to use.**
- EOX 2025 has a **coloured speckle band** (cyan/magenta/yellow noise) around 79–80°S across most longitudes. That's the edge of Sentinel-2 coverage. It's visible in `z4-south-rows-r2.jpg` and will be visible on the globe unless it's masked.
- Inside the area EOX 2025 does cover, interior Antarctica is **flat 255 white**, while the unknown-source tiles have texture. Where they meet there's a visible step.

## 2. Compositing deeper tiles: projection or resolution issue?

This is now moot, but for the record: there's no projection problem. The reprojection is the same per-pixel inverse lookup at any zoom: for each output (lon, lat), compute the Mercator x and y at zoom z and sample. Deeper tiles would only be downsampled more.

The real issue is **filtering, even for z4 alone.** One output pixel covers 0.176° of latitude. A z4 Mercator pixel covers 0.088°·cos φ of latitude, which is about 0.015° at 80°. So near the poles the output squeezes about 11 source rows into each output row vertically, and about 2× horizontally everywhere. Plain bilinear lookup will alias, showing up as shimmer and broken coastlines. Use an area-average warp (`gdalwarp -r average`, or supersample about 4×4 per output pixel and then box or Lanczos down).

## 3. Beyond ±85.05° (no Mercator data at any zoom)

Each cap is 85.05→90° = **28 output rows**. In equirect, every longitude in a row converges on one point, so a naive "repeat the edge row" fill makes a pinwheel at the pole.

**Recommended pinch-fill per cap:**
1. Take the last valid row at ±85.05°.
2. For each cap row, blur that edge row circularly in longitude (wrapping), with a radius that grows linearly from 0 at 85.05° to the full 360° at 90°. The pole row ends up as a single mean colour.
3. North: the edge row is almost entirely ocean (≈ 18, 33, 59), so the result is plain dark ocean. That's correct for the Arctic in this mosaic, which shows no sea ice.
4. South: the edge row is the Antarctic plateau. After the gap fill below, the result is near-white snow.

Don't use Blue Marble for the caps. It's a different colour grade from a different provider, it would add a seam, and the caps are tiny on the globe.

## 4. Quality mismatch (z4 vs z8 downsampled)

If we did mix levels, there'd be no visible **resolution** mismatch. z4 already has more detail than the 2048 equirect can hold at every latitude (at least 2× horizontally, about 11× vertically near the poles), so z4 and z8 both come out at the output's resolution. With correct area-average filtering they'd look equally sharp.

The mismatches that would actually show are **content** mismatches: different vintages or sources (2025 flat-white versus the textured unknown-source snow), the S2 edge speckle, and JPEG blocking in small flat-ocean tiles. Those decide how it looks, not zoom level.

## 5. Concrete recommendation

| Latitude band | Source | Notes |
|---|---|---|
| 85.05°N → 85.05°S | **z4 only.** For each of the 256 tiles: R2 if present and from a vetted source, otherwise the EOX 2025 JPEG fetched at build time (38 fetches, local build input only) | All Arctic gaps get filled with real EOX ocean or land |
| 8 true-blank z4 tiles `4/{4,6,7,8,9,10,13,14}/15`, plus any position where we reject the 13 unknown-source tiles | **Snow fill:** the median colour of adjacent valid interior snow (≈ 245–255 neutral), with an alpha feather of about 1° (about 6 px) into the neighbours | Below about 79°S. Small on the globe |
| ~79–80°S speckle band | Detect pixels with high chroma inside Antarctica and replace them with the local snow colour (median filter of the luminance only) | Optional, but it's visible |
| 85.05° → 90° (both caps) | Pinch-fill (§3) | 28 rows each |
| z5–z8 | **Don't use** | They add no coverage (§1) and no visible sharpness (§4) |

Blending: do one area-average warp of the full z4 mosaic, apply the fills as alpha-feathered layers in equirect space, then do a single JPEG encode at the end.

## Open question for Sean

Are the 13 unknown-source south-polar tiles in R2 (row 14 x=2,3,7–14; row 15 x=2,3,7,8,9) from a source we're allowed to use? If not, or if nobody knows, snow-fill those positions too. The visual cost is low, because they're plain snow below about 79°S.
