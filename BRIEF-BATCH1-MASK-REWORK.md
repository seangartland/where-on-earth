# Brief: Batch 1 Family A masking rework (Astra verdict A, 2026-11-23)

You are working ON the Raspberry Pi. Staging tree: /mnt/external/satmap/batch1/
Read first: /mnt/external/satmap/batch1/BUILD-REPORT.md (the batch 1 build
report) and the Astra consult verdicts. Verdict A is binding:

- Do NOT accept the 894-key re-run as the release candidate.
- Do NOT repeat the regional build. The 544 closure keys were already
  harvested into family-a/tiles/; verify that assembled candidate, do not
  rebuild it.
- Produce a MASKED candidate whose changed outputs are exactly the 544
  closure keys and nothing else.

## Deliverable

A new staged candidate tree at /mnt/external/satmap/batch1/masked-candidate/
containing the full z10 output scope of the Iberia + Congo re-run footprint,
assembled as:

- For each of the 544 closure keys: the repaired bytes from family-a/tiles/.
- For every other key in the footprint: the ORIGINAL pre-repair bytes,
  restored byte-for-byte (copy the original file bytes; never decode and
  re-encode a tile to "restore" it).

Baseline source: the pre-repair tile bytes and hashes the original build
recorded (family-a/manifest.json before-hashes, the region tiles-manifests,
and the archive trees the build copied inputs from). State in your report
exactly which baseline source you used for restored bytes and how you
verified each restored file's sha256 equals its recorded before-hash.

Scope rules:
- z10 only. No z5-z9 regeneration in the candidate (the earlier re-run's
  z5-z9 outputs stay out, as in the original harvest).
- Staged only. NO upload to R2, no live tile change, no flag change.
- Do not mutate the existing family-a/ or work/ trees in place; build the
  masked candidate as a new tree. Inputs are read-only.

## Acceptance evidence (all required in the report)

1. Manifest/hash comparison over the whole footprint proving ZERO changed
   outputs outside the 544 closure keys: every non-closure key's sha256 in
   masked-candidate/ equals its baseline sha256. Publish the comparison
   counts (footprint keys total, closure keys changed, non-closure keys
   verified identical, any key unaccounted for).
2. Each of the 544 candidate tiles' sha256 equals the family-a manifest
   "after" hash (the harvested candidate verified against its own record,
   not rebuilt).
3. The 7 bad controls still pass at or under the 0.003 gate on the masked
   candidate (512/387, 512/388, 512/389, 548/534, 531/372, 532/372,
   513/386), measured on the masked candidate bytes.
4. Excluded clean controls unchanged: 500/377 and 544/522 byte-identical
   to baseline in the masked candidate.
5. Per-key adjudications for the 11 yellow-band exceptions (516/400,
   517/400, 546/528, 548/529, 549/533, 551/529, 552/518, 552/528, 553/473,
   554/473, 554/474) carried into the masked candidate's provenance,
   copied from family-a/provenance/, not rewritten.
6. Boundary sheets made from the ACTUAL masked candidate beside unchanged
   live-baseline neighbors across all 34 components (sheets from the
   unrestricted re-run do not count). Put them under
   masked-candidate/qa/. A visible seam is a finding to report, not a
   reason to widen the mask.
7. Total masked-candidate bytes vs the 1.0 GB candidate budget.

Provenance note to record in the report: 544 is not the unmodified
pipeline's full dependency closure (feather/fallback consume all four
toned quarters; the ocean stage uses a global clean median). The masked
candidate is an allowlist assembly, not a claim that the pipeline's
influence is 544 keys. Do not relabel it otherwise.

## Report

Write /mnt/external/satmap/batch1/masked-candidate/MASK-REWORK-REPORT.md
with: baseline source and verification method, the acceptance evidence
above with measured numbers, any seam findings, total bytes, and an
explicit statement that nothing was uploaded and Sean's final-map visual
validation is still required before release. If any acceptance item
cannot be met, report it as a failure with evidence; do not work around
it silently.
