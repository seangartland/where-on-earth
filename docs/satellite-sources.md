# Satellite imagery sources for detail tiles

Research date: 2026-10-10. Scope: a worldwide, label-free imagery layer for the game's detail window at Web Mercator zooms 4–11. This is research only; no provider integration was made.

## Decision

Use **EOX Sentinel-2 Cloudless 2016** for the detail layer if the visual product is acceptable after a small live test. It is the only researched option that is all of:

- global, seamless and cloud-reduced;
- 10 m Sentinel-2 imagery, served through a standard tile service beyond the required z11;
- usable in a commercial game and cacheable/redistributable through R2 under a clear open licence (CC BY 4.0), with visible attribution; and
- available without a key or account for direct WMTS/WMS integration.

Do **not** use EOX 2018–2025 free layers for this game: they are CC BY-NC-SA 4.0, so a monetised game, advertising, paid subscription, or otherwise commercial use is out of scope without EOX's commercial licence. Do not substitute the freely licensed underlying Sentinel data for the separately licensed EOX-rendered mosaic.

The recommended deployment policy is: use the 2016 WMTS layer directly at first; if R2 is used, cache only the tiles actually requested, preserve a source/licence record, and display this credit next to the map whenever imagery is visible:

> Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017)

CC BY 4.0 permits commercial reuse, copying, adaptation and redistribution with attribution. It does not give a trademark endorsement. The current EOX licence page is the controlling check before launch.

## What “zoom” means here

The following zoom figures are Web Mercator / XYZ-equivalent zooms, not a claim that every pixel carries new sensor detail. At the equator, z11 is about 76.4 m per display pixel; z14 is about 9.55 m. A 10 m Sentinel-2 mosaic therefore has useful native detail through about z14, whereas 30 m Landsat is already adequate for z11 but should not be magnified much past z12.

## Comparison

| Source | Coverage / imagery | Max usable zoom for this game | Interface and key | R2 cache / redistribute? | Reliability / recommendation |
| --- | --- | --- | --- | --- | --- |
| **EOX Sentinel-2 Cloudless 2016** | Global, cloud-reduced RGB, 10 m | z14 in EPSG:3857 (requirement z11 is comfortably within it) | WMTS/WMS; XYZ-like REST WMTS; no key | **Yes**, CC BY 4.0 with the prescribed attribution | Best free global detail option. Third-party service, no public uptime guarantee; cache sparingly and retain fallback. **Recommended.** |
| EOX Sentinel-2 Cloudless 2018–2025 | Same class of global 10 m mosaic, newer | z14 EPSG:3857 | WMTS/WMS; no key | Only for genuinely non-commercial use, CC BY-NC-SA 4.0; ShareAlike and attribution apply. **Not safe for this game.** | Good imagery, but licence rules it out unless EOX grants a commercial licence. |
| NASA GIBS | Global science visualizations: MODIS/VIIRS true colour, Blue Marble, land/ice/fire/aerosol/etc.; not a current 10 m photographic basemap | Matrix sets reach z13 / 19.1 m in Web Mercator, but a layer's own resolution controls its actual detail. Blue Marble ends at z8/611 m; many true-colour layers are 250–500 m (z9/z8). | WMTS REST/KVP, TWMS and WMS; no key | **Generally yes for NASA-led data** (normally CC0 unless labelled otherwise); confirm each layer's source/restriction and credit NASA. | Durable NASA operational service, but no published SLA. Excellent public-domain low-detail/base/fallback; **not a z4–11 photographic-detail replacement**. |
| USGS Landsat / LandsatLook | Global Landsat archive; natural-colour renderings from 30 m multispectral imagery | Native 30 m is useful through z11 and roughly z12 at the equator. LandsatLook ImageServer is dynamic rather than a documented pre-rendered XYZ pyramid, so it has no meaningful published XYZ maximum. | LandsatLook ArcGIS ImageServer (REST/WMS/export image) and STAC/COGs; no data key stated for public viewer endpoints | **Yes for Landsat data and self-rendered derived tiles**: public domain; acknowledge USGS. Do not assume the public LandsatLook rendering endpoint authorises bulk/proxy caching—self-host derived tiles instead. | Data archive is highly reliable; viewer/ImageServer is a browser/viewing service, not a CDN/SLA tile API. Viable only if we build and host a selected mosaic/pyramid. |
| Copernicus Sentinel-2 raw data via Copernicus Data Space | Global 10 m (RGB bands), but individual acquisitions/cloud selection rather than a ready global cloudless mosaic | Native 10 m: z14-ish, more than enough for z11 | STAC/COG/OData plus WMS/WMTS/processing services; account registration required; Sentinel Hub API uses OAuth token/client | **Yes for Sentinel data/derivatives** under the Copernicus legal notice, with required attribution/no-endorsement notice. It is data licensing, not a blanket permission to mirror a particular API service. | Official data source, but the application must choose scenes/cloud masking, render tiles and operate its own cache. Not a drop-in global basemap. |
| OpenAerialMap / HOTOSM Open Imagery Network | Patchy contributed aerial/UAV/satellite surveys; sometimes centimetre-scale, no global or current mosaic | Per item only; the global endpoint has coverage-grid z0–13 and real imagery at z14+, subject to each item's footprint/resolution | STAC search and TiTiler XYZ endpoints; no key advertised | **Per item only.** OAM's legacy terms say CC BY 4.0, while current ingest docs permit CC BY, CC BY-SA and CC BY-NC: inspect the item `properties.license` before caching or serving. | Community service, coverage holes and variable vintage/quality. Useful as an optional local enhancement, **not a primary game layer**. |
| USGS NAIP / National Map imagery | Excellent 0.3–1 m aerial imagery, but US-only (plus limited territories), not satellite/global | Source detail far exceeds z11; actual service/pyramid varies | National Map ArcGIS services / downloads; no general worldwide XYZ product | Generally public-domain US imagery, but inspect product metadata—some US Topo products contain third-party imagery/copyright notices. | Strong US supplement only; cannot solve global coverage. |
| MapTiler Satellite | Commercial global satellite/aerial product | Provider-dependent, well beyond z11 | API key/account; free quota | **No R2 shared cache/redistribution by default.** Cloud terms allow only a temporary personal cache for one end user and prohibit bulk download absent written agreement. | Polished paid fallback, but explicitly not an open replacement. |

## NASA findings

### GIBS is a real tile service, but it is not high-resolution satellite basemap coverage

NASA Global Imagery Browse Services (GIBS) serves pre-generated science visualisations from NASA EOSDIS. Its catalogue has more than 1,200 visualisations: daily/near-real-time MODIS and VIIRS true colour; Blue Marble; land surface, snow/ice, fires, atmosphere, ocean and vector/reference products. It offers WMTS (REST and KVP), tiled WMS and WMS in EPSG:4326, EPSG:3857 and polar projections. The REST form is:

```
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.{format}
```

That is close enough to XYZ to adapt directly, except it is WMTS row/column ordering and has layer, date and tile-matrix-set fields. No API key or Earthdata login is required for these public tile endpoints.

GIBS supports Web Mercator matrix sets through `GoogleMapsCompatible_Level13` (z13, 19.109 m/pixel at the equator); geographic products can use a 15.625 m set. This is a service ceiling, **not** a promise of 15 m imagery. Each layer advertises its own resolution. The existing Blue Marble Shaded Relief + Bathymetry layer is 500 m and stops at Web Mercator z8. Its MODIS/VIIRS true-colour imagery is typically 250–500 m. Therefore requesting z11–13 from GIBS is either impossible for such a layer or merely oversampling—not the desired high-resolution ground detail.

NASA says NASA-led mission data are CC0 unless marked with a restriction/licence. This makes a GIBS-derived R2 cache legally viable only after checking the selected layer's metadata/source, keeping attribution, and excluding any exceptional third-party/restricted layer. NASA asks that data be acknowledged and prohibits an implication of NASA endorsement.

**Other NASA services:** Worldview is the web client built on GIBS, not a separate imagery CDN. Earthdata Search/CMR, LP DAAC, VEDA and cloud holdings expose downloadable products/STAC/COGs and some project-specific map services; they are not a turnkey, global, pre-rendered 10 m XYZ basemap. In short: there is no NASA counterpart to Esri World Imagery for this use case. NASA is ideal for the public-domain z3 base and a low-detail fallback, not the detail source.

## USGS Landsat findings

Landsat Collection data are public domain regardless of whether USGS hosts them in the cloud; USGS says permission is not required and requests source acknowledgement. That authorises making a chosen composite into game tiles and storing/redistributing those derived tiles in R2. The source-resolution constraint is 30 m for normal visible RGB bands (some Landsat panchromatic data are 15 m, but that does not produce a straightforward global natural-colour tile layer).

USGS does provide a visual service: LandsatLook's underlying endpoint is `https://landsatlook.usgs.gov/arcgis/rest/services/LandsatLook/ImageServer`, with ArcGIS REST/ImageServer operations and WMS. It is a dynamic image service for archive exploration, configurable scene selection and image export—not a documented fixed, pre-rendered `{z}/{x}/{y}` service. The official STAC service is for catalogue/data access, likewise not raster XYZ tiles.

So the answer to “pre-rendered tile service?” is **not a supported global XYZ offering**. It is possible to request images through the ImageServer/WMS, but that is the wrong operational dependency for a game's tile fan-out. If Landsat is selected, choose a date/composite, create a tile pyramid under our control, and serve it from R2. That is legally sound and has predictable availability, but it is a data-processing project and will look materially softer than EOX Sentinel-2 in the game's close view.

## Sentinel-2 licence distinction (important)

There are two separate things:

1. **Raw Copernicus Sentinel data.** The EU's Copernicus data policy is free, full and open. The legal notice permits reproduction, distribution, public communication, adaptation and combination. Attribute the source where practicable, do not imply EU/ESA endorsement, and carry any applicable notices. Copernicus Data Space requires registration for access and its Sentinel Hub APIs require OAuth. It is lawful to build and redistribute an R2 tile cache made from the data, but the team would own the scene-selection/compositing/tiling infrastructure.
2. **EOX's rendered Sentinel-2 Cloudless product.** It adds a carefully made global cloudless mosaic and has its own licence. EOX currently states: **2016 is CC BY 4.0**; **2018–2025 is CC BY-NC-SA 4.0**. The latter cannot be used in a commercial game. CC BY 4.0 2016 can be placed behind R2/CDN and redistributed, provided the attribution and licence information travel with the use. It is the practical option.

EOX exposes standards-based WMTS and WMS, not a proprietary API. Its published Web Mercator tile pyramid runs z0–14 and its capability URL is `https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml`. A representative REST-shaped request is:

```
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2016_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg
```

Read the live capabilities before implementation—layer IDs, matrix-set spelling, CORS behaviour and formats are service configuration, not licence promises. EOX invites direct WMS/WMTS integration, but publishes no free-tier SLA. Treat it as a best-effort external origin: HTTP cache, rate-limit concurrent requests, keep Blue Marble as fallback, and do not bulk-prefetch the globe.

## OpenAerialMap findings

OpenAerialMap (OAM) is a discovery and delivery service for open imagery contributed to the Open Imagery Network. It is not a satellite operator or a world mosaic. Coverage is uneven, project-driven and often post-disaster/humanitarian; its strength is occasional very-high-resolution orthophotos, not universal availability.

The current HOTOSM imagery service provides:

- a global coverage grid at `https://global.imagery.hotosm.org/{z}/{x}/{y}.png` (z0–13 is only image-count coverage; z14+ redirects to imagery);
- STAC search at `https://api.imagery.hotosm.org/stac/search`; and
- per-item or selected-mosaic raster tiles using `.../tiles/WebMercatorQuad/{z}/{x}/{y}?assets=visual`.

OAM's public legal page describes contributed imagery as CC BY 4.0 with Open Imagery Network attribution. However, the current ingest schema explicitly allows CC BY 4.0, CC BY-SA 4.0 and CC BY-NC 4.0. Therefore an implementation must read the selected STAC item's licence and provider metadata; never cache/redistribute on the assumption that every catalogue item is commercial-safe. This variability, plus missing coverage, rules it out as the default detail source.

## Operational guidance

- **Safe for an R2 public cache:** NASA layers whose individual metadata has no restriction (normally CC0); USGS Landsat/NAIP data and tiles the team renders; raw Copernicus/Sentinel-derived tiles with required attribution; EOX Cloudless 2016 under CC BY 4.0; and OAM items only when their individual licence permits the intended use.
- **Not safe for this game without a paid/written licence:** EOX Cloudless 2018–2025 (NC); MapTiler-hosted tiles (shared cache prohibited by its cloud terms); Esri World Imagery under its service terms; and an OAM item marked NC or otherwise restricted.
- **No registration/key:** GIBS WMTS/WMS, EOX public WMTS/WMS, OAM public STAC/tile endpoints, and public USGS data/viewer endpoints. This does not mean an origin is an unlimited free CDN.
- **Registration/key:** Copernicus Data Space account; Sentinel Hub OAuth client/token for its APIs. MapTiler requires an API key/account.
- **Reliability:** no researched free external service promises a game-grade SLA. R2 has two benefits here: it reduces third-party load and makes repeat views resilient. It must be a lawful cache of a source above, not an excuse to bulk-scrape an endpoint.

## Sources consulted

- [NASA GIBS: access basics and REST/KVP WMTS patterns](https://nasa-gibs.github.io/gibs-api-docs/access-basics/), [matrix-set resolutions](https://nasa-gibs.github.io/gibs-api-docs/access-advanced-topics/), and [visualisation catalogue](https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/).
- [NASA Earthdata data-use policy](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy).
- [USGS: Landsat remains public domain in the cloud](https://www.usgs.gov/faqs/are-landsat-data-cloud-still-considered-be-within-public-domain), [LandsatLook service description](https://www.arcgis.com/sharing/rest/content/items/61a7eb3f37344191914ecdde6db8a038/info/metadata/metadata.xml?format=default&output=html), and [LandsatLook STAC](https://www.usgs.gov/landsat-missions/spatiotemporal-asset-catalog-stac).
- [Copernicus Data Space terms](https://dataspace.copernicus.eu/terms-and-conditions), [official Copernicus FAQ on reuse rights](https://www.copernicus.eu/en/faq), and [Sentinel Hub authentication](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html).
- [EOX licence terms](https://cloudless.eox.at/license-non-commercial), [EOX pricing/direct-integration statement](https://cloudless.eox.at/pricing), [EOX viewing-product zoom specification](https://cloudless.eox.at/products/viewing), and [WMTS documentation](https://cloudless.eox.at/documentation/usage).
- [OpenAerialMap legal terms](https://openaerialmap.org/legal/), [current HOTOSM tile usage](https://docs.imagery.hotosm.org/usage/using-imagery/), and [current OAM ingest licence field](https://docs.imagery.hotosm.org/dev/ingest/schema/).
- [MapTiler Cloud terms/cache restriction](https://www.maptiler.com/terms/cloud/).
