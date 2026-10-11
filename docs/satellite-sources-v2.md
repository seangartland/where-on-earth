# Satellite tile sources v2: live-verification audit

Research date: 2026-10-10 (UTC). Target: a worldwide, label-free detail layer for a commercial game at Web-Mercator zooms 4–11, with no tile bill and with permission to redistribute/cache the pixels.

## Result

**No source is recommended by this audit.** The required live HTTP verification could not be completed because this workspace's outbound HTTP proxy was unavailable during the audit. Every real `curl` request failed before reaching the provider with HTTP code `000`; that is a local transport failure, not a provider response. Consequently, this document does not repeat the earlier, unverified EOX recommendation and does not call any candidate “working.”

The most promising data route on licensing and resolution is **self-rendered public-domain Landsat**, but it is a data pipeline, not a free hosted tile layer. NASA GIBS may be a useful low-resolution fallback, but no GIBS layer has been verified here to deliver genuine z11 photographic detail. OSM is not satellite and its public tile service does not grant a redistribution/bulk-download right. Mapbox requires a token and its hosted tiles are not freely redistributable.

This conclusion is deliberately narrower than “these sites are down.” A source can only move into the recommended column after the reproducible checks at the end of this file return real `200` responses and valid image bodies from a networked machine.

## HTTP test record

The exact command form used was:

```bash
curl -L --max-time 30 -sS -o /tmp/tile-check.bin \
  -D /tmp/tile-check.headers \
  -w 'status=%{http_code} type=%{content_type} bytes=%{size_download} final=%{url_effective}\n' \
  "$URL"
```

Representative requests actually attempted:

```text
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2025-07-01/GoogleMapsCompatible_Level9/9/170/256.jpg
status=000 bytes=0
curl: (7) Failed to connect to hatch-egress-proxy port 3128

https://tile.openstreetmap.org/11/1024/1024.png
status=000 bytes=0
curl: (7) Failed to connect to hatch-egress-proxy port 3128

https://landsatlook.usgs.gov/arcgis/rest/services/LandsatLook/ImageServer?f=json
status=000 bytes=0
curl: (7) Failed to connect to hatch-egress-proxy port 3128

https://landsatlook.usgs.gov/arcgis/rest/services/LandsatLook/ImageServer/exportImage?bbox=-8230000,4960000,-8210000,4980000&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&f=image
status=000 bytes=0
curl: (7) Failed to connect to hatch-egress-proxy port 3128

https://eox-s2maps.s3.amazonaws.com/?list-type=2&max-keys=1
status=000 bytes=0
curl: (7) Failed to connect to hatch-egress-proxy port 3128

https://api.mapbox.com/v4/mapbox.satellite/0/0/0.jpg90
status=000 bytes=0
curl: (7) Failed to connect to hatch-egress-proxy port 3128
```

The OSM request was retried three times and produced the same pre-HTTP failure. Direct DNS/network access with the proxy disabled also failed. There are therefore **no genuine `200` response headers to show**. Anything else would be invented evidence.

## Candidate findings

### 1. NASA GIBS

Documented REST WMTS form:

```text
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.{ext}
```

Attempted concrete tile (not verified because transport failed):

```text
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2025-07-01/GoogleMapsCompatible_Level9/9/170/256.jpg
```

- **HTTP result:** no provider response (`000`), so no working maximum was verified.
- **Documented ceiling:** the selected VIIRS true-colour matrix set name itself is Level 9. Blue Marble uses Level 8. A GIBS matrix-set ceiling is not evidence of native ground detail: VIIRS/MODIS imagery is hundreds of metres per pixel, so it does not meet the requested z11 detail even if a server resamples it.
- **Possible higher-resolution layer to retest:** historical Landsat WELD annual true-colour products should be investigated in the live capabilities catalogue. Do not use a guessed layer ID; first obtain capabilities, then request a non-empty z11/z12 tile and inspect it.
- **Licence:** NASA says NASA-led Earth science data are openly available and generally CC0 unless a dataset says otherwise; individual visualization metadata still has to be checked for third-party restrictions. NASA requests acknowledgement and prohibits implied endorsement. See [NASA Earthdata data-use policy](https://www.earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy) and [GIBS API access documentation](https://nasa-gibs.github.io/gibs-api-docs/access-basics/).
- **Fit:** not verified; known Blue Marble, MODIS, and VIIRS visual layers do not supply the desired z11 ground detail. No recommendation.

### 2. USGS Landsat on AWS / LandsatLook

There is no documented USGS/AWS global pre-rendered XYZ Landsat basemap. The cloud archive exposes analysis-ready source products (including Cloud Optimized GeoTIFFs and catalogue metadata), not a seamless `{z}/{x}/{y}` RGB pyramid. LandsatLook exposes a dynamic ArcGIS ImageServer; it is a viewer/export service, not evidence of permission to fan out or redistribute its rendered responses.

Endpoints attempted:

```text
Metadata:
https://landsatlook.usgs.gov/arcgis/rest/services/LandsatLook/ImageServer?f=json

Dynamic 256 px export:
https://landsatlook.usgs.gov/arcgis/rest/services/LandsatLook/ImageServer/exportImage?bbox=-8230000,4960000,-8210000,4980000&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&f=image
```

- **HTTP result:** no provider response (`000`); no maximum verified.
- **Resolution:** Landsat multispectral RGB is normally 30 m, enough source resolution for z11 (about 76 m/display pixel at the equator) if the game builds its own cloud-controlled mosaic and tile pyramid.
- **Licence:** USGS states Landsat data are public domain and may be used, transferred, or reproduced without copyright restriction; acknowledgement is requested. See [USGS Landsat public-domain FAQ](https://www.usgs.gov/faqs/are-landsat-data-cloud-still-considered-be-within-public-domain) and [USGS Landsat cloud access](https://www.usgs.gov/landsat-missions/landsat-commercial-cloud-data-access).
- **Fit:** legally suitable **source data**, but not a verified hosted tile provider. Viable only as a self-rendering/hosting project; do not treat LandsatLook as a free game CDN.

### 3. EOX Sentinel-2 `eox-s2maps` AWS bucket (Requester Pays)

This is the original EOX Sentinel-2 Cloudless archive, not the removed WMTS layer. Published descriptions identify source GeoTIFF tiles at pyramid levels z7–z13, rather than browser-ready 256 px XYZ JPEG/PNG tiles.

Discovery request attempted:

```text
https://eox-s2maps.s3.amazonaws.com/?list-type=2&max-keys=1
```

The operational download form requires AWS credentials and Requester Pays acknowledgement, for example:

```bash
aws s3 ls s3://eox-s2maps/ --request-payer requester
aws s3 cp s3://eox-s2maps/<verified-key> . --request-payer requester
```

- **HTTP result:** no provider response (`000`); neither object existence nor z13 was re-verified.
- **Cost:** **not free to download.** Requester Pays charges the requester's AWS account for S3 requests and data transfer. EOX described the complete archive as roughly 200 GB; the exact bill depends on bucket region, destination, current S3 request pricing, and transfer path. It fails Sean's zero-cost constraint unless AWS credits/free transfer happen to cover the actual job, which must not be assumed.
- **Licence:** EOX published the 2016 cloudless product under CC BY 4.0, which allows commercial use and redistribution with attribution. This license claim must be tied to the exact downloaded objects/version. See [EOX original-tile announcement](https://eox.at/2017/03/sentinel-2-cloudless-original-tiles-available/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and [AWS Requester Pays](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html).
- **Fit:** potentially licensable source imagery and adequate resolution, but not a free tile service, not zero-cost bulk data, and not live-verified. No recommendation.

### 4. OpenStreetMap standard tiles (non-satellite fallback)

Documented URL form:

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Attempted z11 tile:

```text
https://tile.openstreetmap.org/11/1024/1024.png
```

- **HTTP result:** no provider response (`000`); no maximum verified in this audit.
- **Licence/service rights:** OpenStreetMap database data are ODbL, but the standard rendered tiles have separate usage rules. The public tile policy requires attribution, valid identification/referrer and caching, and prohibits bulk download/prefetch/offline use. Availability is best effort. See the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and [copyright/attribution page](https://www.openstreetmap.org/copyright).
- **Fit:** not satellite; public `tile.openstreetmap.org` is not a redistributable tile source for a packaged/cacheable game layer. It can only be a live, policy-compliant fallback after a real HTTP test, and should not be depended on for commercial production traffic without another provider/self-hosting.

### 5. Mapbox Satellite

Legacy raster tile form:

```text
https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}{@2x}.{format}?access_token={token}
```

Attempted deliberately without a token:

```text
https://api.mapbox.com/v4/mapbox.satellite/0/0/0.jpg90
```

- **HTTP result:** no provider response (`000`). A valid account token is required for a meaningful `200` test, and none was supplied. Therefore no zoom was verified.
- **Free tier:** Mapbox advertises usage-based free allowances, but the allowance and billable unit vary by API/SDK and can change. “Free tier” is not a grant to redistribute tiles, and exceeding it can create a bill. Check the live [Mapbox pricing page](https://www.mapbox.com/pricing) for the exact integration.
- **Licence/service rights:** Mapbox-hosted imagery is proprietary service content. Its terms govern caching, use through Mapbox APIs/SDKs, and redistribution; it is not open imagery that can be copied into an independent public tile store. See [Mapbox service terms](https://www.mapbox.com/legal/tos) and [Mapbox Raster Tiles API](https://docs.mapbox.com/api/maps/raster-tiles/).
- **Fit:** fails the no-account/no-billing-risk and redistribution requirements. No recommendation even if a token later returns 200.

### 6. Other services checked conceptually

No additional global service was promoted to a candidate because none could satisfy all three gates—anonymous/free operation, commercial redistribution rights, and worldwide z11 satellite detail—without a live request:

- **Copernicus Data Space / Sentinel-2:** open source data and adequate 10 m resolution, but raw scenes require selection, cloud masking, mosaicking, tiling, and hosting. Processing APIs require registration/authentication and have quotas. This is another self-render route, not a verified free global XYZ layer. See the [Copernicus data legal notice](https://dataspace.copernicus.eu/terms-and-conditions) and [Sentinel-2 documentation](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html).
- **OpenAerialMap/HOT imagery:** coverage and licensing vary per item; it is not a seamless global satellite mosaic. A per-item licence check is mandatory, especially because non-commercial items can exist. See [HOT imagery usage](https://docs.imagery.hotosm.org/usage/using-imagery/) and [ingest schema](https://docs.imagery.hotosm.org/dev/ingest/schema/).
- **Esri World Imagery, Google satellite imagery, Bing imagery, MapTiler Satellite:** technically capable hosted mosaics, but not freely redistributable open imagery. They were not recommended and were not represented as verified.

## Max zoom verification table

“Not verified” means exactly that; documented or inferred values are not substituted for a successful tile request.

| Candidate | Actual HTTP result in this audit | Maximum zoom verified working | Commercial redistribution gate | Decision |
| --- | --- | ---: | --- | --- |
| NASA GIBS VIIRS true colour | `000`, local proxy failure | **Not verified** | Usually open/CC0; check layer metadata | Too coarse and unverified |
| USGS LandsatLook | `000`, local proxy failure | **Not verified** | Raw Landsat public domain; hosted-render reuse not established | Self-render only |
| EOX `eox-s2maps` S3 | `000`, local proxy failure | **Not verified** | 2016 product documented CC BY 4.0 | Requester Pays; not zero cost |
| OSM standard tiles | `000`, local proxy failure | **Not verified** | Public tile policy forbids bulk/offline use | Non-satellite fallback only; unverified |
| Mapbox Satellite | `000`, local proxy failure; no token | **Not verified** | Proprietary hosted service; no independent redistribution | Reject |
| Other global satellite tile service | None passed initial rights/access screen | **Not verified** | None established | No recommendation |

## Reproducible verification to run before choosing anything

Run from a host with working outbound HTTPS. A `200` alone is insufficient: also require an image content type, non-trivial byte count, successful image decoding, and a non-empty/non-placeholder tile. Test a land coordinate at every claimed upper zoom and one level above it. Save headers and SHA-256 hashes with the date.

```bash
set -euo pipefail
mkdir -p tile-audit

check_tile() {
  name=$1
  url=$2
  curl --fail-with-body --location --max-time 30 \
    --output "tile-audit/$name.body" \
    --dump-header "tile-audit/$name.headers" \
    --write-out "$name status=%{http_code} type=%{content_type} bytes=%{size_download} final=%{url_effective}\n" \
    "$url"
  file "tile-audit/$name.body"
  sha256sum "tile-audit/$name.body"
}

check_tile gibs-z9 \
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2025-07-01/GoogleMapsCompatible_Level9/9/170/256.jpg'
check_tile osm-z11 \
  'https://tile.openstreetmap.org/11/1024/1024.png'
```

For NASA, first download the live capabilities and derive layer IDs, formats, dates, and linked matrix sets rather than guessing:

```bash
curl --fail-with-body --location \
  --output tile-audit/gibs-capabilities.xml \
  --dump-header tile-audit/gibs-capabilities.headers \
  --write-out 'gibs-capabilities status=%{http_code} type=%{content_type} bytes=%{size_download}\n' \
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml'
```

The acceptance rule for this project should be: **no successful saved test artifact + no primary-source commercial redistribution permission = no recommendation.**
