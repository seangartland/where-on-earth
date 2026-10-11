# R2 setup for EOX satellite tiles

The prefetcher stores the prioritized EOX Sentinel-2 Cloudless 2016 tiles in Cloudflare R2 as `tiles/{z}/{x}/{y}.jpg`. It does not crawl the full pyramid: it uploads all 85 z0–z3 tiles, followed by deduplicated 3×3 windows at z4–z11 around every game location.

## Create the bucket and credentials

1. In the Cloudflare dashboard, open **R2 Object Storage**, create a bucket (for example, `where-on-earth-tiles`), and leave its location on Automatic unless there is a deployment-specific reason to choose otherwise.
2. Under **Manage R2 API Tokens**, create an Account API token with **Object Read & Write** access limited to this bucket. Save the Access Key ID and Secret Access Key when shown; the secret is displayed only once.
3. Do not put these credentials in browser code or commit them. Export them only in the shell that runs the prefetcher.

```sh
export R2_ACCOUNT_ID='your-cloudflare-account-id'
export R2_ACCESS_KEY_ID='your-r2-access-key-id'
export R2_SECRET_ACCESS_KEY='your-r2-secret-access-key'
export R2_BUCKET_NAME='where-on-earth-tiles'
node scripts/prefetch-eox-tiles.mjs
```

Optional variables:

- `R2_PREFIX` defaults to `tiles` and must match the path used by `src/main.js`.
- `R2_ENDPOINT` defaults to `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.
- `LOCATIONS_FILE` defaults to `assets/locations.json` (relative to the repository root).
- `PREFETCH_PROGRESS_FILE` defaults to `.eox-prefetch-progress.json` (relative to the repository root).

The progress file is written atomically and records successful uploads. Re-running the command skips them. `Ctrl-C` or `SIGTERM` stops after the current tile and saves progress. EOX 403, 429, and 5xx responses, plus network failures, pause with exponential backoff and then resume automatically. The origin request rate is capped at five per second.

## Attach the public custom domain

1. Open the bucket's **Settings**, choose **Custom Domains**, and connect `tiles.where-on.earth` (or another hostname in a zone on the same Cloudflare account).
2. Wait for the dashboard to show the domain as active, then verify a known object at `https://tiles.where-on.earth/tiles/{z}/{x}/{y}.jpg` after the prefetch has uploaded it.
3. Keep the bucket's development `r2.dev` URL disabled unless it is separately needed.
4. If the hostname differs, set `window.R2_BASE_URL` before `src/main.js` loads. The production default in `src/main.js` is `https://tiles.where-on.earth`.

R2 custom domains are same-origin-independent image fetches, so ensure the bucket/domain CORS policy permits `GET` and `HEAD` from the game's production origin (and development origins used for testing). A minimal policy allows those methods and the required origins; avoid `*` if the production hostname is known.

## Attribution and source policy

The cached imagery is EOX Sentinel-2 Cloudless 2016, licensed CC BY 4.0. Keep the visible attribution in the game and the source/licence record in `docs/satellite-sources.md`. Do not change the script to a full-world high-zoom crawl or to newer EOX yearly mosaics: the newer free layers have different, non-commercial licensing.
