# Batch 1 build report: Where on Earth discoloration program, 2026-11-23

STAGED ONLY. Built on the Pi under /mnt/external/satmap/batch1/ (task-body
staging path; the plan named step3-scratch/first-batch-2026-11-23, the task
body named batch1, the body won). No upload to R2, no live tile changed, no
Process API. Inputs were copied from the archive trees, never mutated in
place; originals verified untouched by sha256 comparison against the region
tiles-manifests throughout.

HEADLINE: Family A (pilot dtype fix) built and its bad controls all pass,
but acceptance A3 fails as specified: the staged re-run changes 350 keys
outside the plan's strict closure, so the true repair footprint is 894
keys, not 544. Family B (17,4 quarter cast) FAILS its acceptance gate:
the Q2 rebuild of 9/279/69 still measures 0.0646 under the frozen census
gate, and its ancestors and the shared base could not be regenerated from
retained data at all. Per the build instruction, nothing was worked
around; the staging tree is kept for inspection and both failures are
reported with evidence below.

## Step 1: five-key audit (all five OUT, closure stays 544)

Method: fresh signed re-reads of the retained source TIFs; strict and
1-degree feather-expanded footprints; per-stage trace over the retained
field arrays (toned quarters, assembled, guarded, final).

- 10/486/419, 10/487/415, 10/492/415, 10/493/415 (Iberia): real
  above-gate tiles (defect 0.0111 / 0.0057 / 0.0047 / 0.0079, all red),
  but NOT wrap artifacts. Zero negative int16 pixels exist in any quarter
  in the strict footprint and in the feather-expanded footprint, so
  neither the strict path nor feathering has any wrapped signal to carry.
  The red pixels are present in all four toned quarters (for example
  486/419: 119/58/178/92 px) with muted red-brown mean RGB (127,58,36 to
  165,71,40), not the flat wrap red (247,8,8); the assembled field equals
  the selected quarter exactly. Verdict: legitimate saturated terrain
  color (southern Iberia red-brown ground), a census false positive of
  the adjudicated borderline class. Left out.
- 10/995/485 (atoll): atoll-path check done. Tile defect 0.0090 (588 cyan
  px), field box mean RGB (21,84,94), present in all four toned quarters;
  assembled equals selected Q1 exactly (104 px). Strict footprint has
  zero wrapped pixels in every quarter; only 26 wrapped pixels exist in
  the feather-expanded area, none under the selected quarter. Verdict:
  legitimate shallow-lagoon cyan, not a wrap artifact. Left out.
- The plan's sixth outside-closure key, 10/600/464, stays out per
  ADJUDICATION.md (Sahara, legitimate).

Closure recomputation reproduced the plan exactly: 544 keys, 6,853,435
current bytes (Iberia 301 / 3,645,209; Congo 243 / 3,208,226; Great Lakes
0; Atoll 0), 34 connected components.

## Family A: build and acceptance

Fix applied to a staged copy of zfill_pilot.py (patched sha256 in
family-a/manifest.json): in read_extent, clip negatives on the signed
int16 array before the uint16 assignment, then the existing >20000 guard
on the signed values. Regions Iberia and Congo re-run tone, assemble,
guard, ocean, cut in staging. Companion gate-rejection hardening ran
after tone: 0 block substitutions in either region (after the dtype fix
no picked quarter trips the gate at block level, so the guard rail never
fired; recorded in gate-substitutions-*.json).

Acceptance:
1. Code check PASS. Original read_extent on the Algiers footprint: B04
   median 65,514 (TRACE: 65,515). Patched: median 0.0, max 8,379, no
   wrapped values. Synthetic int16 array round-trips with negatives at 0
   and no value above 20000 surviving; the original code reproduces the
   wrap on the same input (audit/code-check.json).
2. Bad controls PASS, all 7 at or under 0.003 after: 512/387 0.375 to
   0.00209; 512/388 0.982 to 0.000; 512/389 0.424 to 0.000; 548/534
   0.220 to 0.000; 531/372 0.027 to 0.000; 532/372 0.038 to 0.000;
   513/386 0.0034 to 0.00029. Clean controls: 500/377 byte-identical,
   0.000 before and after, PASS. 544/522 stays 0.000 on the gate but is
   NOT byte-identical and its content shifted (mean abs RGB diff 3.09,
   28,384 px changed, max 198): PARTIAL FAIL against "byte-identical or
   provably unchanged in content" (see check 3 for the mechanism).
3. PARTIAL FAIL. All 544 closure keys regenerated exactly once; 533 of
   544 measure at or under the gate; the 11 still above are yellow-band
   only (0.0031 to 0.0127: 516/400, 517/400, 546/528, 548/529, 549/533,
   551/529, 552/518, 552/528, 553/473, 554/473, 554/474) and carry
   per-key adjudication notes in provenance, as A3 allows. BUT the
   clause "no key outside the closure changes" FAILS: 350 non-closure
   z10 keys changed sha256 in the staged re-run (Iberia 218, Congo 132),
   including the adjudicated Sahara tile 10/600/464 (0.01216 to 0.01085,
   still legitimate color). Mechanism, measured: assemble's
   low-frequency feather and fallback fill consume ALL four toned
   quarters, not only the selected one (clean control 544/522: its
   footprint's Q3 carries 354 wrapped pixels on Q2-selected ground, and
   Q4 carries 920; the block's toned LF changed, so its correction
   changed), and the ocean stage's wire fix uses a global clean median,
   which shifts replacement pixels field-wide (changed keys reach
   Chebyshev distance 31 from the nearest closure key; 154 sit at
   distance 1). The plan's closure definition (selected-quarter cut
   footprint) undercounts the true dependency closure. The 544-key
   candidate is intact and correct as far as it goes; a release from
   this re-run would change 894 keys, and that widening is Sean's call,
   not assumed here.
4. PASS: all 5 audited keys carry their disposition (step 1) in
   family-a/manifest.json and audit/five-key-verdicts.json.
5. Sheets produced (qa/family-a/: controls sheet plus 6 component
   sheets covering all 34 component centers, before/after 3x3 context,
   centers outlined). No automated seam metric exists in the plan; the
   visual boundary verdict is Sean's at final-map validation. Not
   machine-passed.

Counts vs plan projection: 544 keys in, 544 out. Tile bytes 6,853,435
before (matches plan) to 4,849,260 after (rebuilt JPEGs compress
smaller; the plan projected on current bytes). Family A deliverable on
disk (tiles + manifest + provenance): 5,649,369 bytes.

## Family B: cast check, rebuild, acceptance

6. Cast check PARTIAL MATCH. Reproduced from the retained quarters:
   Q1 toned defect 0.000, Q2 0.000, Q4 0.000 with coverage 17.02%
   (TRACE: 17%), Q2 obs median 34 (TRACE: 34), Q3 obs median 15
   (TRACE: 15); Q3 is the sole defect carrier (cyan). Magnitude differs:
   my exact replication measures Q3 at 0.0121 (795 cyan px on the tile
   crop) vs TRACE's 0.024-0.029 (1,908 px); TRACE itself flags its tone
   replication as approximate. Attribution, coverage and the fallback
   order (Q2 first, Q1 second, Q4 excluded) all reproduce.
   Cast table (crop medians B04/B03/B02, coverage): Q1 1134/1372/1894,
   100%; Q2 333/566/735, 100%; Q3 361/680/688, 100%; Q4 0/0/0, 17.0%.
   Full record: family-b/cast-check.json.
7. FAIL. The decision rule was executed exactly: Q3 excluded, Q2
   selected for the whole footprint (selected TIFF verified 100%
   pixel-identical to Q2, 0% to Q1/Q3/Q4), rendered through the pinned
   refinish chain (finish-field-v3-d8fixed.mjs; field-v3.bin sha256
   24b8454b... matches the production hash; finisher QA status passed).
   Rebuilt 9/279/69 measures 0.0646 (cyan 4,231 px), down from 0.0807
   but far above the 0.003 gate. A cross-check through the local
   finish.mjs chain with the same Q2 selection gives 0.0643: the result
   is chain-independent. Conclusion the plan did not predict: Q2's data
   over this footprint also renders saturated cyan through the full
   finish chain (the evalscript replication tones it clean; the shipped
   chain amplifies it, the same amplification TRACE measured for Q3,
   0.029 to 0.081). The exclude-quarter repair does not clear this
   footprint. Cast handling was NOT attempted: the plan reserves it for
   a future footprint with its own calibration. Sibling tiles in the
   window: 279/70 0.0035 to 0.0023, 279/71 0.000 to 0.000.
   Ancestors and base NOT regenerated, with evidence: the quarterly
   caches for windows 8/138/33, 7/69/15, 5/15/3 and 4/6/0 were never
   retained (raw-quarterly holds only 133 z9 windows) and no retained
   plan gives those windows deriveSources, so the pinned chain has no
   retained input to rebuild 8/139/34, 7/69/17, 5/17/4, 4/8/2 or the
   shared base from. Their current measured fractions (0.037, 0.025,
   0.019, 0.002) and hashes are recorded in family-b/manifest.json.
8. Boundary sheet produced (qa/family-b/279-69-before-after.png); with
   check 7 failed it is evidence, not a pass.
9. z6 PASS: 6/34/8 untouched, sha256
   d2ea8a76511d8908343b93fd964023c34160a76065a718a918db5e8bc2c0548d,
   recorded before and after; this build never wrote to the main
   staging tree.

Family B deliverable: 3 window tiles, 21,210 bytes after (9,351 /
   9/279/69 before), plus provenance 6,952 bytes. Plan projection was
   761,356 bytes for 5 keys + base; only the z9 window was buildable
   from retained data.

## Both families

10. Size PASS. Combined candidate on disk (family A deliverable +
    family B tiles and provenance + all QA, 24,648,098 bytes of QA
    sheets): about 30.3 MB actual against the 1,000,000,000 cap.
    Retained projection: 3,265,874,688 + about 30.3 MB = about
    3,296,200,000 against the 10,000,000,000 cap.
11. PASS: no upload, no release, no flag change. Pages stay opt-in.
    Sean's final-map validation remains the gate.

## Deviations and build notes

- Staging path is /mnt/external/satmap/batch1/ per the task body (plan
  text named step3-scratch/first-batch-2026-11-23/).
- Congo ocean stage OOM-killed twice on the 8 GB Pi (peak anon RSS
  5.5 GB, once with the Family B finisher running concurrently, once
  alone). It completed unchanged (95.3 s) after adding a temporary 8 GB
  swapfile at /mnt/external/satmap/batch1/swapfile; the swapfile was
  swapped off and deleted after the build.
- The pinned finisher hardcodes VM paths (/home/hatch/...). On the Pi
  they were satisfied with symlinks into the staging tree plus a small
  python wrapper script (a plain symlink loses the venv prefix):
  targets-v1.json (sha matches the refinish2.py guard hash),
  tif_to_rgba.py (sha 8847779d..., matches), common.mjs (archive copy),
  .venv-sat/bin/python (wrapper to the zfill venv). All under a fresh
  /home/hatch tree created for this build; nothing pre-existing was
  overwritten. guard.py preflight (part of refinish2.py) was not run;
  the finisher was invoked directly with refinish2.py's exact field-mode
  flags and hash-locked inputs.
- Family A re-run also regenerated the regions' z5-z9 tiles in the
  staged work tree; only z10 closure keys were harvested into the
  candidate, per the plan (the pilot candidate is z10-only).
- Provenance: per-output records for all 544 family A keys and the
  family B window are in family-a/provenance/ and
  family-b/provenance/9_279_69.json (source IDs/quarters, paths,
  sha256 of sources and outputs, byte counts, selection reasons, code
  hashes, wrapped-pixel counts per footprint).

## What Sean decides next

- Family A: accept the widened repair footprint (894 changed keys: the
  544 closure plus 350 feather/global-median dependents, all measured
  and listed in qa/family-a/changed-outside-closure.json), or hold the
  batch. The 544 candidate itself passes every control gate.
- Family B: the 17,4 footprint does not clear under the plan's own
  decision rule. Options are a new calibration for cast handling on this
  footprint, or leaving 279/69 as adjudicated plausible dark water.
  Ancestors/base for this footprint cannot be rebuilt from retained
  data in any case.
