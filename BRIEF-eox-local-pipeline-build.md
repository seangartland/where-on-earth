# Brief: build the local pipeline (EOX Phase 2, milestone 2a: code + fixture proof)

Work in this clone (eox2-work). Build the acquisition, sampling, and
finish code for the local satellite pipeline, and prove it end to end
on synthetic fixtures. Your sandbox has no network: nothing you build
may require a live call to prove itself, and the real downloads wait
for the inventory gate in the sibling clone. Leave work uncommitted.

## Read first

- `docs/eox-local-pipeline-design.md` including the Amendments,
  2026-10-18 section (retention model, derive-down windows, ocean
  pruning, z9 in scope). This is the spec.
- `scripts/sat/render.mjs`: the round-2 finish logic you are porting
  offline. The constants and approaches there are the current approved
  tuning: Blue Marble ocean with the single global deterministic tone
  transform (luminance `0.07 + 0.68 * L^0.92`, chroma x0.72); land tone
  gain 2.9, gamma 0.9, saturation 1.05, `HIGHLIGHT_KNEE = 0.72`;
  per-window VECTOR Natural Earth 10 m land mask at z8/z9 (4x
  supersampled, signed-distance feather, lakes cut out), the global
  21600 raster mask at lower zooms; base as one 2048x1024 EPSG:4326
  image with polar nodata repair.
- `scripts/sat/eox2025-manifest.json` and `scripts/sat/pilot-sites.json`
  (the tile manifest and the five acceptance sites).

## Build (all under `scripts/sat/local/`)

1. **`acquire.mjs`** (Node): reads the inventory
   (`scripts/sat/work/inventory/source-inventory.jsonl`, produced by
   the inventory lane; treat its schema as the interface and code
   against the schema in `scripts/sat/inventory.mjs`), downloads the
   selected objects from the CDSE S3 bucket into the design's VM cache
   layout via the project venv's boto3
   (`/home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python`),
   verifies checksums, and resumes per object. A `--source-dir`
   override reads objects from a local directory instead of S3 (this
   is what the fixture proof uses).
2. **`sample.py`** (rasterio, run under the same venv; GDAL 3.12 is
   available there): for each raw window in the design's window plan,
   sample the four quarter COGs into cached UNTONED windows, all four
   quarters kept separately, reflectance values preserved. Derive-down
   per the amendment: sample once at the finest required scale per
   area; lower zooms are derived at finish. Cache keys carry window
   id, quarter, and source checksum; a missing key is a hard fail,
   never a network call.
3. **`finish.mjs`** (Node): everything downstream of the caches, fully
   offline: season selection per window, land tone, mask composite,
   Blue Marble ocean, slicing to the manifest tiles plus the base
   equirect, and a QA report (per-window band stats, an adjacent-
   window seam metric, nodata accounting). The tuning constants live
   in one config block at the top, seeded from render.mjs round 2.
4. **Runner + runbook**: a thin CLI that chains the stages with the
   design's gates between them, and
   `docs/eox-local-pipeline-runbook.md` giving the exact commands the
   orchestrator runs on the VM for: acquire (post-inventory), sample,
   finish the five acceptance sites, finish the full manifest. Note
   the one-time asset step (Blue Marble 21600 and Natural Earth files
   already sit in the sibling clone's `scripts/sat/cache/`).

## Fixture proof (required)

Synthesise a tiny four-quarter COG set and a fixture inventory for a
two-window area, then run acquire (via `--source-dir`), sample, and
finish against it. Write `docs/eox-local-pipeline-selftest.md` with:
files produced at each stage, tile stats, the fixture seam metric,
and an explicit zero-network statement for sample and finish backed
by the code (no fetch or S3 calls outside acquire).

## Hard invariants

No Process API anywhere, in code or runbook. Sample and finish never
call CDSE. Process API budget for the whole pipeline is 0 PU. Do not
touch `scripts/sat/inventory.mjs` or the design docs; a sibling lane
owns them.
