# Brief: Batch 1 Family B finish-chain investigation (Astra verdict B, 2026-11-23)

You are working ON the Raspberry Pi. Staging tree: /mnt/external/satmap/batch1/
Read first: family-b/cast-check.json, family-b/manifest.json, the Family B
section of /mnt/external/satmap/batch1/BUILD-REPORT.md, and the Astra
consult verdicts. Verdict B is binding:

- Family B stays UNRESOLVED and out of any releasable candidate.
- This is a bounded DIAGNOSIS. It authorizes no production rebuild and no
  release.
- The frozen census gate stays 0.003. Do not pursue a global desaturation
  change and do not tune the single tile merely to cross the threshold.

## Established facts (from the build report; verify, do not re-litigate)

- 9/279/69 rebuilt with Q3 excluded and Q2 selected for the whole
  footprint (selected TIFF verified 100% pixel-identical to Q2) still
  measures 0.0646 through the pinned refinish chain
  (finish-field-v3-d8fixed.mjs; field-v3.bin sha256 24b8454b...), and
  0.0643 through the local finish.mjs chain: chain-independent.
- The evalscript replication tones Q2 clean over this footprint; the
  shipped finish chain amplifies a cyan cast (the same amplification
  TRACE measured for Q3, 0.029 to 0.081). Cast-check exact replication
  measured Q3 at 0.0121 vs TRACE's approximate 0.024-0.029.
- Ancestors and base could NOT be regenerated: quarterly caches for
  windows 8/138/33, 7/69/15, 5/15/3, 4/6/0 were never retained
  (raw-quarterly holds only 133 z9 windows), so 8/139/34, 7/69/17,
  5/17/4, 4/8/2 and the shared base have no retained input.

## Investigation scope (bounded; nothing outside it)

- The retained footprint 9/279/69, its two reported siblings (279/70,
  279/71), and suitable retained clean-water controls you select and
  name.
- Read the pinned finish code (family-b/pinned/, family-b/code/) and
  trace the FIXED Q1/Q2/Q3 inputs through each stage of the production
  chain, recording at every stage: cyan fraction under the frozen census
  gate definition, and RGB distributions (medians and spread) on the
  tile crop.
- Identify precisely where the approximate evalscript replication and
  the production rendering diverge, and which operation amplifies the
  cast. Support the claim with the per-stage numbers, not plausibility.
- Check whether the two chains (pinned refinish vs local finish.mjs)
  share the amplifying operation, since both produced ~0.064.

## Deliverables

1. A causal finding: the stage and operation that amplifies the cast,
   with per-stage cyan fraction and RGB evidence for Q1/Q2/Q3 and for
   the clean-water controls.
2. ONLY if the evidence supports it: a footprint-scoped calibration
   proposal, with control and boundary evidence. If the evidence does
   not support one, say so plainly; a negative finding is a complete
   deliverable.
3. An input-recovery section: a concrete plan for recovering or
   reacquiring the missing ancestor/base inputs (what data, from where,
   estimated size and cost), OR a statement that they are unrecoverable
   and what that means. Record explicitly: Family B stays blocked for
   any repair build while those inputs are unavailable, even if the
   calibration succeeds. Do not substitute upsampled children or leave
   stale ancestors while calling the family repaired.
4. z6 untouched: verify 6/34/8 sha256 still equals
   d2ea8a76511d8908343b93fd964023c34160a76065a718a918db5e8bc2c0548d
   before and after your work.

## Hard limits

- No production rebuild, no release, no upload, no live change.
- Do not modify the pinned finish code or the frozen gate. Work on
  copies under family-b/investigation/ for any instrumentation.
- Do not write outside /mnt/external/satmap/batch1/family-b/investigation/
  except the report file below.

## Report

Write /mnt/external/satmap/batch1/family-b/FINISH-CHAIN-INVESTIGATION.md
with the causal finding, the per-stage evidence tables, the calibration
proposal or negative finding, the input-recovery section, and the z6
verification. State measured vs estimated for every number.
