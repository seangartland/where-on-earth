# Satellite self-host review (Opus)

Date: 2026-10-10. Reviewer: Opus 5.5, working directly (no delegation).
Inputs: `satellite-sources-v2.md`, `satellite-free-options-v3.md`, `aws-r2-pipeline-plan.md`, the existing `satellite-review-*.jpg` grids, `src/main.js`, `assets/locations.json`.

## How this was verified

The v2 and v3 rounds could not reach the network (every curl died at the local proxy, status 000). That is no longer true. In this session every source below got **live `curl` requests from this box**, and I looked at the returned tiles myself. "Verified" in this document means one of:

- an HTTP 200 with an image body that I decoded and viewed, or
- a live S3 listing or metadata response, or
- licence text read from the provider's own live page or metadata.

Things I could **not** verify are labelled. WebFetch and WebSearch were denied in this session, and Esri's developer pages are JavaScript-rendered, so curl gets an empty shell from them.

New comparison images from this session:

- `docs/opus-z8-esri-eox16-weld.jpg`: z8, 6 locations, Esri vs EOX 2016 vs NASA WELD
- `docs/opus-edge-cases-esri-eox16-weld.jpg`: polar, ocean, recent-change and z4 cases
- raw tiles in `docs/satellite-review-tiles/opus-probe/`

## Headline: the premise was wrong

**The EOX 2016 WMTS is not gone.** Its layer is named `s2cloudless_3857`, not `s2cloudless-2016_3857`. The second name returns a 404, and that 404 is where the "EOX 2016 is gone" conclusion came from.

```
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg
-> 200 image/jpeg (verified at z4, z6, z7 and z8, 12 locations)
```

The live WMTS capabilities document describes this layer as *"Sentinel-2 cloudless layer for 2016 by EOX ... released under Creative Commons Attribution 4.0 International License."* EOX's live pricing page (`cloudless.eox.at/pricing`) says it too: *"Feel free to use the provided service endpoints (WMS or WMTS) directly in your application"*, with *"non-commercial use for the 2018 - 2025 data (under CC BY-NC-SA 4.0, or CC BY 4.0 for 2016)."*

The capabilities document also labels `s2cloudless-2017_3857` as CC BY 4.0. That layer is unusable anyway: the existing review grid shows it blank or masked at most locations.

The `eox-s2maps` bucket from the AWS plan really is dead (verified 404 at the bucket root). That plan should be retired.

## Option-by-option

### Option 0 (new, recommended): harvest EOX Sentinel-2 cloudless 2016 into R2

| | |
|---|---|
| **Real?** | **Yes, verified.** Live tiles, and live CC BY 4.0 wording in both the service metadata and the pricing page. |
| **Licence** | CC BY 4.0: commercial use and redistribution allowed with attribution. A CC licence cannot be revoked for material already released under it. Required credit: "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)". |
| **Cost** | Data: $0. Storage: about 165 MB (10,982 tiles × ~15 KB measured average). Cloudflare's R2 free tier (10 GB storage, free egress) should cover it at $0, but **I did not re-verify the R2 pricing page this session**. |
| **Work** | **1 to 2 days.** Day 1: harvester (the 10,982-tile manifest logic already exists in the AWS plan), polite fetch (2 to 4 workers, identifying User-Agent, about 1 to 2 hours of wall time), upload to R2, switch the client URL and attribution. Day 2: QA pass on the location tiles and the polar fix (below). No GDAL, no reprojection. These are already 3857 XYZ JPEGs. |
| **Quality at z8 vs Esri** | **Noticeably worse, but serviceable for most of the world.** It is darker overall, with oversaturated orange-yellow deserts (Nile, Sahara, Dubai) and a flat navy ocean with no bathymetry, where Esri shows teal water with relief. There are some residual clouds (Tokyo, Atacama) and visible mosaic seams over water (Fiji, offshore Dubai). Recent features are present (Palm Jumeirah, the shrunken Aral Sea). Alpine relief is good. |
| **Showstopper region** | **Antarctica is broken.** EOX renders the continent as a flat white vector mask and draws the Ross Ice Shelf as open ocean (see the McMurdo z8 tile). That affects **22 locations with lat < -60**. The 20 locations with lat > 66 are mostly fine (Iceland and Greenland look acceptable). |
| **Risks** | (1) The quality drop is a taste call Sean has to make from the grids, not something I can decide. (2) Cloud and seam tiles near specific locations: **not measured yet**. The harvest should run an automatic white-pixel and seam check and list the location IDs to eyeball. (3) I could not read EOX's general T&Cs (`eox.at/terms-conditions/` is JavaScript-rendered). The CC licence plus the "use the endpoints in your application" statement cover what we're doing, but a one-line courtesy email to EOX before the bulk fetch is cheap insurance. (4) The source is frozen at 2016, which is fine at z8. |

**Polar fix (verified source, licence wording not re-read):** for the 22 Antarctic locations, use NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` / `BlueMarble_NextGeneration` (live capabilities: `GoogleMapsCompatible_Level8`, `Fees: none`, `AccessConstraints: none`). It is blurry at z8 but at least shows ice as ice. NASA imagery is generally free to reuse with credit, but I did not re-read the specific Blue Marble credit terms this session.

### Option (a): build from raw Sentinel-2

| | |
|---|---|
| **Real?** | **Yes, verified.** Element84's Earth Search STAC (`earth-search.aws.element84.com/v1`) answers live. The `sentinel-cogs` bucket (us-west-2) lists anonymously, and a `TCI.tif` true-colour COG from **today (2026-10-10)** returned 200 with no request-charged header, so the archive is current and free to read. (The `sentinel-s2-l2a` bucket also listed anonymously, but `sentinel-cogs` is the one to use: it holds COGs with overviews.) |
| **Cost** | Data: $0. Compute: this box or a cheap VM, reading COG overviews (about 160 to 320 m) by HTTP range request rather than full scenes. The volume is **not measured**; my estimate is tens of GB of range reads. |
| **Work** | **Honestly 2 to 4 weeks, not days.** The 217 z4 tiles span almost all land, so this is effectively a **global** cloud-free mosaic. The work: per-MGRS scene selection, SCL cloud masking, a multi-scene median, cross-scene colour harmonisation (the hard part; seams are what separates amateur from pro mosaics), an ocean treatment, and polar gaps. Sentinel-2 does not image interior Antarctica, so the 22 locations stay unsolved. Then many QA iterations. |
| **Quality vs Esri** | The realistic ceiling is **about EOX-2016 level**, since EOX is a professional team that has iterated on this for a decade. A first attempt will likely be worse. |
| **Risks** | High effort, uncertain quality, and colour and seam QA could drag on. Copernicus terms allow commercial use with "Contains modified Copernicus Sentinel data" credit (from earlier rounds; I did not re-read the legal notice this session). |
| **Verdict** | **Don't.** It costs weeks to land at or below the quality of something available today in 1 to 2 days. |

**Better middle path if EOX quality is rejected: the ESA WorldCover Sentinel-2 composite.** It is verified real. The `esa-worldcover-s2` bucket (eu-central-1) lists anonymously, with `rgbnir/2020/` and `rgbnir/2021/` annual median composites at 10 m, in 3°×3° COGs. Licence CC BY 4.0, verified from the WorldCover Product User Manual, §5.1: *"provided free of charge, without restriction of use... Creative Commons Attribution 4.0."* The existing `worldcover2021-alps-ov4.png` render looks cloud-free with natural colour, arguably better than EOX 2016. ESA has already done the cloud masking and compositing, which skips the hardest part of option (a).

The remaining work is 5 to 8 days: reflectance stretch, harmonisation across tiles, reprojection to 3857 with GDAL (**not installed on this box**, so it needs a container or install), ocean fill, and rendering of the 10,982 tiles. Gaps: **land only, and coverage stops at S60**. I verified the latitude prefixes run N82 to S60. So Antarctica is again uncovered and the oceans need their own fill.

### Option (b): build from raw Landsat

| | |
|---|---|
| **Real?** | Partly. **`usgs-landsat` on AWS is Requester Pays.** Verified live: an anonymous request is refused with "Anonymous users cannot invoke requests against Requester Pays buckets." Free alternative mirrors exist but I did not verify any. |
| **vs Sentinel-2** | Worse on every axis that matters here. It costs money on AWS (small, but it breaks "will not pay"). Resolution is 30 m vs 10 m (irrelevant at z8, but no better). Revisit is slower, so cloud-free compositing is harder. The pipeline work is the same or more. Its only advantage, US public domain, doesn't matter when CC BY 4.0 already allows commercial use. |
| **The pre-rendered shortcut is also out** | NASA GIBS `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual` is verified live (Level 12, so z8 is native). Colour on land is the closest to Esri of anything tested. But available dates are 1984 to 2000 only. The ocean is **black with blocky scene footprints** (Pacific z4, Mediterranean z4). Antarctica is black. There are diagonal swath-edge stripes (Tokyo, Atacama). The imagery shows the pre-shrink Aral Sea and no Palm Jumeirah. For a geography game, 26-year-old imagery is a gameplay problem. |
| **Verdict** | **Reject**, both raw Landsat and WELD. |

### Option (c): Esri with a free API key (ArcGIS Location Platform)

| | |
|---|---|
| **Real?** | Partly verified. The anonymous endpoint works (verified 200 at z4 to z8). The **2M tiles/month free tier is not re-verified by me**: the pricing page is JavaScript-only and search was denied. It rests on v3's browser research. |
| **Can it be self-hosted on R2?** | **No. Verified.** The World Imagery item's live `licenseInfo` says: *"licensed under the Esri Master License Agreement ... This layer is not intended to be used to export tiles for offline."* Copying tiles into R2 is off the table under any Esri plan. |
| **Cost** | $0 within the free tier. Overage is documented at $0.15 per 1,000 tiles. **Unverified:** whether an account with no payment method hard-stops at the limit or bills. Sean must confirm that before relying on it. |
| **Work** | About half a day: account, referrer-restricted key, `?token=` on the URL in `src/main.js:732`, attribution. |
| **Quality** | Best of everything tested: bathymetric ocean, real Antarctic imagery, consistent colour, few clouds. It also covers z9 to z11, which the game currently uses (`maxZ: 11`). |
| **Risks** | It does not meet the stated goal of eliminating Esri; it formalises the dependency instead. Pricing and terms can change. Billing exposure is unknown until the hard-cap question is answered. |
| **Long-term viable?** | Viable as a **hosted** service, not as an exit from Esri. One thing should change regardless of the decision: **the current anonymous endpoint has no contractual basis for a paid commercial game.** The item is licensed under the Esri MLA, and the 2M tier belongs to keyed Location Platform accounts. As long as Esri is in the game, it should be keyed. |

### Other options checked

- **NASA GIBS Blue Marble:** verified live at Level 8. Public NASA imagery, so licensing is clean. Too soft to be the primary detail layer at z7 and z8, but fine as the Antarctic patch.
- **Sentinel Hub 120 m L2A mosaic** (`sentinel-s2-l2a-mosaic-120`): verified live, CC BY 4.0 per its readme, 2019 and 2020, in 10-day periods with bands as separate UTM COGs. 120 m is plenty for z8. But the readme itself warns *"clouds might be remaining in some parts"*, and building RGB means combining bands, choosing periods and reprojecting. That makes it a pipeline project no easier than WorldCover, with worse cloud handling. Not recommended.
- **Hosted APIs (Mapbox, TomTom, MapTiler, Stadia):** none allow storing tiles in our own R2, per v3's research (not re-verified). Each would be a new vendor dependency, not an exit.

## Recommendation

1. **Do Option 0 now: harvest EOX s2cloudless 2016 into R2, about 1 to 2 days, $0.** It is the only verified source that meets every hard constraint today: free, commercial-OK, redistributable, self-hostable, z4 to z8 complete. Patch the 22 Antarctic locations with NASA Blue Marble. Cap the client at `maxZ: 8`.
2. **Gate before the switch, which is Sean's call:** look at `docs/opus-z8-esri-eox16-weld.jpg` and `docs/opus-edge-cases-esri-eox16-weld.jpg`. EOX 2016 is visibly darker and warmer than Esri, with a flat ocean and occasional clouds and seams. If that is acceptable, ship it.
3. **If it isn't acceptable, the upgrade path is the WorldCover 2021 composite (5 to 8 days, $0)**, not raw Sentinel-2, and never Landsat. Run a pilot of about 20 location tiles, look at them, and only then render all 10,982.
4. **While Esri remains in the game, add an API key.** The anonymous endpoint is the actual licensing exposure today. First confirm whether the free tier hard-stops or bills.

### Execution routing (for the orchestrator)

The harvest and upload are mechanical, so they go to a free ladder model. The tile manifest logic already exists in `aws-r2-pipeline-plan.md` (Phase 1). The QA flagging script is mechanical too. Accepting the visual quality is judgment work and belongs to Sean, with Opus reviewing the flagged tiles. Per AGENTS.md "review-before-scale": run a pilot of about 50 tiles across the special geographies, review it, then do the full harvest.

## Corrections to earlier docs

- `satellite-sources-v2.md` / `-v3.md`: their "no source verified" conclusions came from a proxy outage, not from the providers. The network works now.
- "EOX 2016 WMTS gone (404)": **false**, wrong layer name. The correct name is `s2cloudless_3857`.
- `aws-r2-pipeline-plan.md`: the bucket is dead. Retire the plan, but reuse its manifest math (10,982 tiles) and its R2 upload and verification steps.
- The game currently requests Esri up to z11 (`src/main.js:734`). Any self-host at z8 needs that lowered, or z9 to z11 will keep hitting Esri.
