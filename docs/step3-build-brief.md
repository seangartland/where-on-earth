# Step 3 build brief: bounded source-window seam rebuilds

Status: executable build specification; no build or upload is authorized by this document. Run from the Pi only after the VM archive migration and the preflight gates below pass. The live `s2gm2025/` prefix is immutable during this work.

## Decisions still required before execution

1. Sean must confirm the conservative Spain defect core (`z5 x=14..16, y=11..14`) against the 2026-11-21 screenshot or supply its exact geographic bounds. The screenshot is not present in this checkout, so its visual description cannot support a tighter bound.
2. Sean must approve the measured candidate storage projection after the Pi archive and R2 prefix census are current. The projection below is deliberately conservative, but it is not a substitute for the required pre-upload measurement.
3. If a polar window has no valid Sentinel-2 observation in any coherent quarter, Sean must approve the named fallback (adjacent coherent quarter, explicitly recorded no-data/ocean fill, or leaving that window unreleased). A silent fill is forbidden.

## Rebuild windows

XYZ ranges are inclusive. A child range is the exact expansion of the z5 window, not merely the currently shipped sparse keys. Rebuild all intersecting derivatives so that filtering and page gutters cannot retain old pixels. `base` means the intersecting region of `base-ours.jpg`; z6 is intentionally absent from the live ladder and its stored objects remain untouched.

| Window | Evidence and initial one-tile halos | Final z5 range | z4 parents | z7 range | z8 range | z9 range |
| --- | --- | --- | --- | --- | --- | --- |
| W1 polar west | `5/1/2` halo `x=0..2,y=1..3`; `5/1/3` halo `x=0..2,y=2..4`. Both sides of their shared edge have mean 68.25/p99 182 and a near-black-to-imagery step. | `x=0..2,y=1..4` | `x=0..1,y=0..2` | `x=0..11,y=4..19` | `x=0..23,y=8..39` | `x=0..47,y=16..79` |
| W2 polar east | `5/3/2`: `x=2..4,y=1..3`; `5/3/3`: `x=2..4,y=2..4` (mean 79.54/p99 219). `5/4/4`: `x=3..5,y=3..5`; `5/4/3`: `x=3..5,y=2..4` (north-edge mean 36.87/p99 72, marginal). `5/4/1`: `x=3..5,y=0..2` (no neighbor record). Their halos touch, so they are one coherent selection window. | `x=2..5,y=0..5` | `x=1..2,y=0..2` | `x=8..23,y=0..23` | `x=16..47,y=0..47` | `x=32..95,y=0..95` |
| W3 Spain/Iberia | Screenshot evidence: horizontal season band across mid-Spain and rectangular tone/fill patches west of Portugal and over Morocco. Conservative defect core `x=14..16,y=11..14`; one ring covers Atlantic/Iberia/Morocco joins. This is provisional pending Sean's screenshot confirmation. | `x=13..17,y=10..15` | `x=6..8,y=5..7` | `x=52..71,y=40..63` | `x=104..143,y=80..127` | `x=208..287,y=160..255` |

The W1 and W2 ranges are concrete initial build bounds. W3 becomes final only after the screenshot decision above. During comparison, if a visible discontinuity reaches an outer edge, extend that window by exactly one z5 ring (clip y at the world edge and wrap x), regenerate all ranges from that new z5 rectangle, and record the observed edge and extension in the manifest. Repeat only until every outer edge is a clean comparison boundary. Do not merge W1 and W2 merely because their halos overlap in longitude; their source footprints and defect groups are independently selectable.

## Source inventory and run location

The producing checkout is `/home/hatch/workspace/map-game/eox1-work`. Its VM build tree is `/home/hatch/workspace/map-game/eox1-work/scripts/sat/work/s2gm2025` (63,094,272,306 bytes measured 2026-11-22), containing:

- immutable inventories in `scripts/sat/work/inventory/`: `lr-inventory.jsonl` (800 low-resolution band objects, 50,976,672,328 inventoried bytes, four 2025 quarters) and `source-inventory.jsonl` (78,877 10 m catalogue products);
- verified downloaded low-resolution inputs at `work/s2gm2025/source/<quarter>/` (808 files, 51,853,454,329 bytes; nested paths are expected because product IDs contain `/`);
- untoned sampled caches at `work/s2gm2025/raw-quarterly/`, selection/QA intermediates beneath `work/s2gm2025/`, and existing outputs beneath `work/s2gm2025/finished/`;
- tooling in `scripts/sat/local/{acquire.mjs,sample.py,raster_ops.py,finish.mjs,plan.mjs,run.mjs,upload_r2.py}` and masks/Blue Marble inputs in `scripts/sat/cache/`.

The intended Pi archive root is `/mnt/external/satmap/vm-archive/`, with the corresponding checkout/build tree below it. Pi access failed through the pinned-host `pi-ssh` retry path during prep, so the exact Pi subpaths, received bytes, checksums, and window reachability are unverified. Execution is blocked until the migration finishes and a Pi-side checksum reconciliation proves the inventory, all required source objects, cache assets, tools, and environment arrived. Raw satellite assets are retained; never delete or move the VM originals.

Run on the Pi from the migrated `eox1-work` root, substituting its verified absolute root for `$ROOT`:

```sh
ROOT=/mnt/external/satmap/vm-archive/eox1-work
PYTHON="$ROOT/.venv-sat/bin/python"
WORK="$ROOT/scripts/sat/work/step3-2026-11-22"
SOURCE="$ROOT/scripts/sat/work/s2gm2025/source"
INVENTORY="$ROOT/scripts/sat/work/inventory/lr-inventory.jsonl"
ASSETS="$ROOT/scripts/sat/cache"
STAGE="$ROOT/scripts/sat/work/staging/s2gm2025-step3-v1"

node scripts/sat/local/run.mjs --stage acquire --inventory "$INVENTORY" \
  --work "$WORK" --source-dir "$SOURCE" --python "$PYTHON" --max-gb 52
node scripts/sat/local/run.mjs --stage sample --inventory "$INVENTORY" \
  --plan "$WORK/step3-plan.json" --work "$WORK" --python "$PYTHON"
node scripts/sat/local/run.mjs --stage finish --plan "$WORK/step3-plan.json" \
  --work "$WORK" --assets "$ASSETS" --out "$STAGE/tiles" \
  --python "$PYTHON" --all-tiles
```

`step3-plan.json` must encode W1-W3 above, four quarter caches for each raw window, and no full-world `base` job; the final base is patched/rederived only for the intersecting source regions. The existing planner groups sparse 3x3 windows and does not express these source-coherent rectangles or the required provenance, so implement the bounded-plan/provenance extension before running these commands. The current default `run.mjs` inventory points at the incompatible 10 m catalogue; always pass `lr-inventory.jsonl` explicitly. Do not invoke `upload_r2.py` in this prep pass.

## Coherent selection and provenance

For each window, compare all four untoned quarterly rasters as a whole. Select one quarter for the entire window using, in order: complete valid-observation coverage, absence of cloud/snow/nodata discontinuities, continuity at every outer join, and minimum window-wide tone adjustment. Do not choose quarters tile by tile. If the selected quarter has an unavoidable gap, record each fallback footprint and source and apply the same decision across the connected gap; ocean and no-data fills are explicit sources, never implicit black pixels.

Write one JSONL record per source contribution and output. Required fields are:

- build ID, git commit, tool/runtime versions, complete command and config;
- window ID and exact XYZ/geographic bounds, including every ring extension and reason;
- source product, scene and granule identifiers where applicable; grid cell; quarter and acquisition/content dates; source path; byte size; published checksum and locally verified checksum;
- selection score/reason, rejected-quarter reasons, fallback decision, and an explicit `ocean-fill` or `nodata-fill` source type when used;
- contribution/footprint mask path and checksum, observations/validity summary, resampling and alignment parameters;
- all tone parameters (global and overrides), mask/feather parameters, and build version;
- derivative type, output path/key, source record IDs, byte size, dimensions, and SHA-256 checksum.

Every output must resolve transitively to its inputs. Do not invent provenance for unchanged tiles. Preserve the manifest, plan, QA, comparisons, and logs beside the staged candidate.

## Required derivatives

For each final window regenerate: intersecting base/lower-zoom pixels; every tile in the z5, z7, z8 and z9 ranges above; boundary support pixels/gutters; coverage and tile-coordinate manifests; hashes/content version; every page asset whose footprint or gutter intersects the window; page manifests and byte/residency accounting; and fixed-view comparison assets. Recut pages from the repaired source/tiles, never by recompressing existing page JPEGs. Keep the live inset ladder exactly `[5,7,8,9]`; do not create or change z6, live keys, provider config, or deployed assets.

## Staging and storage gate

Local output goes only under `$STAGE`; a later separately authorized upload must use a versioned non-live prefix such as `s2gm2025-step3-v1/`. The three initial rectangles contain 22,242 z5/z7/z8/z9 tile positions before extensions (4,044 W1; 8,088 W2; 10,110 W3). At the documented 10.9 KB historical mean that is about 242.4 MB of JPEG tiles. Budget **1.0 GB** for the complete candidate (tiles, base patch, pages, manifests, provenance, QA and comparisons), pending measured output. Added to the 3,265,874,688-byte bucket measurement, this projects 4,265,874,688 bytes retained, 5,734,125,312 bytes below the 10,000,000,000-byte cap. This assumes all existing EOX/live/rollback objects remain and authorizes no deletion.

Immediately before any upload, inventory actual bytes for every retained R2 prefix, EOX, the new candidate, and rollback assets. Require their sum to be less than 10,000,000,000 bytes with no estimate substituted for an object census. Abort upload if the candidate exceeds 1.0 GB or total retained storage reaches the cap; revise scope/encoding with Sean rather than delete assets.

## Metered pipeline accounting

The durable raw-input cache is the Pi copy of `work/s2gm2025/source/<quarter>/`; untoned rerun cache is `work/step3-2026-11-22/raw-quarterly/`. A tone, mask, ocean, or encoding rerun reads those caches and must incur zero CDSE S3 GETs, zero Process API PU, and zero network egress. A quarter-policy change rereads the four cached quarter windows. Projection/resampling changes resample cached COGs. Only a genuinely absent source object permits acquisition.

Before any acquisition batch, record the immutable inventory object count/bytes, required object IDs, CDSE dashboard request/egress allowance and current usage. Cap requested bytes to the measured remainder and allow at most 5% retry bytes. After every batch (not merely at job end), reconcile successful local object count and bytes from `acquire.jsonl`, client GET/HEAD counters, and dashboard usage. Stop on any unexplained difference. Record OAuth/OData/checksum operations separately; Process API budget is exactly zero and a Process API URL in logs is a failure.

## Acceptance and release boundary

Capture identical before/after views for every window at: wide/base view, z5, and final z9/page detail. Capture both directions across every repaired-to-unchanged join and the three diagnosed polar edges. Preserve raw images and a comparison index. Mechanical QA must account for all planned outputs, verify hashes/readbacks, report nodata/fill masks, and repeat edge statistics; the diagnosed controls are mean <=49.27 and p99 <=110, but visual acceptance is stronger than those thresholds.

Acceptance requires zero visible seasonal bands, zero tile-aligned fill/tone discontinuities, zero new seams at any join, complete provenance, and no blur or rendered-output concealment. Sean must review the comparisons and the staged candidate on phone. Only a later explicit release task may copy/promote staged objects, update live manifests/version URLs, or deploy. This brief authorizes none of those actions.
