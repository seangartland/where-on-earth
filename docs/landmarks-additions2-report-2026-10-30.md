# Landmarks additions 2 report, 2026-10-30

Chunk 6 of the pack additions program: the 28 GLARING landmarks from the
audit-2 report (Sean approved the glaring tier only, 2026-10-30; the
arguable tier was NOT approved and nothing beyond the 28 was added).
Executed per `.build-tmp/landmarks-adds2-brief.md` in the
`woe-adds-landmarks2` worktree at 95eddc4 (post-scrub-3 main). Not
committed, not pushed, not deployed.

## Outcome

- **28 landmarks added** to `assets/locations-landmarks-sol.json` as kind
  `landmark` point entries, appended in the audit's ranked order; the git
  diff on the bank is additions only (472 insertions, 0 deletions).
- Bank 450 → **478**. Pools measured with the game's own helpers
  (`landmarkPackPool` / `landformPackPool` / `packPool` from
  `src/meta/pack-store.js`): **Capitals 207 (unchanged), Landmarks
  215 → 243, Landforms 194 (unchanged), combined 616 → 644.**
- Suite: **83/83** (`node --test test/*.test.mjs`). Two test files changed,
  hardcoded counts only; listed in the test-changes section below.
- All 28 photo URLs re-verified live at build time: HTTP 200, image/jpeg,
  and unique across cities + bank + quarantine both as full URLs and as
  underlying Commons file names.

## Method notes

- Coordinates: Wikidata P625 for each landmark's own entity. Every QID was
  resolved by entity search (never recalled); where search failed twice
  for St Paul's Cathedral, the QID (Q173882) was taken from the English
  Wikipedia article's `wikibase_item` pageprop. Pins rounded to 4 dp,
  bank style. Stored pins agree with the articles' own coordinates
  wherever the article carries them.
- Pin audit: `python3 scripts/pin-audit.py --locations
  assets/locations-landmarks-sol.json --ids <28 ids> --reverse`.
  **GATE: 0 flagged at ≥ 3 km.** All 28 stored pins sit within 0.5 km of
  the nearest reference and are risk class D. All 28 reverse geocodes
  resolve to the landmark itself or its street (e.g. Grand Central
  Terminal at 89 East 42nd Street; Casa Batlló at 43 Passeig de Gràcia;
  the Prague clock at the Old Town City Hall Tower). The audit's
  under-10 km proximity list is all intended same-city neighbours; the
  closest, St Mark's Basilica 0.1 km from the existing St Mark's Square
  entry, is the brief's intended distinct card.
- Difficulty: the adapted v2, the same reimplementation of the frozen
  `score_v2.py` math used in chunks 1-5 (GeoNames cities15000 population
  centres from the demo tree, frozen cuts [4.7, 7.0, 9.6, 15.2, 24.3,
  44.5, 78.9, 112.9, 201.7], K = 0 for all sixteen countries in this
  chunk, none in the approved K table). Fidelity cross-check before
  scoring: the reimplementation reproduces the stored fb/iso values
  exactly for six bank pins (Statue of Liberty fb1676/iso18, American
  Museum of Natural History fb1682/iso16, Lincoln Memorial fb1425/iso201,
  Eiffel Tower fb179/iso266, Sydney Opera House fb568/iso715, Hagia
  Sophia fb310/iso91). Pageviews: Wikimedia REST, article level,
  trailing 12 complete months (2025-10 to 2026-09); mean = total/365,
  median = median of the 12 monthly daily rates. The medians reproduce
  the audit's published figures (Holy Sepulchre 1856.0, Taipei 101
  1532.8, St Paul's 1482.2). Two spike rescores, both adopted on the
  median band: Church of the Holy Sepulchre (mean band 1, median 2) and
  Taipei 101 (mean band 1, median 2; its mean is inflated by one viral
  month at roughly double the median rate).
- Photos: Commons candidates surveyed per landmark (file search with
  license and author from file-page extmetadata), finalists downloaded
  and viewed on labeled contact sheets, and every pick re-viewed as a
  center square crop on a combined crop sheet; all 28 survive the crop.
  Five entries with weak first surveys (Red Fort, Marina Bay Sands,
  Topkapi Palace, Seville Cathedral, St Mark's Basilica) got a second
  targeted survey. Excluded on sight: the Flatiron under renovation
  scaffolding, tourist selfies at Batu Caves and Topkapi, and detail
  shots where a full view existed. One pick is the landmark's defining
  interior, on the chunk-5 precedent: the Grand Central concourse (the
  only usable exterior shots found were the article page image itself);
  the other 27 picks are exteriors. None of the 28 is
  its article's page image (the page image is named in each section;
  Taipei 101's page image is a logo SVG, so no photograph could be it).
  Local copies of the 28 used photos are in `.batch-landmarks2/` as
  `<id>-final.jpg`. Stored URLs are the clean 500px
  `thumb.wikimedia.org` form.
- Sets: assigned only where the bank already runs the theme, following
  the chunk-2 practice: `Sacred Sites` for the eight religious entries
  (precedent Notre-Dame, Cologne Cathedral, Blue Mosque) and `Castles`
  for Edinburgh, Osaka, Bran and Malbork (precedent Neuschwanstein,
  Himeji, Prague Castle). All others `[]`; Topkapi Palace gets none,
  as Schönbrunn and Buckingham Palace carry none.
- Clues follow the brief's "Name, Country" convention, with the bank's
  existing conventions for the home nations: England with the England
  flag for St Paul's (as on Tower Bridge and Westminster Abbey) and
  Scotland with the Scotland flag for Edinburgh Castle (as on Eilean
  Donan). US clues name no state, per the landmarks rule.
- Dedupe: by id AND diacritics-stripped normalized short name across
  cities (804), bank (450), and quarantine: **zero hits**, and no near
  matches. St Mark's Basilica vs the existing St Mark's Square entry is
  the brief's intended pair, as are the four new Indian entries against
  the existing Gateway of India (`india-gate` vs `gateway-of-india`:
  distinct monuments, Delhi's arch vs Mumbai's).

## Per-landmark entries

### church-of-the-holy-sepulchre — Church of the Holy Sepulchre, Israel 🇮🇱
- QID Q187702, pin 31.7784, 35.2298 (Wikidata P625 31.778444, 35.229750). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Consecrated in 335 over the sites of the Crucifixion and Christ's tomb, the church is shared by six Christian denominations under a centuries-old status quo so rigid that a wooden ladder on a ledge above its entrance has stood unmoved since the 1700s.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bf/Jerusalem_Holy_Sepulchre_BW_24.JPG/500px-Jerusalem_Holy_Sepulchre_BW_24.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, Berthold Werner. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Church_of_the_Holy_Sepulchre_by_Gerd_Eichmann_(cropped).jpg`; this is not it.
- views: mean 2205.6/day, median 1856.0/day. **Difficulty 2.** **Spike rescore: mean-input loss 4.0 → band 1; median-input 5.0 → band 2, adopted.**
  difficultyWhy: `p.96·fb41·K0·iso70 → 4.0 → 1 · median rescore 5.0 → 2 (spike check)`

### taipei-101 — Taipei 101, Taiwan 🇹🇼
- QID Q83101, pin 25.0336, 121.5647 (Wikidata P625 25.033611, 121.564722). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: The world's tallest building from 2004 to 2010, it is steadied against typhoons and earthquakes by a 660-tonne steel pendulum suspended between its 87th and 92nd floors, the largest tuned mass damper on Earth.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Taipei_101_2009_amk.jpg/500px-Taipei_101_2009_amk.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, AngMoKio. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Taipei_101_logo.svg`; this is not it.
- views: mean 2991.4/day, median 1532.8/day. **Difficulty 2.** **Spike rescore: mean-input loss 3.2 → band 1; median-input 6.1 → band 2, adopted.**
  difficultyWhy: `p.99·fb90·K0·iso133 → 3.2 → 1 · median rescore 6.1 → 2 (spike check)`

### st-pauls-cathedral — St Paul's Cathedral, England 🏴🏴󠁧󠁢󠁥󠁮󠁧󠁿
- QID Q173882, pin 51.5138, -0.0983 (Wikidata P625 51.513778, -0.098306). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Wren's cathedral, finished in 1710 on the ashes of the Great Fire, hides a structural brick cone between its inner and outer domes to carry the 850-ton lantern; it remained London's tallest building until 1963.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/St_Paul%27s_Cathedral_Dome_from_One_New_Change_-_Square_Crop.jpg/500px-St_Paul%27s_Cathedral_Dome_from_One_New_Change_-_Square_Crop.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Colin. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `St_Pauls_aerial_(cropped).jpg`; this is not it.
- views: mean 1489.2/day, median 1482.2/day. **Difficulty 2.**
  difficultyWhy: `p.87·fb104·K0·iso164 → 6.4 → 2`

### statue-of-unity — Statue of Unity, India 🇮🇳
- QID Q7604504, pin 21.838, 73.7191 (Wikidata P625 21.838000, 73.719100). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: At 182 metres this statue of Sardar Vallabhbhai Patel is the tallest in the world, twice the height of the Statue of Liberty; its viewing gallery sits in the chest, 153 metres up.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/Full_Length_shot_of_The_Statue_of_Unity.jpg/500px-Full_Length_shot_of_The_Statue_of_Unity.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC0, Veera.sj. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Statue_of_Unity.jpg`; this is not it.
- views: mean 1419.1/day, median 1410.3/day. **Difficulty 5.**
  difficultyWhy: `p.86·fb488·K0·iso74 → 18.1 → 5`

### brooklyn-bridge — Brooklyn Bridge, United States 🇺🇸
- QID Q125006, pin 40.7057, -73.9963 (Wikidata P625 40.705667, -73.996333). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: When it opened in 1883 it was the longest suspension bridge on Earth. Its chief engineer, Washington Roebling, crippled by caisson disease, directed the work through a telescope from a Brooklyn window while his wife Emily carried his instructions to the site.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Brooklyn_Bridge_Manhattan.jpg/500px-Brooklyn_Bridge_Manhattan.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, Suiseiseki. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Brooklyn_Bridge_and_the_Lower_Manhattan_skyline_from_Pebble_Beach,_New_York.jpg`; this is not it.
- views: mean 1270.4/day, median 1278.8/day. **Difficulty 7.**
  difficultyWhy: `p.84·fb1680·K0·iso19 → 61.4 → 7`

### tokyo-skytree — Tokyo Skytree, Japan 🇯🇵
- QID Q57965, pin 35.7101, 139.8107 (Wikidata P625 35.710056, 139.810722). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: At 634 metres the tallest tower in the world, its height is a pun: 6-3-4 can be read as 'Musashi', the old name of the province Tokyo stands in.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Tokyo_Skytree_2023.jpg/500px-Tokyo_Skytree_2023.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC0, Akonnchiroll. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Tokyo_Skytree_2014_Ⅲ.jpg`; this is not it.
- views: mean 942.9/day, median 925.7/day. **Difficulty 5.**
  difficultyWhy: `p.77·fb236·K0·iso23 → 15.3 → 5`

### milan-cathedral — Milan Cathedral, Italy 🇮🇹
- QID Q18068, pin 45.464, 9.1906 (Wikidata P625 45.463968, 9.190578). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Begun in 1386 and not finished until 1965, this marble cathedral carries some 3,400 statues, more than any other building in the world, crowned by the gilded Madonnina of 1774.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/20110724_Milan_Cathedral_5260.jpg/500px-20110724_Milan_Cathedral_5260.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Jakub Hałun. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Milan_Cathedral_from_Piazza_del_Duomo.jpg`; this is not it.
- views: mean 1050.0/day, median 891.8/day. **Difficulty 5.**
  difficultyWhy: `p.80·fb380·K0·iso348 → 20.5 → 5`

### florence-cathedral — Florence Cathedral, Italy 🇮🇹
- QID Q191739, pin 43.7731, 11.2569 (Wikidata P625 43.773056, 11.256944). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Brunelleschi's dome, raised from 1420 with no scaffolding or wooden centring, is still the largest masonry dome ever built; a staircase climbs between its two shells to the lantern.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Cattedrale_di_Santa_Maria_del_Fiore_Florenz_M%C3%A4rz_2014.jpg/500px-Cattedrale_di_Santa_Maria_del_Fiore_Florenz_M%C3%A4rz_2014.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY 3.0, Felix König. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Cattedrale_di_Santa_Maria_del_Fiore_–_Il_Duomo_di_Firenze.jpg`; this is not it.
- views: mean 931.8/day, median 887.5/day. **Difficulty 4.**
  difficultyWhy: `p.77·fb132·K0·iso233 → 10.3 → 4`

### red-fort — Red Fort, India 🇮🇳
- QID Q45957, pin 28.6558, 77.2403 (Wikidata P625 28.655833, 77.240278). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Shah Jahan's red sandstone palace-fortress, finished in 1648, is where India's prime minister raises the flag and addresses the nation every Independence Day, from the rampart above its Lahori Gate.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1e/Red_Fort_in_the_evening.jpg/500px-Red_Fort_in_the_evening.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, IshiSenpai. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Delhi_fort.jpg`; this is not it.
- views: mean 971.4/day, median 816.6/day. **Difficulty 7.**
  difficultyWhy: `p.78·fb854·K0·iso19 → 45.4 → 7`

### grand-central-terminal — Grand Central Terminal, United States 🇺🇸
- QID Q11290, pin 40.7528, -73.9772 (Wikidata P625 40.752778, -73.977222). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Opened in 1913, its main concourse ceiling paints the zodiac in reverse, defended by the Vanderbilts as the stars seen from God's viewpoint; the four-faced clock above the information booth is faced in opal.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/3/30/Grand_Central_Terminal_Main_Concourse_2019-10-03_20-02.jpg/500px-Grand_Central_Terminal_Main_Concourse_2019-10-03_20-02.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Axel Tschentscher. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Image-Grand_central_Station_Outside_Night_2.jpg`; this is not it.
- views: mean 801.8/day, median 788.6/day. **Difficulty 8.**
  difficultyWhy: `p.74·fb1681·K0·iso134 → 98.4 → 8`

### flatiron-building — Flatiron Building, United States 🇺🇸
- QID Q220728, pin 40.7411, -73.9897 (Wikidata P625 40.741111, -73.989722). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Completed in 1902 on the triangular scrap where Broadway slices across Fifth Avenue, this steel-framed skyscraper narrows to a prow barely 2 metres wide at its point.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Flatiron_Building%2C_Fifth_Avenue%2C_Manhattan%2C_New_York.jpg/500px-Flatiron_Building%2C_Fifth_Avenue%2C_Manhattan%2C_New_York.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Christian David. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Edificio_Fuller_(Flatiron)_en_2010_desde_el_Empire_State_crop_boxin.jpg`; this is not it.
- views: mean 856.4/day, median 769.6/day. **Difficulty 8.**
  difficultyWhy: `p.75·fb1680·K0·iso16 → 93.1 → 8`

### marina-bay-sands — Marina Bay Sands, Singapore 🇸🇬
- QID Q548679, pin 1.2825, 103.86 (Wikidata P625 1.282500, 103.860000). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Its three 55-storey towers carry a single boat-shaped SkyPark whose 146-metre infinity pool floats some 190 metres above Marina Bay.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Marina_Bay_Sands_%28%D1%81ropped%29.jpg/500px-Marina_Bay_Sands_%28%D1%81ropped%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, Someformofhuman. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Marina_Bay_Sands_(I).jpg`; this is not it.
- views: mean 782.2/day, median 756.6/day. **Difficulty 4.**
  difficultyWhy: `p.73·fb5·K0·iso24 → 9.7 → 4`

### mount-vernon — Mount Vernon, United States 🇺🇸
- QID Q731635, pin 38.7078, -77.0861 (Wikidata P625 38.707778, -77.086111). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: George Washington's Potomac estate, expanded under his eye for 45 years; its 'stone' mansion walls are actually pine boards rusticated with sand thrown onto wet paint, and Washington lies in the brick tomb he specified in his will.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Mount_Vernon%2C_VA%2C_IMG_1726.JPG/500px-Mount_Vernon%2C_VA%2C_IMG_1726.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Anita Mishra. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `West_Face_of_Mansion,_Mount_Vernon,_Near_Alexandria,_Virginia_(2731038734).jpg`; this is not it.
- views: mean 825.8/day, median 742.5/day. **Difficulty 8.**
  difficultyWhy: `p.74·fb1424·K0·iso216 → 83.1 → 8`

### mosque-cathedral-of-cordoba — Mosque-Cathedral of Córdoba, Spain 🇪🇸
- QID Q33200, pin 37.8789, -4.7793 (Wikidata P625 37.878865, -4.779342). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Begun in 785 as a mosque, its hall marches away under more than 850 double-tiered red-and-white arches; after the city fell in 1236 a Gothic cathedral was planted in its exact centre.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e7/Centro_Hist%C3%B3rico%2C_16.9_--_2023_--_C%C3%B3rdoba%2C_Espa%C3%B1a.jpg/500px-Centro_Hist%C3%B3rico%2C_16.9_--_2023_--_C%C3%B3rdoba%2C_Espa%C3%B1a.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Jose María Ligero Loarte. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Mezquita_de_Córdoba_desde_el_aire_(Córdoba,_España).jpg`; this is not it.
- views: mean 762.7/day, median 733.8/day. **Difficulty 5.**
  difficultyWhy: `p.72·fb260·K0·iso252 → 19.1 → 5`

### edinburgh-castle — Edinburgh Castle, Scotland 🏴🏴󠁧󠁢󠁳󠁣󠁴󠁿
- QID Q212065, pin 55.9487, -3.2007 (Wikidata P625 55.948700, -3.200730). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Perched on an extinct volcano, the castle keeps Scotland's crown jewels and the Stone of Scone, returned from Westminster Abbey in 1996; its great cannon Mons Meg, a gift of 1457, hurled 150-kilogram stones over 3 km.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Edinburgh_Castle_dec.23_%282%29.jpg/500px-Edinburgh_Castle_dec.23_%282%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY 4.0, Peulle. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Edinburgh_Castle_from_Esplanade_20211019.jpg`; this is not it.
- views: mean 685.7/day, median 682.2/day. **Difficulty 4.**
  difficultyWhy: `p.70·fb36·K0·iso351 → 10.3 → 4`

### topkapi-palace — Topkapı Palace, Turkey 🇹🇷
- QID Q170495, pin 41.013, 28.984 (Wikidata P625 41.013000, 28.984000). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: The Ottoman sultans' seat for nearly 400 years, its treasury holds the 86-carat Spoonmaker's Diamond, said to have been found by a fisherman and traded away for three spoons.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f5/Baghdad_Kiosk_at_the_Topkap%C4%B1_Palace_in_Istanbul%2C_Turkey_001.JPG/500px-Baghdad_Kiosk_at_the_Topkap%C4%B1_Palace_in_Istanbul%2C_Turkey_001.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, Moonik. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Topkapı_-_01.jpg`; this is not it.
- views: mean 678.8/day, median 670.5/day. **Difficulty 5.**
  difficultyWhy: `p.70·fb310·K0·iso91 → 23.9 → 5`

### sydney-harbour-bridge — Sydney Harbour Bridge, Australia 🇦🇺
- QID Q54495, pin -33.8522, 151.2107 (Wikidata P625 -33.852232, 151.210684). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Nicknamed the Coathanger, its 1932 steel arch is pinned by 6 million rivets and breathes with the heat, the deck rising as much as 18 cm on the hottest days.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Sydney_Opera_House_and_Harbour_Bridge_Dusk_%282%29_2019-06-21.jpg/500px-Sydney_Opera_House_and_Harbour_Bridge_Dusk_%282%29_2019-06-21.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Benh LIEU SONG (Flickr). Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Sydney_Harbour_Bridge-16_October_2025.jpg`; this is not it.
- views: mean 603.2/day, median 600.7/day. **Difficulty 7.**
  difficultyWhy: `p.67·fb568·K0·iso715 → 44.5 → 7`

### osaka-castle — Osaka Castle, Japan 🇯🇵
- QID Q321242, pin 34.6872, 135.5258 (Wikidata P625 34.687222, 135.525833). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Toyotomi Hideyoshi raised Japan's grandest castle here in 1583; it fell to siege in 1615 and burned by lightning in 1665, and the white keep seen today is a 1931 concrete reconstruction paid for by the citizens of Osaka.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/Osaka_Castle_02bs3200.jpg/500px-Osaka_Castle_02bs3200.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY 2.5, 663highland. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Osaka_Castle_03bs3200.jpg`; this is not it.
- views: mean 602.2/day, median 592.6/day. **Difficulty 5.**
  difficultyWhy: `p.67·fb181·K0·iso31 → 16.4 → 5`

### prague-astronomical-clock — Prague Astronomical Clock, Czech Republic 🇨🇿
- QID Q729370, pin 50.087, 14.4207 (Wikidata P625 50.086990, 14.420700). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Installed in 1410, the Orloj is the oldest astronomical clock still working; its apostles parade on the hour, and legend says the city blinded its clockmaker so he could never build another.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Czech-2013-Prague-Astronomical_clock_face.jpg/500px-Czech-2013-Prague-Astronomical_clock_face.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Godot13. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Astronomical_Clock_(8341899828).jpg`; this is not it.
- views: mean 594.5/day, median 583.5/day. **Difficulty 4.**
  difficultyWhy: `p.67·fb74·K0·iso253 → 11.0 → 4`

### india-gate — India Gate, India 🇮🇳
- QID Q245347, pin 28.6129, 77.2293 (Wikidata P625 28.612864, 77.229306). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Lutyens' 42-metre arch is cut with the names of more than 13,000 servicemen of the Indian Army who died in the First World War and the Third Anglo-Afghan War; an eternal flame burned beneath it from 1972 to 2022.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/India_Gate%2C_New_Delhi_from_West.jpg/500px-India_Gate%2C_New_Delhi_from_West.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Nikhilb239. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `India_Gate_front.jpg`; this is not it.
- views: mean 592.8/day, median 572.1/day. **Difficulty 7.**
  difficultyWhy: `p.67·fb850·K0·iso21 → 65.8 → 7`

### bran-castle — Bran Castle, Romania 🇷🇴
- QID Q390275, pin 45.515, 25.3671 (Wikidata P625 45.515000, 25.367100). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: This 1377 border fortress is sold to the world as Dracula's castle, although Vlad the Impaler probably never lived here and Bram Stoker, who never visited Romania, modelled his fictional castle on its perch above the pass.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Bran_Castle_TB1.jpg/500px-Bran_Castle_TB1.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Todor Bozhinov. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Castelul_Bran2.jpg`; this is not it.
- views: mean 677.1/day, median 565.8/day. **Difficulty 4.**
  difficultyWhy: `p.70·fb17·K0·iso134 → 10.4 → 4`

### hawa-mahal — Hawa Mahal, India 🇮🇳
- QID Q836531, pin 26.924, 75.8267 (Wikidata P625 26.924000, 75.826720). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Built in 1799, the 'Palace of Winds' is a five-storey pink screen of 953 small latticed windows, raised so the royal women could watch street processions without being seen; behind the facade it is barely one room deep.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/20191218%2C_Hawa_Mahal_%28The_Palace_of_Winds%29_in_Jaipur%2C_1128_9119.jpg/500px-20191218%2C_Hawa_Mahal_%28The_Palace_of_Winds%29_in_Jaipur%2C_1128_9119.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Jakub Hałun. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `East_facade_Hawa_Mahal_Jaipur_from_ground_level_(July_2022)_-_img_01.jpg`; this is not it.
- views: mean 547.8/day, median 551.6/day. **Difficulty 7.**
  difficultyWhy: `p.65·fb703·K0·iso194 → 57.7 → 7`

### malbork-castle — Malbork Castle, Poland 🇵🇱
- QID Q71279, pin 54.0397, 19.0278 (Wikidata P625 54.039722, 19.027778). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Headquarters of the Teutonic Order from 1309, this triple-walled brick fortress on the Nogat is the largest castle in the world by land area, built to house and feed some 3,000 brothers.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Panorama_of_Malbork_Castle%2C_part_4.jpg/500px-Panorama_of_Malbork_Castle%2C_part_4.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, DerHexer; derivate work: Carschten. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Zespół_Zamku_Krzyżackiego_MALBORK_01.jpg`; this is not it.
- views: mean 547.0/day, median 535.1/day. **Difficulty 5.**
  difficultyWhy: `p.65·fb248·K0·iso241 → 22.2 → 5`

### batu-caves — Batu Caves, Malaysia 🇲🇾
- QID Q687629, pin 3.2374, 101.6839 (Wikidata P625 3.237400, 101.683906). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: A flight of 272 rainbow-painted steps climbs to a cathedral-sized cave temple; beside it stands a 42.7-metre statue of Murugan, the tallest of that god anywhere, coated in 300 litres of gold paint.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/Gombak_Selangor_Batu-Caves-01.jpg/500px-Gombak_Selangor_Batu-Caves-01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, CEphoto, Uwe Aranas. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Batu_Caves_stairs_2022-05.jpg`; this is not it.
- views: mean 498.7/day, median 498.2/day. **Difficulty 5.**
  difficultyWhy: `p.63·fb185·K0·iso304 → 18.3 → 5`

### casa-batllo — Casa Batlló, Spain 🇪🇸
- QID Q461371, pin 41.3916, 2.1649 (Wikidata P625 41.391580, 2.164920). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Gaudí's 1906 rebuild for the Batlló family is nicknamed the House of Bones for its skeletal stone balconies; its roof is a dragon's arched, scale-tiled back, pierced by a turret bearing the cross of St George.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Casa_Batll%C3%B3_01.jpg/500px-Casa_Batll%C3%B3_01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 3.0, Bernard Gagnon. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Casa_Batllo_Overview_Barcelona_Spain_cut.jpg`; this is not it.
- views: mean 514.2/day, median 488.4/day. **Difficulty 6.**
  difficultyWhy: `p.64·fb473·K0·iso505 → 41.1 → 6`

### mysore-palace — Mysore Palace, India 🇮🇳
- QID Q456575, pin 12.3039, 76.6544 (Wikidata P625 12.303889, 76.654444). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Rebuilt in stone in 1912 after fire destroyed its wooden predecessor, the Wodeyar palace is outlined by some 97,000 light bulbs during the Dasara festival, and the royal family still lives in one wing.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ee/Mysore_Palace_-_Amba_Vilas_Palace.jpg/500px-Mysore_Palace_-_Amba_Vilas_Palace.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Whistleraja. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Mysore_Palace_Morning.jpg`; this is not it.
- views: mean 514.0/day, median 476.8/day. **Difficulty 8.**
  difficultyWhy: `p.64·fb988·K0·iso126 → 82.6 → 8`

### seville-cathedral — Seville Cathedral, Spain 🇪🇸
- QID Q231606, pin 37.3857, -5.9931 (Wikidata P625 37.385742, -5.993096). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: The largest Gothic cathedral in the world stands on Seville's great mosque, whose minaret survives as its bell tower, the Giralda; inside, four kings in stone carry the tomb of Christopher Columbus.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Sevilla_Cathedral_-_Giralda.jpg/500px-Sevilla_Cathedral_-_Giralda.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Ingo Mehling. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Sevilla_Cathedral_-_Southeast.jpg`; this is not it.
- views: mean 475.6/day, median 472.4/day. **Difficulty 6.**
  difficultyWhy: `p.62·fb370·K0·iso181 → 34.1 → 6`

### st-marks-basilica — St Mark's Basilica, Italy 🇮🇹
- QID Q172988, pin 45.4344, 12.3397 (Wikidata P625 45.434444, 12.339722). Pin audit: stored vs nearest reference < 0.5 km, risk class D, not flagged.
- fact: Venice's cathedral is clad in crusader loot: the four bronze horses over its facade were stolen from Constantinople in 1204, and its gold altarpiece, the Pala d'Oro, is studded with some 1,300 pearls.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/Venice%2C_Pza._San_Marco_from_Museo_Correr_1.jpg/500px-Venice%2C_Pza._San_Marco_from_Museo_Correr_1.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail — CC BY-SA 4.0, Armin Kleiner. Viewed on labeled contact sheets and as a center square crop; survives the crop. Article page image is `Venezia_Basilica_di_San_Marco_Fassade_2.jpg`; this is not it.
- views: mean 499.0/day, median 471.0/day. **Difficulty 6.**
  difficultyWhy: `p.63·fb298·K0·iso246 → 27.3 → 6`

## Test changes (2 files, counts only)

1. `test/pack-pools.test.mjs`: landmark pool 215 → 243.
2. `test/passport-packs.test.mjs`: section totals [207, 215, 194] →
   [207, 243, 194]; combined total 616 → 644.

No dex pin moved (the numbering suite passed unchanged: no new short
sorts ahead of its pinned examples). No other test touched. Suite 83/83.
