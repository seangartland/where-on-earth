# EOX independence plan: report

Opus 5.5 (Claude Code), 2026-10-17. I did the research and wrote the plan
myself in this session, without delegating. No code was changed. The plan is in
`docs/eox-independence-plan.md`.

## Method

I worked in three passes. First, I checked the brief's stated facts against the
repo, git history, the gitignored harvest folder in `../demo/.harvest-2025/`,
Sean's dated memory notes, and the live site. Second, I built the inventory by
grepping for EOX, Sentinel and credit strings, reading the satellite section of
`src/globe/surface.js` (lines 490 to 1000), `deploy.sh`, `vercel.json` and the
EOX-related docs, then confirming each production claim with live HTTP requests.
Third, I read the licence and product pages for every option directly, using
`curl` with an HTML-to-text filter, a PDF text extractor for the Copernicus legal
notice, and EOX's and Copernicus's public STAC catalogues. WebSearch was not
permitted in this session, so every source was a URL I already knew or found by
following links and sitemaps.

## What I measured

- **Tile manifest.** The 2025 manifest holds 10,947 tiles (z4 210, z5 587, z6 1,371, z7 2,981, z8 5,798). `done.txt` has 10,947 unique lines. The harvest log shows six resumed runs between 2026-10-10 and 2026-10-11.
- **R2 contents.** 60 randomly sampled manifest tiles all returned 200, with a mean size of 10.9 KB, which projects to about 122 MB for the set. That total is an extrapolation from the sample. Tiles at z0 to z3 return 404. Tile `4/8/5` on R2 is byte-identical to EOX's 2025 WMTS tile.
- **Base texture vintage.** I reprojected a 4 by 5 block of z4 tiles from three EOX layers onto the base texture's equirectangular grid and compared pixels. The mean absolute difference was 1.8 for the 2025 layer, 4.5 for 2024 and 20.4 for 2016, so the shipped base is 2025 imagery. The live base file is byte-identical to the repo file.
- **Live credits.** The deployed `surface.js` carries the corrected credit. `credits.html` returns 404 on the live domain, and `deploy.sh` never copies it.
- **R2 headers.** Objects are served immutable for one year. CORS answers only `https://www.where-on.earth`.
- **The 2017 layer.** At z6 it returned blank or near-white tiles at 7 of 8 land test sites. The 2016 and 2025 layers both returned real imagery there.
- **Location coverage.** The current `assets/locations.json` has 805 entries. Their 3 by 3 windows at z4 to z8 need 7,992 tiles, and 7,792 of those are in the manifest.
- **Display resolution.** At z8, the game's deepest zoom, a pixel covers 611 m at the equator and 432 m at 45 degrees latitude. This comes from the standard Web Mercator formula.
- **Repo visibility.** `gh repo view` reports `seangartland/where-on-earth` as PUBLIC. About 219 satellite-related images are tracked under `docs/`, plus the 2025-derived base texture.

## What I read (all fetched on 2026-10-17)

- EOX licence summary, `https://cloudless.eox.at/documentation/license`. It says commercial use needs the Commercial Attribution-RestrictedUse 1.2 licence and that non-commercial use falls under CC BY-NC-SA 4.0.
- EOX legal licence text, `https://cloudless.eox.at/license-legal`, sections 1 to 6. It covers the grant scope, the Direct Redistribution ban, the entity-bound use rule, confidentiality, and a perpetual term.
- EOX pricing page, `https://cloudless.eox.at/pricing`. It says the 2018 to 2025 data is non-commercial and 2016 is CC BY 4.0. It also offers bulk and custom delivery, and says earlier years are discounted.
- The EOX price list behind that page, in its public STAC catalogue (`staging.stac-catalog.eox.at/eoxcloudless/`). It lists 2025 Viewing Ready and Viewing Basic at 6,000 and Exploitation Starter and Ready at 10,000 and 18,000. Viewing products for 2018 to 2024 are 5,000. The pricing page says prices exclude VAT. The catalogue has no currency field, but the site's price formatter (`assets/chunks/theme.*.js`) renders every price with a euro sign.
- EOX "Games & Simulations" page. It lists maptap and EO Guesser among the games using EOxCloudless.
- EOX WMTS capabilities, `https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml`. The layer abstracts give CC BY 4.0 for 2016 and 2017 and CC BY-NC-SA 4.0 for 2018 to 2025.
- The Copernicus Sentinel data legal notice (PDF), and the CDSE terms and conditions, section 3.
- CDSE documentation for the Sentinel-2 Level 3 quarterly mosaics (access page and algorithm page), the CDSE quotas page, and the Sentinel Hub processing unit definition.
- The CDSE public STAC collection `sentinel-2-global-mosaics`: its description, licence link, band assets and temporal extent. I also ran item queries showing that 2025 Q3, 2025 Q4 and 2026 Q2 exist and 2026 Q3 does not.
- AWS Open Data registry pages for Sentinel-2 L2A COGs and ESA WorldCover, and the ESA WorldCover data access page.
- NASA Earthdata data use guidance (NASA mission data is CC0 unless marked) and NASA's Blue Marble Next Generation page (500 m, 2004, credit "NASA Earth Observatory").
- Google Map Tiles API policies, which forbid pre-fetching and caching. I also read Mapbox's terms of service and product terms pages and MapTiler's terms and satellite pages.

## What stayed unverified, and why

- **Whether an EOX purchase covers the tiles we already harvested.** It is also unverified whether a publicly fetchable bucket, or the base texture in a public repo, would count as Direct Redistribution under that licence. The licence text does not settle these questions, and only EOX can answer them.
- **The price list's status.** The catalogue host is named "staging". The live pricing page loads it, but I did not complete a checkout to confirm the price at order time.
- **Mapbox caching terms.** The two Mapbox pages I read did not contain a caching or redistribution clause. The binding terms are probably in a document I did not open.
- **Esri terms.** I did not read Esri's terms in this session.
- **MapTiler terms and price.** I read neither MapTiler's licence for its global satellite download nor its price.
- **USGS Landsat public-domain status.** `usgs.gov` returned HTTP 403 to my fetch.
- **Details of the CDSE Global Mosaics.** I could not confirm whether the COGs have internal overviews, how many items make up a quarter, or how well they cover high latitudes. After about ten queries, the CDSE STAC API began returning a firewall rejection page. I stopped querying rather than push against it.
- **Pipeline estimates.** The processing unit totals, request counts and builder days for option (c1) are estimates. They are built from the measured tile count and the published PU formula, not from a pilot run. The quality of option (c1) against the 2025 layer is unknown until the A/B pilot.
- **The 200 location tiles missing from the manifest.** These are probably open-ocean tiles that EOX does not serve, but I did not check them one by one.
- **Earlier repo findings.** Figures marked PRIOR in the plan come from earlier repo documents and were not re-measured. They include the WorldCover coverage limits, the raw Sentinel-2 build estimate, the WELD verdict, and the R2 free tier size.

## Corrections to the brief

The plan opens with a table of these corrections, which I summarise here. The
tiles are served from Cloudflare R2, not from the game's own static deploy. The
harvest and Sean's comparison took place in October 2026; 2025 is the imagery's
vintage, not the harvest date. EOX does publish a price, EUR 6,000 excl. VAT for the
2025 viewing licence. The corrected `credits.html` has never been deployed. The
2017 layer is also CC BY 4.0, but it has no usable coverage.

## Deviations from the brief

None in scope. The brief asked me to evaluate options (a) to (d). I added the
Copernicus Global Mosaics as a sub-option of (c), because it is the
license-free modern route that the brief asked about in a far cheaper form. No
earlier repo research had identified it.
