# EOX Sentinel-2: bulk use and one-source base layer

Research date: 2026-10-10. Scope: the public EOX Sentinel-2 Cloudless **2016** layer (`s2cloudless_3857`), not the newer annual mosaics.

## Short answer

- **Yes, EOX 2016 can be the one visual source from z0 through the game's z11.** The public Web-Mercator service advertises z0–z13, so it covers both the proposed globe/base range (z0–z3) and the detail range (z4–z11). Use the same 2016 mosaic at every zoom for the least jarring transition.
- **Do not do an unbounded, unauthorised WMTS crawl.** The *data* is CC BY 4.0, so copying, adapting and redistributing it with proper attribution is allowed, including commercially. But EOX's *service* terms prohibit abuse/excessive request volume at EOX's discretion. Public and legal does not make their free tile origin an unlimited bulk-export API.
- **Recommended:** use EOX 2016 live/on-demand with a small, concurrency-limited cache of player-requested tiles; build the z0–z3 base once from its low-zoom tiles (or simply request those tiles normally); and ask EOX for a bulk/offline product before any whole-world prefetch. Keep attribution visible.

## Question 1 — bulk downloading without asking

### What the published terms and licence actually say

There are two different permissions. They should not be conflated.

1. **The 2016 imagery licence.** EOX describes the 2016 layer as **CC BY 4.0**. Its 2017 announcement says, “everyone is allowed and encouraged to use the layer as he/she sees fit” provided the required attribution is given. Its later documentation says users may “modify and enhance” and “redistribute modified or unmodified imagery as part of [their] work,” subject to attribution. CC BY 4.0 therefore permits copying, derivatives, redistribution and commercial use; it does not grant trademark endorsement or let us remove the credit. This is why 2016 is materially different from EOX's 2018–2025 free layers, which are CC BY-NC-SA.

2. **The EOX service terms.** The operative risk is load on EOX's servers, not a ban on possessing the CC-BY pixels. EOX's published Service Terms say:

   > “A violation of the foregoing, abuse (in particular through unlawful use), **excessively frequent requests of**, or uploads to, the EOX Service, or any other use of the EOX Service that in the Service Provider's judgment threatens the security, integrity, or availability of the EOX Service may result in the temporary or permanent suspension of the user account, in individual cases, it may also entitle the Service Provider to claim for damages.”

   The same terms say EOX “will determine unlawful, abusive, excessive, or otherwise inappropriate usage” in its sole discretion. The terms are written primarily for account-based EOX Services; the public WMTS is anonymous. That does **not** make a high-volume anonymous crawler safe: EOX can throttle/block its IPs, change the endpoint, or object to activity that threatens availability. EOX's current product page specifically invites customers to contact `cloudless@eox.at` for “bulk delivery options.”

   EOX's old 2017 launch post is unusually permissive: it explicitly says rendered WMTS/WMS tiles or source GeoTIFFs may be downloaded and asks users to get in touch if they need anything else. That is permission to obtain the data, not a published promise that a free WMTS endpoint will carry a planet-wide crawler at any chosen rate forever.

### Is there a documented numeric rate limit?

**No public numeric WMTS rate limit was found.** The WMTS capabilities and public documentation describe endpoints and tile matrix sets, but do not publish requests/second, tiles/day, a fair-use quota, or a public-service SLA. Absence of a number is not approval for unlimited traffic.

One EOX subscription page advertises capacity of **at least 8,000 WMTS/WMS requests of 256×256 pixels per minute** (about 133/s) for a paid, named service with an SLA. That is a capacity/SLA statement, **not** a free-WMTS allowance or a safe crawler target. Do not turn it into a client limit.

### Do people actually automate/download it?

Yes, routine programmatic and offline use is visible, but that is not evidence of EOX approval for a full-origin scrape:

- EOX itself published the original 2016 GeoTIFF tiles in the `eox-s2maps` AWS bucket as **Requester Pays**. Its original pyramid has z7–z13 source GeoTIFFs. That is the provider's intended bulk/offline path; the requester, rather than EOX, pays S3 transfer/request costs.
- [`txvvgnx/sentinel-downloader`](https://github.com/txvvgnx/sentinel-downloader) is an open-source downloader/converter for that EOX S3 bucket. It estimates a full 2016 set at roughly 200 GB and explicitly warns that Requester Pays may cost money.
- A 2026 GIS Stack Exchange answer demonstrates GDAL reading the public EOX WMTS into COGs and warns that larger zooms take longer and may error, recommending smaller extents. That is a real public example of WMTS automation.
- Mobile Atlas Creator users have posted z0–z14 EOX tile-source configurations for offline atlases. OSM tooling lists the imagery as a selectable background source, and public applications use the direct tile template.

The practical conclusion is: **automated, bounded requests and offline copies are common; a whole-world WMTS harvest is not a documented free-service workflow.** No source found says “bulk-download the entire public WMTS without asking at any rate.”

### Reply to “If it’s available on the internet, why not just download it?”

Because availability answers neither question that matters:

| Question | Answer for EOX 2016 |
| --- | --- |
| May we use/copy the imagery? | Generally yes, under CC BY 4.0, with the required attribution and licence compliance. |
| May we make arbitrary load on EOX's free origin? | No published blanket permission or quota. Its Service Terms expressly call out excessively frequent requests and give EOX discretion. |

The realistic risk is not that a small map cache leads to a lawsuit. It is that a bulk job behaves like abuse: IP/CDN blocking, `429`/`5xx` failures, an incomplete/corrupt pyramid, service changes, an angry provider, and a dependency that can vanish before launch. At extreme scale, EOX's terms also reserve a damages claim. The game then has an operational and reputational problem even though the resulting CC-BY pixels are reusable.

For scale: a complete Web-Mercator z0–z11 pyramid is about **5.6 million tiles** (sum of `4^z`), before retries and outside the useful polar/empty regions. At even 10 requests/sec that is roughly 6.5 days of continuous traffic; at 100 requests/sec it is still about 15.5 hours. That is plainly not comparable to normal player demand. Fetching only z0–z3 is just **85 tiles**; a player-driven cache has a fundamentally different load profile.

## Question 2 — one source from base to detail

### Does EOX 2016 reach z0, and is it suitable through z11?

**Yes.** The current public entry for EOX's `s2cloudless_3857` service reports **minimum zoom 0 and maximum zoom 13**, Web Mercator / 256-pixel tiles. z11 is therefore two native pyramid levels below the public maximum. The provider's original 2016 source GeoTIFF archive is z7–z13; the lower web tiles are the normal downsampled pyramid, which is exactly what a global overview needs.

Use the live capabilities document as the final implementation authority, because service layer IDs and matrix-set aliases can change. At research time, the documented REST-shaped template is:

```
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg
```

Some installations use the `g` matrix-set alias instead of `GoogleMapsCompatible`; read `WMTSCapabilities.xml` rather than hard-code this research note.

### Will it look consistent across zooms?

**As consistent as a raster pyramid can be: yes.** All levels are views of the same EOX 2016 cloud-reduced natural-colour mosaic, instead of a NASA Blue Marble overview snapping to a separately colour-graded Esri mosaic. There will still be normal low-zoom resampling, JPEG compression, seasonal/scene differences within the EOX global mosaic, ocean/polar limits of Web Mercator, and no new sensor detail below z13. Those are inherent to the single dataset; they are much less conspicuous than switching providers at z4.

EOX's own description says the product was made as a “pure visual product” for mapping backgrounds and uses pixel-by-pixel cloud selection. It uses different acquisition windows by hemisphere (northern May–September 2016, southern November 2016–March 2017, tropical May 2016–April 2017), so do not promise that every continent has one season. But those choices are baked into every zoom level.

### Can we make a base texture ourselves?

**Yes, and it is a good way to eliminate runtime dependence for z0–z3.** Download the small low-zoom set once, mosaic/reproject it into the globe texture, and downsample with a high-quality filter. It remains a derivative of the CC-BY imagery: preserve the attribution in the game and record the source/licence in project metadata.

Important projection detail:

- For a conventional **2:1 equirectangular globe texture** (for example, 2048×1024), compose/reproject from EOX's WGS84 geographic matrix set, or reproject the Web-Mercator tiles first. In the usual WGS84 256-pixel matrix, geographic z2 is 8×4 tiles (2048×1024); z3 is 16×8 (4096×2048) and can be downsampled for cleaner filtering. Confirm the advertised matrix dimensions before building.
- Do **not** glue Web-Mercator z3 tiles straight into a 2048×2048 image and wrap it around a sphere. Mercator's latitude stretch will visibly distort the globe and it ends around ±85.05°, leaving polar handling to the renderer/source. A 2048-pixel-wide texture is more than adequate for the game's low-zoom overview; take z3 (or z4 and downsample) for better anti-aliasing.
- If the existing globe intentionally uses a Web-Mercator atlas/crop rather than an equirectangular sphere texture, retain that projection convention; the key is that the imagery should still be EOX 2016.

This offline base is a **small, bounded acquisition** (85 Web-Mercator tiles through z3, or 32 geographic z2 tiles for a 2048×1024 plate-carrée composition), not a bulk detail scrape.

### Other single-source choices

| Option | Covers a global z0–z11 visual pyramid? | Practical verdict |
| --- | --- | --- |
| **EOX Sentinel-2 Cloudless 2016** | Yes, public z0–z13. | Best fit: one mosaic, commercial CC BY 4.0, attribution required. Respect origin load or acquire an offline/bulk product. |
| EOX Cloudless 2018–2025 | Technically yes (check current capabilities per layer). | Same one-source visual strategy, but the free data is CC BY-NC-SA 4.0. Not suitable for a commercial/monetised game without EOX's commercial licence. |
| Esri World Imagery | Yes, high zooms. | One provider, but not one homogeneous annual mosaic: it is a global compilation of different imagery/resolutions/vintages. Its service terms and caching rules are a separate commercial-contract question, so it is not a drop-in bulk source. |
| MapTiler/Mapbox/other commercial satellite tiles | Usually yes. | Technically good, but require a key/plan and normally prohibit shared bulk caches/redistribution without a licence. Still a provider mosaic, not necessarily one date/look. |
| NASA Blue Marble/GIBS | Base-level only. | Good public-domain-style overview/fallback, but it cannot supply 10 m-looking z11 detail. Mixing it with another provider recreates the current visual jump. |
| Raw Copernicus Sentinel-2, self-mosaicked | Yes, if we build it. | Legally/open-data viable, but scene selection, cloud masking, colour balancing, tiling and hosting become our project. It is not a ready-made one-source service. |

## Recommendation

Use **EOX Sentinel-2 Cloudless 2016 as the single visual source for z0–z11**. It directly solves the Blue Marble → Esri mismatch and has enough native/source detail for the requested close range.

1. Bake a 2048×1024 equirectangular base from the low-zoom EOX geographic tiles (prefer z3/z4 → downsample) and use it for the globe/z0–z3. Preserve poles/projection correctly.
2. Use the same EOX 2016 WMTS for z4–z11, with a low-concurrency, retrying, player-demand cache. Do not schedule a full-pyramid prefetch.
3. Show the required, visible credit wherever imagery appears: **“Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)”**. Retain CC BY 4.0/source information in the shipped credits/provenance.
4. Before a large offline cache or launch-scale traffic, email EOX (`cloudless@eox.at`) with the tile count/area, intended caching and commercial use. Ask for a bulk delivery, MBTiles/GeoPackage/MapCache product, or written rate guidance. Their current site explicitly offers custom data formatting and bulk delivery.

This gets Sean the consistent visual system without treating a friendly public WMTS endpoint as an unmetered CDN.

## Sources

- [EOX 2016 launch / licence and direct WMTS/WMS-download statement](https://new.eox.at/2017/08/sentinel-2-global-cloudless-mosaic/); [2016 source GeoTIFF archive, Requester Pays, and z7–z13](https://eox.at/2017/03/sentinel-2-cloudless-original-tiles-available/).
- [EOX Service Terms and Conditions](https://eox.at/service-terms-and-conditions/) — quoted excessive-request, suspension and damages language.
- [EOxCloudless licence summary](https://cloudless.eox.at/documentation/license) and [pricing / custom bulk-delivery statement](https://cloudless.eox.at/pricing).
- [EOX WMTS usage documentation](https://cloudless.eox.at/documentation/usage) and [current WMTS capabilities](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml).
- [Current EOX 2016 `s2cloudless_3857` zoom record (z0–z13)](https://qms.nextgis.com/geoservices/2173).
- [Public EOX S3 downloader example](https://github.com/txvvgnx/sentinel-downloader), [GDAL/WMTS automation example](https://gis.stackexchange.com/questions/500272/world-satellite-map-with-qgis-in-an-offline-computer), and [offline-atlas discussion](https://sourceforge.net/p/mobac/forum/map_sources/thread/996d15cd03/).
- [EOX 2018 licensing distinction](https://eox.at/2019/02/sentinel-2-cloudless-2018/); [EOX 2024 page on current free WMTS/WMS and commercial licensing](https://eox.at/2025/03/sentinel-2-cloudless-2024/).
