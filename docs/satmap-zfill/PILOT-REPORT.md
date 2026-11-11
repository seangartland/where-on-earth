# PILOT-REPORT: satmap 174 Phase 1 pilot (Great Lakes row, Iberia, Congo)

Lane: claude-run (Opus 5.5), started 2026-11-11. Brief: BRIEF-phase1-pilot.md.
Design authority: DESIGN.md Phase 1 plus the brief's gates. Status of each
section is stated at its head; numbers are labeled measured unless marked
otherwise.

---

## 1. Sharpness diagnostic (brief step 1). FOR SEAN BEFORE ANY GLOBAL SCALING

Status: complete, measured 2026-11-11.

**Finding: detail is lost at the source-resolution stage, not in the render
chain.** The LR quarterly product itself (S2MSI_L3__MCQ_LR, 0.0036 deg/px,
about 306 m E-W x 400 m N-S at Madrid's latitude) does not carry the detail
EOX shows at z9. A z9 window rendered directly from the full-resolution
quarterly source, bypassing the production chain entirely, is no sharper than
production. The production chain reproduces the direct render to within 0.1
Laplacian-variance units at the field-assembly stage; finish tone and JPEG
encode each cost a measurable but secondary share (named below). The 2x-of-EOX
sharpness bar is not reachable at z9 from this source. Reaching it needs the
high-resolution quarterly sources (or per-window HR scenes), which is a
sourcing decision for Sean (DESIGN.md Open Question 2), not this lane's call.

### Metric

Grayscale (PIL 'L') of the 256x256 z9 tile containing the city center,
4-neighbour 3x3 Laplacian, variance. Validated by reproducing the reference
numbers on live tiles fetched 2026-11-11 with curl and the Origin header:
Madrid z9 tile 9/250/193 ours 166.7, EOX 6,539.5 (reference 167 / 6,540);
Chicago z9 tile 9/131/190 ours 223.6, EOX 11,435.6 (reference 224 / 11,436).

### Three-way numbers per city (plus each chain stage)

Direct renders read the source on the Pi in place
(/mnt/external/satmap/source, cells N18W036 and N18W108), toned with the
production land curve from eox1-work/scripts/sat/local/finish.mjs (gain 2.9,
gamma 0.9, knee 0.72, saturation 1.05, shadow lift on), encoded exactly as
production does (ffmpeg mjpeg -q:v 2 from PPM). The production window cache is
the sample.py output the live z9 was finished from
(quarter-v2-work/raw-quarterly/9_249_192 and 9_129_189).

Madrid, tile 9/250/193:

| Stage | Q1 | Q2 | Q3 | Q4 |
|---|---:|---:|---:|---:|
| S0 source native pixels, no resampling (149x195 px crop) | 618 | 1,254 | 1,212 | 560 |
| S1 direct z9 render, average resampling, lossless | 160 | 323 | 315 | 144 |
| S1 direct, average, after JPEG q2 | 141 | 292 | 283 | 126 |
| S1 direct, lanczos, after JPEG q2 | 144 | 294 | 286 | 131 |
| S1 direct, cubic, after JPEG q2 | 123 | 251 | 244 | 111 |
| S1 direct, bilinear, after JPEG q2 | 82 | 168 | 163 | 74 |
| S1 direct, nearest, after JPEG q2 (blocky; inflated by block edges) | 308 | 644 | 624 | 277 |
| S2 production window cache (field-assembly output), lossless | 160 | 323 | 315 | 144 |
| S2 production window cache after JPEG q2 | 141 | 292 | 283 | 127 |
| **Production z9 as served** | 167 (one tile) | | | |
| **EOX z9 as served** | 6,540 | | | |

Chicago, tile 9/131/190:

| Stage | Q1 | Q2 | Q3 | Q4 |
|---|---:|---:|---:|---:|
| S0 source native pixels, no resampling (146x195 px crop) | 695 | 894 | 773 | 625 |
| S1 direct z9 render, average resampling, lossless | 180 | 233 | 201 | 163 |
| S1 direct, average, after JPEG q2 | 163 | 214 | 183 | 148 |
| S1 direct, lanczos, after JPEG q2 | 161 | 206 | 176 | 143 |
| S1 direct, bilinear, after JPEG q2 | 93 | 120 | 104 | 84 |
| S2 production window cache (field-assembly output), lossless | 180 | 233 | 201 | 163 |
| S2 production window cache after JPEG q2 | 163 | 214 | 184 | 148 |
| **Production z9 as served** | 224 (one tile) | | | |
| **EOX z9 as served** | 11,436 | | | |

### Attribution, stage by stage

1. **Source resolution (dominant).** The tile footprint holds only about 150
   x 195 source pixels, so z9 is a 1.3x to 1.7x upscale of the LR grid.
   Control experiment: EOX's own z9 tile box-downsampled to the LR grid and
   bilinear-upscaled back falls from 6,540 to 899 (Madrid) and from 11,436 to
   1,196 (Chicago), a 7x to 10x loss from resolution alone. The LR product is
   also intrinsically smoother than a box-downsampled 10 m image: on the same
   native grid, with our global contrast matched to EOX's, our source scores
   1,927 to 2,653 (Madrid) and 2,034 to 2,579 (Chicago), against EOX
   6,862 / 9,071 on that grid. That is a further 2.6x to 4.5x, and it sits in
   the product itself, before any of our code runs.
2. **Finish tone (secondary, fixable).** Our toned source has about half
   EOX's global grey contrast (std 16 to 25 vs EOX 32 at Madrid; 22 to 26 vs
   44 at Chicago). Laplacian variance scales with contrast squared, so the
   finish curve costs a 2x to 4x factor. This is the tone gate's fix point
   (section 5) and it does not add detail.
3. **Field-assembly resampling (neutral as built).** Production's
   Resampling.average equals the direct average render exactly and is on par
   with lanczos. Bilinear would halve sharpness; it must not be used.
4. **JPEG encode (minor).** q:v 2 costs 8 to 12%.
5. **Quarter choice (content, not loss).** Q2/Q3 Madrid carries 2x the
   Laplacian variance of Q1/Q4 because summer fields contrast more; the
   production tile's 167 sits at its quarter's level.

Ceiling, stated plainly: the best LR z9 that any chain can produce at Madrid is
about 300 (average or lanczos, Q2/Q3) at the production tone, and roughly
600 to 1,000 with an EOX-like contrast curve (estimated by the contrast-squared
scaling above, not rendered). The 2x bar is 3,270 (Madrid) and 5,718
(Chicago). The gap of roughly 5x to 10x after any tone fix is source
resolution by name.

Evidence on disk: satmap-zfill/pilot/diag/ (diag-pi.json, diag-vm.json,
diag-eox-degrade.json, diag-contrast.json, every rendered PNG/JPEG, and
montage-sharpness.png, which shows production / direct lanczos / direct
average / native source pixels / EOX side by side for both cities). Script:
satmap-zfill/pilot/diag_sharpness.py.

### What this means for the rest of the pilot

The brief's sharpness gate reads "within 2x of EOX ... or the diagnostic
finding explains the remaining gap by name". It is explained by name (source
resolution), so the pilot proceeds on the LR source as DESIGN.md Open Question
2 recommended. The pilot does not and cannot fix z9/z10 sharpness. Before the
global pass Sean decides whether deep levels need the HR quarterly sources.
The z10 windows in this pilot are smoother upscales of the same 300-400 m
pixels, exactly as DESIGN.md 2.5 warned.
