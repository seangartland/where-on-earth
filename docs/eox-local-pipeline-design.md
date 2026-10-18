# Local quarterly-mosaic pipeline: Phase 2 design

Status: design for Sean's approval; no implementation is included. Numerical
labels used throughout are **M** (measured in this clone/VM), **D** (documented
in the named repository sources), and **E** (engineering estimate that must be
replaced by a measurement where a gate says so).

## Summary

Make downloaded Copernicus Data Space Ecosystem (CDSE) quarterly-mosaic COGs,
not the Process API, the source of truth. An acquisition pass inventories and
downloads the COGs intersecting the committed Phase 0 manifest; an offline
GDAL/Python pass reads their overviews into cached, untinted quarterly window
rasters; the existing round-2 season choice, land tone, Natural Earth mask,
Blue Marble ocean, slicing, and QA then run only against those caches. Finished
tiles go under the already-approved R2 prefix `s2gm2025/` **[D]**.

Sean has one dashboard action: create S3 credentials for the existing CDSE
account, copy the access key and one-time secret into the VM's secret store, and
do not put either in this repository **[D]**. This is distinct from the OAuth
client used by the pilot Process API.

The committed manifest is 10,665 tiles for 1,943 coordinates, split z4 218,
z5 573, z6 1,302, z7 2,871, and z8 5,701 **[M]**. Grouping each zoom into
global, grid-aligned 3-by-3 blocks (anchor `x = 3k`, `y = 3j`, with x wrapping)
produces 34, 90, 229, 496, and 1,082 blocks respectively, or 1,931 raw
windows **[M, calculated directly from the committed manifest]**. Reserve
75 GB persistent disk: 40 GB for source COGs, 25 GB for compressed quarterly
raw windows, 7 GB for selected untinted windows, and 3 GB for masks, ocean
data, finished imagery, logs, and headroom **[E]**.
The VM has 86 GB free on its persistent 100 GB home filesystem, 7.7 GiB RAM,
and only 510 MiB ephemeral `/tmp` **[M]**; therefore all working paths live
under home, and the measured acquisition inventory must be no more than 40 GB
before downloading. First acquisition plus rendering is 8–24 elapsed hours
**[E]**. A finish-only tuning rerun of the five-site acceptance set is 2–10
minutes **[E]** and of the full manifest is 30–120 minutes **[E]**, with zero
PU and zero network acquisition **[E]**.

## 1. Source acquisition

### Product and resolution policy

Use the same 2025 Sentinel-2 Level 3 Quarterly Mosaic product family as the
pilot **[D]**. The Process views were the low-resolution BYOC collection
`byoc-6af2d932-8f18-4bed-a31b-d32bc49d43a0` and the 10 m collection
`byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca` **[D]**. The downloadable objects
must be matched to those products by vintage, quarter, band, grid cell, and
published product identifier; a merely similar Sentinel-2 product is not an
acceptable substitution.

The baseline uses the approximately 400 m low-resolution product at every game
zoom **[D]**. Equatorial Web Mercator output is about 9,784, 4,892, 2,446,
1,223, and 612 m/px at z4 through z8 respectively **[D, formula
156543.033928/2^z]**. The pilot proved that the low-resolution collection
renders z4 through z9 and retains real texture at z9 **[M]**. It is therefore
adequate for z4–z8 without paying the storage and I/O cost of 10 m inputs.

The 10 m product is not part of the baseline pull. Its service-side refusal
above 1,600 m/px **[M]** would allow it locally at any resolution, but native
detail is useful only at z8 in this game **[E]**. Before a full 10 m download,
render the five-site acceptance set at z8 from both products. Adopt 10 m for z8
only if Sean sees a material improvement and the inventory still fits the disk
gate. z4–z7 remain low-resolution. This decision avoids silently turning the
design into a multi-hundred-gigabyte 10 m archive **[E]**.

### Discovery, credentials, and download

1. Sean opens the CDSE S3 credential manager once, creates an access-key/secret
   pair, copies the secret when shown, and stores both outside git **[D]**.
   Grant read-only data access if the dashboard offers scopes. Rotate by
   replacing the secret-store values; no manifest changes.
2. Query the documented OData `Products` endpoint at
   `https://catalogue.dataspace.copernicus.eu/odata/v1/Products` for the 2025
   quarterly-mosaic products **[D; endpoint and vintage]**. Filter on
   product type `S2MSI_L3__MCQ`, the four 2025 quarter date ranges, and the
   low-resolution product identity; request product id, name, content date,
   footprint, S3 path, checksum, and content length. OData is discovery only.
   Save the unedited response and a normalized `source-inventory.jsonl`.
3. Intersect product footprints with the union of manifest tile bounds. Retain
   every source cell needed by at least one raw window and all four quarters.
   Record why every object is included. Reject an inventory with a missing
   quarter, ambiguous resolution, duplicate product id, absent checksum, or an
   unexpected vintage.
4. Read the OData-returned object paths from bucket `eodata` through endpoint
   `https://eodata.dataspace.copernicus.eu`, using S3 path-style requests and
   Sean's access-key/secret credentials **[D]**. Strip a leading `/eodata/`
   from an OData `S3Path` before using the remainder as the bucket key; do not
   guess product directories or list the whole bucket. Download each required
   COG asset to `.partial`, verify content length and the
   published checksum, then atomically rename. Retry only absent or invalid
   objects. Emit bytes and request counts per object and quarter.

The exact object count and compressed byte total cannot be measured in this
networkless sandbox. For planning, the Phase 0 footprint's low-resolution COGs
are estimated at 15–40 GB total for four quarters **[E]**. That is explicitly
not an authorization to download 40 GB: the metadata-only inventory supplies
the measured total first. Sean re-approves or supplies a larger persistent
volume if it exceeds the 40 GB disk gate **[E]**. If CDSE exposes no trustworthy
content lengths, download one representative object per quarter, measure its
bytes and compression, and revise the estimate before the batch.

For a later vintage, generate a new immutable source id such as `s2gm2026`, run
the same four-quarter inventory, and store it beside—not over—`s2gm2025` **[D
for prefix versioning; E for example vintage]**. Acquisition manifests include
product ids and checksums, so quarters may be updated only by creating a new
source revision. An incomplete year does not replace the approved vintage.

## 2. Local sampling

Introduce GDAL plus a small Python raster driver. Node and ffmpeg remain useful
for orchestration, JPEG encoding, and the existing A/B page, but they do not
provide reliable windowed COG reads, overview selection, CRS warping, nodata
propagation, or multi-band geospatial alignment. This VM currently has neither
GDAL command-line tools nor Rasterio installed **[M]**. Pin GDAL/Rasterio and
PROJ versions in the implementation phase and record them in every run report.

Build a VRT per quarter over the downloaded cells. For each of the 1,931 packed
3-by-3 windows **[M]**, use `gdalwarp`/Rasterio to read the nearest suitable COG
overview and write the exact output grid:

- detail: 768 by 768 pixels, EPSG:3857, bounds derived from the packed XYZ
  window **[M for dimensions; D for projection]**;
- base: 2,048 by 1,024 pixels, EPSG:4326, bounds `[-180,-90,180,90]` **[M,
  matching round 2]**;
- bands: B02, B03, B04, and `observations`, retained as source-scale integers
  with nodata and geotransform metadata **[D]**; and
- quarters: four separate band groups, never pre-toned and never collapsed
  during acquisition **[D]**.

Use area/average resampling for reflectance when reducing resolution and nearest
neighbor for `observations` and validity **[E]**. Never bilinearly interpolate
observation counts or nodata. Use one target grid for all quarters and validate
identical dimensions, transform, CRS, and band order before writing the raw
cache. At source-cell boundaries, GDAL reads the quarter VRT as one mosaic, so
tone cannot vary by source object or request window.

Season selection is local but semantically the same as the current evalscript.
For detail windows at z6–z8 whose center latitude is above +23 degrees, prefer
July–September; below -23 degrees, prefer January–March; in the intervening
band use no seasonal preference **[M, current renderer]**. z4, z5, and the base
use no preference because their windows cover too much latitude **[M for z4;
E extension to z5]**. Among eligible quarter samples choose the greatest
positive `observations`; if none is eligible, choose the greatest positive
`observations` among all quarters; no positive observation is nodata **[M,
current evalscript]**. Quarter identity comes from acquisition metadata, never
array position. This selection writes a cached untinted selected RGB+validity
raster; land tone is a separate finish step.

The finish step carries round 2 forward unchanged in intent: reflectance is
source digital number divided by 10,000; land uses gain 2.9, gamma 0.9,
saturation 1.05, contrast 1.0, and a highlight knee at 0.72 **[M]**. The same
continuous 21,600-by-10,800 December 2004 Blue Marble source and deterministic
ocean tone fill water **[M]**. Natural Earth land-minus-lakes supplies the
mask: the global 21,600-by-10,800 raster for z4–z7 and the base, and exact
4-times-supersampled vector-window masks with a 2-pixel signed feather at z8
**[M for existing method; E for extending raster use through z7]**. Transparent
polar land extends its nearest valid land sample as in round 2 **[M]**. Finish
from the cached raw rasters, slice to 256-pixel JPEGs, and write nodata and seam
QA before upload **[M/D]**.

Process lower layers first: base, z4, z5, z6, z7, then z8 **[D]**. This produces
an early whole-globe QA surface and bounds wasted work if a source defect is
found.

## 3. Data retention and disk budget

All paths below are on persistent home storage, never `/tmp`; `/tmp` is only
510 MiB and does not persist **[M]**. Names are proposed **[E]** and belong in a
gitignored `scripts/sat/work/s2gm2025/` tree.

| Artifact | Retained form and location | Size | Lifetime |
| --- | --- | --- | --- |
| Acquisition evidence | OData response, normalized inventory, object ids, paths, lengths, checksums, download log under `inventory/` | under 50 MB **[E]** | Keep permanently with the vintage; commit only the non-secret normalized manifest **[E]** |
| Source COGs | Original verified bytes under `source/<quarter>/`; never rewritten | 15–40 GB **[E]**, hard gate 40 GB **[E]** | Keep through G2 and every tuning round; after G2, copy to durable cold storage before VM deletion **[E]** |
| Raw quarterly windows | Lossless tiled GeoTIFF under `raw-quarterly/<z>/`; four quarters of B02/B03/B04/observations, including the base | 36.4 GB for detail plus 0.07 GB for the base uncompressed: `1,931 x 768 x 768 x 4 x 4 x 2` and `2,048 x 1,024 x 4 x 4 x 2` bytes **[M calculations]**; 12–25 GB compressed **[E]** | Source of truth for season changes; keep through G2 and archive with source inventory **[E]** |
| Selected untinted windows | Lossless tiled GeoTIFF, RGB plus validity/observations, under `raw-selected/<policy-hash>/` | 9.1 GB uncompressed: 1,931 x 768 x 768 x 4 bands x 2 bytes **[M calculation]**; 3–7 GB compressed **[E]** | Keep while tuning that selection policy; rebuild locally from quarterly cache if policy changes |
| Natural Earth inputs | Original land/lakes zips, global mask, and z8 per-window feather masks under `mask/` | current zips 5.6 MB and global mask 0.92 MB **[M]**; full z8 mask cache under 100 MB **[E]** | Keep permanently; keys include source checksum, bounds, dimensions, and algorithm version |
| Ocean source | Original 21,600-by-10,800 Blue Marble JPEG under `ocean/` | decoded RGB about 700 MB **[M]**; compressed source 20–80 MB **[E; current clone contains only the older 2.57 MB low-resolution file, M]** | Keep permanently with source URL/checksum and acknowledgement |
| Finished windows/tiles | Composite working windows, 10,665 JPEG tiles, base, QA and run logs under `finished/<finish-hash>/` | 0.2–1.0 GB **[E]**; existing EOX mean implies about 116 MB for tiles alone **[E from 10.9 KB documented sample]** | Keep current candidate through G2; old tuning finishes may be deleted because raw inputs persist |

Peak planned use is 75 GB **[E]**. Delete no source COG or raw quarterly window
to make a run fit. If measured acquisition plus conservative raw-cache forecast
would exceed 75 GB **[E]**, stop before transfer and attach persistent storage or
reduce scope with Sean's approval. Streaming from S3 instead of caching is not
an allowed workaround.

The enforced invariant is: **tone, masking, ocean composition, JPEG encoding,
and A/B assembly always run locally from cached untinted windows. No finishing
or tuning command is allowed to call CDSE.** A finish command fails closed when
a required raw-cache key is missing and tells the operator to run the separate
acquisition/sampling command. Cache keys include vintage, product id/checksum,
quarter, CRS, bounds, dimensions, bands, resampling, and selection-policy hash
**[E]**.

## 4. Re-run economics and meter reconciliation

After the first verified pull, a tone/ocean/mask tuning rerun costs zero Process
API PU, zero S3 GETs, and zero network egress **[E by design]**. The five-site
acceptance set is 18 detail windows plus one base in the existing round-2 command
**[M]**; finishing those cached rasters should take 2–10 minutes **[E]**. The
full 1,931-window packed manifest should take 30–120 minutes on this VM **[E]**,
plus 5–20 minutes for JPEG slicing and QA **[E]**. Actual first-run timings
replace these estimates in the run report.

A season-policy change also costs zero acquisition: it rereads four cached
quarter groups and rewrites selected windows, estimated at 10–45 minutes for
the five-site set and 1–4 hours for the full manifest **[E]**. A projection,
resampling, vintage, or product-resolution change invalidates raw windows and
reruns local sampling from cached COGs, estimated at 2–8 hours full-manifest
**[E]**, still with zero PU and zero S3 calls **[E]**.

Only the initial S3 object download remains metered or quota-sensitive. The
free-tier egress/request limits and exact billing behavior were not verified in
this sandbox. Before each batch, record the CDSE dashboard's documented limit,
current usage, inventory object count, and byte budget; cap the downloader at
those measured remaining amounts. After each batch, reconcile local successful
GET count and bytes against both the S3 client's counters and dashboard usage,
record the difference, and do not start the next batch until unexplained usage
is resolved. Budget: exactly the inventoried object count and bytes plus at most
5 percent retry bytes **[E]**; retries never broaden the object list. OAuth token
exchange, OData metadata queries, and checksum validation are recorded but
expected to consume zero PU **[E]**. The Process API budget is exactly 0 PU
**[E]** and its URL must not occur in acquisition or finishing logs.

## 5. Migration and validation

1. Freeze the committed manifest and inventory the low-resolution 2025 COGs.
   Verify all four quarters, checksums, measured bytes, and the disk gate before
   downloading **[D/E]**.
2. Locally sample the unchanged round-2 acceptance set—Fiji, Sydney, Bay Area,
   Iceland, and Antarctic Peninsula—at the same zooms and exact XYZ bounds:
   18 detail windows plus the 2,048-by-1,024 base **[M]**. Keep the API-produced
   round-2 candidate only as a comparison artifact; do not use its pixels as an
   input.
3. Prove data-path equivalence before taste: correct quarter ids and
   observations, exact grids, no source-cell seams, deterministic output, masks
   aligned at coasts, and no network access during two identical finish runs.
   Pixel identity with the API is not required because local overview and
   resampling behavior may differ **[E]**.
4. Carry over unchanged the round-2 land transform, global ocean source and
   ocean transform, Natural Earth land/lakes vectors, z8 vector-mask method,
   2-pixel feather, polar extension, JPEG settings, QA concepts, and blind A/B
   builder **[M]**. Replace only API acquisition/evalscript execution and any
   mask cache key that depends on the old request shape.
5. Rebuild the blind panels against EOX and inspect against the round-2 intent
   and the prior G1 defect list: no rectangular or horizontal ocean seams; no
   stair-step/black/cyan coast artifacts or lost islands; restrained ocean cyan;
   no orange land or clipped snow; no polar black strip; stable transitions
   across zooms **[D]**.
6. **This is the exact G1 rerun point:** after all five local site panels and the
   local base pass mechanical QA, but before any full-manifest sampling or R2
   upload, give Sean the blind A/B and ask for the same ship/tune verdict **[D]**.
   A pass authorizes the full render. A fail changes only local finish logic and
   reruns from cached raw windows at zero acquisition cost.
7. Render base then z4 through z8, write counts/nodata/seam reports, upload only
   passing outputs to `s2gm2025/`, and perform the on-globe 390 px comparison
   **[D]**. Gate G2 then occurs before Stripe live mode or any paid feature:
   Sean approves the live source, credits, and default switch **[D]**.

Acceptance requires 10,665 manifest tile records accounted for as uploaded or
intentionally omitted for all-nodata fallback **[M/E]**, no checksum failures,
no unreviewed missing source cells, deterministic finish hashes, clean QA, Sean's
G1 ship verdict, and Sean's G2 live verdict.

## 6. Risks and open questions

- **COG identity, layout, and coverage.** The repository documents the product
  type and BYOC ids but not the downloadable low-resolution S3 key layout,
  object count, content lengths, overviews, or exact high-latitude coverage.
  OData/S3 inventory and representative local reads must answer these before
  bulk transfer. A quarter missing the Phase 0 footprint blocks acquisition.
- **Vintage mutation.** CDSE may republish an object under a changed checksum.
  Never overwrite a cache entry; create a source revision and rerun the pilot.
- **Free-tier S3 limits/egress.** Limits and charges are unverified here. The
  pre-batch dashboard snapshot, hard byte/request cap, and post-batch
  reconciliation prevent an open-ended pull. If the measured free allowance is
  below the inventory, pause for Sean to approve waiting, storage in the same
  region, or a known paid amount.
- **Disk and memory.** The 75 GB peak estimate leaves about 11 GB on today's
  persistent filesystem **[E from M free space]**. Process one window at a time,
  use tiled compressed outputs, and cap GDAL cache below 2 GiB **[E]**. Never
  decode all four quarters or the roughly 700 MB ocean RGB plus many windows in
  parallel **[M/E]**.
- **Resolution choice.** Approximately 400 m may look soft at z8, while full 10 m
  acquisition may break the disk budget. The five-site z8 test decides; a
  bounded intermediate overview extracted from 10 m COGs is acceptable only
  after the original intersecting COGs are cached and inventoried.
- **Season semantics.** A packed z6 or z7 window can cross the +23/-23 degree
  boundary **[E]**. The baseline preserves request-center behavior for
  comparability. Per-pixel latitude selection is a later policy change that can
  be tested for free from the quarterly cache.
- **Product seams and missing data.** Local VRT sampling removes independent
  request tone but cannot repair discontinuities already present in quarterly
  products. QA must inspect source-cell edges and quarter switches explicitly.
- **Toolchain reproducibility.** GDAL/PROJ axis order, overview choice, and
  resampler versions can alter pixels. Pin versions and store the complete
  command/configuration and output hashes.
- **Fallback to Process API.** It is permitted only if CDSE does not expose the
  required product COGs, the footprint is materially incomplete, authenticated
  S3 cannot be made reliable, or the measured source set cannot fit an approved
  persistent store. Quality failure alone does not justify returning to an
  uncached API: first test the 10 m local product or adjust local finishing.
  Any Process fallback requires a new written acquisition/cache design, a PU
  budget approved by Sean, raw API responses retained, and dashboard
  reconciliation after every batch. It is not part of this Phase 2 design.

## Amendments, 2026-10-18 (Sean)

- **R2 retention and free allowance (amends section 3).** Durable R2 storage is
  capped at the account-wide 10 GB free allowance; no monthly R2 storage cost
  is authorized. R2 retains finished low-resolution tiles and base, the
  finished high-zoom pin layer, and the selected untoned windows, projected at
  up to 9.975 GB using the present worst-case estimates. The four quarterly
  source COG sets and raw quarterly working windows live on the VM's home
  volume and are never copied to R2. Sean confirmed on 2026-10-18, after the
  persistence check, that they are RETAINED there as the working archive:
  the home volume demonstrably survives VM replacements (files from
  2026-10-17 intact through repeated replacements; 100 GB volume, 86 GB
  free), while processes and /tmp do not persist. They remain reproducible
  from the immutable inventory and CDSE if the VM store is ever lost, and
  anything irreplaceable still belongs in git or R2. The original section 3 table's longer source-COG and quarterly-
  window retention statements are superseded by this paragraph.
- **Derive-down windows (amends section 2).** For a given covered area, sample
  and store an untoned window once at the finest required output grid, then
  derive its lower-zoom windows during the offline finish. Store a separate
  lower-zoom sample only where its footprint is not covered by a finer stored
  window. This replaces routine per-zoom duplicate sampling while preserving
  the section 2 selection, projection, masking, and finish rules.
- **Ocean pruning (amends section 1 acquisition).** Before retaining a source
  object, intersect its footprint with the checked-in Natural Earth land-minus-
  lakes mask. The inventory uses a conservative polygon-versus-mask-cell test:
  an object is excluded as entirely ocean only when no land pixel cell
  intersects its footprint. Coastal ambiguity is retained. Every exclusion and
  its measured content length is written to the inventory evidence. Ocean is
  still painted from Blue Marble during finishing.
- **Zoom scope.** The approximately 400 m product supplies z4 through z9; z9 is
  an upscale already in scope. The separate 10 m pin layer starts at z10.
