# EOX Phase 1 pilot build report

## Built

The pilot renderer, quarterly-mosaic evalscript, 12-site coordinates, tile-math
test, and local blind A/B builder are in `scripts/sat/`. The implementation uses
the plan's c1 route: four 2025 quarterly `sentinel-2-global-mosaics` inputs,
local-summer preference outside 23 degrees latitude, and the highest-observation
quarter as fallback. Its named tone constants use the CDSE true-colour baseline
of 2.5 reflectance gain, with neutral gamma, contrast, and saturation defaults.
No tone value was fitted to EOX imagery.

The renderer posts one 768 by 768 EPSG:3857 window per 3 by 3 tile grid, slices
it into nine JPEGs, resumes completed tiles, limits requests to 120 per minute,
retries transient responses up to three times, appends request and PU records to
`run.jsonl`, and records per-tile transparent or empty-pixel fractions in
`qa.json`. A pilot is 12 sites at z4, z6, and z8, plus Bay Area, Alps, Fiji, and
Sydney at z9. It also requests a 4096 by 2048 EPSG:4326 base render and writes a
2048 by 1024 JPEG.

`make-ab.mjs` downloads the existing detail tiles only after the pilot tiles are
available, stores both sides locally, stitches each grid, and writes `ab.html`.
The deterministic A/B mapping is kept only in `ab-key.json`; the HTML does not
refer to that file.

## Dry-run evidence

With no `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`, this command prints four
redacted Process request payloads, one each for z4, z6, z8, and z9, followed by a
redacted base request, then exits successfully:

```sh
node scripts/sat/render.mjs --pilot
```

The payloads identify the local evalscript by path, not contents or credentials.
No token, client ID, or client secret is printed.

## Live-render command

Supply credentials only through the process environment or the ignored
`scripts/sat/.env`, then run:

```sh
node scripts/sat/render.mjs --pilot && node scripts/sat/make-ab.mjs
```

The command writes build artifacts under `scripts/sat/pilot/`. Do not commit
tiles, stitched imagery, the rendered base, `ab.html`, or `ab-key.json`.

## Pilot estimate

There are 40 detail windows and one base request, for 41 Process API requests.
Each detail window is 768 by 768 pixels. The initial implementation used four
input bands and four quarterly samples, for `(768*768)/(512*512) * (4/3) * 4 =
12 PU` per window, or 480 PU for detail. The tuning change below adds B08, so
the current estimates are 15 PU per detail window, about 600 PU for detail,
about 213 PU for the two base hemispheres, and about 813 PU for a full pilot.

## Verification limits

This build did not make live CDSE calls. It cannot verify the deployed CDSE data
collection identifier, account access, rendered visual quality, nodata behavior,
or EOX tile downloads until the orchestrator supplies credentials and runs the
live command. The tile-math test verifies all stored site coordinates. Bay Area
at z8 is `40/98`; the Phase 0 `8/134/89` tile is a valid but different fixed-view
reference, so it is used as a plausibility check rather than an equality check.

## Correction: BYOC collection access

The first live Process API request failed with HTTP 400, reporting that
`sentinel-2-global-mosaics` was an invalid collection type. That name is a
catalog collection, not a built-in Sentinel Hub Process API collection type.

CDSE documents the Sentinel-2 Level 3 Quarterly Mosaics as the public BYOC
collection `byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca` in its [Sentinel-2
Mosaic access documentation](https://documentation.dataspace.copernicus.eu/Data/Others/Sentinel2_Mosaic_access.html).
The renderer now posts one data entry of that type with one 2025 time range,
from `2025-01-01T00:00:00Z` through `2025-12-31T23:59:59Z`. At that point PU
accounting was unchanged because it still counted four quarterly samples.

The evalscript now requests that single datasource with TILE mosaicking. It
uses each `scenes.tiles[i].date` month to choose the northern Q3 or southern Q1
item, rather than assuming a sample order, and otherwise selects the sample
with the most observations. Mosaic band values are digital numbers, so tone
now converts each value to reflectance by dividing by 10000 before applying
the unchanged 2.5 gain and neutral named constants.

Dry-run payloads now show one `input.data` object with the BYOC type and the
full-year time range, with the evalscript still redacted. Final Process API
errors now include the first 300 response-body characters to make invalid
requests diagnosable without another run.

## Correction 3: request-scoped seasonal preference

A live TILE-mosaicked request failed because `inputMetadata.coordinates` is not
populated there. The evalscript no longer reads input metadata for latitude.
Instead, the renderer substitutes its `PREFERRED_MONTHS` token for each request,
using the EPSG:3857 window-bbox center latitude: July through September above
23 degrees, January through March below -23 degrees, and an empty list between.
Scene dates still identify the preferred quarter, and highest observations stays
the fallback.

The renderer applies this preference only to z6, z8, and z9 windows. It sends
an empty list for z4 because a z4 window spans too much latitude for one seasonal
choice, and for the EPSG:4326 base request because it is only a backdrop.
Dry-run output includes each sample request's substituted `preferredMonths`
array while continuing to redact the evalscript body.

## Correction 4: two-part base texture

The Process API rejects output dimensions above 2500 pixels. The base render now
posts two 2048 by 2048 EPSG:4326 requests: a west hemisphere from -180 to 0
degrees longitude and an east hemisphere from 0 to 180. Both use the unchanged
empty seasonal preference. Their PNG responses are temporarily stored under the
output directory, stitched west-to-east into the same 4096 by 2048 whole, then
downsampled to the existing 2048 by 1024 `base-ours.jpg`; the temporary PNGs
are removed afterward. Each request is logged as `kind: "base"` with its
`part` field. Base pixel and PU totals are unchanged.

## Correction 5: EOX z9 parent-region fallback

EOX detail imagery is available only through z8. When the local A/B builder
gets a 404 for an EOX detail tile, it now builds that panel from the overlapping
two-by-two tile region at the parent zoom, crops the exact footprint of the
requested three-by-three child-tile window, and scales it back to the regular
768-pixel panel. The fallback is triggered by the missing response rather than
a fixed zoom, so available z4, z6, and z8 EOX panels retain their existing
native-tile path. The blind HTML labels remain unchanged.

The base pair remains the renderer-produced `base-ours.jpg` versus the supplied
EOX base texture. If that renderer file is absent, the builder still writes all
detail comparisons and reports that it skipped the base pair.

## Tuning round 1

The evalscript now requests B08 as well as the RGB bands and reserves its fourth
output band for classification: alpha 255 for mosaic land, alpha 110 for water,
and alpha 0 for no data. Water is `B08 < B04 * 0.65`. This is deliberately
conservative because NIR absorption is the signal being used, while dark land
and uncertain coasts should remain mosaic pixels. Nodata accounting still reads
the uncomposited Process image, treating alpha 0 as nodata and every positive
alpha value as data.

The renderer composites classified water with NASA Blue Marble Next Generation
`world.topo.bathy.200412.3x5400x2700.jpg`, a 5400 by 2700 pixel equirectangular
topography-and-bathymetry image, from
https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg.
It is fetched once into the ignored `scripts/sat/cache/` directory and sampled
onto each request grid. A two-pixel flag-boundary feather blends the two
sources. The live `report.json` records the cached file's exact byte size under
`bmng.bytes`; that value cannot be measured in this sandbox because the image
has not been downloaded here.

Land tone constants are now `REFLECTANCE_GAIN = 3.2`, `GAMMA = 0.85`, and
`SATURATION = 1.15`; contrast remains 1.0. These affect mosaic pixels only,
including the mosaic half of the feather. Blue Marble pixels pass through
unchanged.

### Orchestrator-run live steps

This sandbox verified syntax and dry-run request construction only. The
orchestrator should rerender exactly Fiji, Sydney, Bay Area, Iceland, and
Antarctic Peninsula, plus the base, then rebuild the complete A/B page:

```sh
node scripts/sat/render.mjs --pilot --sites fiji,sydney,bay-area,iceland,antarctic-peninsula --refresh
node scripts/sat/make-ab.mjs
```

That is 18 detail windows: Fiji, Sydney, and Bay Area at z4, z6, z8, and z9;
Iceland and Antarctic Peninsula at z4, z6, and z8. `--refresh` reissues only
those windows and the base despite their existing output files. The rerender is
expected to make 20 Process requests, or about 483 PU: 270 PU for detail and
about 213 PU for the two base hemispheres. It has not been live-rendered or
visually approved in this sandbox.

The scoped request construction was verified without using available
credentials via `node scripts/sat/render.mjs --pilot --sites
fiji,sydney,bay-area,iceland,antarctic-peninsula --refresh --dry-run`.

## Tuning round 1 correction

The round 1 B08 water test did not separate water from land in the quarterly
mosaic. On a fresh Fiji z8 window, `B08 < B04 * 0.65` flagged 29,048 of
589,824 pixels (about 5 percent), all coastal fringes; open ocean was instead
classified as land. The raw band means show that the open ocean is unmasked
filler: northeast Fiji ocean was B04 244, B03 382, B08 860
(B08/B04 = 3.52, NDWI = -0.385); southwest Fiji ocean was B08/B04 = 0.84 and
NDWI = +0.227. Viti Levu land was B08/B04 = 6.45 and NDWI = -0.573, while
Vanua Levu land was B08/B04 = 2.28 and NDWI = -0.114. The ocean samples
disagree with one another and overlap land on every index, so no threshold on
these bands can classify this mosaic's water reliably.

The evalscript therefore returns RGB plus the pre-tuning observation alpha,
without B08 or band-derived water classification. The renderer now decides
water from `cache/ne-land-mask.png`, a 21600 by 10800 equirectangular Natural
Earth 10m land-minus-lakes mask generated by `scripts/sat/make-land-mask.py`.
Mask water receives Blue Marble; alpha zero continues to mean only that the
mosaic has no data. The two-pixel coast feather uses neighboring mask classes.
The Caspian Sea is a known mask gap that reads as land and remains a Phase 2
item.

Correction 2 fixed an EPSG:3857 units bug in this mask path: window x
coordinates are meters, but were sampled as though they were degrees. The
first tuning attempt hid the Blue Marble error because its ocean color is
smooth, but the mask advanced about 91,600 pixels per screen column and wrapped
modulo 21,600, producing the dense vertical stripes seen in Fiji and Sydney.
EPSG:3857 x is now converted to degrees before both Blue Marble and mask
sampling; the EPSG:4326 path remains in degrees. The per-pixel land-mask class
is also precomputed once per window, so the two-pixel feather reads cached
classes rather than recomputing coordinates and mask samples for every
neighbor.

The orchestrator should rerender Fiji, Sydney, Bay Area, Iceland, and Antarctic
Peninsula with `--refresh`, then run `make-ab`:

```sh
node scripts/sat/render.mjs --pilot --sites fiji,sydney,bay-area,iceland,antarctic-peninsula --refresh
node scripts/sat/make-ab.mjs
```
