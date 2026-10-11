# R2 pre-rendered satellite inset pipeline — scope

Research date: 2026-10-10. Scope only; this document does not implement the pipeline.

## Recommendation

Pre-render a **3×3 neighborhood at z4–z11 around every location**, deduplicate globally by `{z}/{x}/{y}`, and publish the resulting **45,913 unique JPEG tiles** to an R2 Standard bucket at versioned keys such as `s2cloudless-2016/v1/{z}/{x}/{y}.jpg`.

This is the smallest sensible fixed window for the present renderer: the tile containing the location plus a one-tile margin in every direction. It is 768×768 source pixels and matches the current inset code's one-tile margin. It will cover a settled phone-sized close view in the common case, but it is not equivalent to the renderer's absolute 8×8 dynamic-window cap. A 5×5 set is the straightforward expansion if device testing exposes edges during panning or landscape use.

Before bulk-fetching, ask EOX to confirm that a one-time, throttled fetch of roughly 46,000 2016 tiles for public redistribution is acceptable. CC BY 4.0 permits the reuse, but EOX publishes neither a bulk-download policy nor a rate limit/SLA for the free WMTS.

## 1. Tile calculation and storage

### Calculation

For each location and zoom `z`:

```text
n = 2^z
x = floor((longitude + 180) / 360 * n)
y = floor((1 - asinh(tan(clamp(latitude, -85.05112878, 85.05112878))) / pi) / 2 * n)
```

Generate offsets `dx,dy = -1,0,1`, wrap `x` modulo `n`, clamp `y` to `[0,n-1]`, then deduplicate the keys across all 1,928 locations. WMTS uses the same numeric grid but its REST path is row then column (`z/y/x`); the proposed R2 path is conventional XYZ (`z/x/y`).

Without deduplication, the baseline is exactly `1,928 × 8 zooms × 9 = 138,816` location-tile references. Deduplication is important because nearby locations and low zooms share tiles.

| Zoom | Unique 3×3 tiles | Unique 5×5 tiles |
| ---: | ---: | ---: |
| 4 | 217 | 250 |
| 5 | 594 | 803 |
| 6 | 1,377 | 2,093 |
| 7 | 2,988 | 4,718 |
| 8 | 5,806 | 10,042 |
| 9 | 9,310 | 18,696 |
| 10 | 12,033 | 28,190 |
| 11 | 13,588 | 34,809 |
| **Total** | **45,913** | **99,601** |

The 5×5 naïve count is 385,600 references. These exact unique counts were calculated from the current `assets/locations.json` (1,928 records) with Web Mercator/XYZ math.

### Storage estimate

The output is already-compressed 256×256 JPEG; do not decode/re-encode it. The EOX origin could not be sampled from this workspace, so the honest estimate is a byte-size model rather than a measured claim:

| Average JPEG | 3×3 / 45,913 objects | 5×5 / 99,601 objects |
| ---: | ---: | ---: |
| 10 KiB | 0.470 GB (0.438 GiB) | 1.020 GB (0.950 GiB) |
| **20 KiB planning case** | **0.940 GB (0.876 GiB)** | **2.040 GB (1.900 GiB)** |
| 30 KiB | 1.410 GB (1.314 GiB) | 3.060 GB (2.850 GiB) |
| 50 KiB stress case | 2.351 GB (2.189 GiB) | 5.100 GB (4.749 GiB) |

Object metadata overhead is not included and is not material at this scale. The implementation's first step must sample at least 100 geographically and zoom-stratified EOX tiles, record p50/p95/mean bytes, and replace the planning figure with `45,913 × measured mean`. All modeled cases remain under R2 Standard's 10 GB-month free allowance as currently published.

## 2. EOX WMTS origin

Capabilities:

```text
https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml
```

2016 Web Mercator JPEG REST template:

```text
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2016_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg
```

This is WMTS order: `{TileMatrix}/{TileRow}/{TileCol}` = `{z}/{y}/{x}`. It is programmatically fetchable with ordinary HTTPS GETs, requires no key/account, and the published service supports `GoogleMapsCompatible` Web Mercator. EOX explicitly permits direct WMS/WMTS application integration and documents a 4,096-pixel maximum request size; a 256-pixel WMTS tile is within it.

EOX does **not** publish a numeric request-per-second limit, bulk-mirroring quota, or uptime SLA. Therefore:

- obtain written operational confirmation before the bulk run;
- start at two concurrent requests, use a descriptive `User-Agent` with a contact address, and only increase to four if EOX agrees;
- honor `429` and `Retry-After`; exponentially back off on 429/5xx/network errors;
- never retry 404 indefinitely, and cap transient retries (for example, five attempts);
- verify `Content-Type: image/jpeg`, 256×256 dimensions, and a sane nonzero size before upload;
- reread capabilities immediately before implementation because identifiers and formats are service configuration, not a licensing guarantee.

References: [EOX service endpoints and matrix sets](https://cloudless.eox.at/documentation/usage), [EOX free-service and licence conditions](https://cloudless.eox.at/license-non-commercial), and [EOX pricing/direct-integration statement](https://cloudless.eox.at/pricing).

## 3. R2 setup

Use **R2 Standard**, not Infrequent Access: these are small, frequently read objects; Standard has no retrieval charge or minimum retention.

1. Create a Cloudflare account (or use the existing one), enable the R2 subscription/billing profile, and ensure the intended domain is a zone in the same account.
2. Create a production bucket, for example `map-game-satellite`, with Standard storage. Keep it private while loading and validating.
3. Create scoped S3-compatible credentials that can list/write only this bucket. Put secrets in local/CI secret storage, never in the repository or browser.
4. Upload to immutable, versioned keys: `s2cloudless-2016/v1/{z}/{x}/{y}.jpg`. Upload `manifest.json`, `attribution.json`, and a machine-readable list of expected keys/checksums alongside the tiles.
5. Connect a dedicated custom domain such as `sat.example.com`. Do not use `r2.dev` in production: Cloudflare documents it as rate-limited and it does not provide CDN caching/WAF features.
6. Enable a Cache Rule for `sat.example.com/s2cloudless-2016/v1/*`: eligible/cache everything, edge TTL of one year, browser TTL of at least 30 days, and origin/object `Cache-Control: public, max-age=31536000, immutable`. JPEG is normally cacheable, but an explicit rule removes ambiguity.
7. Enable Smart Tiered Cache so an edge miss can be satisfied from an upper tier instead of causing one R2 read in every edge data center.
8. Disable the public `r2.dev` URL. Optionally add WAF/rate-limiting rules against hotlink abuse; do not require browser credentials for the tiles.
9. Configure CORS for the game's production and preview origins (`GET`, `HEAD`; no credentials). Test canvas/WebGL loading because a missing CORS header makes otherwise valid imagery unusable.
10. Add monitoring from at least two regions for one known tile and the manifest, plus Cloudflare usage/billing alerts.

Cloudflare says custom domains are required to put R2 behind its cache, whereas `r2.dev` is for development. See [R2 setup](https://developers.cloudflare.com/r2/get-started/), [public buckets/custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/), and [R2 cache behavior](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/).

## 4. Pipeline design and runtime

The proposed future script (for example `scripts/build-satellite-tiles.mjs`) should be resumable and deterministic:

1. Read and validate `assets/locations.json`; fail unless every record has finite `lat/lng` and the expected count (or require an explicit `--accept-location-count` when the catalogue changes).
2. Generate the exact deduplicated 3×3 key set, sorted by zoom then Morton/Hilbert-like locality or `y/x`. Write a local manifest containing source layer, source URL template, generation date, location-data checksum, tile keys, and attribution/licence URLs.
3. Run a 100-tile stratified probe. Validate responses and report mean/p50/p95 byte size, latency, errors, and projected storage/runtime. Require a human `--continue` for the bulk phase.
4. For each key, first `HEAD` R2 or consult the previous manifest/checksum so reruns skip good objects. Fetch the EOX `z/y/x` URL through a bounded queue (two requests by default), stream bytes without transcoding, compute SHA-256, validate JPEG/dimensions, then upload to R2 as `z/x/y.jpg` with `Content-Type: image/jpeg` and immutable cache headers.
5. Persist a checkpoint after every batch (for example, 100 tiles). Record successes, permanent failures, attempts, HTTP status, bytes, ETag/checksum, and elapsed time. A rerun retries only missing/failed keys.
6. After fetching, compare R2 keys against the expected manifest, download and decode a random sample from the custom domain, visually inspect representative city/desert/ocean/polar/antimeridian tiles, then publish manifests last.
7. Keep the prior version during rollout. Switching versions becomes a one-line client URL change and rollback requires no object overwrite or cache purge.

### Runtime estimate

Runtime is origin-latency/rate-limit bound, not CPU bound. For 45,913 objects:

| Sustained completed rate | Fetch phase |
| ---: | ---: |
| 2 tiles/s | 6 h 23 m |
| 4 tiles/s | 3 h 11 m |
| 8 tiles/s | 1 h 36 m |

At two concurrent requests and 0.5–1.0 seconds per response, expect roughly **3.2–6.4 hours** before retries and validation; budget **one working day** for the first run. R2 upload time should overlap fetches. Do not optimize toward 8 tiles/s unless EOX explicitly approves it. A 5×5 corpus takes about 2.17 times as long.

## 5. Client code change and failure behavior

The eventual code change is localized to `SAT_PROVIDERS` in `src/main.js`. Preserve its argument order (`url(z, y, x)`) while emitting an XYZ R2 path:

```js
const SAT_PROVIDERS = [{
  url: (z, y, x) => `https://sat.example.com/s2cloudless-2016/v1/${z}/${x}/${y}.jpg`,
  credit: 'Base imagery: NASA Blue Marble · Detail imagery: EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)',
  maxZ: 11,
}];
```

No tile-loader rewrite is required: the current inset code already fetches JPEG blobs with CORS, retries once, trips a circuit breaker after repeated failures/429s, and leaves the older inset or local Blue Marble base visible through failed tiles.

Recommended fallback hierarchy:

1. On a missing/failed R2 detail tile, retain the current behavior: transparent gap shows the prior completed inset or the bundled NASA Blue Marble base.
2. On repeated failures, keep the existing circuit breaker/backoff. Do **not** silently fall back to Esri; that preserves the dependency, may violate the intended usage/attribution model, and reintroduces an uncontrolled external origin.
3. If satellite initialization itself fails, the existing classic map fallback remains.
4. Keep the previous R2 version for an operational rollback. A short-lived, separately approved EOX-direct emergency provider could be feature-flagged, but it should not be automatic: it can create a traffic spike against the free origin during an R2 incident.

Important limitation: a fixed 3×3 corpus will return 404 when a user pans farther than one tile from a location or when a wider viewport needs more coverage. Before release, either constrain detail exploration to the intended location framing, or run viewport tests and promote to 5×5. The loader should treat an expected corpus miss differently from an R2 outage in telemetry.

## 6. Cost projection

Current R2 Standard pricing is $0.015/GB-month, $4.50/million Class A operations, $0.36/million Class B operations, and zero egress fees. The monthly free tier is 10 GB-month, 1 million Class A, and 10 million Class B operations; billing units round up. At the modeled 0.94 GB and 45,913 initial PUTs, **storage and the initial load are $0/month** within the current free tier.

Actual R2 reads are CDN-origin misses, not every browser tile request. Because cache hit ratio and geographic spread are unknown, the table conservatively treats every browser request as a Class B R2 operation; a custom domain plus Smart Tiered Cache should make the real charge lower.

Assumptions:

- expected session: five locations × one settled 3×3 window = **45 tile requests/user/day**;
- stress session: five locations × all eight zoom levels × nine tiles = **360 tile requests/user/day**;
- 30-day month, one session per daily user, current free tier applied;
- costs exclude any paid Cloudflare zone plan, optional Workers, Cache Reserve, or WAF add-ons (none is required for the basic design).

| Daily users | Monthly browser requests, expected | Worst-case R2 Class B cost | Monthly browser requests, stress | Worst-case R2 Class B cost |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.35 M | $0.00 | 10.8 M | $0.36 |
| 10,000 | 13.5 M | $1.44 | 108 M | $35.28 |
| 100,000 | 135 M | $45.00 | 1.08 B | $385.20 |

These figures intentionally overstate R2 cost. For example, if CDN/tiered cache prevents 95% of browser requests from reaching R2, even 100k DAU expected traffic produces 6.75 M R2 reads and stays within the 10 M free tier. Use Cloudflare's observed R2 Class B count after launch, not browser request count, for billing forecasts. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### Comparison with Esri

The code currently calls the unauthenticated legacy `server.arcgisonline.com/.../World_Imagery` URL. There is no project account meter in this repository, so its apparent dollar cost is $0 but it is not a sound commercial cost baseline: availability, allowed volume, and continued anonymous access are outside the game's control.

For an apples-to-apples supported Esri Location Platform comparison, Esri currently prices basemap tiles at 2 million free per month, then $0.15 per 1,000 tiles. With the same assumptions and no caching/rehosting:

| Daily users | Esri expected (45/day) | Esri stress (360/day) |
| ---: | ---: | ---: |
| 1,000 | $0 | $1,320/month |
| 10,000 | $1,725/month | $15,900/month |
| 100,000 | $19,950/month | $161,700/month |

This is a pricing comparison, not a claim that the legacy anonymous endpoint currently generates such an invoice. Esri's supported APIs require an account/token and attribution, and Esri basemap content generally cannot be bulk-copied into R2 without explicit rights. Source: [ArcGIS Location Platform pricing](https://developers.arcgis.com/pricing/).

## 7. Attribution and licence record

EOX's currently prescribed 2016 credit is:

> **EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH https://eox.at (Contains modified Copernicus Sentinel data 2016 & 2017)**

Display it legibly and close to the map whenever EOX detail imagery can be visible; make `EOxCloudless` and `EOX IT Services GmbH` links in a credits panel or attribution control. The existing compact `.sat-credit` element can show a readable shortened line only if the full linked attribution is one tap/click away and still satisfies EOX's proximity requirement. Continue the separate NASA Blue Marble base credit.

Also include a link to [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) in the game's legal/credits view and in `attribution.json`. If tiles are modified in the future (color correction, recompression, overlays), state that they were modified. Do not imply endorsement by EOX, ESA, the EU, or Copernicus.

The earlier research document used the older `Sentinel-2 cloudless – https://s2maps.eu ...` wording. EOX's current licence page now prescribes the `EOxCloudless https://cloudless.eox.at ...` line above; use the current prescribed wording, and recheck it immediately before launch.

## Step-by-step implementation plan

1. **Get origin approval:** send EOX the layer/year, 45,913 count, intended concurrency, R2 redistribution, commercial-game context, and proposed attribution; retain their response.
2. **Validate source:** reread live capabilities/licence, manually fetch representative tiles, verify CORS/JPEG/256px, and run the 100-tile size/latency probe.
3. **Validate coverage:** make a test manifest and render automated screenshots at representative locations on phone/tablet/desktop portrait and landscape. Decide 3×3 versus 5×5 before the bulk run.
4. **Provision R2:** bucket, least-privilege credentials, custom domain, CORS, immutable cache rule, Smart Tiered Cache, monitoring, and budget alerts.
5. **Build the resumable fetch/upload script:** tile math, global dedupe, throttling/backoff, validation, checksums, checkpoints, dry-run, and manifest generation.
6. **Run a staging subset:** several dense cities plus remote islands, high latitude, desert, ocean-edge, and antimeridian cases. Exercise missing-tile and R2-outage behavior.
7. **Run the production fill:** two concurrent EOX requests by default; upload immutable versioned keys; reconcile all 45,913 expected objects.
8. **QA through CDN:** decode random samples, compare source/R2 checksums, inspect imagery, confirm headers/CORS/cache status, and test WebGL on Safari/iOS and Chromium/Android.
9. **Change and test the client:** swap only the provider URL/credit, add corpus-miss versus outage telemetry, verify Blue Marble/classic fallback, then deploy behind a feature flag or percentage rollout.
10. **Operate:** monitor CDN hit ratio, R2 Class B requests, 404/5xx rates, per-zoom misses, and EOX/licence changes. Keep the previous immutable version and reproducible manifest.

## Risks and open questions

| Risk / question | Impact | Mitigation / decision needed |
| --- | --- | --- |
| Does EOX approve a 46k-tile bulk mirror of its free endpoint? | Could block or throttle the initial fill despite CC BY permission. | Obtain written confirmation; offer the key list/AOI and low request rate; ask about a bulk package if preferred. |
| No published EOX rate limit or SLA | Runtime is uncertain; aggressive fetching could harm the service. | Default to two concurrent requests, back off, checkpoint, and budget one day. |
| 3×3 does not cover every possible 8×8 dynamic inset | 404 seams after panning or on wide views. | Device/viewport QA; constrain exploration or choose the exact 99,601-tile 5×5 option. |
| Storage estimate is modeled, not sampled | Actual capacity/bandwidth could differ. | Mandatory 100-tile stratified probe; update the manifest and forecast from measured bytes. |
| Location catalogue changes | New locations may have no detail tiles. | CI check that recomputes expected keys/diff; fill new keys before shipping new locations. |
| Low-zoom dedupe couples many locations to one object | A bad/missing tile affects many rounds. | Checksums, decode validation, known-tile probes, immutable versions. |
| Custom-domain cache can retain old objects/404s | Overwrites or late uploads may appear stale. | Immutable version paths; upload tiles before manifest/client; never overwrite a released version. |
| Hotlinking/bot scraping | Can raise request counts and evict useful cache entries. | WAF/rate limits and monitoring; referrer checks only as a weak signal, not an access-control guarantee. |
| R2/CDN outage | Detail disappears. | Local Blue Marble and classic fallback; retain old completed inset; no automatic traffic surge to EOX. |
| Attribution UI space | Required credit may be too long on mobile. | Short visible source label plus an immediately accessible, linked full credit near the map; legal review. |
| Licence or prescribed wording changes | Future deployment may become noncompliant. | Snapshot source/licence metadata per version and recheck EOX's controlling page before each release. |
| 2016 imagery age/visual quality | Some places have changed; mosaic artifacts/clouds may affect play. | Representative visual acceptance test; clearly identify imagery vintage; do not substitute 2018–2025 because those free layers are non-commercial. |
| Browser CORS/WebGL behavior | Valid images may fail to decode/upload. | Explicit bucket CORS and production-origin tests on Safari/iOS and Chromium/Android. |

## Go/no-go gates

Proceed only when all are true: EOX confirms the planned bulk access; the attribution presentation is accepted; the 100-tile probe validates the format and storage estimate; viewport QA chooses 3×3 or 5×5; every expected R2 object reconciles; and outage/missing-tile tests fall back cleanly without Esri traffic.
