# N3 diagnosis: the island ghost blobs, real cause and fix

Date: 2026-10-22/23. Claude (Sonnet 5) via claude-run.

**This is a resume.** This diagnosis was started twice before and killed mid-work by session/VM limits. The surviving artifacts from those runs — in `shots/sat-review/n3-captures/diagnosis/` — already did the hard part: an ablation sweep that ruled out the first fix attempt's target and identified the real one, and a fix already written (uncommitted) in `demo/src/globe/surface.js`. This session audited those artifacts, confirmed them, filled the one gap they left (did the fade uniform actually reach 0 at the capture framing — it wasn't yet measured), and completed the recapture and this report. No measurement already on disk was redone.

## Starting point: what the first attempt got wrong

The first fix attempt (Codex gpt-5.6-sol, 2026-10-22) gated the island-legibility terms (`legFade`, the shelf/glow/rim/min-land-tint block) behind a new `uIslandFade` uniform, on the theory that those terms were softening into the ghost blobs at close zoom. The orchestrator's verification captures showed this had **zero effect** — before/after renders were byte-identical, and the blobs were still visible.

## What the surviving artifacts already proved (not redone here)

An ablation sweep in `diagnosis/` (`diag2.mjs`, `KILL=<term>`) rendered Samoa z8 with one shader/JS term zeroed at a time and compared each to an un-ablated baseline (`diag-baseline.png`). MD5 of each capture:

| capture | KILL target | md5 | vs. baseline |
|---|---|---|---|
| `ablate-none.png` | (none) | `621cb5fe...` | — |
| `ablate-legterms.png` | `legFade` forced to 0 (kills the whole legibility block, i.e. the first attempt's actual target) | `621cb5fe...` | **byte-identical** |
| `ablate-mintint.png` | the minimum-land-tint mix only | `621cb5fe...` | **byte-identical** |
| `ablate-insetonly.png` | world base forced to black (only inset tiles draw) | `621cb5fe...` | **byte-identical** |
| `ablate-oceanflat.png` | `uOceanFlat` flat-tint mix forced to 0 | `61fa5206...` | **different** |
| `ablate-baseonly.png` | inset mix forced to 0 (only world base draws, trivially different — insets are the whole visible image at z8) | `18a23461...` | different (expected) |

This already proved two things before this session started:
1. The legibility terms (`legFade` and everything gated by it, including min-land-tint) are **not** the source — zeroing the entire block changes nothing on screen. The first attempt's fix was aimed at the wrong code.
2. `uOceanFlat` — the flat deep-ocean tint mix, gated by `openWater` — **is** the source. It's the only ablation (besides the trivial base/inset swap) that changes the rendered pixels at all.

## Why `uOceanFlat` produces blobs that look like they're near the islands

`openWater` (`surface.js`, fragment shader) is computed by sampling the baked equirectangular land/water mask texture (`uMap`) at a few fixed texel offsets around the current fragment, to get a softened "how far from land" value:

```glsl
float wideLand = max(max(texture2D(uMap, vUv - vec2(wx.x, 0.0)).r, ...), ...) * uLand;
float openWater = 1.0 - smoothstep(0.02, 0.60, wideLand);
sat = mix(sat, vec3(0.045, 0.125, 0.255), openWater * uOceanFlat);
```

`uMap` is a single fixed-resolution world texture — its texel size in world space is constant regardless of camera zoom. At whole-globe zoom, the soft falloff this produces (a smooth gradient of tint fading in a few texels around any coastline) is far smaller than a screen pixel and invisible. At close inset zoom (z7–z8), the real coastline is drawn sharply from high-resolution satellite inset tiles, but `openWater`'s falloff footprint is now many screen pixels wide and no longer aligned with that sharp coastline (the inset reprojection and the fixed-resolution mask sample different geometry). The result is exactly what was reported: soft orange-brown and grey-blue ellipses, offset from the real islands, because the `uOceanFlat` mix blends toward tint color over a broad, blurry, misregistered footprint while the actual island sits sharply inside that footprint.

## Did `uIslandFade` (the dead first-attempt mechanism) ever engage? Not relevant, but checked

Moot, since it didn't gate the actual culprit — but for completeness: the first attempt's uniform is gone from the working tree entirely (confirmed by `grep -n uIslandFade src/globe/surface.js` returning nothing, and by `git diff` showing only the new `uOceanFlatFade` addition against HEAD, no leftover `uIslandFade` plumbing). There is only one fade mechanism in the current code.

## The fix

Added a second uniform, `uOceanFlatFade`, that gates only the `uOceanFlat` mix (not the legibility terms, which were never the problem and are untouched):

```glsl
sat = mix(sat, vec3(0.045, 0.125, 0.255), openWater * uOceanFlat * uOceanFlatFade);
```

`updateInsets()` sets it every frame from the same `detailZoom` formula the file already uses elsewhere (line 777's inset zoom-level selection) rather than inventing a new one:

```js
_insetQ.copy(globe.quaternion).invert();
if (insetPointAt(0, 0, _insetP)) {
  const lat = Math.asin(clamp(_insetP.y, -1, 1));
  const mpp = ((state.dist - 1) * 6371000 * 2 * Math.tan((FOV / 2) * DEG)) / state.viewH;
  const detailZoom = Math.log2((156543.03 * Math.cos(lat)) / (mpp * INSET_Q));
  globeMat.uniforms.uOceanFlatFade.value = 1 - smoothstep(clamp(detailZoom - 7, 0, 1));
}
```

This fades the flat-ocean tint out over `detailZoom` 7→8 (the same window the first attempt used, which was the right threshold even though it was wired to the wrong term) and leaves it fully on at `detailZoom` ≤ 7, i.e. z6 and below. Net diff against HEAD is additive and small: one new uniform declaration, one new uniform wired into the existing `mix()` call, and the per-frame update block — nothing removed, nothing else touched.

## Measured: does `uOceanFlatFade` actually reach 0/1 at real capture framings?

Not assumed — read directly off `globeMat.uniforms.uOceanFlatFade.value` via an in-transit-instrumented `surface.js` (`diag4.mjs`), at the four diagnosis views:

| view | dist | landed insetZ | detailZoom | `uOceanFlatFade` |
|---|---|---|---|---|
| samoa-z8 | 1.09 | 8 | 8.35 | **0.000** |
| tahiti-z8 | 1.09 | 8 | 8.32 | **0.000** |
| samoa-z6 | 1.22 | 7 (retry landed one level above wantZ 6) | 7.06 | 0.989 |
| samoa-wide | 1.45 | 6 | 6.03 | **1.000** |

The fade engages fully at both z8 verification views and is fully off (tint preserved) at the genuine z6 view. `samoa-z6`'s retry loop (break condition: landed insetZ ≥ wantZ) accepted insetZ 7 at dist 1.22 rather than retrying down to 6, landing it right at the transition edge (detailZoom 7.06) — not a bug, just the boundary case; `samoa-wide` (dist 1.45) was added specifically so one capture is unambiguously below the transition.

## Recapture verdicts

Captured with the project's production harness (`shots/sat-review/n3-captures/globe-n3.mjs`), `BEFORE=1` serving git HEAD (unfixed) vs. the current working tree (fixed), into `diagnosis/before2/` and `diagnosis/after2/`.

- **samoa-z8** (dist 1.09, detailZoom 8.35): before shows large soft orange-brown and grey-blue ellipses surrounding and offset from the two real islands. After: blobs fully gone — ocean is a clean dark blue, islands are sharp-edged green with no surrounding haze. **Fixed.**
- **tahiti-z8** (dist 1.09, detailZoom 8.32): before shows a hazy orange-grey patch near the top of the frame (same artifact) plus a tile-mosaic seam line and several dark cloud-cover patches around the islands. After: the hazy orange-grey patch is gone. The dark cloud-cover patches and the diagonal tile seam are still present in both — those are source-imagery/tiling artifacts unrelated to the ocean-flat tint and out of scope for this fix. **Fixed** (for the reported ghost-blob artifact).
- **samoa-z6** (dist 1.22, insetZ 7, detailZoom 7.06, fade 0.989): before and after are visually indistinguishable — tint still present (the orange legibility/marker dots visible here are UI markers over the flattened ocean, not the z8 ghost-blob artifact). **Unchanged, as intended** (this is the transition boundary, 98.9% tint retained).
- **samoa-wide** (dist 1.45, insetZ 6, detailZoom 6.03, fade 1.000): before and after are visually indistinguishable — full flat-ocean tint retained. **Unchanged, as intended.**

## Verification

`node --check --input-type=module < src/globe/surface.js` passes. Per instructions, this change is **not committed, pushed, or deployed** — the orchestrator banks it after its own review.
