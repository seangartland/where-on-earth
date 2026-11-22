# Prep brief: Astra step 3, bounded source-window seam rebuilds

Sean approved proceeding with the Astra plan on 2026-11-22. This is the
PREP pass for step 3 of docs/zoom-astra-decision.md: inventory the
source data, define the exact rebuild windows, and write the executable
build brief. Baseline is current main (bc1c4bb). Branch: step3-prep.
Docs and report only, plus at most one pilot window into a staging
prefix. NO live tile changes, NO deploy.

## Background facts (established, do not re-derive)

- The seam diagnosis (docs/satmap-seam-diagnosis.md, banked 4fad688):
  all four flagged z5 edges UNDETERMINED. 5/3/2 S and 5/1/2 S / 5/1/3 N
  carry a strong nodata/fallback-fill signature; 5/4/4 N marginal;
  5/4/1 no neighbor record.
- The provenance hunt was a definitive negative: NO per-tile source
  provenance exists anywhere in the mosaic tree. Chains break at the QA
  stage. Repair therefore means re-derivation from raw scenes with NEW
  provenance recorded.
- Astra step 3 scope: the seven flagged z5 tiles 5/3/2, 5/3/3, 5/1/2,
  5/1/3, 5/4/4, 5/4/3, 5/4/1, plus the Spain band/fill-patch extents
  from Sean's 2026-11-21 screenshot (Extent view over Iberia/North
  Africa: hard horizontal season band across mid-Spain, rectangular
  tone patches in the Atlantic west of Portugal and over Morocco).
  Windows = defect bounds + one-tile halo, extended by rings until a
  clean comparison boundary is covered. Coherent quarter/scene
  selection across each window. Regenerate every intersecting
  derivative (base/lower zooms, live inset levels [5,7,8,9], page
  assets). No blur or rendered-output concealment.
- Retained storage incl. EOX and rollback assets must stay under
  10,000,000,000 bytes (bucket measured 3.27 GB on 2026-11-22).
- Satmap bulk migration is still in flight: VM
  ~/workspace/map-game/eox1-work/scripts/sat is rsyncing to the Pi
  (/mnt/external/satmap/vm-archive/) at ~25 Mbps; at 2026-11-22 09:45
  PT the Pi held 29.6 GB of 63.1 GB. Sean's raw satellite files are
  retained assets: never delete anything.
- Pi access: ~/workspace/bin/pi-ssh (read-only checks only). If pi-ssh
  fails from the sandbox, verify endpoint identity per the standing
  rule, and if still unreachable, do the VM-side inventory and mark
  Pi-side items unverified in the report rather than guessing.

## Deliverables

1. Source inventory: where the raw Sentinel-2 scenes and the mosaic
   build tree actually live (VM paths, Pi paths), whether each step-3
   window's source data is reachable NOW or only after the migration
   completes, and the build tooling that produced s2gm2025 (scripts,
   entry points) with the exact commands a rebuild would run.
2. Window definitions: for each of the seven tiles and the Spain
   extents, the concrete rebuild window (tile ranges per zoom) under
   the halo rule, with the defect evidence for its bounds.
3. docs/step3-build-brief.md: the executable build brief covering
   window list, scene-selection method (one coherent quarter per
   window), the provenance schema (scene/granule ids, quarter/date,
   source path + checksum, selection/fallback decisions, contribution
   mask, tone params, build version, output checksums; ocean/no-data
   fills explicit), derivative regeneration list, run location (Pi),
   storage projection against the 10 GB cap, and acceptance
   comparisons (before/after at wide, z5, and final detail across
   every join; zero visible seasonal bands or fill discontinuities,
   zero new seams). Include the metered-pipeline accounting: raw-input
   cache location, rerun cost, reconciliation method and frequency.
4. Pilot (only if one window's source data is fully reachable now):
   rebuild that one window into a staging prefix (never the live
   prefix) and include before/after evidence in the report. If no
   window qualifies, say which dependency blocks each.
5. STEP3-PREP-REPORT.md: inventory findings, the window list, what the
   pilot did or why none ran, and any decision Sean still owes, as a
   short list at the top.

Commit the docs and report on branch step3-prep. Do not truncate the
final summary.
