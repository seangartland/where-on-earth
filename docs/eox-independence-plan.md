# EOX independence plan: commercially clean imagery before the first paid feature

Opus 5.5, 2026-10-17. Plan only, no code changed. Method, sources and what stayed
unverified are in `docs/eox-independence-report.md`. Every number below was
measured in this session unless it is marked **estimate**.

## 0. Corrections to the brief (verified against the repo and live endpoints)

The brief's direction holds, but five of its stated facts are wrong or incomplete,
and two of them change the plan.

| Brief said | What is true | How checked |
| --- | --- | --- |
| Tiles are "served as static files by the game itself" | The 10,947 detail tiles live in a **Cloudflare R2 bucket** behind `https://tiles.where-on.earth/tiles/{z}/{x}/{y}.jpg` (`src/globe/surface.js:507`). Only the 2048x1024 base texture ships in the Vercel deploy. There are still no runtime calls to EOX. | Code read; live `curl` (R2 `Server: cloudflare`, `Cache-Control: public, max-age=31536000, immutable`) |
| Harvested "October 2025"; Sean's side-by-side was "October 2025" | The **2025 vintage** was harvested **2026-10-10 to 2026-10-11** (`.harvest-2025/` file times, `full.log`, commit `36ac93a` 2026-10-11). Sean's "way better" judgment was 2026-10-10 on one Bay Area 2x2 z8 grid, `demo/docs/bayarea-2016-vs-2025.jpg`. | File times, git log, `~/memory/2026-10-10.md:545` |
| EOX commercial licence has "no public price" | EOX's public price list is machine-readable in the STAC catalogue its pricing page loads. 2025 **Viewing Ready / Viewing Basic: EUR 6,000 excl. VAT**, global, no subsets. 2018 to 2024 years: EUR 5,000. Licence term is perpetual ("the term of the Copyright and Similar Rights"). | `staging.stac-catalog.eox.at/eoxcloudless/*/collection.json`, `cloudless.eox.at/license-legal` §5(a) |
| Only 2016 is CC BY 4.0 | EOX's WMTS capabilities also mark **2017** CC BY 4.0, but the 2017 layer is **blank or white at 7 of 8 land test sites** at z6 (it covers wider Europe only). It is not a usable variant. | Capabilities XML; 8-site z6 fetch |
| Credits corrected 2026-10-17 | The in-game credit is corrected **and live** (`src/globe/surface.js:508`, live file matches). `credits.html` was corrected in git but is **never deployed**: `deploy.sh` does not copy it, nothing links to it, and `https://www.where-on.earth/credits.html` returns **404**. | `deploy.sh:35-60`, live `curl` |

## 1. Inventory of every EOX touchpoint

### 1a. Imagery in production

| Item | Where | Measured |
| --- | --- | --- |
| Detail tiles, EOX 2025 (`s2cloudless-2025_3857`) | R2 bucket `where-on-earth-tiles`, key `tiles/{z}/{x}/{y}.jpg`, custom domain `tiles.where-on.earth` | Manifest **10,947 tiles: z4 210, z5 587, z6 1,371, z7 2,981, z8 5,798** (`demo/.harvest-2025/eox-manifest-valid.json`; `done.txt` 10,947 unique lines). 60 of 60 random manifest tiles return 200; mean **10.9 KB**, so about **122 MB** total (**estimate** from that sample). Tile `4/8/5` on R2 is **byte-identical** to EOX's 2025 WMTS tile. |
| z0 to z3 on R2 | none | `tiles/{0..3}/0/0.jpg` all **404**. Deleted 2026-10-11 when tiles were moved to start at z4. |
| Base texture | `assets/eox-z4-base-2k.jpg` (2048x1024, 269,995 bytes), shipped by `deploy.sh`, served from Vercel with `max-age=3600, must-revalidate` | **2025 imagery, measured**: mean absolute difference against a reprojected 4x5 block of z4 tiles is **1.8** for the 2025 layer vs 20.4 for 2016 and 4.5 for 2024. Built from 198 R2 tiles + 38 EOX WMTS tiles + 20 synthetic snow tiles (`docs/z4-composite-build-log.md`). Live file is byte-identical to the repo file. |

### 1b. Client code and cache keys

| Location | What it couples to EOX |
| --- | --- |
| `src/globe/surface.js:502-511` | `SAT_PROVIDERS[0]`: tile URL with `?v=3` cache-bust query, EOX credit string, `maxZ: 8` |
| `src/globe/surface.js:512` | `SAT_BASE_URL = './assets/eox-z4-base-2k.jpg'` (separate from the provider record) |
| `src/globe/surface.js:547-550, 1082` | `.sat-credit` element shows `satProvider.credit`; `src/styles/game.css:391-393` styles it |
| `src/globe/surface.js:767, 808` | Tile cache key is `${pi}/${z}/${x}/${y}` where `pi` is the provider's index, so a second provider already gets its own in-session LRU and "missing" entries |
| `src/globe/surface.js:800-803, 946` | Comments name `scripts/prefetch-eox-tiles.mjs` and say "z0-3 always exist". Both are stale: the script is not in this repo and z0 to z3 are 404. The ancestor walk (`loadInsetTile`, lines 815-820) still ends correctly at `k >= z`, after up to four extra 404s per missing chain per session. |
| `src/globe/surface.js:571` | `INSET_MIN_Z = 4` |
| R2 cache policy | Objects are `immutable, 1 year`; CORS allows only `https://www.where-on.earth` (a foreign `Origin` gets no ACAO header) |

### 1c. Attribution and credits surfaces

| Surface | State |
| --- | --- |
| In-game `.sat-credit` (`surface.js:508`) | `EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)`. Live. |
| `credits.html:15` | Same credit plus "used under CC BY-NC-SA 4.0 for non-commercial use". Not deployed, not linked, 404 live. |
| OG image `assets/og-v3.png`, passport share card (`src/meta/passport.js:399`) | No satellite imagery (stylised globe; location photos). Not touchpoints. |

### 1d. Pipeline (harvest and build)

| Artifact | State |
| --- | --- |
| `scripts/prefetch-eox-tiles.mjs` (177 lines, the 2016 R2 prefetcher) | Exists only as an **untracked** file in `demo/`'s working tree. Not in git. |
| `.harvest-2025/harvest.py` (the 2025 harvester) | **Deleted** (it held R2 credentials). Only its logs, `done.txt`, `monitor.sh` and the manifest remain, in the gitignored `demo/.harvest-2025/`. |
| `.build-tmp/z4-composite/{download,build}.py` (base texture builder) | **Deleted.** Only the build log in `docs/z4-composite-build-log.md` describes it. |
| Manifest | Gitignored. The current `assets/locations.json` has **805** entries whose 3x3 z4 to z8 windows need **7,992** tiles; 7,792 are in the manifest, 200 are not (likely EOX ocean blanks, **unverified**), and 3,155 manifest tiles serve locations no longer in that file. |

**Consequence:** the imagery pipeline cannot be reproduced from the repo. That is
the largest gap for any swap.

### 1e. Docs and committed imagery

- 15 docs mention EOX (grep counts): `eox-bulk-and-base.md` 40, `r2-pipeline-scope.md` 27, `aws-r2-pipeline-plan.md` 25, `z4-composite-build-log.md` 25, `satellite-sources.md` 15, `opus-satellite-review.md` 15, `satellite-sources-v2.md` 10, `polar-fill-opus.md` 9, `z4-composite-review-opus.md` 7, `tile-seams-opus.md` 6, `r2-setup.md` 6, `z4-full-globe-cost-opus.md` 6, `tile-debug-opus.md` 4, `tile-teardown-opus.md` 2, `accounts-plan-payments-addendum.md` 1. Several describe the superseded 2016 pipeline (`r2-setup.md`, `r2-pipeline-scope.md`, `aws-r2-pipeline-plan.md`).
- `docs/accounts-plan-payments-addendum.md:288` already names this licence as the gate before Stripe live mode.
- The repo is **public** (`seangartland/where-on-earth`, `gh repo view`: PUBLIC). It tracks the 2025-derived base texture, about 219 satellite review/debug images under `docs/` (EOX 2016/2017, Esri, GIBS, R2 tiles, live-globe screenshots), and 20 screenshot PNGs under `shots/`. This matters for option (a) (see §2).

## 2. Options matrix

Licence status key: **VERIFIED** = I read the term on the source this session.
**UNVERIFIED** = not read, with the reason. **PRIOR** = taken from an earlier repo doc, not re-read.

### (a) Buy EOX's commercial licence for the 2025 mosaic

- **Terms (VERIFIED, `cloudless.eox.at/documentation/license`, `/license-legal`, `/pricing` and the STAC price list):** commercial use needs the EOX Commercial Attribution-RestrictedUse 1.2 licence. Grant is worldwide, non-transferable, "solely for Your own business purposes", and covers "an interactive online map integrated into Your website or app". Term is perpetual unless breached (§5a). "Direct Redistribution" (making the material available as-is, free or paid) is prohibited (§3b). The licence is entity-bound: "if the Licensed Material is Used in a service or product published under Your name, You need Your own license". You must inform users of the restricted use (§3b) and keep the material confidential (§3c). Attribution string is unchanged.
- **Price (VERIFIED as listed):** EUR 6,000 excl. VAT for 2025 Viewing Ready (prerendered s2maps.eu look, GeoPackage/SQLite/GeoTIFF; the 3857 SQLite is 918.8 GB) or Viewing Basic. Subsets are not offered for Viewing products. 2024 and older: EUR 5,000.
- **Open question (UNVERIFIED, needs EOX):** "Licensed Material means the Licensor's product or products ordered by You". Whether buying covers the 10,947 tiles we already harvested from the free WMTS, or requires re-extracting them from the delivered 0.9 to 1.1 TB file, is not stated. Two further compliance questions only EOX can answer: does a publicly fetchable R2 bucket (any non-browser client can GET a tile) count as Direct Redistribution, and does the 2025-derived base texture in the public GitHub repo.
- **Money:** EUR 6,000 one-off, EUR 0 recurring (a newer vintage later is another purchase). **Builder days:** 0.5 to 1 (ToS line on restricted use, credits page, possibly extraction from the purchased file, tighten R2 access, move imagery out of the public repo). **Quality:** identical to today. **Risk:** low technical risk; the licence questions above; EOX response time; Sean has said (2026-10-10) he prefers not to contact EOX.

### (b) Re-harvest the 2016 CC BY 4.0 mosaic

- **Terms (VERIFIED):** the pricing page says "CC BY 4.0 for 2016"; the WMTS capabilities abstract for `s2cloudless_3857` says "Sentinel-2 cloudless layer for 2016 ... Creative Commons Attribution 4.0". The layer still serves (z3 and z4 tiles returned 200 today). EOX's service terms against "excessively frequent requests" (**PRIOR**, quoted in `docs/eox-bulk-and-base.md`) still govern the harvest rate.
- **Money:** EUR 0. **Builder days:** 1 to 1.5 (harvest 10,947 tiles politely, rebuild the base, Antarctic Blue Marble patch of 280 z4 to z6 tiles already scoped on 2026-10-10, attribution change). **Quality:** a real regression; Sean judged 2025 "way better", and the 2016 review (**PRIOR**, `docs/opus-satellite-review.md`) found it darker and warmer, with flat navy ocean, residual clouds, seams and a broken Antarctica. **Risk:** low technical, high taste.
- **2017 variant:** CC BY 4.0 (VERIFIED) but blank at 7 of 8 sites (measured). Rejected.

### (c) Build our own from Copernicus Sentinel-2 data

The NC terms are EOX's; the underlying data is not. **VERIFIED** from the EU legal notice (`sentinels.copernicus.eu/.../Sentinel_Data_Legal_Notice`, PDF read): "free, full and open access", lawful use for reproduction, distribution, communication to the public, adaptation and combination, with the notice "Contains modified Copernicus Sentinel data [Year]". The CDSE terms (VERIFIED, `dataspace.copernicus.eu/terms-and-conditions` §3) put CDSE-served Sentinel data under the same legal notice.

The key fact that makes (c) cheap: **the game never goes below z8, and z8 is 611 m per pixel at the equator (432 m at 45°)**. A 10 m mosaic is downsampled about 60x before a player sees it. We need a clean, well-coloured 600 m picture, not a 10 m one.

**c1. Copernicus Sentinel-2 Global Mosaics (recommended route; not in any earlier repo research).**
CDSE publishes `sentinel-2-global-mosaics` (product type `S2MSI_L3__MCQ`): quarterly cloudless composites, 10 m, bands B02/B03/B04/B08 plus a per-pixel `observations` count, int16 COGs of 10,008 x 10,008 px, from 2020-01-01 onward (VERIFIED from the public CDSE STAC: items exist for 2025 Q3, 2025 Q4 and 2026 Q2; none yet for 2026 Q3). Collection licence links the Copernicus legal notice (VERIFIED). Algorithm (VERIFIED, CDSE docs): per pixel, mask SCL classes 1, 3, 7, 8, 9, 10, then take the **first quartile** of the quarter's valid observations. No colour harmonisation is described, so expect darker output and visible quarter or tile seams until we tune it. Access needs a free CDSE account (assets carry `auth:refs` oidc/s3).

Pipeline at our tile count and zoom depth:

1. **Manifest.** Regenerate from every playable location set (3x3 windows, z4 to z8), committed. Today's equivalent is 10,947 tiles.
2. **Render with the Sentinel Hub Process API** on CDSE, requesting each zoom's tiles directly in EPSG:3857 at that zoom's resolution, as 3x3-tile (768 px) windows sliced into 256 px JPEGs. No GDAL, no reprojection on our side, no source download.
3. **Season pick in the evalscript:** request 2025 Q1 to Q4; per pixel prefer local summer (Q3 north of about 23°N, Q1 south of about 23°S) and fall back to the quarter with the most `observations`, so tropics get their clearest quarter and high latitudes avoid snow.
4. **Tone mapping:** reflectance to sRGB (CDSE's example uses a 2.5 gain), plus a gamma, contrast and saturation curve tuned **by eye** in the A/B (§5). Do not fit curves to EOX pixels: that would make EOX's NC imagery an input to a commercial product.
5. **Gaps:** open ocean and interior Antarctica have no Sentinel-2 data. Fill nodata from the new base texture, with ocean and Antarctic pixels from NASA Blue Marble Next Generation (500 m, credit "NASA Earth Observatory", VERIFIED on NASA's page). Tiles that are entirely nodata are not uploaded, so they 404 and the base shows, exactly as today.
6. **Base texture:** one 4096x2048 EPSG:4326 Process API render of the same evalscript, downsampled to 2048x1024 with the same gap fill. This replaces the deleted Mercator-to-equirect builder.
7. **Upload** to R2 under a new prefix (§4) and write a QA report: counts per zoom, nodata fraction per tile, blank and seam flags.

Compute and storage (**estimates**, from CDSE's PU definition, VERIFIED: 1 PU = 512x512 output px x 3 input bands x 1 sample; multiply by bands/3 and by samples):

| Quantity | Value |
| --- | --- |
| Output pixels | 10,947 x 256 x 256 = 717.4 M px (measured count) |
| Base PU (1 sample, 3 bands) | about 2,740 PU |
| With `observations` band and 4 quarterly samples | about 2,740 x 4/3 x 4 = about 14,600 PU |
| Free tier (VERIFIED, CDSE Quotas page) | 10,000 PU and 10,000 requests per month, 300 per minute |
| Requests | about 1,500 if batched as 3x3 windows (est.) |
| Base texture | 4096x2048 = 32 PU x 4/3 x 4 = about 170 PU |
| Wall time | hours; the 300 PU/min cap allows the full job in about an hour of throughput |
| Output storage | about 122 MB (same tile count and JPEG settings as today); R2 free tier 10 GB (PRIOR) |
| Money | EUR 0 if the job is spread over two monthly quotas or limited to 2 quarters per pixel; otherwise a small paid CDSE/Sentinel Hub plan (price UNVERIFIED) |

**Builder days (estimate):** 4 to 7. Pipeline and pilot 2 to 3, colour tuning and seam work 1 to 3, gap fill and base 1. **Quality vs 2025:** unknown until the A/B. Same satellite and similar season logic as EOX, but without EOX's colour correction and sharpening. **Risk:** medium. Quality may need extra tuning rounds; CDSE availability (its STAC API began rejecting my requests with a firewall page after about ten queries, so the pipeline must be polite and resumable); quarterly product continuity is CDSE's choice.

**c2. Fully DIY from raw L2A scenes** (Element 84 Earth Search COGs on AWS; licence statement VERIFIED on the AWS registry page). Scene selection, cloud masking, median compositing and cross-scene colour harmonisation are all ours. Earlier estimate: 2 to 4 weeks (**PRIOR**, `docs/opus-satellite-review.md`). Compute is small at 600 m if COG overviews are used, but engineering time dominates. Only worth it if c1's cloud handling fails the A/B.

### (d) Other ready-made sources

| Source | Licence position | Resolution / vintage vs S2 10 m | Self-host tiles? |
| --- | --- | --- | --- |
| ESA WorldCover S2 RGBNIR annual composites | CC BY 4.0, "without restriction of use" (VERIFIED, esa-worldcover.org and AWS registry) | 10 m, **2020 and 2021 only**, land only, stops at 60°S (PRIOR); 8.5 TB per year | Yes (CC BY). Earlier estimate 5 to 8 builder days (PRIOR) |
| NASA Blue Marble Next Generation | NASA ESDIS data is CC0 unless marked (VERIFIED, Earthdata data-use page); BMNG asks for credit "NASA Earth Observatory" (VERIFIED) | **500 m, 2004** monthly MODIS composites. Near native at z8 but much softer and 21 years old | Yes. Use as gap fill, not as the main layer |
| NASA GIBS Landsat WELD | Public NASA product (PRIOR) | 30 m, **1984 to 2000**; black ocean and Antarctica (PRIOR) | Yes, but rejected on quality earlier |
| USGS Landsat | Public domain (UNVERIFIED: usgs.gov returned 403 to my fetch); AWS bucket is Requester Pays (PRIOR) | 30 m raw scenes | Yes, but it is a c2-sized project |
| Sentinel Hub 120 m L2A mosaic | CC BY 4.0 (PRIOR) | 120 m, 2019 to 2020, residual clouds (PRIOR) | Yes, but older and cloudier than c1 |
| Google Map Tiles API | Must not "pre-fetch, index, store, or cache any Content" (VERIFIED, Map Tiles policies) | High-res, mixed vintages | **No.** Excluded |
| Mapbox Satellite | Caching and redistribution terms not found on the two pages I read (UNVERIFIED) | High-res composite | Assume no without a contract |
| Esri World Imagery | Not read this session (UNVERIFIED); earlier doc calls it a separate commercial-contract question (PRIOR) | High-res, mixed vintages | Assume no without a contract |
| MapTiler Satellite | Offers on-prem / offline global satellite downloads, quote-only (VERIFIED page text); licence and price not read (UNVERIFIED) | Unknown for the global layer | Possibly, by contract |

Paid APIs either forbid caching (Google) or need a contract we have not read, and every one of them would turn a static, EUR 0 per month hosting model into a metered dependency. None beats (a) or (c1).

### Cost and effort summary

| Option | One-off money | Recurring | Builder days | Quality vs current 2025 | Risk |
| --- | --- | --- | --- | --- | --- |
| (a) EOX 2025 licence | EUR 6,000 excl. VAT | 0 | 0.5 to 1 | Identical | Low tech; licence-scope questions; EOX contact |
| (b) EOX 2016 | 0 | 0 | 1 to 1.5 | Clear regression (Sean's call) | Low tech, high taste |
| (c1) CDSE Global Mosaics | 0 (est.) | 0 | 4 to 7 (est.) | Unknown, A/B gated; likely close after tuning | Medium |
| (c2) Raw L2A DIY | 0 | 0 | 10 to 20 (PRIOR) | Unknown | High |
| (d) WorldCover 2021 | 0 | 0 | 5 to 8 (PRIOR) | Older (2021), A/B gated | Medium |
| (d) Blue Marble only | 0 | 0 | 1 | Large regression | Low tech, high taste |

## 3. Recommendation

Build **(c1)** and keep **(a)** as the funded, pre-approved fallback. (c1) is the
only route that is modern, licence-free, EUR 0 and static-hostable, and the
600 m display resolution makes it far smaller than "build a global 10 m mosaic"
sounds. (a) is the known-good exit at a known price if (c1) fails the A/B or slips
past the payments date. (b) stays the last resort.

## 4. Swap design: make a source change a data swap

What a source change touches end to end today: harvest inputs (unreproducible,
§1d), tile path and `?v=` query (`surface.js:507`), credit (`surface.js:508`),
`maxZ` (`surface.js:509`), base filename (`surface.js:512`), `credits.html`, R2
objects, deploy cargo. The client is already close to data-driven: one provider
record, provider-partitioned tile cache keys, 404 meaning "use the base". Five small
refactors finish the job, each a plan step in Phase 0:

1. **One provider record per source**, holding everything source-specific:
   `{ id, tiles: 'https://tiles.where-on.earth/<id>/{z}/{x}/{y}.jpg', base: './assets/sat-base-<id>.jpg', credit, maxZ }`.
   Fold `SAT_BASE_URL` into it. A swap is then a new record plus a new default id.
2. **Version by path prefix, not query string.** Each source gets its own R2 prefix
   (`eox2025/`, `s2gm2025/`), so a new source is automatically a new cache key,
   both sources coexist for the A/B, and rollback is a one-line default change with
   no re-upload. The base file gets the id in its name, which also sidesteps the
   1-hour `must-revalidate` cache on the fixed filename.
3. **`?sat=<id>` override**, alongside the existing `?map=classic` switch, so Sean
   can A/B on the real deployed game at 390 px without changing what players see.
4. **Ship and link credits.** Make `deploy.sh` copy `credits.html` (today it is
   404 live), link it from the settings or about surface, and keep its credit text
   in step with the provider record.
5. **Commit the pipeline:** `scripts/sat/` with the manifest generator (all
   location sets), the per-source fetch or render step, the base builder, the R2
   uploader (credentials from environment only), and a QA report writer. The
   manifest is committed; credentials never are.

Optional, and only with Sean's nod because it is adjacent: correct the stale
"z0-3 always exist" comments (`surface.js:800-803, 946`).

**Attribution copy per outcome:**
- (c1): "Contains modified Copernicus Sentinel data 2025" (legal-notice form), plus "NASA Earth Observatory" if Blue Marble fills gaps.
- (a): unchanged EOX string; add the restricted-use line to the ToS.
- (b): "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)", CC BY 4.0.

## 5. Phased path

| Phase | Work | Exit check |
| --- | --- | --- |
| **0. Shape** (0.5 to 1 day) | Refactors 1 to 5 above with today's EOX 2025 data moved under `eox2025/`. No visual change. Sean creates the free CDSE account. | Game renders identically; `?sat=eox2025` works; `credits.html` returns 200 live |
| **1. Pilot** (2 to 3 days) | c1 evalscript; render the A/B panel (below) at z4, z6, z8 plus a draft base | **Gate G1:** Sean's blind A/B. Pass, tune and repeat (max 2 rounds), or fall back |
| **2. Full render** (2 to 3 days) | Render the full manifest and base, gap fill, upload to `s2gm2025/`, QA report | QA clean; on-globe A/B via `?sat=s2gm2025` at 390 px |
| **Gate G2: the decision gate** | Placed **before Stripe live mode and before any paid feature ships** (the gate the payments addendum already names). Flip the default id, update credits, deploy. | Live game shows the new source; credits page live |
| **3. Cleanup** | Delete `eox2025/` from R2; remove the EOX-derived base from deploys; stop committing satellite imagery to the public repo | No EOX 2025 bytes served by the paid game |

**A/B protocol** (Sean's 2026-10-10 method, made blind and broader). He compared a
labelled Bay Area 2x2 z8 grid side by side. Keep that format, and:
- Use a fixed 12-site panel covering the failure modes: Bay Area (the original), Sahara and Nile, Amazon, Congo, Alps (snow), Iceland (cloudy), Siberian taiga, Andes and Atacama, Indonesia (tropical cloud), Fiji (small islands), Sydney (southern summer), the Antarctic Peninsula (gap fill). Grids at z4, z6 and z8.
- Label the two sides **A and B in random order**, unlabelled until Sean has picked, so "newer equals better" cannot bias the call.
- Add the full base texture side by side, and on-globe 390 px screenshots of the live game using `?sat=` (`shots/passport/pp-shot.mjs` already does headless 390 px capture).
- Ask Sean per site for "A better / same / B better", plus one overall call: ship or not. The pass bar is his overall "ship". Any site where he says "way worse" gets one tuning round before the call stands.

**Fallback if the chosen source slips.** If G1 fails twice, or Phase 2 has not
cleared QA two weeks before the planned paid-feature date, trigger (a): buy the
2025 Viewing licence (EUR 6,000), confirm the licence-scope questions with EOX, and
ship paid features on the current imagery. If (a) is refused or stalls, (b) is
1 to 1.5 days and free. Paid features never wait on imagery longer than that.

## 6. Decisions for Sean

1. **Route.** Recommend building (c1) Copernicus Global Mosaics, with (a) as the fallback. Alternative: buy (a) now and skip the build, trading EUR 6,000 for 4 to 7 builder days and zero quality risk.
2. **Pre-approve the fallback budget.** Recommend approving up to EUR 6,000 now for (a), so a failed A/B never blocks payments.
3. **CDSE account (Sean-only action).** Recommend creating a free Copernicus Data Space account for the pipeline; its credentials go in environment variables only.
4. **Vintage.** Recommend 2025 (all four quarters exist, matching today's look). 2026 is incomplete; Q3 has no items yet.
5. **Contacting EOX.** Recommend no contact unless (a) is triggered, which respects your 2026-10-10 preference. The list price is public, so no quote is needed to decide.
6. **Gap fill.** Recommend NASA Blue Marble Next Generation for ocean and Antarctica, credited "NASA Earth Observatory".
7. **Public repo imagery.** Recommend that the pipeline stops committing satellite imagery to the public repo, and that you decide whether the existing 2025-derived base texture and screenshots stay in git history. Under (c1) this stops mattering once EOX 2025 is retired from the paid game; under (a) it is one of the questions for EOX.
8. **Credits page.** Recommend shipping and linking `credits.html` in Phase 0 regardless of route. It is currently 404 live.
9. **Zoom depth.** Recommend keeping `maxZ: 8`. Every extra zoom level roughly quadruples render PU and tile count.
