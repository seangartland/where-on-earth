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
Each detail window is 768 by 768 pixels. The plan formula with four input bands
and four quarterly samples is `(768*768)/(512*512) * (4/3) * 4 = 12 PU` per
window, or 480 PU for detail. The 4096 by 2048 base estimate is about 171 PU.
Expected pilot total is about 651 PU.

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
from `2025-01-01T00:00:00Z` through `2025-12-31T23:59:59Z`. PU accounting is
unchanged: it still counts four quarterly samples.

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
