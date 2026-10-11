# AWS EOX 2016 to R2 pipeline plan

Research and calculation date: 2026-10-10. This is a plan only. No AWS objects were listed or downloaded while preparing it.

## Executive result

Use the **z7 source GeoTIFFs** from `s3://eox-s2maps/tiles/7/` to render the game's z4-z8 Web Mercator tiles. The current 1,928 locations produce exactly **10,982 unique destination tiles** with a 3x3 window at each zoom:

| Destination zoom | Unique XYZ tiles |
| ---: | ---: |
| 4 | 217 |
| 5 | 594 |
| 6 | 1,377 |
| 7 | 2,988 |
| 8 | 5,806 |
| **Total** | **10,982** |

Those destination footprints intersect **7,536 candidate z7 EOX metatile cells** out of the 128 x 64 global z7 metatile grid. Their candidate keys have the form `tiles/7/{column}/{row}.tif`; columns span 0-127 and rows 1-62. This is an exact geometric candidate set, not a claim that all 7,536 objects exist. The archive can omit empty/non-Sentinel cells. A Requester Pays `ListObjectsV2`/`HeadObject` pass is therefore required to turn the candidate list into the exact existing-object manifest and exact byte count.

For budgeting before that pass, use **6.0 GB** as a deliberately conservative planning figure. A z7 file contains 512 x 512 x 3 bytes = 786,432 bytes of uncompressed RGB samples, so all 7,536 candidates contain 5.93 decimal GB of raw samples before LZW compression, plus small TIFF headers. LZW files will normally transfer less, and absent ocean cells reduce it further. A reasonable preflight range is **1-6 GB**, but only the billed metadata pass can replace that with a measured number.

At Sean's supplied **$0.09/GB** egress rate:

- planning case: `6.0 GB x $0.09 = $0.54`;
- provisional range: `1-6 GB = $0.09-$0.54`;
- S3 request charges, local disk, compute, and R2 operations are separate and expected to be small at this object count.

Do not use the often-quoted approximately 200 GB full-archive estimate for this job. That estimate covers all source levels z7-z13; z8 output needs only z7 source resolution.

## What is in `eox-s2maps`

EOX documents the bucket as follows:

- bucket: `eox-s2maps`, region `eu-central-1`, Requester Pays;
- object key: `tiles/{zoom}/{column}/{row}.tif`;
- source zooms: **7 through 13**; z13 is approximately the original 10 m Sentinel-2 resolution;
- files: 512 x 512, three 8-bit RGB bands, LZW-compressed GeoTIFF, EPSG:4326;
- grid: OGC WMTS Simple Profile / CRS84 geographic pyramid;
- storage optimization: each file is a 2x2 metatile, so a file stored under zoom `z` uses the column and row identifier from matrix `z-1`.

For stored zoom 7, the identifiers therefore come from the z6 CRS84 matrix: 128 columns by 64 rows. Each file covers 2.8125 degrees longitude by 2.8125 degrees latitude:

```text
west  = -180 + column * 2.8125
east  = west + 2.8125
north =   90 - row * 2.8125
south = north - 2.8125
```

Rows count north-to-south and columns west-to-east. For a point away from an exact boundary:

```text
column = floor((longitude + 180) / 2.8125)
row    = floor((90 - latitude) / 2.8125)
key    = tiles/7/{column}/{row}.tif
```

This is **not** the Google/XYZ Web Mercator grid used by the game. Do not substitute destination `{z}/{x}/{y}` values into an EOX source key.

Primary references:

- [EOX: original tiles, bucket structure, format, metatiles and zooms](https://new.eox.at/2017/03/sentinel-2-cloudless-original-tiles-available/)
- [EOX: global 2016 mosaic, source download and CC BY 4.0](https://new.eox.at/2017/08/sentinel-2-global-cloudless-mosaic/)
- [EOxCloudless pricing and bulk-format options](https://cloudless.eox.at/pricing)
- [Open-source downloader for this bucket](https://github.com/txvvgnx/sentinel-downloader) (useful corroboration, not the authority for the format or costs)

### Important visual limitation

The bucket holds the original Sentinel-derived RGB GeoTIFFs, not necessarily every component of EOX's rendered web basemap. EOX describes its current “Viewing Ready” map as combining the mosaic with bathymetry and an ocean mask. Expect source no-data outside imagery coverage unless a representative source probe proves otherwise. Before production, Sean must choose one of:

1. composite valid source pixels over the game's existing ocean/base texture (recommended and fully self-hosted);
2. accept a flat configured ocean colour; or
3. acquire EOX's rendered/bathymetry assets as a separate licensed bulk product.

The staging render must explicitly test coastlines, remote islands, open ocean, high latitudes, and the antimeridian.

## How the required source set was calculated

The input is the current `assets/locations.json` and must contain 1,928 finite `lat`/`lng` records. For every zoom 4 through 8, calculate the containing Web Mercator XYZ tile, add offsets `dx,dy = -1,0,1`, wrap x at the antimeridian, clamp y to the valid matrix, and globally deduplicate `{z}/{x}/{y}`.

For each of those 10,982 tiles:

1. calculate its EPSG:4326 west/east longitude and north/south latitude bounds;
2. select every 2.8125-degree z7 source cell whose interior intersects that footprint;
3. deduplicate `tiles/7/{column}/{row}.tif`.

The union is 7,536 candidates. The large number is intentional: each z4 tile spans 22.5 degrees longitude and a large latitude range, and the 217 z4 windows alone intersect all 7,536 cells. For comparison, the source candidates intersecting only the respective destination zooms are:

| Destination set | Candidate z7 source cells |
| --- | ---: |
| z4 only | 7,536 |
| z5 only | 6,200 |
| z6 only | 4,242 |
| z7 only | 2,724 |
| z8 only | 1,876 |
| z4-z8 union | 7,536 |

The implementation should write both deterministic manifests to a work directory:

```text
work/manifests/destination-z4-z8.txt     # z/x/y.jpg, 10,982 lines
work/manifests/source-z7-candidates.txt  # tiles/7/column/row.tif, 7,536 lines
```

It should then produce `source-z7-existing.tsv` with key, S3 ETag, byte size and last-modified time. Keep missing candidate keys in a separate report; they are not automatically errors if their footprints are ocean/no-data.

## Tools and prerequisites

Install locally or in a pinned container:

- AWS CLI v2;
- GDAL 3.x with `gdalinfo`, `gdalbuildvrt`, `gdalwarp` and `gdal_translate` (and JPEG/PNG drivers);
- Node.js 20+ for manifest generation from the existing JSON, or Python 3.11+ with equivalent tile math;
- `jq`, GNU `sort`, `sha256sum`, and sufficient temporary disk;
- `rclone` or AWS CLI v2 for Cloudflare R2's S3-compatible endpoint;
- optionally `rio-cogeo` only if intermediate COGs are wanted. It is not needed for final 256 px tiles.

Pin tool versions in the run log. Plan for at least **20 GB free temporary disk** for source files, intermediates, rendered output, manifests and retry headroom.

## Phase 1: deterministic manifests and priced preflight

Automate a repository script, for example `scripts/build-eox-manifests.mjs`, that:

1. validates the catalogue count and coordinates;
2. emits the exact 10,982 destination keys and 7,536 source candidates;
3. records counts per zoom and SHA-256 hashes of both manifests;
4. fails on a changed catalogue unless Sean explicitly accepts the new count.

Sean supplies an AWS IAM access key/secret (and session token if applicable) belonging to an account that accepts Requester Pays charges. The principal needs only read/list access to the public bucket; the credentials must never enter the repository or command history. Configure a named local profile or environment-backed CI secret.

Illustrative read-only checks:

```bash
aws s3api list-objects-v2 \
  --bucket eox-s2maps \
  --prefix tiles/7/ \
  --request-payer requester \
  --region eu-central-1 \
  --profile eox-requester \
  --output json > work/manifests/eox-z7-list.json
```

`list-objects-v2` is paginated; AWS CLI normally paginates automatically unless `--no-paginate` is used. Intersect its returned keys with the candidate manifest locally. Summing returned `Size` fields gives the exact planned transfer bytes before any image download:

```bash
jq '[.Contents[].Size] | add // 0' work/manifests/eox-z7-list.json
```

If bucket listing is denied, issue one `head-object` per candidate with `--request-payer requester`; record 404 candidates and do not retry them. Stop for Sean's approval if the measured byte total or estimated bill materially exceeds the 6 GB / $0.54 planning ceiling.

## Phase 2: download the source GeoTIFFs

Download only keys present in `source-z7-existing.tsv`, with Requester Pays explicitly enabled:

```bash
aws s3api get-object \
  --bucket eox-s2maps \
  --key 'tiles/7/64/31.tif' \
  --request-payer requester \
  --region eu-central-1 \
  --profile eox-requester \
  'work/source/tiles/7/64/31.tif'
```

The production downloader should use bounded parallelism (for example 4-8 workers), exponential retry for transient AWS errors, atomic `.part` files, and a resumable state file. After every download:

- compare local bytes to S3 `Size`;
- save ETag and SHA-256 (ETag is not always an MD5);
- require `gdalinfo` to report 512 x 512, three Byte bands and EPSG:4326;
- quarantine failures rather than silently rendering them.

Do not use `aws s3 sync s3://eox-s2maps/tiles/7/ ...`: it would fetch the entire prefix instead of the calculated subset and makes the priced manifest less auditable.

## Phase 3: build a source mosaic and render 10,982 tiles

Build a virtual mosaic without copying pixels:

```bash
find work/source/tiles/7 -name '*.tif' -print0 | sort -z > work/manifests/local-tiffs.nul
tr '\0' '\n' < work/manifests/local-tiffs.nul > work/manifests/local-tiffs.txt

gdalbuildvrt \
  -input_file_list work/manifests/local-tiffs.txt \
  -srcnodata '0 0 0' \
  -vrtnodata '0 0 0' \
  work/eox-2016-z7.vrt
```

Confirm the actual source no-data semantics with `gdalinfo` and representative pixels before fixing `0 0 0`; change the command if the files declare another mask/no-data representation.

For each destination manifest entry, calculate the exact EPSG:3857 bounds of that XYZ tile and render directly to 256 x 256. A safe two-step shape is:

```bash
gdalwarp \
  -s_srs EPSG:4326 -t_srs EPSG:3857 \
  -te "$MINX" "$MINY" "$MAXX" "$MAXY" -te_srs EPSG:3857 \
  -ts 256 256 \
  -r cubic \
  -srcnodata '0 0 0' -dstalpha \
  -multi -wo NUM_THREADS=ALL_CPUS \
  -of GTiff -co TILED=YES -co COMPRESS=DEFLATE \
  work/eox-2016-z7.vrt work/render-tmp/$Z-$X-$Y.tif
```

Then composite the alpha-bearing intermediate over the selected ocean/base treatment and encode the final image. For opaque JPEG output:

```bash
gdal_translate \
  -of JPEG -co QUALITY=88 \
  work/composited/$Z-$X-$Y.tif \
  work/output/$Z/$X/$Y.jpg
```

If Sean wants transparent no-data instead, emit PNG or WebP with alpha rather than JPEG. The client and R2 key extension must agree with that choice.

Do not run `gdal2tiles` over the global source VRT without an explicit tile list: it will generate the complete pyramid, not the requested 10,982 objects. A small worker script around `gdalwarp` is deterministic and bounded. Cache/coalesce work by source window if benchmarks show repeated VRT reads are slow.

Rendering validation must check:

- exactly 10,982 decodable 256 x 256 outputs;
- no unexpected all-no-data or single-colour land tiles;
- visual samples at every zoom and the special geographies listed above;
- no seams or x/y inversion;
- deterministic SHA-256 output for a fixed GDAL version/settings;
- required attribution in the game's imagery UI and legal/credits view.

## Phase 4: upload to the existing R2 bucket

Use immutable, versioned conventional XYZ keys in the existing `where-on-earth-tiles` bucket:

```text
s2cloudless-2016/v1/{z}/{x}/{y}.jpg
```

Sean creates a least-privilege R2 API token scoped to object read/write/list for this bucket and supplies the account ID/endpoint. Store the token in a named AWS CLI profile or secret manager, not `.env` in the repository.

Example upload shape:

```bash
aws s3 cp work/output/ \
  s3://where-on-earth-tiles/s2cloudless-2016/v1/ \
  --recursive \
  --exclude '*' --include '*.jpg' \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --profile r2-uploader \
  --cache-control 'public,max-age=31536000,immutable' \
  --content-type image/jpeg
```

Prefer a manifest-driven uploader if the AWS CLI version does not reliably set the desired metadata per object. Upload tiles first, then a version manifest containing source/object hashes, byte counts, GDAL settings, licence/attribution text and generation date. Publish or switch the client URL only after reconciliation confirms every expected key.

R2 verification:

1. list the version prefix and require 10,982 objects;
2. compare object sizes and sampled checksums to local output;
3. fetch and decode stratified samples through the public/custom domain;
4. verify `Content-Type`, CORS and immutable caching headers;
5. test game rendering on desktop and mobile before enabling the new origin.

## What is automated and what Sean must do

| Work item | Automation | Sean/action owner |
| --- | --- | --- |
| Location validation, XYZ dedupe, source intersection | Fully scripted and repeatable | Approve a changed location count |
| Candidate-to-existing S3 manifest and exact byte/cost report | Fully scripted once credentials are present | Supply AWS Requester Pays billing credentials; approve measured spend |
| Source downloads, retries and integrity validation | Fully scripted/resumable | Keep credentials funded/valid; intervene only on permission/budget failure |
| GDAL mosaic, reprojection, composition and encoding | Fully scripted after visual policy is selected | Choose ocean/no-data treatment and JPEG vs alpha format |
| QA reports and automated decode/count/checksum gates | Mostly automated | Review representative imagery and accept visual quality |
| R2 upload and reconciliation | Fully scripted once token/endpoint exist | Supply scoped R2 token and account endpoint; confirm production prefix/domain |
| Game URL/attribution rollout | Code/config can be automated separately | Approve attribution presentation and release/feature-flag switch |

Sean needs to provide:

1. AWS access key ID, secret access key and optional session token for an AWS account accepting Requester Pays charges. A named local profile is preferred; do not send credentials in chat or commit them.
2. Confirmation that **$0.09 per decimal GB** is the intended transfer rate and approval after the exact metadata preflight reports bytes and request counts.
3. The desired no-data/ocean treatment and final file format/quality.
4. Cloudflare account ID, R2 S3 endpoint and a least-privilege token for `where-on-earth-tiles`.
5. Approval of the immutable prefix (proposed `s2cloudless-2016/v1`) and final public/custom-domain URL.

## Go/no-go gates

Do not start the bulk transfer until:

- the generated counts reproduce 1,928 locations, 10,982 destination tiles and 7,536 candidate source cells;
- AWS metadata resolves existing keys and exact bytes, and Sean approves the calculated bill;
- representative z7 TIFFs validate their projection, bands, no-data behavior and visual content;
- Sean chooses how to fill ocean/no-data pixels;
- temporary disk has adequate headroom and credentials are stored outside the repository.

Do not publish the R2 version until all 10,982 destination objects reconcile, representative CDN reads decode correctly, attribution is present, and coastline/high-latitude/antimeridian screenshots pass review.

## Licence and attribution

EOX's later 2017 announcement states that the 2016 mosaic is CC BY 4.0 (the earlier March post still shows the original CC BY-SA wording). Preserve a dated copy/link of the controlling licence with the build manifest and use EOX's prescribed 2016 attribution, including links where possible:

> Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)

If this pipeline composites, colour-corrects or otherwise changes the imagery, identify it as modified. Recheck the live EOX licence/attribution page before release and do not imply endorsement by EOX, ESA, the EU or Copernicus.
