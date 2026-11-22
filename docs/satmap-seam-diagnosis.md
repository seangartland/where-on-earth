# Seam Diagnosis (z5 flagged joins)

Scope: diagnosis and repair planning only. No mosaic field, source tiles, or shipped assets were modified. All evidence read from `/mnt/external/woe-seam-diagnosis` only, per confinement amendment.

## Evidence examined

- `BRIEF-seam-diagnosis.md` (task and amendment)
- `stage2-revision-report.md` (flagged edges, control range, seam crops)
- `satmap-advice-astra.md` (ruling: source-side fix, no blur)
- `seam-crops-revision/5-3-2-S-5-3-3.png`, `5-1-2-S-5-1-3.png`, `5-1-3-N-5-1-2.png`
- `provenance-global/AUDIT-DATA.md`, `tiles-manifest.json`, `tone-global.json`, `mask-global.json`, `layer-consistency.json`, `seams-global.json` (`seams-global.json` is the retired Lane A non-adjacent-edge artifact per AUDIT-DATA; not used as authoritative seam evidence)
- `provenance-global/01_tiles_manifest.py`, `02_tone_global.py`, `05_mask_global.py`, `RETIRED-04_seams_global.py`
- `field-data/PREREG.md`, `REPORT.md`, `REFINISH-SCOUT.md`, `REFINISH-PHASE1*.md`, `OPUS-NEXT-STEPS.md`, `OPUS-EFFORT-ASSESSMENT.md`, `global_composite.py`, `phase1_*`, `common.py`
- `field-data/.src/comp-b.npz` (broken symlink; target not in workdir)

Not found in workdir: original mosaic source scene/tile identities per z5 cell (full-plan window provenance, per-tile QA/source records, selection manifests, quarterly/source COG provenance for these specific z5 tiles, fetch records). I searched `provenance-global/*.json`, `field-data/*.json*`, and filename/content patterns for `S2A`, `S2B`, `granule`, `MGRS`, `scene`, `source_id`, `acquisition`; no per-tile source identity records were present.

## Measurement basis

Stage 2 revision report control range (2 px outermost strip, RGB abs diff, 0-255): mean 28.50-49.27, p99 47.0-110.0. Verdict CONTINUOUS only when every measured edge lies inside that range.

I independently measured the provided seam crops (Pillow/numpy, RGB). The crops are 1028x128; the strongest row boundary is at row 63->64 in every crop, matching the reported seam location. The two 5/1/2-5/1/3 crops have identical pixel statistics, confirming they depict the same boundary.

| Crop / edge | strip mean abs diff | strip p95 | strip p99 | max | strongest row boundary mean | top 2px lum mean | bottom 2px lum mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5/3/2 S - 5/3/3 N (`5-3-2-S-5-3-3.png`) | 79.54 | 200.0 | 219.0 | 241.0 | 80.49 (row 63->64) | 1.51 | 83.38 |
| 5/1/2 S - 5/1/3 N (`5-1-2-S-5-1-3.png`) | 68.25 | 156.0 | 182.0 | 198.0 | 69.02 (row 63->64) | 1.66 | 73.71 |
| 5/1/3 N - 5/1/2 S (`5-1-3-N-5-1-2.png`) | 68.25 | 156.0 | 182.0 | 198.0 | 69.02 (row 63->64) | 1.66 | 73.71 |

Tile bounds (Web Mercator tile math):

| Tile | Lon range | Lat range | Center |
|---|---:|---:|---:|
| 5/3/2 | -146.25, -135.00 | 81.09, 82.68 | -140.62, 81.88 |
| 5/3/3 | -146.25, -135.00 | 79.17, 81.09 | -140.62, 80.13 |
| 5/1/2 | -168.75, -157.50 | 81.09, 82.68 | -163.12, 81.88 |
| 5/1/3 | -168.75, -157.50 | 79.17, 81.09 | -163.12, 80.13 |
| 5/4/4 | -135.00, -123.75 | 76.84, 79.17 | -129.38, 78.01 |
| 5/4/3 | -135.00, -123.75 | 79.17, 81.09 | -129.38, 80.13 |
| 5/4/1 | -135.00, -123.75 | 82.68, 83.98 | -129.38, 83.33 |

## Per-edge diagnosis

### 1) 5/3/2 south edge (joins 5/3/3 north) - SUSPECT, worst

- **Reported edge profile:** mean 79.54, p99 219.0 (control max mean 49.27, p99 110.0). Visible discontinuity sighted in crop.
- **Measured crop profile:** 2px strip mean 79.54, p99 219, max 241; strongest boundary row 63->64 mean 80.49; top 2px luminance mean 1.51, bottom 2px luminance mean 83.38. Top half black fraction (lum < 2) 2.22%, bottom half 0.087%.
- **Source identities (both sides):** Not found in workdir. I checked `provenance-global/tiles-manifest.json` (plan membership/counts only; no per-tile source IDs), `tone-global.json`, `mask-global.json`, `layer-consistency.json`, `seams-global.json`, and all `field-data/*.json*` for scene/granule/source identifiers. No per-tile source scene, quarter selection, mask, fallback, or alignment record for 5/3/2 or 5/3/3 is present.
- **Diagnosed cause:** **Undetermined (evidence missing), with strong nodata/fallback-fill signature.** The seam is a near-black to normal-imagery step concentrated at a single tile boundary row. That pattern is consistent with missing/invalid source coverage or fallback fill on the 5/3/2 side meeting valid imagery on 5/3/3, but source provenance is required to distinguish nodata fill, polar coverage gap, fallback substitution, or another source-selection failure. Location is extreme high latitude (81-83N), where polar coverage and illumination artifacts are plausible; this is not classified as real-world feature because the boundary is tile-aligned and the top strip is near-black.
- **Repair plan (source-side):** Trace 5/3/2 and 5/3/3 to original source scenes/quarters, QA masks, nodata/fallback decisions, and any tone/alignment transforms in the mosaic pipeline. If 5/3/2 used nodata/fill/fallback while 5/3/3 used valid imagery, replace 5/3/2 with the correct source selection or an explicitly approved fallback consistent with neighboring coverage; do not blur the edge. Regenerate affected z5 tile(s), then downstream derivatives that consume them: z5 page/strip assets, any z4/z6+ pyramids or overviews derived from these tiles, gutters, manifests/hashes/content versions, and any revision/page packages containing these keys. Re-measure the 5/3/2 S / 5/3/3 N 2px edge mean and p99 against the Stage 2 control range (mean <= 49.27, p99 <= 110.0) and visually inspect the same crop framing.

### 2) 5/1/2 south edge and 5/1/3 north edge - SUSPECT, same boundary

- **Reported edge profile:** 5/1/2 S -> 5/1/3 mean 68.25, p99 182.0; 5/1/3 N -> 5/1/2 mean 68.25, p99 182.0. Same boundary measured from both sides.
- **Measured crop profile:** Identical for both crops: mean 68.25, p99 182, max 198; strongest boundary row 63->64 mean 69.02; top 2px luminance mean 1.66, bottom 2px luminance mean 73.71. Top half black fraction 2.14%, bottom half 0.195%.
- **Source identities (both sides):** Not found in workdir. Same provenance search as edge 1; no per-tile source scene/quarter/mask/fallback/alignment record for 5/1/2 or 5/1/3.
- **Diagnosed cause:** **Undetermined (evidence missing), with strong nodata/fallback-fill signature.** Same tile-aligned near-black to normal-imagery step pattern as edge 1, at similarly extreme latitude (79-83N). The two crops being pixel-identical confirms one physical boundary, not two defects. Cause cannot be finalized without source provenance; plausible classes include missing/invalid source coverage, nodata fill, or fallback substitution on 5/1/2.
- **Repair plan (source-side):** Trace 5/1/2 and 5/1/3 source identities, QA masks, nodata/fallback decisions, and color/alignment processing. Apply the same source-side correction principle: fix the upstream tile selection/fill for the dark side; do not blur. Regenerate affected z5 tile(s) and all downstream derivatives (pyramids/pages/strips/gutters/manifests/hashes/content versions/revision packages). Re-measure the same boundary once (both directions should match) against control range; confirm p99 <= 110.0 and mean <= 49.27 and no visible discontinuity in the crop.

### 3) 5/4/4 north edge (joins 5/4/3 south) - SUSPECT, marginal

- **Reported edge profile:** mean 50.77, p99 97.0. Mean is just over control max mean 49.27; p99 is within control p99 range (47-110).
- **Measured crop profile:** No seam crop provided in `seam-crops-revision/` for this edge. I cannot independently re-measure pixel strips from an image.
- **Source identities (both sides):** Not found in workdir. Same provenance search; no per-tile source records for 5/4/4 or 5/4/3.
- **Diagnosed cause:** **Undetermined (evidence missing).** The signal is marginal (mean barely above control max, p99 inside control range). Possible causes include mild tone/color processing difference, scene-selection/fallback boundary, or acceptable natural variation near control threshold; without crop and source provenance, it cannot be classified confidently. I do not classify it as real-world feature or defect without evidence.
- **Repair plan (source-side):** First obtain/produce the missing seam crop and per-side source provenance for 5/4/4 and 5/4/3. If provenance shows different scene/quarter/fallback/tone processing, normalize at source and regenerate affected derivatives. If it is a real feature and edges remain within acceptable visual/metric bounds after review, document as accepted with evidence. Regeneration scope if changed: affected z5 tile(s), downstream pyramids/pages/strips/gutters/manifests/hashes/content versions. Re-measure mean/p99 against control range; require both within control after fix.

### 4) 5/4/1 - SUSPECT, not assessable

- **Reported edge profile:** No existing neighbor; not assessable (n/a).
- **Measured crop profile:** No crop provided; no adjacent tile edge to measure.
- **Source identities / intended source:** Not found in workdir. `tiles-manifest.json` confirms plan membership at aggregate level only (z5 expected/present 573/573, 0 missing) but does not list per-tile identities or intended neighbors/sources. No full-plan.json, window/tile source manifest, or fetch/QA record is staged for 5/4/1.
- **Diagnosed cause:** **Undetermined (evidence missing).** The tile is high latitude (82.68-83.98N, near polar coverage limit). Missing neighbor may be expected coverage boundary, missing plan/window coverage, or dropped source/fallback; cannot determine from staged evidence.
- **Repair plan (source-side):** Locate intended neighbor and source coverage in full-plan and source QA/fetch records. Confirm whether 5/4/1 should have an adjacent tile, ocean/fill, or masked nodata treatment. If a neighbor/source is missing improperly, fetch/select correct source and generate the missing tile/neighbor consistently; regenerate downstream derivatives and manifests. Re-measure the intended shared edge once neighbor exists; apply the same 2px mean/p99 control-range gate and visual crop review.

## Summary table

| Edge | Reported mean/p99 | Cause | Repair (source-side) | Regeneration scope | Status |
|---|---:|---|---|---|---|
| 5/3/2 S -> 5/3/3 N | 79.54 / 219.0 | Undetermined; strong nodata/fallback-fill signature on 5/3/2 (near-black to imagery step, tile-aligned, 81-83N) | Trace source/QA/fallback for both tiles; replace/fix dark-side source selection; no blur | 5/3/2 (and any affected neighbor), downstream pyramid/page/strip/gutter/manifest/hash/version artifacts | Evidence missing for source IDs |
| 5/1/2 S -> 5/1/3 N (same boundary as next) | 68.25 / 182.0 | Undetermined; strong nodata/fallback-fill signature on 5/1/2 (identical to reverse crop) | Trace source/QA/fallback; fix dark-side source selection; no blur; remeasure once | 5/1/2 (and affected neighbor), downstream pyramid/page/strip/gutter/manifest/hash/version artifacts | Evidence missing for source IDs |
| 5/1/3 N -> 5/1/2 S | 68.25 / 182.0 | Same physical boundary as 5/1/2 S -> 5/1/3 N | Same fix as above; not a separate repair | Same as above | Duplicate measurement of same seam |
| 5/4/4 N -> 5/4/3 S | 50.77 / 97.0 | Undetermined; marginal over mean control, p99 within control; no crop/provenance | Obtain crop + source provenance; normalize source/tone only if provenance confirms mismatch; otherwise document accepted with evidence | If changed: affected z5 tiles + downstream pyramid/page/strip/gutter/manifest/hash/version artifacts | Evidence missing (crop, source IDs) |
| 5/4/1 (no neighbor) | n/a / n/a | Undetermined; not assessable, high-latitude coverage boundary unknown | Locate intended neighbor/source in full plan + QA/fetch records; generate/fix missing source coverage as needed | Missing/affected z5 tile(s) and downstream derivatives/manifests if generated or changed | Evidence missing (intended source/neighbor) |

## Ruling compliance

- Source-side diagnosis/repair planning only; no blur/fade across seam.
- No mosaic field, source tile, or shipped asset modified.
- Where provenance is missing, this report names where it looked and what is missing, rather than guessing source identities.
