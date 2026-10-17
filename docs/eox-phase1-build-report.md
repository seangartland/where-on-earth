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
