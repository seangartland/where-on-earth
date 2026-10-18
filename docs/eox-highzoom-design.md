# High-zoom 10 m satellite design

Status: design for Sean's decision; no implementation is included. Every
number is marked **[M]** (measured or calculated from files in this clone),
**[D]** (documented in the named repository source or brief), or **[E]**
(engineering estimate to replace with a measurement). Storage uses decimal GB,
matching R2 billing **[D]**.

## Recommendation

Build a **static, pin-centred z10-z14 layer** from the 2025 10 m quarterly
mosaic, after the low-resolution base-layer pipeline has passed G1. For each of
the 805 city pins and 427 landmark pins **[M, the two committed asset files]**,
render the same grid-aligned 3-by-3 tile neighborhood already used to define
detail coverage **[D]**, except for the South Pole landmark at latitude -90,
which is outside Web Mercator's approximately +/-85.05-degree limit and keeps
the existing base/stylized fallback **[M/D]**. Deduplication across the 1,231
renderable pins leaves 8,905, 9,658, 10,015, 10,289 and 10,512 tiles at z10
through z14, respectively, or 49,379 tiles total **[M]**.
That is the right first product: native detail through approximately z14 **[D]**,
bounded acquisition and rendering, no live raster service, and useful close-up
imagery at the places gameplay actually names.

The finished layer is about **0.54-1.98 GB [E]**, using an explicitly estimated
11-40 KB JPEG range; the planning case is 1.23 GB at 25 KB/tile **[E]**. It fits
inside R2's documented 10 GB free-storage allowance if the base artifacts and
source archive do not consume that allowance **[D/E]**. R2 egress is free;
storage above the account-wide free allowance is $0.015/GB-month, Class A is
$4.50/million operations, and Class B is $0.36/million operations **[D,
Cloudflare figures supplied in the brief]**. Uploading 49,379 immutable objects
therefore has a gross Class A list price of about $0.22 before any allowance
**[E, multiplication]**. Reads retain today's CDN-shaped latency: an edge miss
is one R2 object read, while an edge hit avoids the origin **[E]**.

Do **not** build every descendant of the current z8 footprint. That would be
31,104,656 z10-z14 tiles **[M]**, approximately 342-1,244 GB **[E]**, with a
777.6 GB planning case **[E]** and about $11.51/month of R2 storage after the
10 GB allowance **[E]**. It spends roughly 630 times as many tile objects as
the pin-centred proposal **[M]** to cover mostly non-gameplay terrain.

Do **not** put GDAL on the request path initially. A lazy renderer is a valid
later extension for observed misses, but it adds a container service, cold-start
and source-range-read latency, concurrency control, and another failure domain
to a static game. The present settle-then-fill UI tolerates missing imagery,
but it does not turn a multi-second first render into a good default experience
**[E]**.

The client changes are small but important:

1. Raise the satellite provider's `maxZ` from 8 to 14 **[M for the current
   value; D for the proposed ceiling]**. Keep z9 as the already-planned upscale
   of the low-resolution product **[D]**; the 10 m layer begins at z10.
2. Publish a compact, versioned coverage index for z10-z14 and consult it before
   choosing a tile URL. Outside the pin layer, request the nearest known z8/z9
   ancestor immediately. Do not discover sparse coverage by issuing up to six
   expected 404s per tile **[E]**.
3. Keep the existing two-buffer inset behavior, centre-first queue, six normal
   fetches, three slow-network fetches, 150 ms settle delay, ancestor cropping,
   and classic-map-under-satellite fallback **[M]**. Missing high-detail tiles
   remain a graceful quality reduction, not an error.
4. Use a new immutable source/version prefix and query-string version; never
   replace the approved low-resolution objects in place **[D/E]**.

This work follows, rather than blocks, the base build. Its inventory can run in
parallel with low-resolution acquisition **[E]**, but its five-site z10-z14
quality pilot should reuse the base pipeline's approved season, tone, mask,
ocean, provenance, and QA decisions. Full high-zoom acquisition/rendering starts
only after base G1, so it does not amplify an unapproved finish **[E]**.

## Decision basis and common assumptions

The committed Phase 0 manifest contains 10,665 tiles for 1,943 coordinates:
218 at z4, 573 at z5, 1,302 at z6, 2,871 at z7, and 5,701 at z8 **[M]**. For a
fixed XYZ footprint every deeper level has four children, so a complete
descendant layer has `5,701 x 4^(z-8)` tiles **[M]**. This is exact geometry,
not a storage measurement.

The 10 m source is the Sentinel-2 L3 Quarterly Mosaic BYOC collection
`byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca`, with B02/B03/B04/B08 and the
quarterly observations data used by the existing selection policy **[D]**.
Equatorial output is 306, 153, 76, 38, 19 and 9.5 m/px at z9-z14 **[D]**. Thus
z10 is the first requested genuinely higher-detail level and z14 is the useful
ceiling; z15 would enlarge pixels beyond source-native detail **[D/E]**.

No 10 m COGs or finished high-zoom JPEG sample exist in this clone **[M]**.
The base memo's 10.9 KB mean came from lower-resolution EOX tiles **[D]**, not
from this product at these zooms. All byte and build-time figures below are
therefore estimates. The tables expose an 11 KB lower scenario, a 25 KB
planning scenario, and a 40 KB upper scenario **[E]**. Inventory and a stratified
JPEG pilot must replace them before approval to scale.

Global high-detail coverage is out of scope. A complete Web Mercator z14 alone
would contain 268,435,456 tiles before excluding ocean or polar rows **[M,
`4^14`]** and has no relationship to the game's bounded location coverage.

## Coverage and storage math

### Full descendant footprint

| Zoom | Resolution | Tile count | Finished GB at 11 / 25 / 40 KB |
| --- | ---: | ---: | ---: |
| z10 | 153 m/px **[D]** | 91,216 **[M]** | 1.00 / 2.28 / 3.65 **[E]** |
| z11 | 76 m/px **[D]** | 364,864 **[M]** | 4.01 / 9.12 / 14.59 **[E]** |
| z12 | 38 m/px **[D]** | 1,459,456 **[M]** | 16.05 / 36.49 / 58.38 **[E]** |
| z13 | 19 m/px **[D]** | 5,837,824 **[M]** | 64.22 / 145.95 / 233.51 **[E]** |
| z14 | 9.5 m/px **[D]** | 23,351,296 **[M]** | 256.86 / 583.78 / 934.05 **[E]** |
| **z10-z14** | | **31,104,656 [M]** | **342.15 / 777.62 / 1,244.19 [E]** |

At the 25 KB planning size, stopping at z12 is 47.89 GB cumulative and about
$0.57/month after the 10 GB free allowance **[E]**; adding z13 raises that to
193.84 GB and about $2.76/month **[E]**; adding z14 raises it to 777.62 GB and
about $11.51/month **[E]**. The money is modest, but 31.1 million files,
generation time, inventory/QA, and revision churn are not **[M/E]**.

### Pin-centred coverage

The pin counts below were calculated from `assets/locations.json` and
`assets/locations-landmarks-sol.json`: exclude the one point outside Web
Mercator (the South Pole landmark at latitude -90), map the other 1,231 points
into XYZ, include the containing tile plus one tile in every direction, wrap x,
clip y, and deduplicate **[M]**.

| Zoom | Unique 3x3 tiles | Finished GB at 11 / 25 / 40 KB |
| --- | ---: | ---: |
| z10 | 8,905 **[M]** | 0.098 / 0.223 / 0.356 **[E]** |
| z11 | 9,658 **[M]** | 0.106 / 0.241 / 0.386 **[E]** |
| z12 | 10,015 **[M]** | 0.110 / 0.250 / 0.401 **[E]** |
| z13 | 10,289 **[M]** | 0.113 / 0.257 / 0.412 **[E]** |
| z14 | 10,512 **[M]** | 0.116 / 0.263 / 0.420 **[E]** |
| **z10-z14** | **49,379 [M]** | **0.543 / 1.234 / 1.975 [E]** |

A 3-by-3 z14 neighborhood is about 7.3 km across at the equator and less at
higher latitude **[E, 9.5 m/px x 256 px x 3, before latitude scaling]**. It is
a close-look patch, not a metropolitan-region promise. If playtesting needs a
larger disc, generate it from the same renderable-pin list and remeasure unique
tiles; a 5-by-5 square has a hard upper bound of 30,775 objects per zoom before
overlap **[M, `1,231 x 25`]**, versus 11,079 for 3-by-3 **[M, `1,231 x 9`]**.

The 1,943-coordinate Phase 0 footprint includes more than the 1,232 named
city/landmark pins, of which 1,231 are Web Mercator-renderable **[M]**.
Propagating that entire footprint preserves detail
around expedition/trivia and other referenced coordinates, but its exact sparse
z10-z14 counts must be generated from the source location union; multiplying
5,701 z8 tiles is the much larger *continuous descendant* interpretation **[M]**.
The recommended first release deliberately guarantees high detail only around
the two named gameplay pin sets. Add other proven gameplay coordinates to the
same sparse manifest when product requirements name them **[E]**.

## Option A: pre-render a static pyramid

### Full current footprint

This most closely extends the base design: archive intersecting 10 m COGs in
R2, read them locally with GDAL/VRTs, apply the approved per-pixel quarter
selection and finish, slice immutable JPEGs, QA them, and upload **[D/E]**.

- **Storage and build.** The exact 31,104,656-tile and per-zoom counts are above
  **[M]**. Finished storage is 342-1,244 GB **[E]**. At an unbenchmarked 20-100
  completed tiles/second, slicing alone is roughly 3.6-18 days of continuous
  compute **[E]**; geospatial reads, selection, masks and QA can make it longer.
  A revision rewrites the pyramid.
- **Serving.** It has the best latency shape: static CDN/R2 hits, free egress,
  no application service, deterministic cache keys, and no first-view render
  penalty **[D/E]**. Gross Class A list price for 31.1 million uploads is about
  $140 before allowances **[E]**. Each uncached object read is a Class B
  operation; one million such reads list at $0.36 before allowances **[D]**.
- **Failures.** Batch interruption is resumable by checksum; bad source cells,
  seams or finish policy can contaminate many descendants; incomplete uploads
  require an atomic version-prefix switch **[E]**. Static serving continues if
  the build VM disappears **[D/E]**.
- **Operations.** Simple at runtime, heavy before release. Tens of millions of
  objects make listing, QA evidence, deletion, and version rollover material
  jobs even though storage dollars are low **[E]**.

### Recommended sparse static variant

The same machinery over the pin manifest produces 49,379 tiles **[M]** and
about 1.23 GB in the planning case **[E]**. After source COGs are local, a first
full pass is estimated at 2-12 hours on the present VM **[E]**, including
warping, finishing, slicing and mechanical QA; measure the pilot rather than
scheduling from that range. It retains static serving's favorable failure and
latency properties while accepting ancestor imagery away from pins. Its main
new operational artifact is the coverage index, which must be generated from
the exact uploaded manifest and versioned with it **[E]**.

## Option B: lazy generation into R2

The request path would be: client asks for an XYZ tile; a Worker or origin
looks for the immutable JPEG in R2; on a miss it coalesces duplicate work,
invokes a raster renderer, atomically stores the result in R2, and returns it.
Later requests are ordinary static hits **[E]**.

A Cloudflare Worker can perform routing, authentication-free lookup, cache
policy and job coalescing, but it cannot run the GDAL/PROJ raster toolchain
**[D, brief]**. The actual renderer must be a pinned container on an autoscaling
container platform, a function image with sufficient memory/runtime, or an
always-on VM **[E]**. The recommended shape, if this is ever built, is a small
autoscaling container with GDAL/Rasterio and a bounded ephemeral cache. Its
durable inputs—original verified COGs, inventory, policy and finished JPEGs—live
in R2; the VM/container is disposable cache, preserving Sean's storage rule
**[D/E]**. A single fixed VM is cheaper to understand but creates an availability
and patching obligation that does not exist today **[E]**.

- **Storage and acquisition.** Finished storage grows only with demand: between
  zero and the same 342-1,244 GB full-footprint bound **[E]**. This does *not*
  remove source acquisition: every source COG needed by the allowed coverage
  must be durably archived in R2, or a first request depends on CDSE availability
  and credentials **[D/E]**.
- **Build cost.** Up-front tile work is near zero **[E]**, exchanged for service
  engineering, image deployment, request coalescing, negative caching, limits,
  observability and per-render compute **[E]**. No repository evidence prices a
  suitable platform, so a dollar figure would be invented; benchmark runtime
  and choose a platform before costing it.
- **Latency.** Cached tiles match static serving **[E]**. An uncached tile needs
  container scheduling/cold start, several COG range reads or local-cache hits,
  warp/selection/finish/JPEG work and an R2 write. Budget 1-10 seconds for a
  cold tile and 0.2-2 seconds warm **[E]**, then replace those broad bounds with
  a prototype. The current 150 ms settle delay and centre-first filling **[M]**
  hide motion churn, not seconds of blank detail. Multiple visible cold tiles
  amplify tail latency.
- **Serving cost.** Add one lookup/read per request, an R2 write on first fill,
  renderer compute, logs and possibly cross-provider data transfer **[E]**.
  R2's documented storage/request/egress prices still apply **[D]**; compute is
  unknown until a platform and measured render duration are selected **[E]**.
- **Failures.** Cold-start timeout, source range-read failure, duplicate renders,
  partial object publication, a poisoned cached tile, thundering herds, renderer
  outage and cost abuse join the static pipeline's data-quality risks **[E]**.
  Return an ancestor immediately on timeout and never cache a partial result.
- **Operations.** Highest of the options: deploy and patch native libraries,
  hold source/index versions consistent, bound concurrency and memory, trace
  failures, and keep rollbackable container and tile versions **[E]**.

Lazy rendering is justified only if measured play repeatedly asks for useful
detail outside a sparse static manifest and the misses are too dispersed to
batch nightly **[E]**. A background demand log followed by an offline static
increment is simpler than synchronous generation and should be tried first.

## Option C: pre-render shallow, lazy deep

The natural hybrid pre-renders z10-z12 and lazily fills z13-z14. Over the full
z8 footprint the static portion is 1,915,536 tiles and 20.1-76.6 GB **[M/E]**;
the lazy ceiling adds up to 29,189,120 possible tiles and 321-1,168 GB **[M/E]**.
At the 25 KB planning size those are 47.89 GB static and 729.73 GB possible
lazy growth **[E]**. Over the pin manifest, z10-z12 is 28,578 static tiles and
0.714 GB at 25 KB, while z13-z14 is only 20,801 tiles and 0.520 GB **[M/E]**.

- **Build/acquisition.** It reduces first-release rendering for continuous
  coverage, but still needs all source COGs intersecting the allowed lazy area
  in durable R2 **[E]**. For pin coverage, saving 20,801 pre-renders does not
  justify a service **[M/E]**.
- **Serving/latency.** z10-z12 is predictable; the exact moment the camera asks
  for z13 introduces the cold path. That quality boundary may be more visible
  than a consistent sparse/static policy **[E]**. Cached deep tiles converge to
  static behavior.
- **Failures and operations.** It inherits both systems: batch/version failures
  at shallow levels and all lazy-service failures deep **[E]**. The coverage
  index must distinguish absent, renderable, in-progress and finished tiles
  **[E]**.

This is the best dynamic architecture if later evidence requires broad z10-z12
coverage but makes z13-z14 demand genuinely sparse. It is not the first-release
recommendation because the measured pin pyramid is already small enough to
pre-render completely **[M/E]**.

## Acquisition reality

The high-zoom output footprint is not the acquisition unit. The product is
published as grid-cell quarterly products/assets; a 3-by-3 XYZ patch that
touches one source cell requires the relevant COG assets for that whole cell
unless authenticated HTTP/S3 range reads are deliberately kept as an external
runtime dependency **[D/E]**. Durable operation therefore inventories every
2025 Q1-Q4 source cell intersecting the chosen union, copies the original
verified objects to a versioned R2 archive, and renders locally from a VM cache
**[D]**.

Repository documentation describes 10,008-by-10,008 int16 COG bands **[D]**.
One uncompressed band plane is about 200.3 MB and four required planes
(B02/B03/B04/observations) are about 801 MB per cell-quarter **[E,
`10008 x 10008 x 2` arithmetic]**. Across four quarters that is about 3.20 GB
uncompressed per retained grid cell **[E]**, before B08, masks, TIFF structure
and overviews. If each required band is a separate object, the expected shape
is 16 required COG objects per retained cell across four quarters **[E]**; if
CDSE packages a product differently, the inventory—not this assumption—wins.
Compression and real content lengths are unknown **[M]**.

Consequently, neither “49,379 output tiles” nor “small discs” implies a small
download. The 1,231 renderable pins are globally dispersed **[M]** and can intersect many
source grid cells. Disc-shaped acquisition saves zero bytes when the disc and
the broader footprint touch the same cell **[E]**; it saves a whole cell's four
quarters only when the reduced union avoids that cell entirely. Once a cell is
acquired, clipping it before durable archival would lose provenance and future
rerender flexibility without reducing the initial CDSE transfer **[E]**.

The base design's 15-40 GB estimate applies to the approximately 400 m product,
not this 10 m archive **[D]**. The repository explicitly warns that the latter
can be multi-hundred-GB **[D/E]**. There is no defensible object or compressed
byte total in the networkless clone **[M]**. The metadata-only inventories in
the next section are therefore a hard gate. If the pin-cell archive is too
large for approved R2 cost or transfer, reduce the pin set or render from a
bounded temporary CDSE range-read pilot; do not silently make CDSE the live
tile origin **[E]**.

## Failure policy and rollout

Source, render-policy and delivery versions are immutable **[E]**. A release
prefix is published only after object-count reconciliation, checksum/size
validation, deterministic rerender checks, seam/nodata reports and the visual
acceptance set pass **[D/E]**. The coverage index is derived from that passing
prefix, never from intended work **[E]**.

Client behavior on an uncovered or failed tile is the already-supported nearest
ancestor crop; beneath that, the base and stylized map remain visible **[M]**.
A bad high-zoom release is rolled back by provider/index version, without
rewriting objects **[E]**. Keep the source COG archive, normalized inventory,
checksums, exact pin manifest, toolchain versions and finish hash in R2; local
COGs and working rasters on the VM are caches **[D/E]**.

Rollout order:

1. Finish the low-resolution inventory and base G1; run the high-resolution
   metadata inventory independently **[E]**.
2. Acquire only the source cells for the existing five-site acceptance set and
   render z10-z14 3-by-3 neighborhoods **[E]**. This measures bytes, throughput,
   JPEG size, seams and whether z13/z14 visibly earn their cost.
3. After Sean approves the close-detail look, acquire the measured pin-cell
   source set, render/upload a versioned sparse pyramid, then publish its
   coverage index **[E]**.
4. Log coverage misses without rendering them synchronously **[E]**. Batch-add
   demonstrated gameplay areas. Reconsider a lazy service only after those logs
   show dispersed, repeated demand that cannot be handled by scheduled static
   increments **[E]**.

## Measurements to run next, in order

1. **Freeze both output manifests [E, prescribed measurement].** Recompute the z10-z14 3-by-3
   pin set from the 805-city and 427-landmark files, recording the South Pole
   landmark as excluded outside Web Mercator; save per-zoom sorted XYZ,
   deduplication counts and hashes **[M after the run]**. Separately expand every
   committed z8 tile through z14 and confirm the full-footprint counts in this
   memo **[M when run]**.
2. **Run two metadata-only OData inventories [E, prescribed measurement].** Query `Products`
   for product type `S2MSI_L3__MCQ`, collection identity corresponding to
   `byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca`, each of the four 2025 quarter
   date ranges, and footprints intersecting (a) the union of pin tile bounds
   and (b) the union of all Phase 0 z8 bounds. Request and retain product id,
   name, content dates, footprint, S3 path, checksum and content length **[D]**.
   Report unique grid cells, products/objects and bytes per quarter plus union;
   diff the cell-id sets to price disc versus full-cell acquisition.
3. **Resolve asset layout without bulk download [E, prescribed measurement].** For one central,
   one coastal, one high-latitude and one sparse/ocean-adjacent cell in every
   quarter, enumerate only the product's required assets. Record key, band,
   byte length, checksum, TIFF dimensions/type, block size, compression,
   internal overview levels, nodata, CRS and bounds. Confirm whether B02/B03/
   B04/observations are separate objects and whether B08 is avoidable.
4. **Measure range-read amplification [E, prescribed measurement].** Against those samples,
   trace S3 GET/range request count and transferred bytes for one z10, z12 and
   z14 3-by-3 render, cold and with a warm local COG cache. Compare whole-object
   download with range reads. This decides acquisition disk, network and any
   future lazy-render feasibility.
5. **Download the five-site source subset [E, prescribed measurement].** Verify every length
   and checksum, record compressed bytes per cell/quarter/band and peak local
   disk. Extrapolate only by the measured inventory's cell classes, retaining a
   range rather than a single mean.
6. **Run a stratified static pilot [E, prescribed measurement].** Render the five sites at all
   five high zooms with the pinned base finish. Record wall/CPU time, peak RAM,
   source bytes read, output JPEG bytes and QA failures per tile. Include urban,
   vegetation, desert, snow and ocean/coast tiles; report p10/mean/p50/p90/p99
   JPEG sizes. Replace every storage and build-time estimate in this memo.
7. **Test delivery and the coverage index [E, prescribed measurement].** Upload the pilot under
   a disposable version prefix. Measure cold and warm tile latency from the
   game's target regions, R2 Class A/B counts, CDN hit behavior, index bytes and
   lookup time. In the client harness, confirm an uncovered z14 view goes
   directly to its known ancestor with no expected-404 cascade.
8. **Only if logs later justify lazy rendering, benchmark one container [E,
   prescribed measurement].** With archived R2 COGs, measure cold start, warm
   render, R2 range GETs,
   peak memory, concurrent duplicate suppression, atomic publication and
   timeout-to-ancestor behavior for the same z10/z12/z14 sample. Price the
   measured platform invocation/runtime and compare it with the static batch
   increment before approving a service.

The release gate is the measured pin-cell source byte total, the measured
49,379-tile output total and build duration, a passing visual pilot through z14,
and confirmation that the account-wide R2 footprint remains within Sean's
approved storage budget **[M/E]**.
