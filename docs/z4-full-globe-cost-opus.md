# z4 full-globe coverage: real cost analysis

Opus 5.5, 2026-10-10. Analysis only, nothing implemented. Code refs are `demo/src/main.js`.

## How this was done (measured vs estimated)

| Claim | Method |
|---|---|
| Inset is OFF at full zoom-out on a phone | **Measured**: headless Chromium (swiftshader), 390x844 @2x, current local `main.js`, read `window.__sat.inset` at 5/15/30 s and counted requests to `tiles.where-on.earth`. Result: `gen: null`, 0 tile requests. Script: `shots/passport/z4-probe.mjs`. |
| Window sizes at each zoom | **Computed**: Python port of `sampleInsetView` + `insetWindowAt` (`docs/z4-full-globe-sim.py`). Camera model simplified (camera on axis, globe tilted by latitude). The headless result above agrees with it. |
| z4 bytes on the wire | **Measured**: GET of all 210 z4 manifest URLs from R2 (`?v=3`). 210/210 returned 200. Total **1,592,572 B**, mean **7.6 KB**, max **28.3 KB**. |
| z0-z3 gone | **Measured**: `0/0/0`, `2/0/0`, `3/0/0` all 404. |
| R2 edge caching | **Measured**: response header `cf-cache-status: DYNAMIC`, so Cloudflare is not edge-caching tiles. Every request goes to the R2 origin. |
| Which z4 tiles are missing | **Measured** from `.harvest-2025/eox-manifest-valid.json` (210 of 256). |
| Latency, decode time, mip time on real phones | **Estimated**. Sandbox latency goes through a MITM proxy (about 4.5 s per request at 16 parallel), which says nothing about cellular. All phone timings below are labelled as estimates. |

## Two premises that are off

**1. At full zoom-out the user is not seeing 64 z4 tiles. They are seeing zero tiles.**
`insetWindowAt` (line 947) returns `null` when the visible footprint plus a 1-tile margin is wider or taller than `INSET_TILES` (8, or 6 when `maxTextureSize < 4096`, line 806-807). At the default portrait zoom (`fitDist` ≈ 6.14 on 390x844) the z4 footprint is:

| View (390x844) | z the formula wants | z4 window needed (cols x rows) | Fits 8x8? |
|---|---|---|---|
| fitDist (default), lat 0 | 3 | 10 x 14 | no |
| fitDist, lat 30 | 3 | 18 x 12 (limb wraps past the pole) | no |
| maxDist (1.55x fit), lat 0 | 2 | 10 x 16 | no |
| first zoom where z4 fits, lat 0 | 5 | 6 x 8 | yes, at **~38% of default altitude** |

So `pickInsetWindow` (line 964) gets `want = null`, `insetsOff()` runs, and the globe is the solid `#0a1a2f` from the TEMP `loadSatBase` (line 750-760) plus the stylized land underneath. The 64-tile patch the user remembers only appears after zooming in about 2.6x. Desktop 1440x900 behaves the same way (z4 fits at about 45% of default altitude). Worth confirming on the user's phone with `__sat.inset` in the console, but the headless run and the geometry agree.

**2. z4 is not "land only".** Rows 3-10 (66.5°N to 55.8°S) are 100% present, open ocean included. The 46 missing tiles are all polar:
- Row 0-1 (79-85°N): mostly missing (Arctic Ocean).
- Rows 11-14 (56-83°S): 2-4 missing each (Southern Ocean / Antarctic edge).
- Row 15 (82.7-85.05°S): 13 of 16 missing, so most of the **Antarctic interior** is missing.
- Above ±85.05° Web Mercator has no tiles at any zoom. The shader clamps there (line 362).

So "z4 everywhere" really means z4 from 79°N to about 80°S. The poles need some other fill no matter which approach we take.

## Q1. Architecture changes to load all 210 z4 tiles live

Today the full-globe view wants z2-z3 (the formula on line 968, `INSET_Q = 1` texel per CSS px). Forcing z4 means building a whole-world z4 layer:

- **Texture**: the full z4 Mercator world is 16x16 tiles = **4096x4096**. That is the only layout that works with the existing `insetSample` bounds math (line 319). Partial windows can't hold a footprint that wraps past a pole, as the 18-column case above shows.
- **Can't reuse the double-buffered inset**: a world window would make both inset RTs 4096² (line 806), which doubles an already large allocation. The world layer never moves, so double-buffering buys nothing. It has to be a **third, static layer**: either a new `uniform sampler2D` plus a branch in `insetSample`, or (better) the existing `uSatBase` slot.
- **Loader**: a new one-shot loader that reuses `fetchInsetTile` / `decodeInsetTile` / `pumpInsetUploads` but targets the world RT, never aborts on window change (line 1024-1027 aborts anything the *current* window doesn't need), and isn't gated by `inset.win`.
- **Projection**: `uSatBase` is sampled with equirect `vUv` (line 360). A Mercator world RT needs to be sampled with `merc` instead, plus a pole fill above ±85°.
- **Fallback chain**: `setInsetSrc` / `loadInsetTile` (lines 1037-1060) walk to ancestors on 404, and the comment at line 1179 says "z0-3 always exist, so it ends". That is no longer true. It still terminates (via `t.k >= win.z`), but every missing z4 source now costs up to 4 extra serial 404 round trips (z3, z2, z1, z0) before the tile gives up. This already happens today for the inset. The cap should be `k <= z - 4`.

## Q2. Performance cost (live 210-tile approach)

| | Today at full zoom-out | Live z4 world layer | Notes |
|---|---|---|---|
| Requests | **0** (measured) | **210** + up to ~4 x 404 chains per missing source | Not 210 vs 64: today's real baseline is 0. |
| Bytes | 0 | **1.59 MB** (measured) | Fits the 8 MB / 400-tile blob LRU (lines 815-816). |
| Time to complete, 6 parallel (`INSET_FETCHES`) | n/a | ~35 rounds. At 150-300 ms RTT on good LTE, **~5-10 s** (estimate) | `cf-cache-status: DYNAMIC`: no edge cache, so every request is an R2 origin hit. |
| Time on slow network (median > 1.5 s, 3 parallel) | n/a | 70 rounds x 1.5 s+ = **~105 s+** (estimate) | Slow mode drops the inset one z level, but z4 is the floor (line 970), so nothing gets cheaper. |
| GPU memory, layer level 0 | 0 | 4096² RGBA8 = **64 MB** | |
| ... with mips | 0 | **~85 MB** | Mips are needed or the limb aliases badly at this minification. |
| Existing insets (allocated once you zoom in) | 2 x 2048² = 32 MB (~43 MB mipped) | same | Total **~128 MB** of textures. |
| Upload work | 0 | 210 `texSubImage2D` calls at 4/frame (line 811) = ~53 frames (~0.9 s at 60 fps) + 210 `createImageBitmap` decodes | Each 256² upload is small. Decode is mostly off main thread. |
| One-time `generateMipmap` on 4096² | 0 | One frame spike, **~5-20 ms on a mobile GPU** (estimate) | Visible as a hitch during idle rotation. |
| Steady-state frame time | baseline | **~unchanged** | Still one texture fetch per layer per fragment. The cost is memory and load, not per-frame shading. |
| Devices with `maxTextureSize < 4096` | 1536 fallback works | **cannot allocate**. Must downscale to 2048² | Once you downscale, you are displaying z3 resolution anyway. |

The memory row is the real risk. ~128 MB of WebGL textures on iOS Safari makes a context loss plausible (my estimate, not tested on a device). The code turns satellite off for the session after the 2nd loss (line 1306).

Resolution check: at default zoom on a 390px portrait phone the disc is ~430 CSS px across. At the centre that works out to about 3.75 CSS px per degree. A 2048-px-wide world gives 5.7 texels per degree, which already exceeds the app's own target of 1 texel per CSS px (`INSET_Q = 1`). A 4096 world (z4) gives 11.4 texels per degree, which matches *device* pixels at 3x DPR. So at full zoom-out, z4 is **2x oversampled** against the quality bar the code already sets. The extra sharpness is real but small at that scale. What makes it "look cleanest" is mostly that the whole globe is **one consistent EOX mosaic**, with no seam against a differently coloured base.

## Q3. Can the inset system be extended?

Not usefully. The three properties that make it good for zoomed-in views all work against a whole-globe layer:
- **8x8 cap = RT size.** A world needs 16x16, and double-buffering doubles it.
- **Window replacement / abort on move** (lines 985-1031). A world layer must never be torn down on rotation, and the idle drift (line 1240) would keep rebuilding windows.
- **Gated on "settled"** (line 1260-1272). Nothing streams while the user spins the globe, which at full zoom-out is most of the time.

The right shape is **base layer = whole world (static, loaded once); insets = unchanged, for zoom-in only**. The slot already exists: `uSatBase`, "the whole world in one local 2048x1024 equirectangular texture" (line 726), currently stubbed by the TEMP solid-blue canvas.

## Q4. Failure behaviour

**Live 210 tiles:** a failed tile is retried once (`INSET_TRIES = 2`, line 817), then given up. With z0-3 deleted there is no ancestor fill, so each failure is a **dark-blue square hole** in the globe. Five consecutive failures trip the breaker (line 1134) and pause *all* tile loading for 60 s, doubling up to 8 min, which leaves a half-built globe. These failures are most likely on cellular, which is exactly the phone case. The result is patchy, and it's the first thing every player sees.

**Single composite (Q5):** one same-origin asset served from Vercel with the app. It either loads or it doesn't. If it fails, the existing path already handles it: `initSatellite` catch → classic stylized map + "Satellite view unavailable" toast (lines 786-790). The all-or-nothing behaviour is the point.

## Q5. The smarter approach: pre-composited z4 base

Build **one 2048x1024 equirectangular JPEG from the 210 z4 tiles already in R2** and ship it as `assets/eox-z4-base-2k.jpg`, replacing `SAT_BASE_URL` (line 740) and the TEMP `loadSatBase` body (lines 751-759).

- **No EOX re-harvest.** Source is the 210 z4 tiles in R2 (1.6 MB download, done once, offline). z0-z3 stay deleted.
- **Zero shader changes.** It drops into `uSatBase`, which is already equirect and already covers the poles (line 357-360).
- **Cost:** 1 request of ~300-500 KB (estimate; the Blue Marble 2k it replaces is 358 KB measured), 8 MB GPU (~11 MB mipped), one upload, mipmaps generated by three.js at load. That is about **1/8 of the live-layer memory and 1/210 of the requests**.
- **Resolution:** z3-equivalent (5.7 texels/degree), which meets `INSET_Q = 1` at full zoom-out, as computed above.
- **Seamless zoom-in:** the insets draw the same EOX imagery on top, so zooming in just sharpens with no colour shift. Today there is a ~2.6x zoom band where the globe is solid blue before the first z4 window fits. The composite fills that band too.
- **Offline build steps:** reproject Mercator z4 → equirect, Lanczos downsample, and fill the polar gaps (above 79°N / below ~80°S where tiles are missing, and everything beyond ±85.05°).
- **Follow-ons:** update the credit string (line 736, "Base NASA Blue Marble") and cap the ancestor walk at z4 (Q1, last bullet).
- **Optional later, not recommended now:** a 4096x2048 variant (32 MB, ~43 MB mipped) for desktop only, gated on `maxTextureSize >= 8192` and a non-touch device. Only worth it if desktop full-globe looks soft.

## Q6. Recommendation

**Live full-globe z4 on a phone: feasible on paper, a bad trade in practice.**
- ~85 MB extra texture memory, which puts context loss on iOS at real risk.
- It cannot allocate on 4096-max devices.
- 210 origin requests, with a slow fill on cellular.
- A patchy, holed globe when requests fail.
- All of this buys sharpness that is 2x past the app's own quality target at that zoom.

**Do the pre-composited z4 base instead.** It gives the user what they actually liked: the whole globe in one clean EOX mosaic. It costs one ~0.4 MB file, 8-11 MB of GPU memory and no runtime architecture change, it fails cleanly to the classic map, and it needs no re-harvest. The inset system stays as is for zoom-in. Two small follow-ons go with it: cap the ancestor 404 walk at z4, and fix the stale "z0-3 always exist" comments (lines 1033, 1179).

**Decisions for the user before anyone builds it:**
1. **Pole fill.** z4 has no imagery north of ~79°N, very little south of ~80°S, and nothing beyond ±85°. Options: flat ocean/ice colours, a stretched edge row, or Blue Marble used *only* for the polar caps (that means keeping the existing 358 KB asset as a source for the build, not shipping it at runtime).
2. **Confirm the premise on device.** Run `__sat.inset` at full zoom-out on the phone. My measurement says the inset is off there (`gen: null`). If the phone shows otherwise, the deployed code differs from local `main.js` and this analysis needs a second look.
