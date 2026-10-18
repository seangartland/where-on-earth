# EOX replacement: scale-up notes

Measured learnings from the Phase 1 pilot build and live debugging
(2026-10-17), recorded for the Phase 2 full render. Every claim here was
observed against the live CDSE Sentinel Hub API unless marked as
documentation. Companion docs: `docs/eox-independence-plan.md`,
`docs/eox-phase1-build-report.md`.

## Collections

- The plan's assumed collection type `sentinel-2-global-mosaics` does not
  exist as a Process API type. The Sentinel-2 Level 3 Quarterly Mosaics
  are BYOC collections:
  - 10 m: `byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca`
  - ~400 m low-res: `byoc-6af2d932-8f18-4bed-a31b-d32bc49d43a0`
- The CDSE Catalog API lists only 10 collections and does not include the
  mosaics. Do not look for them there.
- The 10 m collection refuses output coarser than 1,600 m per pixel
  (verbatim error). That rules out z4 (about 2,446 m/px), z5, and any
  base texture on the 10 m collection. The low-res collection rendered
  z4 through z9 without complaint, and its z9 output (306 m/px requested
  from ~400 m native) showed real texture in the pilot.
- Phase 2 options this opens: low-res for everything (simplest, one
  collection), or a mix with the 10 m collection only where the pixel
  size allows (z8 at 611 m/px and z9 at 306 m/px are under the cap).

## Request shape

- Output width and height are capped at 2,500 px per request (verbatim
  error). The 4,096 px base is built as two 2,048x2,048 hemisphere
  requests (west [-180,-90,0,90], east [0,-90,180,90], EPSG:4326)
  stitched, then downsampled to 2048x1024.
- PNG responses cannot carry FLOAT32. The evalscript uses sampleType
  AUTO: returned floats in [0,1] are stretched to [0,255] (Sentinel Hub
  evalscript documentation). Values above 1 clamp, which is the intended
  behaviour of the 2.5 gain.
- Mosaic band values are digital numbers, reflectance x 10,000. Divide
  by 10,000 before any gain.
- With TILE mosaicking, `inputMetadata.coordinates` is undefined. Never
  read per-pixel position from metadata. The renderer injects per-request
  constants into the evalscript text instead: PREFERRED_MONTHS from the
  window centre latitude, applied at z6 and above only. A z4 window spans
  about 67 degrees of latitude, so z4 and the base use the
  most-observations fallback everywhere.
- Identify each quarterly item from `scenes.tiles[i].date` (its month),
  never from sample index order.

## Tooling traps

- Node `spawnSync` defaults to a 1 MB maxBuffer. A decoded 768x768 RGBA
  frame is about 2.4 MB, so ffmpeg slicing died with an empty stderr and
  looked like an API failure. render.mjs sets maxBuffer explicitly.
- Builder sandboxes (codex-run) have no network: dry runs there attempt
  live calls when a local .env exists. Live verification is always the
  orchestrator's step, on the VM.

## Quota and cost (documentation plus pilot observation)

- PU is charged on output pixels x bands x samples requested. Request
  batching does not reduce PU. Our evalscript requests 4 samples (the
  quarterly items) and 4 output bands.
- Free Copernicus General quota: 10,000 PU per month, 10,000 requests
  per month, 300 requests per minute. Hitting the cap stops requests; it
  does not bill.
- Pilot actuals: 40 windows plus base, about 650 PU estimated by the
  renderer's own accounting, all detail requests HTTP 200.
- Full z4-z8 render estimate at pilot settings: about 14,600 PU, i.e.
  roughly two monthly cycles on one account, or less with trims (fewer
  samples is the only real lever and it changes the season logic).
- Validation failures (HTTP 400) were observed repeatedly during
  debugging with no quota impact noticed. Observed, not guaranteed.
- Batch Processing API: official docs price it at one third the PU but
  restrict it to Copernicus Service or commercial accounts. An
  orchestrator probe with guessed `/api/v2/batch/` paths returned 404;
  that is a wrong address, not an eligibility verdict. If Batch is ever
  revisited, take the exact V2 paths from docs.sentinel-hub.com first.

## Credentials

- The CDSE dashboard shows a client's secret only at creation. The copy
  in the Secure Vault cannot be re-verified against the dashboard.
- Browser downloads land in the browser agent's own folder and are
  unreachable from the VM. Never move secrets by download.
- Proven pattern (2026-10-17): sealed drop. The page encrypts in the
  browser with an RSA public key (WebCrypto, RSA-OAEP SHA-256) and posts
  ciphertext to a local server; the private key never leaves the VM.
  localhost.run tunnels on port 443 reach the browser tooling; bore.pub
  tunnels do not (loopback rejected, high ports refused).
- Working credentials live at `scripts/sat/.env` (mode 600, gitignored)
  in the Phase 1 clone. Token exchange via client_credentials against
  the CDSE identity realm returns 200.
