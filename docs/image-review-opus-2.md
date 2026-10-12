# Image review (Opus, pass 2) — 2026-10-11

Reviewed by Claude Opus directly (no delegation). Method: downloaded every current
image and looked at it, then rendered every candidate as a **square, top-biased crop**,
which is how the passport slot displays it (`.pp-slot-photo`: `aspect-ratio: 1`,
`object-fit: cover`, `object-position: center 20%`). Candidates came from the
Wikimedia Commons search API. Every replacement URL was fetched and returned HTTP 200 image/jpeg.

## Task 1: red "ERR: unknown" bar on `?audit=1`

**Cause:** `index.html` registers a global `error` listener in the **capture** phase.
Capture catches resource-load failures from `<img>` elements too. Those events carry no
`message` and no `filename`, so the bar prints `ERR: unknown @ `. Audit mode renders all 766
passport photos; the main site only renders visited ones. So a single broken image URL shows the
bar in audit mode and almost never on the main site.

**The broken image:** a scan of all 766 URLs found exactly one failure:
`zajecar` → `Železnička_stanica_u_Zaječaru_01.jpg`, HTTP 404 (file gone from Commons).

**Fix:**
1. `zajecar` now has a working image (see below).
2. The global handler skips `<img>` errors. Every image already has its own `error` fallback
   (removes itself or shows the flag tile), so these were never real app errors. Script and
   module failures still show the bar.

I did not reproduce this in a browser. The diagnosis rests on two things: the message
format matches a resource-error event exactly, and the 404 is the only failing URL.

## Task 2: flagged images

Note: the first 16 IDs were already replaced in the last commit (57f6cb5). Sean's examples
(Central Park for NYC, the icebreaker for Hobart, Beverly Hills 1906) were the images
**before** that commit. I judged the images as they stand now.

| ID | Current image | Verdict | New image |
|---|---|---|---|
| phoenix-usa | Phoenix skyline Arizona USA | **Keep.** Clear downtown skyline. | — |
| omaha | Omaha skyline on the Missouri River | **Keep.** Clean skyline over the river. | — |
| new-york-usa | The New York City Skyline at Dusk | **Keep.** Midtown skyline from above. | — |
| santa-fe | Panoramic view of downtown Santa Fe | **Replace.** 3.7:1 panorama; the square crop is a dark rooftop and railing. | Cathedral of St. Francis, Santa Fe, New Mexico.JPG |
| beverly-hills | Beverlyskyline.jpg | **Keep.** Modern aerial of the Beverly Hills business district. | — |
| los-angeles-usa | LosAngelesSkyline.jpg | **Replace.** 18:1 strip (500×28 thumb); renders as a smear. | Skyline of Los Angeles, Downtown Los Angeles, California 13.jpg |
| pittsburgh | Pittsburgh Skyline (30475358416) | **Replace.** Power lines cut across the frame. | Downtown Pittsburgh from Duquesne Incline in the morning.jpg (rivers, bridges, incline car) |
| hobart-australia | Hobart-skyline-dusk.jpg | **Replace.** Generic rooftops at dusk; nothing says Hobart. | Winter2016 (2) Sullivans Cove 2016.jpg (harbour, city, kunanyi behind) |
| tarawa-kiribati | ESA satellite image of the atoll | **Replace.** A satellite image, not a photo of the place people live. | South Tarawa from the air.jpg (settled strip and lagoon) |
| bucaramanga-co | Bucaramanga city.jpg | **Replace.** Two-thirds empty sky. | Bucaramanga Yuri Romero Picon.JPG (city in its valley) |
| coyoacan-mx | Coyoacan street scene (portrait) | **Replace.** Anonymous sidewalk with people; could be anywhere. | JardinCentenarioCoyoacan.JPG (central plaza, San Juan Bautista church) |
| hermosillo-mx | Hermosillo Cityview.jpg | **Replace.** 8:1 panorama; the crop is rocks. | Panarama de Hermosillo, Sonora al atardecer.jpg (city lights at dusk) |
| mexicali-mx | Callejón de la Chinesca 02 | **Replace.** Chinese signage alley reads as China, which misleads a geography game. | Catedral de Mexicali 01.jpg |
| playa-del-carmen | Aerial of Playa del Carmen | **Keep.** Town, beach, and sea in one aerial. | — |
| veracruz-mx | Street Scene, Veracruz (1800s sepia) | **Replace.** Historic photo. | Puerto de Veracruz Malecón.JPG |
| ngerulmud-palau | Ngerulmud 04 (Capitol) | **Keep.** Ngerulmud *is* the capitol complex; there is no town to show. Commons has nothing better (searches return inauguration crowds). | — |
| hargeysa | HargeisaDrone.jpg | **Keep.** Drone view over the city centre. | — |
| nashik-in | View from Pandav Leni | **Replace.** Hazy, generic apartment blocks. | Ramkund,nashik.JPG (Godavari ghats, temples, city) |
| mumbai-india | Bandra-Worli Sea Link (full-size 3751px file) | **Replace.** A bridge with a tiny skyline, and a multi-MB original instead of a thumb. | Mumbai 03-2016 27 skyline at Marine Drive.jpg |
| takeo | Takeo Psar Nat (dark market interior) | **Replace.** Dark interior, unreadable. | Takeo Independence Monument 4051.jpg |
| prayagraj | Sangam tent city at night | **Replace.** Temporary Kumbh Mela camp, not the city. | On the banks of New Yamuna bridge, Allahabad.jpg (the city's signature bridge) |
| batam-id | Batam, Indonesia (Unsplash) | **Replace.** A man's back in sunlight. | Nagoya Thamrin City Morning View (2026).jpg |
| kirkuk | Qaysariyya Bazaar entrance | **Replace.** A doorway. | Top views of the Citadel Market, Kirkuk 01.jpg (rooftops, domed mosque) |
| kitakyushu | Kitakyushu City Hall | **Replace.** Single office building. | KokuraSkylines02.jpg |
| quetta-pk | Quettaa Pakistan, View 2008 | **Keep (weak).** Outskirts and mountains, not ideal. Commons has no better Quetta photo: searched 6 queries, finding only 1935 earthquake ruins, B&W colonial photos, and near-duplicates of this shot. | — |
| zamboanga | View from Garden Orchid Hotel | **Replace.** 3:1 panorama of tree canopy. | ZAMBOANGA CITY Asia's Latin City City Hall and Plaza Rizal.jpg |
| gwangju | Gwangju city - view apts | **Replace.** Dated, dark, and a pine tree covers a third of the frame. | Asian culture complexp.jpg (downtown around the Asia Culture Center; Commons category "Cityscapes of Gwangju") |
| zajecar | (404, broken) | **Replace.** Caused the audit error. | Zajecar centar.jpg (town centre square) |

**Totals:** 20 replaced, 8 kept (phoenix-usa, omaha, new-york-usa, beverly-hills,
playa-del-carmen, ngerulmud-palau, hargeysa, quetta-pk). Quetta is the one I'd still call weak;
fixing it needs a source outside Commons.

New URLs use the standard `upload.wikimedia.org/.../thumb/.../500px-...` form, like most
of the dataset. No collages.

## Verification
- `assets/locations.json`: valid JSON, 766 entries, unique IDs.
- All 766 image URLs fetched afterward: every one returns 200.
