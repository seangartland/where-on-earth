# Landforms additions report, chunk 3 of the pack additions (2026-10-30)

Worktree `woe-adds-landforms` at dabe6f3. Nothing committed, pushed, or deployed.

## Outcome

- **49 of 49 added, 0 held.** All six glaring (Sahara, Aconcagua, Caspian Sea, Cappadocia, Antelope Canyon, Mammoth Cave) and all 43 arguables from section 3 of `docs/pack-omissions-audit-2026-10-29.md` are in `assets/locations-landmarks-sol.json` (bank 387 → 436, diff is insertions only).
- **Dedupe: zero hits.** All 49 checked by id and by diacritics-stripped short name against the bank, `assets/locations.json`, and the quarantine file before sourcing (the chunk-2 collision class, a target already living in the cities file, does not occur here).
- Kinds: 36 point landmarks, 12 radius areas (`extentKm`), 1 extent polygon (Sahara).

## Pool proof (the game's own modules)

- `PACK_LANDFORM_IDS.size` = **187**
- Capitals pool **207**, Landmarks pool **249** (unchanged), Landforms pool **187**, combined packs **643**.

## Sahara verdict: SHIPPED, all geometry gates pass

- **Source correction, measured:** RESOLVE Ecoregions 2017 has no single "Sahara desert" ecoregion, which the extent spec assumed. The desert is split into West Sahara desert (ECO_ID 845), East Sahara Desert (822), and South Sahara desert (842), plus fringing steppe and montane ecoregions. The shipped polygon is the **union of 822 + 842 + 845**, the three ecoregions actually named Sahara desert: 6 outer polygons, 11 holes (the montane enclaves: Tibesti, Ennedi, Hoggar fringe), 9,656 source vertices. Source file: `https://storage.googleapis.com/teow2016/Ecoregions2017.zip` (CC BY 4.0 per its LICENSE field); extraction kept in-repo as `build/extract-sahara-ecoregions.py`, mirroring how `build/make-canyon-line.py` documents the canyon source.
- **Simplification:** tolerance 0.015 degrees, midpoint-split ring handling as the Reef. **1,162 vertices, measured max deviation 1.665 km** (gate: at most 2.5 km). Record is 20,754 bytes (budget: 100 KB per record); the whole sidecar is 110,663 bytes raw, 15.1 KB gzipped (budget: 500 KB total).
- **Regeneration:** `node build/make-extents.mjs` run twice, `assets/extents.json` byte-for-byte identical (sha256 aa0fa821e492d95c70141fb017a3baaed98bf539d1478a0dd04616e1064157ab). The git diff of the sidecar is insertions only: the great-barrier-reef record (331 vertices, deviation 1.662 km) and grand-canyon record are unchanged.
- **Geometry QA with the shipped scorer** (`scoringDistanceKm` against the shipped sidecar): a deep-inside point scores **0**; the stored anchor scores **0**; Tunis scores 646.8 km, Cairo 127.9 km, Sossusvlei 4,604 km (the polygon's southern edge is the Sahel line, as drawn by RESOLVE).
- **Anchor decision, with the measured reason:** the brief named Erg Chebbi (Q146219 P625, 31.1667, -3.9833) as the anchor. Measured against the shipped polygon, Erg Chebbi scores **129.9 km**: it falls in the North Saharan steppe fringe ecoregion, not in any of the three named-desert ecoregions, so a card anchored there would contradict its own geometry. The stored anchor is therefore the **Sahara entity's own Wikidata P625 (Q6583: 23.0797, 12.6122)**, deep inside the polygon, scoring 0. Erg Chebbi remains the photo (below) and is named in the fact. The same fringe exclusion is why Egypt east of the Nile (Red Sea coastal desert and Arabian desert ecoregions) scores a small positive distance rather than 0; widening the union is a data-only rebuild if Sean wants it.
- **Fringes deliberately excluded:** the North Saharan steppe reaches latitude 35.9 on the Mediterranean coast; including it would let coastal taps score 0 and blur the desert's edge.
- **Attribution gap for the orchestrator:** RESOLVE Ecoregions is CC BY 4.0 and requires credit ("Ecoregions 2017 © RESOLVE" is stored on the record). `credits.html` does not yet carry a RESOLVE line. Not edited here, per the brief.
- Existing anchors inside the Sahara polygon (correct, they are in the desert): Abu Simbel Temples, Richat Structure, Sabha (city).

## Landforms wiring and a stale-derivation finding

`scripts/pack-landforms/derive.py` at HEAD was stale: run against the current bank it emits **142** landforms, not 138, because its name pattern sweeps in four Landmarks banked by chunks 1-2 whose names trip the pattern ('Ajanta Caves', 'Ellora Caves', 'Mount Rushmore', 'Sugarloaf Mountain'). The committed `src/meta/pack-landforms.js` (138) is what the game uses; chunk 2 never re-ran the derivation. Fix applied in this chunk, flagged here rather than silently:

- Those four short names added to `EXCLUSIONS` in derive.py with a comment (they are built structures and name-only mountains; Landmarks membership is canonical).
- All 49 new ids added to `CURATED_ADDITION_IDS` as data, the famous-five precedent, so membership never depends on the name pattern.
- Re-ran derive.py: `src/meta/pack-landforms.js` diff is **exactly +49 ids, -0**. Landforms 138 → 187, Landmarks stays 249.

## Difficulty (frozen v2 framework, adapted as the brief specifies)

Scorer math replicated exactly (frozen cuts, K table, GeoNames population centres); area entries measure fallback/isolation distances to the anchor then subtract `extentKm` (floor 0); Sahara measures both distances to the shipped polygon. Lake Tahoe's clue names the country (Great Salt Lake precedent: "Lake Tahoe, United States 🇺🇸"), so it is scored on the US centre, not a state centre. Mount Vinson has no GeoNames population centre for Antarctica; the fallback centre used is the pole, the continent's geographic centre, documented on the entry's working record.

**Spike rescores (mean/median bands disagreed; median adopted):**

| id | mean views/day → band | median views/day → band | stored |
|---|---|---|---|
| sahara | 1562.3 → 5 | 1584.0 → 4 | **4** |
| caspian-sea | 2597.6 → 2 | 2407.4 → 3 | **3** |
| mount-st-helens | 2149.1 → 1 | 1899.4 → 2 | **2** |
| mount-tambora | 590.5 → 7 | 535.4 → 8 | **8** |
| ilulissat-icefjord | 40.6 → 8 | 34.0 → 9 | **9** |
| santorini-caldera | 1110.2 → 5 | 1211.4 → 4 | **4** |

**Fame-article decisions:** Bryce Canyon and Carlsbad Caverns were scored on their national-park articles ("Bryce Canyon National Park" 365.8/352.2 views/day; "Carlsbad Caverns National Park" 270.8/268.0) because the bare feature titles are stubs (6.7 and 12.1 views/day) and the park article is the feature in substance. Mammoth Cave was kept on its own substantive article (81.7/80.1; the park article's 573.3/586.7 noted but not used, the feature article being real). Area radii follow the existing precedent (~0.5-0.6x the longest dimension, Baikal's 342.7 km the cap): Caspian 340, Gobi 340, Tanganyika 330, Kalahari 300, Rub' al Khali 280, Atacama 250, Namib 250, Belize Barrier Reef 120, Bay of Fundy 100, Okavango 90, Toba 50, Santorini caldera 5.

Every new entry's `difficultyWhy` trailing level equals its stored difficulty (checked mechanically, 49/49).

## Pin audit (48 point/area entries; Sahara is geometry-gated instead)

`scripts/pin-audit.py --reverse`: stored pins vs Wikidata references, 43 of 45 compared within 0.5 km (the anchors are the reference coordinates). Reverse geocodes confirm every entry at the feature or its immediate site, including named hits: Upper Antelope Canyon, Eigerwand/Eigertrail, Kaieteur Rainbow Viewpoint, Thukela Falls trail, Upper Yosemite Fall Trail, Stromboli Volcano trail, Waitomo Caves, Rheinfallbrücke, Mauna Loa Summit Trail, the Blanc-Martel trail (Verdon), Nea Kameni (Santorini Caldera anchor), Fish River Canyon Hiking Trail, Tuktuk Siadong on Samosir (Lake Toba).

Two gate flags, both deliberate anchors, kept with reasons:

- **belize-barrier-reef, 55.35 km from the reef entity's P625 (class A).** The entity coordinate sits on the Belize coast, not on the reef. The anchor is the Great Blue Hole pin (17.3153, -87.5344), the bank's existing entry for the reef's signature component, on the reef itself. Same deliberate-anchor pattern as Milford Sound in earlier chunks.
- **bryce-canyon, 3.55 km (class C).** The anchor is the national park entity's P625 (37.6167, -112.1425); the audit's reference is the feature entity's P625. Both points sit in the Bryce amphitheatre area (reverse geocode: Tropic Trail, at the rim).

Three audit "reference errors" (guilin-karst, santorini-caldera, the-wave: "no QID") are gaps in the audit's own reference table, not anchor errors: all three anchors come from QIDs resolved in this chunk (Guilin Q189633, its P625 on the Li River amid the karst; Santorini caldera; The Wave Q3032130) and all three reverse-geocode onto the feature.

## Proximity (under 25 km, plus area containment)

Intended component-vs-whole and same-place pairs:

- **kilauea ↔ halemaumau-crater, 1.3 km**: the crater is Kīlauea's summit crater; both cards are legitimate.
- **belize-barrier-reef ↔ great-blue-hole, 0.0 km**: deliberate shared anchor (above).
- **yosemite-falls ↔ yosemite-valley, 1.1 km** (and Half Dome 5.7 km): the falls are in the valley; the valley is a separate existing card.
- **guilin-karst ↔ Guilin (city), 2.0 km**: the karst anchor is the Guilin entity's P625 on the Li River; the towers ring the city.
- **santorini-caldera ↔ Santorini (city entry), 3.5 km**: caldera anchor in the bay beside Nea Kameni; the island entry is the town.

Neighbouring but distinct features: eiger ↔ jungfrau 5.6 km (adjacent Bernese Oberland summits); aletsch-glacier ↔ jungfrau 13.7 km and ↔ eiger 16.0 km (same massif cluster); antelope-canyon ↔ horseshoe-bend 12.5 km (both near Page, different features); aoraki-mount-cook ↔ franz-josef-glacier 14.1 km (opposite sides of the Main Divide); seljalandsfoss ↔ heimaey-iceland 23.2 km (offshore island, unrelated).

Area discs legitimately contain component entries and shore cities (the covering-anchor pattern): Atacama disc holds Valle de la Luna and Antofagasta; Gobi disc holds Flaming Cliffs, Nemegt Formation, Yolyn Am; Namib disc holds Sossusvlei, Deadvlei, Spitzkoppe, Windhoek; Caspian disc holds Baku and Makhachkala; Tanganyika disc holds Bujumbura and Gitega. One reverse case: rhine-falls falls inside the pre-existing black-forest disc (80 km), which predates this chunk.

## Photos

One real Commons photo per entry, each viewed before selection (contact sheets plus refill rounds for seven weak first passes). PD/CC0 where available, CC BY / CC BY-SA recorded per entry in the table below. No Wikipedia article page images, no maps, montages, paintings, or satellite imagery. One NASA astronaut photograph is used where it is the honest view of the feature (Tambora's caldera, seen whole only from above); the Sahara photo is a ground-level Erg Chebbi sunrise, public domain. Every URL verified HTTP 200 and unique across both datasets. Viewed copies saved in `.batch-landforms/` (49 files). Two weak-photo notes: Tugela Falls' freely licensed photos never show the thin falls ribbon clearly, so the card shows its Amphitheatre cliff (the falls' own wall); the Caspian photo is a shore view, the only honest ground view of a sea-sized lake.

## Test changes (all flagged, per the brief)

Full suite: **83/83 pass** (`node --test test/*.test.mjs`).

1. `test/pack-pools.test.mjs`: `PACK_LANDFORM_IDS.size` 138 → 187, and the test title updated to match. (Pool-count change, expected.)
2. `test/passport-packs.test.mjs`: section totals [207, 249, 138] → [207, 249, 187]; total 594 → 643. (Pool-count change, expected.)
3. `test/extent-aware-scoring.test.mjs`: **beyond pool counts** — the `APPROVED_AREAS` manifest, which asserts the bank's radius-area set equals an approved list, extended with the 12 new area entries and their radii (listed above). The manifest is the approval record for area radii, so new areas cannot pass without it; flagged for the orchestrator's review rather than treated as a formality.
4. Dex numbering: several existing Landforms' derived Passport numbers shift because the new ids interleave in pool order. That is the approved pre-lock derived numbering working as designed; no test pinned a shifted number.

No other test files changed. The Daily fixture (2026-11-03) is untouched: the new entries are landmarks and cannot enter the city Daily pool, and the extent-aware suite's frozen fixture passes as-is.

## Files changed

- `assets/locations-landmarks-sol.json` (+49 entries, appended id-sorted)
- `assets/extents.json` (+sahara record only)
- `build/make-extents.mjs` (Sahara record, ring simplifier, source documentation)
- `build/extract-sahara-ecoregions.py` (new; the kept extraction script)
- `scripts/pack-landforms/derive.py` (EXCLUSIONS +4 names, CURATED_ADDITION_IDS +49)
- `src/meta/pack-landforms.js` (regenerated, +49 ids)
- `test/pack-pools.test.mjs`, `test/passport-packs.test.mjs`, `test/extent-aware-scoring.test.mjs` (above)
- `.batch-landforms/` (49 viewed photo copies)
- `build/extent-sources/` (gitignored source downloads, as with the Reef)

## Per-entry record

| id | kind | anchor (lat, lng) | anchor reference | D | views/day mean / median | photo (Commons file) | license | author |
|---|---|---|---|---|---|---|---|---|
| aconcagua | landmark | -32.6531, -70.0117 | Wikidata P625 of Q39739 | 6 | 1170 / 1121 | Aconcagua 13.JPG | CC BY 3.0 | Mariordo Mario Roberto Duran Ortiz |
| aletsch-glacier | landmark | 46.4422, 8.0772 | Wikidata P625 of Q204658 | 5 | 81 / 72 | Aletschgletscher mit Pinus cembra1.jpg | CC BY 2.0 | Jo Simon on Flickr |
| antelope-canyon | landmark | 36.8578, -111.3722 | Wikidata P625 of Q308926 | 7 | 275 / 274 | USA Antelope-Canyon.jpg | Public domain | Lucas Löffler |
| aoraki-mount-cook | landmark | -43.595, 170.1419 | Wikidata P625 of Q5059 | 7 | 348 / 322 | Aoraki from Mueller Hut, Aoraki - Mount Cook National Park, New Zealand.jpg | CC BY-SA 4.0 | Michal Klajban |
| atacama | area 250 km | -24.5, -69.25 | Wikidata P625 of Q47141 | 7 | 889 / 881 | ALMA’s dishes huddle together in the desolate landscape of Chile’s Atacama Desert (ann16035b).jpg | CC BY 4.0 | A. Caproni/ESO |
| bay-of-fundy | area 100 km | 45, -65.75 | Wikidata P625 of Q181857 | 9 | 359 / 318 | NB-00046 - Hopewell Rocks (51304954724).jpg | CC BY-SA 2.0 | Dennis G. Jarvis |
| belize-barrier-reef | area 120 km | 17.3153, -87.5344 | deliberate anchor (see report) | 9 | 74 / 75 | Belize Caye Caulker-211.jpg | CC BY 3.0 | Dronepicr |
| bryce-canyon | landmark | 37.6167, -112.1425 | Wikidata P625 of Q43590260 | 6 | 366 / 352 | Bryce Amphitheater from Sunrise Point, Bryce Canyon National Park, Utah.jpg | CC BY-SA 4.0 | Christian David |
| cappadocia | landmark | 38.6706, 34.8392 | Wikidata P625 of Q217265 | 4 | 1096 / 1060 | The extraordinary landscape of Cappadocia, Turkey - panoramio.jpg | CC BY 3.0 | belemita@gmail.com |
| carlsbad-caverns | landmark | 32.1753, -104.4439 | Wikidata P625 of Q273195 | 6 | 271 / 268 | Big Room, Carlsbad Cavern (51202435701).jpg | Public domain | CarlsbadCavernsNPS |
| caspian-sea | area 340 km | 42, 50.5 | Wikidata P625 of Q5484 | 3* | 2598 / 2407 | Caspian Sea Khezershahr beach.jpg | CC BY 3.0 | Sasan Geranmehr |
| colca-canyon | landmark | -15.5972, -72.0559 | Wikidata P625 of Q1107685 | 9 | 88 / 86 | Andean condor at Colca Canyon - 53032077390.jpg | CC BY 2.0 | Hans Brian Brandsberg Berg |
| devils-tower | landmark | 44.5903, -104.7153 | Wikidata P625 of Q306201 | 5 | 1032 / 953 | Devils Tower CROP.jpg | Public domain | not stated |
| eiger | landmark | 46.5776, 8.0053 | Wikidata P625 of Q4425 | 4 | 412 / 411 | Eiger Nordwand - panoramio (1).jpg | CC BY 3.0 | qwesy qwesy |
| fish-river-canyon | landmark | -27.7187, 17.5786 | Wikidata P625 of Q1420196 | 9 | 61 / 61 | Fish River Canyon (37687631182).jpg | CC BY 2.0 | Sonse |
| franz-josef-glacier | landmark | -43.475, 170.2 | Wikidata P625 of Q673150 | 8 | 89 / 83 | Franz Josef Glacier 14.jpg | CC BY-SA 4.0 | Krzysztof Golik |
| gobi | area 340 km | 42.5, 103 | Wikidata P625 of Q42070 | 5 | 928 / 914 | Camels in Gobi Desert 01.jpg | CC0 | Bernard Gagnon |
| guilin-karst | landmark | 25.2667, 110.2833 | Wikidata P625 of Q189633 | 8 | 350 / 349 | Li River and mountains in Yangshuo County, Guilin38.jpg | CC0 | Huangdan2060 |
| huangshan | landmark | 30.125, 118.1667 | Wikidata P625 of Q36034 | 7 | 215 / 210 | Mount-huangshan 53319729912.jpg | CC BY 2.0 | xiquinhosilva |
| ilulissat-icefjord | landmark | 69.15, -49.55 | Wikidata P625 of Q828071 | 9* | 41 / 34 | Ilulissat Icefjord.jpg | CC BY 4.0 | Quintin Soloviev |
| kaieteur-falls | landmark | 5.1781, -59.4823 | Wikidata P625 of Q38120 | 9 | 204 / 185 | Kaieteur Falls Aerial 02.jpg | CC BY 2.0 | Amanda |
| kalahari | area 300 km | -23, 22 | Wikidata P625 of Q47700 | 7 | 476 / 466 | 106 Angolan giraffe walking in the Kalahari Desert of Namibia Photo by Giles Laurent.jpg | CC BY-SA 4.0 | Giles Laurent |
| kilauea | landmark | 19.4211, -155.2868 | Wikidata P625 of Q188698 | 5 | 795 / 747 | Kīlauea summit eruption fissures within Halema'uma'u crater lava lake (96756).jpg | Public domain | USGS

Hawaiian Volcano Observatory |
| lake-tahoe | landmark | 39.0833, -120.0333 | Wikidata P625 of Q169962 | 7 | 1465 / 1417 | Emerald Bay, Lake Tahoe, California. 2015.jpg | CC0 | Eric Philbin |
| lake-tanganyika | area 330 km | -6.1, 29.5 | Wikidata P625 of Q5511 | 6 | 571 / 567 | Lake Tanganyika at Gombe Stream National Park.jpg | CC BY 2.0 | fabulousfabs |
| lake-toba | area 50 km | 2.67, 98.8875 | Wikidata P625 of Q183360 | 9 | 390 / 362 | Danau Toba, Sumatera.jpg | CC BY-SA 4.0 | Yurianto76 |
| mammoth-cave | landmark | 37.1833, -86.1 | Wikidata P625 of Q2666855 | 5 | 82 / 80 | Historic Entrance (Mammoth Cave, Kentucky, USA) 35 (37548438050).jpg | CC BY 2.0 | James St. John |
| mauna-loa | landmark | 19.4833, -155.6 | Wikidata P625 of Q159762 | 5 | 664 / 666 | Mauna loa from hilo bay.JPG | CC0 | Kaleodu at English Wikipedia |
| mount-ararat | landmark | 39.7019, 44.2983 | Wikidata P625 of Q72303 | 7 | 1025 / 1004 | Mount Ararat, Two volcanic cones, Ararat Plain, Armenia.jpg | CC BY 4.0 | Vyacheslav Argenberg |
| mount-olympus | landmark | 40.0833, 22.35 | Wikidata P625 of Q80344 | 4 | 1322 / 1211 | Olympus National Park 30.jpg | CC BY-SA 4.0 | kallerna |
| mount-rainier | landmark | 46.8517, -121.7603 | Wikidata P625 of Q194057 | 2 | 1545 / 1542 | Rainier20200906.jpg | CC0 | Caleb Riston |
| mount-roraima | landmark | 5.1419, -60.7642 | Wikidata P625 of Q4777 | 8 | 359 / 275 | Monte Roraima e Kukenan Tepui com sol radiante.jpg | CC BY-SA 4.0 | Ney Teixeira de Freitas Guimarães Filho |
| mount-st-helens | landmark | 46.2003, -122.1894 | Wikidata P625 of Q4675 | 2* | 2149 / 1899 | Mount St. Helens Summit Panorama.jpg | CC BY 3.0 | Farwestern Photo by Gregg M. Erickson |
| mount-tambora | landmark | -8.2453, 117.9928 | Wikidata P625 of Q168714 | 8* | 590 / 535 | Mount Tambora Volcano, Sumbawa Island, Indonesia.jpg | Public domain | This image was taken by the NASA Expedition  |
| mount-vinson | landmark | -78.5253, -85.6172 | Wikidata P625 of Q17189941 | 10 | 63 / 58 | Mount Vinson from NW at Vinson Plateau by Christian Stangl (flickr).jpg | CC BY-SA 2.0 | Christian Stangl |
| namib | area 250 km | -23, 15 | Wikidata P625 of Q131377 | 4 | 247 / 246 | Sossusvlei Dunes Namib.jpg | CC0 | Vicartb |
| okavango-delta | area 90 km | -19.4, 22.9 | Wikidata P625 of Q650872 | 8 | 337 / 320 | Vista aérea del delta del Okavango, Botsuana, 2018-08-01, DD 42.jpg | CC BY-SA 4.0 | Diego Delso |
| puncak-jaya | landmark | -4.0833, 137.1833 | Wikidata P625 of Q1045888 | 10 | 487 / 489 | The Pyramids of the Equator.jpg | CC BY-SA 4.0 | Yobel Irnawan |
| rhine-falls | landmark | 47.6772, 8.6158 | Wikidata P625 of Q214924 | 4 | 213 / 226 | Chutes du Rhin - Octobre 2021.jpg | CC BY-SA 4.0 | Christian David |
| rub-al-khali | area 280 km | 20, 50 | Wikidata P625 of Q229269 | 7 | 385 / 377 | Ar-Rub' Al-Khali (Oman) kz04.jpg | CC BY-SA 4.0 | Krzysztof Ziarnek, Kenraiz |
| sahara | extent polygon | 23.0797, 12.6122 | Sahara entity P625 (Q6583). Brief's Erg Chebbi anchor measured 129.9 km OUTSIDE the RESOLVE named-desert union (it falls in the North Saharan steppe fringe ecoregion), so the entity coordinate inside the geometry is used; Erg Chebbi remains the photo. | 4* | 1562 / 1584 | Erg chebbi sunrise.jpg | Public domain | JanSuchy |
| santorini-caldera | area 5 km | 36.4036, 25.3964 | Wikidata P625 of Q2071883 | 4* | 1110 / 1211 | Oia - Santorini 2019.jpg | CC BY-SA 4.0 | User:Anna.Tsolidou |
| seljalandsfoss | landmark | 63.6158, -19.9928 | Wikidata P625 of Q777882 | 5 | 68 / 66 | Seljalandsfoss Waterfall, Iceland, 20240720 1501 3097.jpg | CC BY 4.0 | Jakub Hałun |
| stromboli | landmark | 38.804, 15.2233 | Wikidata P625 of Q131148 | 7 | 410 / 422 | Eruption of Stromboli volcano - 2012-06-01 A.jpg | CC BY 2.0 | Mark Ireland (https://www.flickr.com/people/ |
| the-wave | landmark | 36.9961, -112.006 | Wikidata P625 of Q3032130 | 8 | 10 / 10 | The Wave - Coyote Buttes North (49995394933).jpg | Public domain | BLMUtah |
| tugela-falls | landmark | -28.7522, 28.8941 | Wikidata P625 of Q223649 | 6 | 118 / 109 | Amphitheatre Drakensberg View.jpg | CC BY-SA 3.0 | PhilippN |
| verdon-gorge | landmark | 43.7378, 6.3639 | Wikidata P625 of Q687057 | 7 | 131 / 122 | Aerial view of the outlet of the Verdon gorge.jpg | CC BY 4.0 | Olivier Cleynen |
| waitomo-glowworm-caves | landmark | -38.2608, 175.1036 | Wikidata P625 of Q7960635 | 5 | 7 / 7 | Waitomo Caves - panoramio.jpg | CC BY 3.0 | Николай Максимович |
| yosemite-falls | landmark | 37.755, -119.5973 | Wikidata P625 of Q491677 | 7 | 82 / 79 | Yosemite Falls from trail, Yosemite NP, CA, US - Diliff.jpg | CC BY-SA 3.0 | Diliff |

* difficulty set by the median under the spike rule (see Difficulty).

Photo URLs (500px Commons thumbnails, each verified HTTP 200 and unique across both datasets):

- aconcagua: https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c8/Aconcagua_13.JPG/500px-Aconcagua_13.JPG
- aletsch-glacier: https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a5/Aletschgletscher_mit_Pinus_cembra1.jpg/500px-Aletschgletscher_mit_Pinus_cembra1.jpg
- antelope-canyon: https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/USA_Antelope-Canyon.jpg/500px-USA_Antelope-Canyon.jpg
- aoraki-mount-cook: https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Aoraki_from_Mueller_Hut%2C_Aoraki_-_Mount_Cook_National_Park%2C_New_Zealand.jpg/500px-Aoraki_from_Mueller_Hut%2C_Aoraki_-_Mount_Cook_National_Park%2C_New_Zealand.jpg
- atacama: https://thumb.wikimedia.org/wikipedia/commons/thumb/8/84/ALMA%E2%80%99s_dishes_huddle_together_in_the_desolate_landscape_of_Chile%E2%80%99s_Atacama_Desert_%28ann16035b%29.jpg/500px-ALMA%E2%80%99s_dishes_huddle_together_in_the_desolate_landscape_of_Chile%E2%80%99s_Atacama_Desert_%28ann16035b%29.jpg
- bay-of-fundy: https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/NB-00046_-_Hopewell_Rocks_%2851304954724%29.jpg/500px-NB-00046_-_Hopewell_Rocks_%2851304954724%29.jpg
- belize-barrier-reef: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Belize_Caye_Caulker-211.jpg/500px-Belize_Caye_Caulker-211.jpg
- bryce-canyon: https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Bryce_Amphitheater_from_Sunrise_Point%2C_Bryce_Canyon_National_Park%2C_Utah.jpg/500px-Bryce_Amphitheater_from_Sunrise_Point%2C_Bryce_Canyon_National_Park%2C_Utah.jpg
- cappadocia: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/The_extraordinary_landscape_of_Cappadocia%2C_Turkey_-_panoramio.jpg/500px-The_extraordinary_landscape_of_Cappadocia%2C_Turkey_-_panoramio.jpg
- carlsbad-caverns: https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8d/Big_Room%2C_Carlsbad_Cavern_%2851202435701%29.jpg/500px-Big_Room%2C_Carlsbad_Cavern_%2851202435701%29.jpg
- caspian-sea: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Caspian_Sea_Khezershahr_beach.jpg/500px-Caspian_Sea_Khezershahr_beach.jpg
- colca-canyon: https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Andean_condor_at_Colca_Canyon_-_53032077390.jpg/500px-Andean_condor_at_Colca_Canyon_-_53032077390.jpg
- devils-tower: https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/Devils_Tower_CROP.jpg/500px-Devils_Tower_CROP.jpg
- eiger: https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Eiger_Nordwand_-_panoramio_%281%29.jpg/500px-Eiger_Nordwand_-_panoramio_%281%29.jpg
- fish-river-canyon: https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Fish_River_Canyon_%2837687631182%29.jpg/500px-Fish_River_Canyon_%2837687631182%29.jpg
- franz-josef-glacier: https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c4/Franz_Josef_Glacier_14.jpg/500px-Franz_Josef_Glacier_14.jpg
- gobi: https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Camels_in_Gobi_Desert_01.jpg/500px-Camels_in_Gobi_Desert_01.jpg
- guilin-karst: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ec/Li_River_and_mountains_in_Yangshuo_County%2C_Guilin38.jpg/500px-Li_River_and_mountains_in_Yangshuo_County%2C_Guilin38.jpg
- huangshan: https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Mount-huangshan_53319729912.jpg/500px-Mount-huangshan_53319729912.jpg
- ilulissat-icefjord: https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/Ilulissat_Icefjord.jpg/500px-Ilulissat_Icefjord.jpg
- kaieteur-falls: https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Kaieteur_Falls_Aerial_02.jpg/500px-Kaieteur_Falls_Aerial_02.jpg
- kalahari: https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/106_Angolan_giraffe_walking_in_the_Kalahari_Desert_of_Namibia_Photo_by_Giles_Laurent.jpg/500px-106_Angolan_giraffe_walking_in_the_Kalahari_Desert_of_Namibia_Photo_by_Giles_Laurent.jpg
- kilauea: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f5/K%C4%ABlauea_summit_eruption_fissures_within_Halema%27uma%27u_crater_lava_lake_%2896756%29.jpg/500px-K%C4%ABlauea_summit_eruption_fissures_within_Halema%27uma%27u_crater_lava_lake_%2896756%29.jpg
- lake-tahoe: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/Emerald_Bay%2C_Lake_Tahoe%2C_California._2015.jpg/500px-Emerald_Bay%2C_Lake_Tahoe%2C_California._2015.jpg
- lake-tanganyika: https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/Lake_Tanganyika_at_Gombe_Stream_National_Park.jpg/500px-Lake_Tanganyika_at_Gombe_Stream_National_Park.jpg
- lake-toba: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Danau_Toba%2C_Sumatera.jpg/500px-Danau_Toba%2C_Sumatera.jpg
- mammoth-cave: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f4/Historic_Entrance_%28Mammoth_Cave%2C_Kentucky%2C_USA%29_35_%2837548438050%29.jpg/500px-Historic_Entrance_%28Mammoth_Cave%2C_Kentucky%2C_USA%29_35_%2837548438050%29.jpg
- mauna-loa: https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/Mauna_loa_from_hilo_bay.JPG/500px-Mauna_loa_from_hilo_bay.JPG
- mount-ararat: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/Mount_Ararat%2C_Two_volcanic_cones%2C_Ararat_Plain%2C_Armenia.jpg/500px-Mount_Ararat%2C_Two_volcanic_cones%2C_Ararat_Plain%2C_Armenia.jpg
- mount-olympus: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/Olympus_National_Park_30.jpg/500px-Olympus_National_Park_30.jpg
- mount-rainier: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Rainier20200906.jpg/500px-Rainier20200906.jpg
- mount-roraima: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/Monte_Roraima_e_Kukenan_Tepui_com_sol_radiante.jpg/500px-Monte_Roraima_e_Kukenan_Tepui_com_sol_radiante.jpg
- mount-st-helens: https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Mount_St._Helens_Summit_Panorama.jpg/500px-Mount_St._Helens_Summit_Panorama.jpg
- mount-tambora: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/Mount_Tambora_Volcano%2C_Sumbawa_Island%2C_Indonesia.jpg/500px-Mount_Tambora_Volcano%2C_Sumbawa_Island%2C_Indonesia.jpg
- mount-vinson: https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Mount_Vinson_from_NW_at_Vinson_Plateau_by_Christian_Stangl_%28flickr%29.jpg/500px-Mount_Vinson_from_NW_at_Vinson_Plateau_by_Christian_Stangl_%28flickr%29.jpg
- namib: https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Sossusvlei_Dunes_Namib.jpg/500px-Sossusvlei_Dunes_Namib.jpg
- okavango-delta: https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Vista_a%C3%A9rea_del_delta_del_Okavango%2C_Botsuana%2C_2018-08-01%2C_DD_42.jpg/500px-Vista_a%C3%A9rea_del_delta_del_Okavango%2C_Botsuana%2C_2018-08-01%2C_DD_42.jpg
- puncak-jaya: https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c8/The_Pyramids_of_the_Equator.jpg/500px-The_Pyramids_of_the_Equator.jpg
- rhine-falls: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e7/Chutes_du_Rhin_-_Octobre_2021.jpg/500px-Chutes_du_Rhin_-_Octobre_2021.jpg
- rub-al-khali: https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Ar-Rub%27_Al-Khali_%28Oman%29_kz04.jpg/500px-Ar-Rub%27_Al-Khali_%28Oman%29_kz04.jpg
- sahara: https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Erg_chebbi_sunrise.jpg/500px-Erg_chebbi_sunrise.jpg
- santorini-caldera: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Oia_-_Santorini_2019.jpg/500px-Oia_-_Santorini_2019.jpg
- seljalandsfoss: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Seljalandsfoss_Waterfall%2C_Iceland%2C_20240720_1501_3097.jpg/500px-Seljalandsfoss_Waterfall%2C_Iceland%2C_20240720_1501_3097.jpg
- stromboli: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Eruption_of_Stromboli_volcano_-_2012-06-01_A.jpg/500px-Eruption_of_Stromboli_volcano_-_2012-06-01_A.jpg
- the-wave: https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/The_Wave_-_Coyote_Buttes_North_%2849995394933%29.jpg/500px-The_Wave_-_Coyote_Buttes_North_%2849995394933%29.jpg
- tugela-falls: https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6a/Amphitheatre_Drakensberg_View.jpg/500px-Amphitheatre_Drakensberg_View.jpg
- verdon-gorge: https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d6/Aerial_view_of_the_outlet_of_the_Verdon_gorge.jpg/500px-Aerial_view_of_the_outlet_of_the_Verdon_gorge.jpg
- waitomo-glowworm-caves: https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Waitomo_Caves_-_panoramio.jpg/500px-Waitomo_Caves_-_panoramio.jpg
- yosemite-falls: https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Yosemite_Falls_from_trail%2C_Yosemite_NP%2C_CA%2C_US_-_Diliff.jpg/500px-Yosemite_Falls_from_trail%2C_Yosemite_NP%2C_CA%2C_US_-_Diliff.jpg

## Clues and facts, verbatim

### aconcagua
- Clue: Aconcagua, Argentina 🇦🇷
- Fact: At 6,961 m (22,837 ft) Aconcagua is the highest mountain outside Asia and the tallest in both the Western and Southern Hemispheres. Despite the altitude its normal route is a walk-up needing no technical climbing, though its weather kills climbers most seasons.

### aletsch-glacier
- Clue: Aletsch Glacier, Switzerland 🇨🇭
- Fact: The largest glacier in the Alps, about 20 km long and covering some 80 km²; at Konkordiaplatz, where three ice streams merge, the ice is around 900 m thick. It is retreating so fast that the Märjelensee, a lake once famous for calving icebergs beside it, has drained away.

### antelope-canyon
- Clue: Antelope Canyon, Arizona 🇺🇸
- Fact: Flash floods rushing through a crack in Navajo sandstone polished this slot canyon into flowing waves of red rock. Around midday in summer, shafts of sunlight fall straight to the floor of Upper Antelope Canyon, on Navajo land near Page and visitable only on guided tours.

### aoraki-mount-cook
- Clue: Aoraki / Mount Cook, New Zealand 🇳🇿
- Fact: New Zealand's highest mountain at 3,724 m, called Aoraki, 'cloud-piercer', in te reo Māori. A huge rock avalanche in 1991 sheared about 10 m from its summit, and ice and rock loss has lowered it since.

### atacama
- Clue: Atacama Desert, Chile 🇨🇱
- Fact: The driest non-polar desert on Earth: some of its weather stations have never recorded rain, and its hyper-arid core averages under 15 mm a year. The same clear, dry skies put the ALMA observatory's 66 radio antennas on its Chajnantor plateau, 5,000 m up.

### bay-of-fundy
- Clue: Bay of Fundy, Canada 🇨🇦
- Fact: Fundy's tides are the highest on Earth, rising as much as 16 m at Burntcoat Head, as much water as all the world's rivers combined pours in and out twice a day. At the Hopewell Rocks, flowerpot sea stacks stand on an ocean floor you can walk at low tide.

### belize-barrier-reef
- Clue: Belize Barrier Reef, Belize 🇧🇿
- Fact: At roughly 300 km, this is the largest barrier reef system in the Northern Hemisphere, a chain of mangrove cayes, atolls and patch reefs. Its Great Blue Hole, a marine sinkhole 124 m deep, became world famous after Jacques Cousteau named it a top-ten dive site in 1971.

### bryce-canyon
- Clue: Bryce Canyon, Utah 🇺🇸
- Fact: Not a canyon at all, but a row of amphitheatres bitten into the Paunsaugunt Plateau, filled with pink limestone spires called hoodoos. At 2,400-2,700 m elevation, some 200 freeze-thaw cycles a year wedge the rock apart grain by grain.

### cappadocia
- Clue: Cappadocia, Turkey 🇹🇷
- Fact: Erosion carved compressed volcanic ash into 'fairy chimney' spires, and people carved back: the soft tuff holds rock-cut churches and whole underground cities such as Derinkuyu, which descends about 60 m. At dawn, fleets of hot-air balloons drift over the valleys of Göreme.

### carlsbad-caverns
- Clue: Carlsbad Caverns, New Mexico 🇺🇸
- Fact: The Big Room, roughly 1,200 m long and up to 79 m high, is among the largest cave chambers in North America. On summer evenings some 400,000 Brazilian free-tailed bats spiral out of the Natural Entrance in a column that can take three hours to empty.

### caspian-sea
- Clue: Caspian Sea, Central Asia
- Fact: The world's largest inland body of water at about 371,000 km² is a lake in all but name: the Volga makes its northern third nearly fresh while the south is almost as salty as the ocean. Its surface sits about 28 m below sea level.

### colca-canyon
- Clue: Colca Canyon, Peru 🇵🇪
- Fact: At roughly 3,270 m deep, more than twice the Grand Canyon, Colca is among the deepest canyons on Earth. At the Cruz del Cóndor lookout, Andean condors ride morning thermals past the rim, and terraces cut before the Inca still green its slopes.

### devils-tower
- Clue: Devils Tower, Wyoming 🇺🇸
- Fact: A boss of fluted igneous columns rising 386 m above the Belle Fourche River, formed as an intrusion that cooled and cracked into hexagons underground and was exposed by erosion. Proclaimed the first US national monument in 1906, it is Bear Lodge, sacred to the Lakota and other Plains tribes.

### eiger
- Clue: Eiger, Switzerland 🇨🇭
- Fact: The Eiger's 1,800 m north wall was the last of the Alps' great north faces to be climbed, in 1938, after a run of fatal attempts earned it the nickname Mordwand, 'murder wall'. A cog railway tunnels through the mountain itself, with windows cut into the face.

### fish-river-canyon
- Clue: Fish River Canyon, Namibia 🇳🇦
- Fact: Africa's largest canyon runs 160 km, up to 27 km wide and 550 m deep, cut first by tectonic rifting and then by the Fish River's meanders. Its 85 km hiking trail opens only in the cool season; summer heat on the canyon floor is dangerous.

### franz-josef-glacier
- Clue: Franz Josef Glacier, New Zealand 🇳🇿
- Fact: This glacier pours from the Southern Alps down to about 300 m above sea level, ending amid temperate rainforest, a rare pairing of ice and lush green. Explorer Julius von Haast named it in 1865 for Emperor Franz Joseph I of Austria.

### gobi
- Clue: Gobi Desert, Mongolia 🇲🇳
- Fact: A cold desert of gravel plains and bare rock where winter brings -40 °C and herders' camels grow shaggy coats. At Bayanzag's Flaming Cliffs in 1923, Roy Chapman Andrews' expedition found the first dinosaur eggs recognised by science.

### guilin-karst
- Clue: Guilin Karst, China 🇨🇳
- Fact: Between Guilin and Yangshuo the Li River threads a forest of limestone towers, the karst landscape printed on China's 20-yuan banknote. The towers are the eroded floor of a tropical sea that covered the region some 300 million years ago.

### huangshan
- Clue: Huangshan, China 🇨🇳
- Fact: Granite pinnacles, gnarled pines gripping bare rock, and seas of cloud made Huangshan the model for classical Chinese shan shui painting. More than 60,000 stone steps stitch its paths together, and porters still carry loads up them slung from bamboo shoulder poles.

### ilulissat-icefjord
- Clue: Ilulissat Icefjord, Greenland 🇬🇱
- Fact: The fjord is the sea terminus of Sermeq Kujalleq, one of Earth's fastest glaciers, which calves more ice than any glacier outside Antarctica. Bergs ground for years on a shallow moraine at the fjord's mouth before escaping to Disko Bay; the berg that sank the Titanic is often traced to this fjord.

### kaieteur-falls
- Clue: Kaieteur Falls, Guyana 🇬🇾
- Fact: The Potaro River pours over a sheer 226 m ledge in Guyana's rainforest, making Kaieteur the largest single-drop waterfall on Earth by volume, about five times Niagara's height. No road reaches it: visitors arrive by small plane or a trek of several days.

### kalahari
- Clue: Kalahari Desert, Botswana 🇧🇼
- Fact: A 900,000 km² sea of red sand that is only semi-desert: summer rains green it enough for great herds and the black-maned Kalahari lions. The Okavango River ends here, spreading into an inland delta instead of ever reaching the sea.

### kilauea
- Clue: Kīlauea, Hawaii 🇺🇸
- Fact: Among the world's most active volcanoes, Kīlauea erupted almost continuously from 1983 to 2018 at Puʻu ʻŌʻō. The 2018 lower East Rift eruption destroyed more than 700 homes, and the summit's Halemaʻumaʻu crater periodically hosts a roiling lava lake.

### lake-tahoe
- Clue: Lake Tahoe, United States 🇺🇸
- Fact: North America's largest alpine lake by volume is 501 m deep and famed for cobalt clarity, with visibility sometimes past 20 m. It straddles the California-Nevada line, its surface 1,897 m up in the Sierra Nevada, and despite hard winters it never freezes over.

### lake-tanganyika
- Clue: Lake Tanganyika, Tanzania 🇹🇿
- Fact: The world's longest freshwater lake (about 673 km) and second deepest at 1,470 m, holding roughly 16% of Earth's unfrozen surface fresh water. Its clear waters evolved more than 250 species of cichlid fish found almost nowhere else.

### lake-toba
- Clue: Lake Toba, Indonesia 🇮🇩
- Fact: The world's largest volcanic lake fills the caldera of a super-eruption about 74,000 years ago that may have cooled the planet for years. Samosir Island, uplifted from the caldera floor, is nearly the size of Singapore and home to the Christian Batak people.

### mammoth-cave
- Clue: Mammoth Cave, Kentucky 🇺🇸
- Fact: The longest known cave system on Earth, with more than 676 km (420 miles) of surveyed passages and more still being mapped. Gypsum crystals coat its dry upper levels, while the Echo River, home to blind white fish, runs through its depths.

### mauna-loa
- Clue: Mauna Loa, Hawaii 🇺🇸
- Fact: The largest volcano on Earth by volume: it rises 4,169 m above the sea and about 17 km from its base on the ocean floor, a taller pile than Everest. On its northern flank the Mauna Loa Observatory has measured atmospheric CO₂ since 1958, producing the Keeling Curve.

### mount-ararat
- Clue: Mount Ararat, Turkey 🇹🇷
- Fact: A dormant twin-coned volcano: Greater Ararat (5,137 m) is Turkey's highest peak, and tradition holds that Noah's Ark came to rest on it. It stands in Turkey but is Armenia's national symbol, printed on its coat of arms and visible from Yerevan on clear days.

### mount-olympus
- Clue: Mount Olympus, Greece 🇬🇷
- Fact: Greece's highest summit, Mytikas (2,917 m), was the throne of the twelve Olympian gods, its peak usually hidden by cloud. Nobody is known to have stood on top until 1913; the massif is now a national park famed for its wildflowers and chamois.

### mount-rainier
- Clue: Mount Rainier, Washington 🇺🇸
- Fact: The most glaciated peak in the contiguous United States, wrapped in 26 named glaciers, and the most topographically prominent: it rises about 4,000 m from the surrounding lowlands. It is an active volcano whose mudflows (lahars) threaten towns in the Puyallup valley below.

### mount-roraima
- Clue: Mount Roraima, Venezuela 🇻🇪
- Fact: A tepui whose flat summit, about 31 km², is ringed by cliffs up to 1,000 m tall at the junction of Venezuela, Brazil and Guyana. It inspired Conan Doyle's 'The Lost World'; its blackened summit rocks host a tiny frog that, unable to hop well, curls into a ball and rolls away from danger.

### mount-st-helens
- Clue: Mount St. Helens, Washington 🇺🇸
- Fact: On 18 May 1980 its north flank slid away in the largest landslide in recorded history, and the eruption that followed cut the summit from 2,950 m to 2,549 m. A new lava dome has been growing inside the horseshoe crater ever since, most recently in 2004-2008.

### mount-tambora
- Clue: Mount Tambora, Indonesia 🇮🇩
- Fact: Tambora's April 1815 eruption, the largest in recorded history, blasted about 1,000 m off the summit and left a caldera 6 km wide. Its stratospheric sulphur veil caused 1816, the 'Year Without a Summer', with crop failures and famine across the northern hemisphere.

### mount-vinson
- Clue: Mount Vinson, Antarctica
- Fact: The highest mountain in Antarctica at 4,892 m, it was first sighted from the air in 1958 and not climbed until 1966. It crowns the Sentinel Range of the Ellsworth Mountains, roughly 1,200 km from the South Pole, where summer temperatures hover near -30 °C.

### namib
- Clue: Namib, Namibia 🇳🇦
- Fact: Often called the world's oldest desert, arid for at least 55 million years, it runs some 2,000 km along Namibia's Atlantic coast. At Sossusvlei its apricot dunes exceed 300 m, among Earth's tallest, and fog rolling in off the ocean keeps its desert life alive.

### okavango-delta
- Clue: Okavango Delta, Botswana 🇧🇼
- Fact: One of the world's largest inland deltas: floodwater from Angola fans out into the Kalahari and evaporates rather than reaching any sea. The flood peaks in the dry winter, drawing one of Africa's densest concentrations of elephants, lions and wild dogs to the shrinking lagoons.

### puncak-jaya
- Clue: Puncak Jaya, Indonesia 🇮🇩
- Fact: At 4,884 m, Puncak Jaya (the Carstensz Pyramid) is the highest point between the Himalayas and the Andes and the highest island peak on Earth. Glaciers beside this equatorial summit, extensive in the 1930s, have shrunk to a few remnants expected to vanish within years.

### rhine-falls
- Clue: Rhine Falls, Switzerland 🇨🇭
- Fact: Europe's most powerful waterfall: about 600 tonnes of water per second pour over a 23 m ledge spanning 150 m. The falls formed roughly 15,000 years ago as the Rhine was diverted into a new channel at the end of the last ice age.

### rub-al-khali
- Clue: Rub' al Khali, Saudi Arabia 🇸🇦
- Fact: The Empty Quarter is the largest continuous sand desert on Earth, some 650,000 km² of dunes up to 250 m high across four countries. Parts of its interior can go a decade without rain; Wilfred Thesiger's camel crossings of the 1940s remain its benchmark journeys.

### sahara
- Clue: Sahara, North Africa
- Fact: The largest hot desert on Earth at about 9.2 million km², nearly the size of the United States, spread across 11 countries. Its sand seas cover only about a quarter of it; most of the Sahara is gravel plain and rock plateau, and the dunes of Erg Chebbi in Morocco rise some 150 m.

### santorini-caldera
- Clue: Santorini Caldera, Greece 🇬🇷
- Fact: Santorini's crescent is the rim of a volcano that drowned its own centre: the eruption of around 1600 BCE buried the port of Akrotiri and is a candidate source for the Atlantis story. The dark islets in the bay, Nea Kameni, are new lava domes that last erupted in 1950.

### seljalandsfoss
- Clue: Seljalandsfoss, Iceland 🇮🇸
- Fact: A 60 m curtain of the Seljalandsá dropping off a cliff that was once Iceland's coastline, with a path worn behind the falls into a dripping alcove. Its river rises on Eyjafjallajökull, the ice cap whose 2010 eruption shut down European airspace.

### stromboli
- Clue: Stromboli, Italy 🇮🇹
- Fact: This Aeolian island erupts in small explosions every few minutes and has done so for centuries, earning it the name 'Lighthouse of the Mediterranean'. Its Sciara del Fuoco, a vast scar down the northwest flank, funnels lava flows straight into the Tyrrhenian Sea.

### the-wave
- Clue: The Wave, Arizona 🇺🇸
- Fact: A trough of swirled red-and-cream sandstone in Arizona's Coyote Buttes, sculpted by wind and water from dunes laid down some 190 million years ago. Access is by lottery only, a few dozen hikers a day, and there is no trail: visitors navigate by photo guide and GPS.

### tugela-falls
- Clue: Tugela Falls, South Africa 🇿🇦
- Fact: Five leaps totalling 948 m down the Drakensberg's Amphitheatre wall make the Tugela usually the world's second-tallest waterfall, and some surveys argue it edges past Angel Falls. The flow is seasonal: after summer rains it streams, in dry winters it thins to a thread.

### verdon-gorge
- Clue: Verdon Gorge, France 🇫🇷
- Fact: Europe's grandest canyon: limestone walls up to 700 m high above a river turned milky turquoise by glacial flour. The gorge was unknown to outsiders until Édouard-Alfred Martel's 1905 expedition traversed it in wooden boats; its cliffs are now a cradle of sport climbing.

### waitomo-glowworm-caves
- Clue: Waitomo Glowworm Caves, New Zealand 🇳🇿
- Fact: In the Glowworm Grotto, larvae of Arachnocampa luminosa, a fungus gnat found only in New Zealand, dangle sticky silk threads from the ceiling and glow blue-green to snare prey. Tour boats drift beneath the living light show in enforced silence.

### yosemite-falls
- Clue: Yosemite Falls, California 🇺🇸
- Fact: At 739 m (2,425 ft) in three tiers (Upper Fall, the Middle Cascades and Lower Fall), this is one of the tallest waterfalls in North America. Snowmelt swells it to a thundering torrent in late spring; by some autumns it dwindles to a wisp or dries entirely.
