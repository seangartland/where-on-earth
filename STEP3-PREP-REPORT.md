# Step 3 prep report

## Decisions Sean still owes

- Confirm the conservative Spain defect core (`z5 x=14..16,y=11..14`) against the 2026-11-21 screenshot, or provide exact bounds; the screenshot itself is absent from this checkout.
- Approve any explicit polar fallback if no coherent 2025 quarter has valid observations across an entire polar window.
- After migration, approve the measured candidate storage census and, later, any build/upload/release as separate actions. This prep pass authorizes none.

## Result

The source/build inventory and executable specification are in `docs/step3-build-brief.md`. Three connected rebuild windows cover every required locator: W1 `z5 x=0..2,y=1..4` for `5/1/2` and `5/1/3`; W2 `z5 x=2..5,y=0..5` for `5/3/2`, `5/3/3`, `5/4/4`, `5/4/3`, and `5/4/1`; and provisional W3 `z5 x=13..17,y=10..15` for the photographed Spain/Iberia/Morocco defects. The brief gives exact z4 parent and z7/z8/z9 expansions and the one-ring extension rule.

## Inventory findings

- Producing VM checkout: `/home/hatch/workspace/map-game/eox1-work`; build tree: `scripts/sat/work/s2gm2025`, measured at 63,094,272,306 bytes.
- Low-resolution source ledger: `scripts/sat/work/inventory/lr-inventory.jsonl`, 800 B02/B03/B04/observations objects across 2025 Q1-Q4, totalling 50,976,672,328 inventoried bytes. The VM source cache contains 808 files and 51,853,454,329 bytes. The separate 10 m catalogue contains 78,877 products; it is inventory, not the input used by the shipped low-resolution build.
- Existing cache/output sizes: `raw-quarterly` 1,116,313,288 bytes (532 files); `finished` 3,693,168,689 bytes (131,604 files). The acquisition log was last modified 2026-10-19.
- Producing entry points are `scripts/sat/local/run.mjs`, `acquire.mjs`, `sample.py`, `raster_ops.py`, `finish.mjs`, and `plan.mjs`; exact bounded commands and the required planner/provenance extension are specified in the build brief.
- Intended Pi archive: `/mnt/external/satmap/vm-archive/`. The pinned-host helper made all configured attempts but the tunnel closed each connection. Consequently Pi received bytes, exact paths, checksums, environment, and current migration completion are **unverified**, not inferred from the VM.

## Pilot

No pilot ran. Although the VM holds the source tree, the authorized run location is the Pi and no window is fully reachable there *as verified now*: W1, W2, and W3 are all blocked by incomplete/unverified VM-to-Pi migration plus the failed read-only Pi check. W3 also awaits exact screenshot confirmation. Running on the VM or staging from an unverified partial Pi archive would violate the qualification in the prep brief. No staging prefix, live tile, R2 object, provider configuration, or deployment was changed.

## Storage and handoff

The initial windows span 22,242 positions across live levels `[5,7,8,9]`. At the documented 10.9 KB historical mean the tile payload is about 242.4 MB; the build brief reserves a conservative 1.0 GB for the complete staged candidate. Against the measured 3,265,874,688-byte bucket this projects 4,265,874,688 bytes retained, leaving 5,734,125,312 bytes under the 10,000,000,000-byte cap, with EOX and rollback assets retained. A fresh exact prefix census remains a hard pre-upload gate.

Prep verification was limited to repository/source inventory, tile arithmetic, tooling inspection, storage measurement, and the read-only Pi attempt. No build, upload, live mutation, deletion, or deploy occurred.
