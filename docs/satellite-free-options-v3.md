# Free satellite tile options — round 3

Research date: **2026-10-10 UTC**. Intended use: a paid-subscription game needing worldwide satellite/aerial raster tiles at Web Mercator zooms 4–11.

## Bottom line

**No provider can be marked verified in this environment.** The outbound `curl` proxy is unavailable. Every tile request below failed before reaching the provider with:

```text
curl: (7) Failed to connect to hatch-egress-proxy port 3128: Couldn't connect to server
status=000
```

Consequently this report contains **no claimed HTTP 200 result** and recommends no provider as production-ready yet. Documentation was reachable through the research/browser service, but that is not a substitute for the required `curl` test.

Subject to a successful keyed `curl` retest, **Esri ArcGIS Location Platform World Imagery is the leading choice**: its current official pricing explicitly includes 2,000,000 basemap tiles/month free, satellite imagery is included, commercial application use is supported under the platform agreement, and a developer can create an account and API key self-service without talking to sales. **TomTom Satellite is the second candidate** at 200,000 Raster Tile requests/month free and self-service signup. Mapbox is technically suitable but has a smaller 750,000-tile allowance and only temporary caching.

## Comparison

“Verified max zoom” means a real image response received by `curl` during this audit, not a documented maximum. Because the proxy failed, every entry is unverified.

| Provider / product | Exact free quota | z4–z11 / max zoom | Commercial-use finding | URL format actually attempted | Live result | Decision |
| --- | ---: | --- | --- | --- | --- | --- |
| **Esri ArcGIS Location Platform — World Imagery** | **2,000,000 basemap tile requests/month**, then $0.15/1,000 | Docs describe global basemap tiles; World Imagery supports well beyond z11. **Verified max: none** | Platform is offered for applications, including commercial apps, subject to the ArcGIS Location Platform Agreement and mandatory Esri/data attribution. Do not bulk copy or redistribute tiles outside the service terms. | `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={API_KEY}`; also tested legacy `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | `000` (proxy failure) at z4 and z11 | **Best candidate; not verified** |
| **Mapbox Satellite — Raster Tiles API** | **750,000 raster tile requests/month**, then $0.25/1,000 through 2M | Global through z16; regional z18 and selected z21+. **Verified max: none** | Commercial Application License applies; attribution required. Imagery must remain within Mapbox services/platforms. Local performance caching is allowed for **no more than 30 days**; not suitable for permanent/offline tile harvesting. | `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg?access_token={TOKEN}` | `000` (proxy failure); no token was available | Viable hosted option after keyed test; caching restriction is significant |
| **Stadia Maps Satellite** | Free plan: **200,000 credits/month**, but satellite costs 4 credits/tile and is not included; therefore **0 commercial satellite tiles/month** | Stadia documents satellite coverage to z18. **Verified max: none** | **Fails.** Free plan prohibits commercial use. Satellite is available only on the $80/month Standard plan (7.5M credits, effectively up to 1.875M satellite tiles if used for nothing else). | `https://tiles.stadiamaps.com/tiles/stadia_satellite/{z}/{x}/{y}.jpg` | `000` (proxy failure) | Reject |
| **Thunderforest** | Hobby plan: **150,000 tile requests/month** | Published raster maps reach high zooms, but **there is no satellite/imagery style**. **Verified max: none** | The service has commercial paid plans, but the free “Hobby Project” offer is not evidence of a commercial satellite license—and no satellite product exists. | `https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey={API_KEY}` (Atlas was used only to probe reachability) | `000` (proxy failure) | Reject: no satellite product |
| **CARTO Basemaps** | **1,000,000 requests/month for commercial use** (5M for non-commercial) | Raster styles document z0–20. **Verified max: none** | Commercial use is explicitly allowed within 1M requests/month with attribution and terms; however the available Voyager, Positron and Dark Matter basemaps are OSM-derived cartography, **not satellite imagery**. | `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key={KEY}` | `000` (proxy failure) | Reject: no satellite product |
| **TomTom Maps Raster Satellite Tile API** | **200,000 Raster Tile API requests/month free** under the current pricing page; no credit card required | Satellite API documents z0–19, so it covers z4–z11. **Verified max: none** | TomTom’s Map Display product page explicitly says the freemium offer is OK for commercial applications. Current pricing has changed from the older 50k/day offer to 200k/month, so use the current pricing page for quota. Attribution and product terms apply; caching/offline rights require separate review before prefetching. | `https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key={API_KEY}` | `000` (proxy failure); no key was available | **Second candidate; not verified** |
| **NASA GIBS VIIRS true colour** | No metered monthly quota is published; public API access is free, subject to fair-use/availability policies | Selected layer’s matrix set ends at z9; it does **not** provide actual z11 detail. **Verified max: none** | NASA-led Earth science data are generally open/CC0, but layer metadata and third-party notices control. Commercial reuse is generally possible with acknowledgement and no implied endorsement. | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | `000` (proxy failure) | Reject: does not meet z11 detail |
| **MapTiler Satellite** | Free plan: 100,000 API requests/month, but **commercial production quota is 0** | Satellite is offered and technically covers the requested zooms. **Verified max: none** | Free plan is limited to personal/non-commercial use and R&D for commercial products. Production commercial use requires Flex ($30/month) or another paid arrangement. | Not curled separately; proxy failure was already universal | Not tested after universal proxy failure | Reject |

## Evidence and provider-specific answers

### 1. Esri: the 2M claim is real, and signup is self-service

Esri’s current [ArcGIS Location Platform pricing](https://developers.arcgis.com/pricing/) says basemap tiles—including satellite imagery—receive **2M free tile requests per month**, then cost $0.15 per 1,000. The [Basemap Styles service documentation](https://developers.arcgis.com/documentation/mapping-apis-and-services/maps/services/basemap-layer-service/) repeats the 2M allowance, and the [service-data page](https://developers.arcgis.com/rest/basemap-styles/service-data/) publishes the authenticated World Imagery URL. Esri requires basemap and data attribution.

An API key does not require a sales conversation. Esri provides a [free ArcGIS Location Platform account](https://developers.arcgis.com/documentation/security-and-authentication/get-started/) and a self-service [Create an API key tutorial](https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/tutorials/create-an-api-key/location-platform/). A key may be embedded in a public application and can be restricted by referrer and privileges. The free allowance is a usage tier, not an unlimited grant: usage above it can be billed if pay-as-you-go is enabled.

The new authenticated URL should be tested with a real key before integration. The old anonymous `server.arcgisonline.com` World Imagery URL was also attempted, but even that could not traverse the local proxy. Do not assume the anonymous legacy endpoint inherits the Location Platform 2M contractual tier.

### 2. Mapbox: 750k raster tiles, commercial hosted use, temporary cache only

The current [Mapbox pricing page](https://www.mapbox.com/pricing) gives the Raster Tiles API **750,000 free requests/month**. The [Mapbox Satellite reference](https://docs.mapbox.com/data/tilesets/reference/mapbox-satellite/) supplies the URL format and documents global coverage to z16. A payment method is required to unlock the Raster Tiles API after signup/trial; no sales call is required.

Mapbox permits use in commercial applications under its service terms, with attribution. It does **not** license the imagery as freely redistributable data. Mapbox’s [satellite imagery usage page](https://www.mapbox.com/imagery) says imagery can be cached locally for performance for at most **30 days** and is otherwise available only through Mapbox services/platforms. Thus normal HTTP/client caching is possible; permanent caching, bulk download, an independent tile store, and indefinite offline use are not.

### 3. Stadia Maps: no qualifying free satellite tier

The [Stadia Maps pricing page](https://stadiamaps.com/pricing) gives the free plan 200,000 credits/month, says **commercial use is not allowed**, and reserves satellite for the Standard plan. Satellite costs four credits per tile. The [service limits](https://docs.stadiamaps.com/limits/) and [FAQ](https://stadiamaps.com/faqs/) confirm that a revenue-generating product requires a paid subscription. This fails two requirements independently.

### 4. Thunderforest: free quota, but no satellite

Thunderforest’s [pricing page](https://www.thunderforest.com/pricing/) lists 150,000 tile requests/month for the free Hobby Project plan. Its complete [maps catalog](https://www.thunderforest.com/maps/) lists Cycle, Transport, Landscape, Outdoors, Atlas and other OSM/cartographic styles, but no satellite or aerial imagery. Therefore the quota is irrelevant to this requirement.

### 5. CARTO: commercial free quota, but no satellite

The current [CARTO Basemaps page](https://carto.com/basemaps/) explicitly allows 1M requests/month free for commercial use. It offers only Voyager, Positron and Dark Matter families based on OpenStreetMap data. CARTO can display third-party basemaps in its platform, but that does not turn CARTO into a satellite imagery provider or supply a satellite quota.

### 6. Other candidates

**TomTom is the only additional hosted candidate found that plausibly satisfies the policy and zoom gates.** The current [TomTom pricing page](https://docs.tomtom.com/pricing) lists 200K free monthly Raster Tile API requests and no-card self-service signup. The [Satellite Tile API](https://docs.tomtom.com/map-display-api/documentation/tomtom-maps/v1/raster/satellite-tile) documents Maxar imagery, JPEG tiles, and z0–19. The product page says freemium use is OK for commercial applications. It still cannot pass this audit until a real key returns an image with `curl`; permanent cache/prefetch rights also need confirmation from TomTom for the intended architecture.

**Google Maps Platform** is not an arbitrary XYZ satellite tile source and its terms restrict caching, extraction, and use outside Google maps. Its map-load pricing cannot be compared as a free tile quota, so it is not a candidate for this tile-layer requirement.

**MapTiler** has satellite imagery and a 100K-request free plan, but its [pricing](https://www.maptiler.com/cloud/pricing/) and [Cloud terms](https://www.maptiler.com/terms/cloud/) restrict the free plan to testing, personal/non-commercial use, or R&D for commercial products—not commercial production.

**NASA GIBS** is free/open and useful for small-scale, date-specific Earth observation, but the common true-colour VIIRS layer uses `GoogleMapsCompatible_Level9`. It neither provides genuine z11 detail nor a commercial high-resolution seamless basemap comparable to Esri/Mapbox/TomTom.

Open Landsat/Sentinel source data remains legally attractive for a self-rendered layer, but it is not a ready hosted tile service: cloud masking, mosaicking, tiling, storage and CDN delivery would be this project’s responsibility and would not be cost-free in production.

## Reproducible `curl` record

The audit used this shape (bodies and headers were directed to `/tmp`):

```bash
curl -L --max-time 30 -sS \
  -o /tmp/provider.body -D /tmp/provider.headers \
  -w 'status=%{http_code} type=%{content_type} bytes=%{size_download} final=%{url_effective}\n' \
  "$URL"
```

Concrete z11 probes included:

```text
Esri legacy: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/11/770/603
Esri keyed:  https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/11/770/603?token=API_KEY
Mapbox:      https://api.mapbox.com/v4/mapbox.satellite/11/603/770.jpg?access_token=TOKEN
TomTom:      https://api.tomtom.com/map/1/tile/sat/main/11/603/770.jpg?key=API_KEY
Stadia:      https://tiles.stadiamaps.com/tiles/stadia_satellite/11/603/770.jpg
Thunderforest Atlas reachability probe: https://tile.thunderforest.com/atlas/11/603/770.png?apikey=API_KEY
CARTO non-satellite probe: https://basemaps.cartocdn.com/rastertiles/voyager/11/603/770.png?key=KEY
```

All produced the same local transport result: `status=000`, zero bytes, proxy connection refused. Requests without credentials were intended only to test network reachability; even with a working network, a `401`/`403` would not verify the product.

## Recommendation and acceptance test

1. **Create an ArcGIS Location Platform account and API key through the self-service portal.** No sales contact is needed. Restrict the key to the game’s production origins and only the required basemap privilege.
2. From a host with functioning outbound HTTPS, request representative land tiles at **every zoom from 4 through 11** through the authenticated imagery endpoint. Require HTTP 200, `image/*`, non-trivial bytes, successful decoding, and visually non-placeholder imagery. Save dated headers and hashes.
3. Confirm the exact imagery style endpoint in the live Esri dashboard/docs and render the required Esri plus dynamic data-source attribution in the game.
4. If Esri fails the keyed test or its cache terms conflict with the game, run the same keyed test against **TomTom**. Use **Mapbox** only if its 30-day cache limit is acceptable.

Until step 2 succeeds, the honest selection is: **no verified free commercial satellite provider yet; Esri is the strongest documented candidate, not a verified result.**
