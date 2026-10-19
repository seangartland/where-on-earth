# G1 cold review: ours vs EOX base imagery

## Verdict

**Tune; do not ship this base layer.** Of the 20 windows, I score **3 pass, 7 weak, and 10 fail**. This is substantially better than a round in which every pair fails, but the remaining failures are distributed across every site and include release-blocking defects: low-zoom ocean panel boundaries, inconsistent land tone, and broken Antarctic ice/coast rendering. The polar failures in particular are not cosmetic tone preferences.

I judged the A/B panels before consulting `ab-key.json` or `qa.json`, then used the key to assign the observations below. One procedural caveat: `ab.html` is not source-blind because its image URLs contain `ours` and `eox`; the standalone page should be used for future cold reviews, or both builds should use opaque asset names.

## Scorecard

Panel references below retain the displayed A/B labels. “Ours” is included only after unblinding.

### Bay Area

| Zoom | Score | Evidence |
|---|---|---|
| z4 | **fail** | **B (ours)** is much darker than A through the open Pacific and contains large rectangular/diagonal ocean-tone changes. Bathymetric ridges become isolated bright blue marks against near-black water. Baja and the west coast remain legible, but the ocean paneling dominates the window. |
| z6 | **weak** | **B (ours)** has a reasonably close land match, though the dry interior is a little darker and redder than A. Its shelf/bathymetry is brighter and more cyan, with a visible tone transition offshore. Coast separation is usable but not seamless. |
| z8 | **fail** | **B (ours)** is materially darker than A over both California land and coastal water; forest and valley shadow detail close up. A broad dark ocean region meets a brighter coastal strip, making the coast look cut out rather than naturally separated. |
| z9 | **pass** | **A (ours)** is close to B in land brightness and retains urban, agricultural, and relief detail. It is slightly warmer/more saturated, and coastal water is somewhat darker, but there is no obvious masking or cloud defect and the coast reads cleanly. |

### Iceland

| Zoom | Score | Evidence |
|---|---|---|
| z4 | **fail** | **B (ours)** makes Iceland, Britain, and mainland Europe much darker than A while rendering North Atlantic bathymetry much brighter. Multiple broad ocean blocks/lines are visible. Greenland ice remains separable from water, but the global-window tonal discontinuities are release-blocking. |
| z6 | **weak** | **B (ours)** is darker and browner on Iceland than A, with snowfields still clear but reduced terrain separation. The ocean is brighter/cyan and an offshore tone boundary remains visible. No single cloud artifact dominates, but the land/ocean balance is not matched. |
| z8 | **weak** | **B (ours)** is modestly darker on the ice-free terrain, while snow/ice is similarly bright. The southeast coastal water shifts toward dark teal and the shoreline is harder than A. Detail is intact and there is no large seam, so this is tunable rather than a fail. |
| z9 | **pass** | **A (ours)** is slightly darker and less highlight-heavy than B but preserves volcanic terrain, snow, lakes, and the ice margin. The ice edge is coherent and no panel boundary is apparent. |

### Fiji

| Zoom | Score | Evidence |
|---|---|---|
| z4 | **fail** | **B (ours)** is darker on Australia and in the deep ocean than A, while ridge/shelf features are locally brighter blue. Large ocean tone blocks and lines are visible; small islands are present but the background does not read as one continuous ocean. |
| z6 | **fail** | **B (ours)** is much brighter and more cyan across the ocean than A, with conspicuous rectangular tone changes. Island land is brighter/greener, but small-island/coast separation is overwhelmed by the discontinuous bathymetry field. |
| z8 | **weak** | **B (ours)** has brighter blue bathymetry and a darker deep-water field than A. Fiji itself is small but readable and green; no obvious cloud defect is present. The tonal transition across the ocean keeps this from passing. |
| z9 | **weak** | **A (ours)** gives Viti Levu strong green land and a crisp reef/coast edge, but its deep water is substantially darker than B and the shallow-water turquoise is more saturated. This is usable locally, but not matched to adjacent/EOX ocean tone. |

### Sydney

| Zoom | Score | Evidence |
|---|---|---|
| z4 | **fail** | **B (ours)** is darker on Australia and deep water, with brighter shelves/ridges and visible ocean blocks; it is effectively the same low-zoom global discontinuity seen in Fiji z4. Land remains recognizable, but the base-layer ocean is not continuous. |
| z6 | **pass** | **B (ours)** is a close brightness match on eastern Australia, with somewhat stronger red/orange and green saturation. The coast is crisp and there are no visible cloud, snow, masking, or panel-edge defects. Offshore bathymetry is brighter than A but not enough here to fail the window. |
| z8 | **weak** | **B (ours)** is darker across the land interior and brighter/cyan offshore than A. The coastline remains clean and detailed, but the land/ocean tone balance is visibly different. |
| z9 | **fail** | **A (ours)** is much brighter and more saturated on land than B, especially in rust-red and green areas, while deep coastal water remains dark. Detail and the coast are sharp, but this is a large local exposure/color mismatch rather than a close base-layer match. |

### Antarctic Peninsula

| Zoom | Score | Evidence |
|---|---|---|
| z4 | **fail** | **A (ours)** has a large rectangular ocean-tone boundary west of South America and brighter/cyan shelf water than B. Antarctic ice is recognizable, but its edge includes harsh black speckling and abrupt white shapes. |
| z6 | **fail** | **A (ours)** contains flat gray polygonal areas at the Antarctic coast/ice edge that do not exist in B. These read as missing-data or compositing shapes, not natural ice, and break land/ocean separation. Ocean lines are also visible. |
| z8 | **fail** | **A (ours)** has clipped white ice, dark/olive edge halos, and geometric gray coastal patches. B is imperfect and speckled, but A's ice/ocean boundary reads as a mask failure. This cannot be accepted as a tonal variant. |
| z9 | **fail** | **B (ours)** is the worst polar panel: large soft gray lobes and hard-edged blocks cover coastal water/ice, with blown white snow and blurred vertical transitions. The shapes are plainly non-geographic and destroy coast interpretation. |

## QA cross-check

The QA window keys are the upper-left coordinates of each 3×3 site window; the named site's center tile is two coordinates higher. This maps the metrics to the scorecard as follows.

| Site | z4 nodata | z6 nodata | z8 nodata | z9 nodata | Read against the panels |
|---|---:|---:|---:|---:|---|
| Bay Area | 85.1% | 35.6% | 0% | 0% | The high low-zoom missing-source share is consistent with the ocean-dominated z4/z6 composites. It does not by itself measure the visible seams. |
| Iceland | 32.8% | 22.4% | 0% | 0% | Coverage improves with zoom, consistent with the cleaner z8/z9 panels. Tone mismatch persists after nodata reaches zero, so coverage is not the whole issue. |
| Fiji | 90.9% | 81.2% | 38.9% | 0% | This is the clearest corroboration: the three weak/failing ocean-heavy panels are also the three incomplete source windows. The center output tiles still report 44.5%, 46.1%, 0%, and 0% nodata respectively, showing that the window and sampled output-tile statistics describe different extents/stages. |
| Sydney | 73.1% | 6.3% | 0% | 0% | The sharp coverage improvement agrees with z6 being the cleanest Sydney panel. The z9 exposure mismatch remains despite zero reported nodata and is a tone issue. |
| Antarctic Peninsula | 71.0% | 29.4% | 0% | 0% | z4/z6 incompleteness supports concern, but z8/z9 are a direct contradiction if zero nodata is treated as a quality pass: both visibly contain severe mask/composite artifacts. |

The numeric data are useful but insufficient for acceptance:

- The z4 seam checks report mean absolute RGB differences of **22.72**, **120.53**, and **11.46**, but the listed pairs connect different site windows rather than measuring every internal boundary in each displayed mosaic. They therefore do not clear the visible z4 panel edges. The 120.53 result is itself a strong warning.
- `validPixels + nodataPixels` is consistently 589,824 pixels per window, so the percentages above are internally well formed. However, zero nodata at z8/z9 only says the metric found no remaining nodata by its definition; it does not detect clipped snow, cloud-like gray fills, hard mask geometry, or tone seams.
- Raw-band means cannot establish visual brightness against EOX because QA contains no matched EOX statistic and the finish transform is nonlinear. For example, Antarctic z9 has very high raw means (R/G/B about **4886/5200/5439**) and an output center-tile RGB mean of **190.9**, which is consistent with the visually blown snow but does not quantify the A/B difference.
- The output center-tile means span roughly **26.3** (Bay z8), **29.3** (Fiji z9), **59.9** (Sydney z9), **118.8** (Iceland z9), and **190.9** (Antarctic z9). That wide range is expected across biomes; it argues against forcing all windows toward one global mean.

## Required tuning and repair

1. **Repair polar masks/compositing before tonal work** — motivated by Antarctic **z6 A, z8 A, and z9 B**, with z4 A as a secondary warning. No finish-config tone lever (gain, gamma, knee, saturation, or ocean curve) can remove geometric gray fills, lobes, or hard mask edges. This is a **per-biome/upstream** repair: reject cloud/nodata fills at the ice boundary, rebuild the affected windows, and add a visual/mask-edge QA check. Do not try to hide these defects by darkening the ocean.

2. **Fix low-zoom ocean continuity** — motivated by Bay **z4 B**, Iceland **z4 B**, Fiji **z4 B/z6 B**, Sydney **z4 B**, and Antarctic **z4 A**. A global ocean-curve change will move both sides of a seam together and cannot eliminate a boundary; normalize/blend source windows before the finish curve. After continuity is fixed, test a small curve compression—offset **0.07 → 0.08** and scale **0.68 → 0.64–0.66**, holding ocean gamma near **0.92**—to lift near-black abyssal water without making the already-bright shelves much brighter. This is a **global ocean experiment**, not an acceptable substitute for seam repair.

3. **Do not increase global land gain** — Bay **z8 B** and Iceland **z4 B/z6 B** need more midtone visibility, but Sydney **z9 A** is already too bright and saturated. Use **per-window/per-biome exposure normalization**: try effective land gain **+8–12%** for Bay z8 and **+5–8%** for Iceland z4/z6, while reducing Sydney z9 by **8–12%**. Keep the global gain at **2.9** until those trials show a consistent residual. Gamma is the safer secondary lever for dark midtones: test **0.86–0.88** only on the dark windows rather than globally.

4. **Reduce the Sydney z9 color/exposure excess locally** — motivated by **Sydney z9 A**. Start with land gain **2.9 → 2.6–2.7** and saturation **1.05 → 0.98–1.00** for that window or its dry-Australia normalization class. This is **per-window/per-biome**; applying it globally would dull the already restrained Iceland panels.

5. **Recover polar highlight texture only after mask repair** — motivated by clipped ice in Antarctic **z8 A/z9 B**. Test a lower highlight knee of **0.72 → 0.64–0.68** for the snow/ice biome, paired with a **5–10%** polar land-gain reduction if needed. This is a **per-biome** adjustment. It may reduce white clipping, but it will not repair the gray geometry described in item 1.

6. **Retest ocean chroma after luminance continuity is fixed** — motivated by the overly cyan shelves in Bay **z6 B**, Iceland **z6 B**, Fiji **z6 B/z8 B**, and Sydney **z8 B**. Try ocean chroma **0.72 → 0.62–0.66**. This is the one plausible **global color** adjustment, but judge it on reefs in Fiji z9 A so their useful turquoise separation is not erased.

The acceptance gate for the next round should require: no geometric Antarctic fills, no visible 768/256-pixel ocean boundaries at normal page scale, and no fail in any of these 20 windows. On the current evidence, G1 is not ready to ship.
