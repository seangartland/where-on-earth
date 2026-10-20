# EOX replacement: R2 upload and provider wiring (prepped 2026-10-19)

Decision (Sean, 2026-10-19): tooling is prepped now; the upload and the
provider wiring happen after the z4-z8 render completes and its report
verifies. Nothing in this doc is live yet.

## No token needed (corrected 2026-10-19, Sean's objection)

An earlier draft of this plan asked Sean to mint a fresh R2 API token,
because the October harvest pair was exposed and the S3-style uploader
needed a key pair in the environment. Sean objected: he has already had
to reset the R2 credentials twice. The fix: the uploader now goes through
the Cloudflare account API token already stored in Muse's Secure Vault
for the custom.cloudflare connector (created 2026-10-13, "Edit Cloudflare
Workers" template, includes R2 storage). No dashboard visit, no new
token, no credentials in any file or environment. Verified live
2026-10-19: bucket list 200, probe object PUT 200 with etag, DELETE 200,
and a two-object end-to-end run of the uploader itself with a no-op
rerun (resume logic). The old exposed R2 token is now irrelevant to this
work; deleting it is optional hygiene whenever Sean is in the dashboard
for something else (the connector token cannot revoke other tokens: the
tokens list returns 403).

## The upload (one command, resumable)

    cd ~/workspace/map-game/eox1-work
    .venv-sat/bin/python scripts/sat/local/upload_r2.py \
      --root scripts/sat/work/s2gm2025/finished/full --prefix s2gm2025

- Keys: s2gm2025/base-ours.jpg and s2gm2025/{z}/{x}/{y}.jpg on bucket
  where-on-earth-tiles, served as https://tiles.where-on.earth/s2gm2025/...
  (custom domain serves bucket objects directly; no Worker change; the
  existing CORS policy already allows the game origins).
- Content-Type image/jpeg, Cache-Control public, max-age=31536000,
  immutable. The provider URL carries a version query (?v=1) so a
  corrected re-upload can bust caches by bumping it.
- Progress file at finished/full/.r2-upload-progress.json makes reruns
  skip size-matching keys; a killed upload resumes where it stopped.
- Verify before wiring: --dry-run prints the object plan; after the real
  run, curl -I a sample of keys across z4-z8 plus the base and confirm
  200, content type, and the ACAO header for https://www.where-on.earth.

## Provider wiring (after upload verifies)

Add one record beside eox2025 in src/globe/surface.js (Phase 0 shape
{id, tiles, base, credit, maxZ}):

- id: "s2gm2025"
- tiles: "https://tiles.where-on.earth/s2gm2025/{z}/{x}/{y}.jpg?v=1"
- base: "https://tiles.where-on.earth/s2gm2025/base-ours.jpg"
- maxZ: 8
- credit: our own mosaic credit (Copernicus Sentinel data 2025, processed
  locally; no EOX attribution, this is not EOX data)

Ship it as a solo deploy (name the cargo: this record only, plus the
credits page source section). Default stays eox2025. Sean validates at
https://www.where-on.earth/?sat=s2gm2025 on his phone.

## After Sean validates on the globe

Only then, in order: flip the default provider to s2gm2025, fix the
stale credits page (it still says 2016 CC BY 4.0), redeploy, and delete
the EOX tile objects. Sean's rule (2026-10-19): EOX data is not deleted
until he has validated the new data on the actual globe.
