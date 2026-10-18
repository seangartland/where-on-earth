# EOX local satellite pipeline runbook

The local pipeline uses the immutable inventory and cached COGs. Acquisition is
the only networked stage. Sampling and finishing fail closed when a cache key is
missing. They have no CDSE or other network path, and the Process API budget is
0 PU.

Run from the repository root on the VM:

```sh
PYTHON=/home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python
WORK=scripts/sat/work/s2gm2025
INVENTORY=scripts/sat/work/inventory/lr-inventory.jsonl
ASSETS=/home/hatch/workspace/map-game/eox1-work/scripts/sat/cache
```

One time, copy (do not move) the Blue Marble 21600 JPEG,
`ne-land-mask.png`, `ne_10m_land.zip`, and `ne_10m_lakes.zip` from the sibling
clone's `scripts/sat/cache/` to the chosen `$ASSETS` directory if they are not
already there. These are local inputs; finish never downloads them.

## Acquire, after the inventory gate

The full LR census is 67.33 GB across 2025; after Sean's approved B08 skip,
`lr-inventory.jsonl` is about 51 GB. Do not run this until that inventory
contains all four quarters and remains at or below the 52 GB acquisition gate.
Expose the CDSE S3 credentials from the VM secret store under boto3's standard
environment names (do not write them to this repository), then run:

```sh
export AWS_ACCESS_KEY_ID='<CDSE S3 access key from the VM secret store>'
export AWS_SECRET_ACCESS_KEY='<CDSE S3 secret from the VM secret store>'
node scripts/sat/local/run.mjs --stage acquire \
  --inventory "$INVENTORY" --work "$WORK" --python "$PYTHON" --max-gb 52
```

The downloader reads only inventory S3 paths, writes `.partial` files, checks
content length and the inventory's published checksum, and atomically renames.
Re-running resumes verified objects. Review `$WORK/acquire.jsonl`; reconcile
its request and byte totals with the CDSE dashboard before another batch.

## Sample

Generate the full plan, then sample. The plan implements derive-down: a lower
window covered by finer stored windows is marked for offline derivation.

```sh
node scripts/sat/local/plan.mjs --out "$WORK/full-plan.json"
node scripts/sat/local/run.mjs --stage sample \
  --inventory "$INVENTORY" --plan "$WORK/full-plan.json" \
  --work "$WORK" --python "$PYTHON"
```

The sampler writes four separate untoned GeoTIFFs per raw window under
`$WORK/raw-quarterly/`. Missing acquired objects are a hard failure.

## Finish the five acceptance sites

The acceptance set is Bay Area, Fiji, Sydney, Iceland, and Antarctic Peninsula.
This includes z9, as required by the 2026-10-18 amendment.

```sh
node scripts/sat/local/plan.mjs \
  --sites bay-area,fiji,sydney,iceland,antarctic-peninsula \
  --out "$WORK/acceptance-plan.json"
node scripts/sat/local/run.mjs --stage finish \
  --plan "$WORK/acceptance-plan.json" --work "$WORK" \
  --assets "$ASSETS" --out "$WORK/finished/acceptance" --python "$PYTHON"
```

Inspect `qa.json`, all five site tiles, and `base-ours.jpg`. This is the G1
rerun point: prepare the blind A/B and obtain Sean's ship/tune verdict before
full finishing. A tune rerun uses the same caches and performs zero S3 GETs.

## Finish the full manifest

After G1 approval:

```sh
node scripts/sat/local/run.mjs --stage finish \
  --plan "$WORK/full-plan.json" --work "$WORK" \
  --assets "$ASSETS" --out "$WORK/finished/full" --python "$PYTHON"
```

Require the manifest tile count to be fully accounted for, no unexpected
nodata, reviewed seam metrics, and a deterministic repeat finish before upload.
Source COGs and quarterly windows remain on the persistent VM home volume and
are not copied to R2. Finished tiles/base and selected untoned windows are the
durable R2 artifacts, within the account-wide 10 GB free-storage cap.

## Fixture check

```sh
node scripts/sat/local/selftest.mjs --python "$PYTHON"
```

This uses only generated local files and needs no credentials.
