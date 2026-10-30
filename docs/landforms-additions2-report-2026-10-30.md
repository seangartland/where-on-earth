# Landforms additions 2 report, 2026-10-30

Chunk 7 of the pack additions program: the GLARING tier of
docs/landforms-audit2-report-2026-10-30.md, approved whole by Sean
2026-10-30. Executed per `.build-tmp/landforms-adds2-brief.md` in the
`woe-adds-landforms2` worktree. Not committed, not pushed, not deployed.

## Outcome

- **10 of the 11 added.** Four radius areas (Amazon rainforest, Aral Sea,
  Socotra, Mojave Desert), four whole-river extent cards (Rhine, Euphrates,
  Colorado River, Missouri River), two point mountains (Mount Sinai,
  Kangchenjunga).
- **1 held at the coverage gate: the River Thames** (see below). No bank
  entry, no extents record, no Landforms id, exactly the Parana/Murray
  treatment in chunk 4.
- Bank 478 → **488**. Pools measured with the game's own helpers
  (`src/meta/pack-store.js`): **Capitals 207, Landmarks 243 (unchanged),
  Landforms 194 → 204, combined 644 → 654.**
- Suite: **83/83** (`node --test test/*.test.mjs`).
- The extents sidecar regenerates byte-for-byte: `assets/extents.json` is
  472,343 bytes, sha256
  `9474f2c8ebcf30cc415bd7ee49f3a1d84bfe4c3ffe99016c8ddbdcb33d355ae0`,
  identical across two consecutive runs of the extended
  `build/make-extents.mjs`, and every pre-existing record (Reef, Canyon,
  Sahara, 19 chunk-4 rivers) is byte-identical to the committed file,
  verified per record by JSON comparison. Foundation first: the NE
  centerlines file and the RESOLVE Ecoregions 2017 extract were lost with
  the removed chunk-4 worktree, so both were restored from the official
  sources named in the script header and the unmodified script regenerated
  the committed sidecar byte-identical (sha256 8be73c99...) before any
  extension.

## The three flag dispositions

- **Colorado River overlap (noted, shipped as approved).** The shipped
  Colorado line runs through the Grand Canyon reach, where it is the same
  water as the shipped Grand Canyon extent (that line is a 277 km reach of
  the Colorado). Both are cards now, per Sean's approval of the glaring set
  whole; scoring is per-card, each against its own geometry. The Colorado
  anchor is deliberately upriver at Moab, a different reach and a different
  photograph from the canyon card.
- **Missouri River as its own card (shipped).** Chunk 4 excluded the
  Missouri from the Mississippi's assembled stem under the tributary rule;
  that rule governed the Mississippi's geometry, not the Missouri's right
  to its own card. It ships here as a whole-river extent card in its own
  right.
- **Euphrates multi-name assembly (shipped, one reach disclosed).** The
  stem is assembled from NE segments named Euphrates + Firat + Murat +
  Al Furat (the Syrian reach's Arabic name), the Yangtze pattern. The
  Murat arm's Keban reservoir centerline ends about 7 km short of the
  Firat arm's weld node, and gaps are never bridged, so the shipped stem
  follows the Karasu headstream from its source north of Erzurum; the
  Murat joins the shipped line's Keban reach in reality but is not drawn
  into it. Assembled 2,490 km against the 2,800 km conventional figure
  (88.9 percent, gate 80).

## Held: River Thames, 267 km assembled = 77.2 percent of 346 km

NE carries the Thames as a single centerline feature. It is genuinely one
connected stem, source to Gravesend, but at 1:10m generalization it
measures 267 km against the conventional 346 km published length, and the
tidal reach below Gravesend is not drawn as a centerline at all. No
assembly choice changes this; the missing length is in the source, the
same failure mode as Parana (66 percent) and Murray (59 percent) in
chunk 4. It fails the frozen 80 percent gate and is held: no bank entry,
no extents record, no derive id. Its audit pageviews (mean 1067.2,
median 1074.2 per day) say the fame is real; the geometry source is what
is missing.

## Rivers (chunk-4 method, build-time gates enforced)

| id | assembled / conventional | coverage | verts | dev (km) | anchor reach |
|---|---|---|---|---|---|
| rhine-river | 1,092 / 1,230 | 88.8% | 105 | 1.657 | Cologne riverfront |
| euphrates-river | 2,490 / 2,800 | 88.9% | 243 | 1.664 | Deir ez-Zor |
| colorado-river | 1,879 / 2,330 | 80.7% | 152 | 1.617 | Moab, US-191 bridge reach |
| missouri-river | 3,227 / 3,767 | 85.7% | 292 | 1.646 | Great Falls (Black Eagle) |

Assembly notes: the Rhine is collected under Rhine + Rhein + Rhin (the
French-bank reach name bridges the Basel-Strasbourg gap; without it there
is no path). Its line crosses Lake Constance on the lake centerline, as
drawn. The Colorado name set also matches an Argentine river of the same
name; the source/mouth seeds select the US river's component, and only
that component is shipped. NE's named Missouri begins at Canyon Ferry
Lake, so the shipped stem starts there; the roughly 65 km from Three
Forks, the conventional source confluence, is not drawn under the name in
NE and is not bridged. Scorer QA with the shipped `scoringDistanceKm` and
the shipped sidecar: for every river an on-line point scores 0, the anchor
scores 0, and a named off-river city scores plausibly (Rhine: Munich
163.2 km; Euphrates: Damascus 323.5 km; Colorado: Phoenix 211.1 km;
Missouri: Wichita 276.8 km).

## Areas (chunk-3 approved-areas path)

Radii follow the chunk-3 precedent (~0.5-0.6x the longest dimension, the
Baikal 342.7 km scale as the practical cap), and the four are synced into
the APPROVED_AREAS manifests in `test/extent-aware-scoring.test.mjs` and
`scripts/validate-landmarks.mjs` the way chunk 3 synced its twelve.

| id | anchor (the entity P625) | radius | note |
|---|---|---|---|
| amazon-rainforest | -3.16, -60.03 (Q177567) | 340 | at the precedent cap, Caspian/Gobi band |
| aral-sea | 45.0, 60.0 (Q35883) | 200 | ~0.5x the historic lake's 428 km length |
| socotra | 12.51, 53.92 (Q82859) | 60 | ~0.45x the main island's 132 km length |
| mojave-desert | 35.0083, -115.475 (Q184355) | 250 | desert band with Namib/Atacama |

## Points

Mount Sinai (Q377485, 28.5384, 33.9752) and Kangchenjunga (Q82019,
27.703, 88.1474) use their Wikidata P625 summits verbatim; both are kind
"landmark" bank entries in the Landforms pool via the derive list, the
K2/Everest precedent.

## Difficulty (frozen adapted v2, spike check applied)

Pageviews are the feature article's Wikimedia REST figures for 2025-10 to
2026-09 (mean = total/365, median = median monthly daily rate). Distances
follow the chunk-3/4 adaptations: points measure to the pin; areas
measure to the anchor then subtract the radius (floor 0); rivers measure
to the shipped line, isolation excluding cities within 15 km of the line
(the base scorer's own-city rule). Mojave's clue names California, so its
fallback centre is California's GeoNames population centre (the Lake
Tahoe precedent inverted). No entry's mean and median bands disagreed, so
no spike rescores this chunk.

| id | views mean | views median | difficulty | difficultyWhy |
|---|---|---|---|---|
| amazon-rainforest | 1947.3 | 1938.0 | 6 | `p.93·fb1890·K0·iso954 → 29.4 → 6` |
| aral-sea | 1688.6 | 1646.5 | 5 | `p.90·fb637·K0·iso595 → 17.1 → 5` |
| socotra | 1643.0 | 1622.7 | 6 | `p.90·fb966·K0·iso904 → 25.5 → 6` |
| mojave-desert | 957.6 | 952.5 | 3 | `p.78·fb87·K0·iso15 → 8.7 → 3` |
| rhine-river | 1350.1 | 1332.0 | 3 | `p.85·fb169·K0·iso117 → 8.9 → 3` |
| euphrates-river | 1001.9 | 993.6 | 3 | `p.79·fb96·K0·iso19 → 8.4 → 3` |
| colorado-river | 965.3 | 961.3 | 7 | `p.78·fb1065·K0·iso52 → 55.8 → 7` |
| missouri-river | 863.8 | 854.3 | 3 | `p.75·fb48·K0·iso397 → 9.2 → 3` |
| mount-sinai | 1023.4 | 1000.2 | 5 | `p.79·fb303·K0·iso314 → 17.4 → 5` |
| kangchenjunga | 976.9 | 917.9 | 5 | `p.78·fb338·K0·iso244 → 19.8 → 5` |
## Pin audit

`scripts/pin-audit.py --reverse` on the ten new ids. The two points and
four area anchors are the entities' own P625 coordinates and were not
flagged. The four river anchors were flagged, as designed: the audit
compares against the river entity's single P625 (a source or mouth
point), while the bank anchor is a vertex on the shipped line at a named
reach, the chunk-4 pattern. Reverse geocodes confirm every anchor on its
feature: Aral Sea anchor to "Aral Sea, Aral District, Kazakhstan"; Rhine
anchor to Gustav-Heinemann-Ufer, Cologne (the Rhine bank); Euphrates
anchor to Deir ez-Zor; Colorado anchor to Moab (Upper Drinks Canyon
Campground on the river road); Missouri anchor to Black Eagle, the Great
Falls suburb at the falls; Mount Sinai to Jabal Musa, Saint Catherine;
Kangchenjunga to "Kangchenjunga, Chungthang, Sikkim". Proximity notes
(report-only under the 25 km rule): the Rhine anchor sits 3.9 km from
the cologne-cathedral bank entry, intended (the anchor reach is
Cologne); the Amazon rainforest anchor sits 16.0 km from the
amazon-river entry's Manaus anchor, the forest and its river as distinct
subjects.

## Dedupe

Zero hits on id and normalized short name for all eleven candidates
(including the held Thames) across cities (804), bank (478 before this
chunk), and quarantine (116). rhine-falls is a distinct existing card
(the falls on the Rhine at Schaffhausen), not a hit on the Rhine River.

## Derive regeneration catch

Regenerating `src/meta/pack-landforms.js` after the bank additions first
produced +12, not +10: two chunk-6 Landmark additions trip the derive
name pattern, 'Batu Caves' (cave) and 'Mount Vernon' (mount). They had
been kept out only because the checked-in set predated their banking.
Following the chunk-3 precedent for the identical failure (Ajanta Caves,
Ellora Caves, Mount Rushmore, Sugarloaf Mountain), both names were added
to EXCLUSIONS in derive.py; the final regenerated diff is exactly
+10 / -0 and neither entry changes pools (both remain Landmarks, as
banked).

## Photos

One real photograph per entry, every finalist viewed on labeled contact
sheets and every pick re-viewed as a center square crop (the game's
crop). All ten stored URLs re-verified 200 image/jpeg and unique across
both datasets by URL and by Commons file name; none is its article's
page image (checked against all ten pageimages). River photos are at the
anchor reach. Local copies in `.batch-landforms2/<id>-final.jpg`.

| id | file | license | author |
|---|---|---|---|
| amazon-rainforest | Aerial view of the Amazon Rainforest.jpg | CC BY-SA 2.0 | lubasi |
| aral-sea | Graveyard of ships (431543).jpg | CC BY 2.0 | upyernoz from Haverford, USA |
| socotra | Dragon's Blood Tree, Socotra Island (30133804756).jpg | CC BY-SA 2.0 | Rod Waddington |
| mojave-desert | Joshua Tree National Park (California, USA) -- 2012 -- 5663.jpg | CC BY-SA 4.0 | Dietmar Rabich |
| rhine-river | Rhine River & Cologne Cathedral (9812095795).jpg | CC0 | Gary Todd from Xinzheng, China |
| euphrates-river | Deir Ez-Zor Euphrates 9915.jpg | CC BY-SA 4.0 | Dosseman |
| colorado-river | Bridge of US 191 crossing Colorado river near Moab, East view 20110816 2.jpg | CC BY-SA 4.0 | DXR |
| missouri-river | Aerial view of the Missouri River at Great Falls, Montana.jpg | CC BY-SA 4.0 | Jsayre64 |
| mount-sinai | Mount Moses.jpg | CC BY-SA 3.0 | Mohammed Moussa |
| kangchenjunga | Kangchenjunga 2018.jpg | CC BY 4.0 | Kolkatametro |
## Facts (verbatim, as stored)

### amazon-rainforest

clue: Amazon Rainforest, South America

The largest rainforest on Earth holds an estimated 390 billion individual trees across some 5.5 million km², about 60 percent of it in Brazil. About one in ten of all known species lives here, and its canopy drives weather far beyond South America: the forest exhales so much moisture that its “flying rivers” carry rain to farms thousands of kilometres south.

### aral-sea

clue: Aral Sea, Central Asia

Once the world’s fourth-largest lake at about 68,000 km², the Aral has shrunk to roughly a tenth of that since the 1960s, when its two feeder rivers were diverted to irrigate cotton. Its old port of Muynak now sits over 100 km from the shore, its fishing fleet rusting in sand.

### socotra

clue: Socotra, Yemen 🇾🇪

About a third of this island’s plant species grow nowhere else on Earth. Its umbrella-shaped dragon blood trees bleed a deep red resin that was traded across the ancient world as dye, medicine and varnish, and the island sat cut off from mainland Africa for millions of years, evolving in isolation.

### mojave-desert

clue: Mojave Desert, California 🇺🇸

North America’s driest desert is named for the Mohave people of the Colorado River. Its Joshua trees are giant yuccas that grow almost nowhere else, and at Kelso its dunes “sing”: avalanching sand on the slip faces hums and booms at up to about 105 decibels.

### rhine-river

clue: Rhine River, Germany 🇩🇪

Europe’s busiest waterway runs 1,230 km from the Swiss Alps to Rotterdam, the continent’s largest port. Its 65 km Middle Rhine gorge is lined with more than 40 castles, and at the Lorelei rock the river narrows into its most storied and once most dangerous bend.

### euphrates-river

clue: Euphrates River, Iraq 🇮🇶

The longest river in western Asia, at about 2,800 km, is formed in Turkey where the Karasu and Murat streams join, and Babylon stood on its banks in what is now Iraq. At Qurna in the south it meets the Tigris, and the two flow on together as the Shatt al-Arab to the Gulf.

### colorado-river

clue: Colorado River, United States 🇺🇸

The river that carved the Grand Canyon is now so fully allocated among seven US states and Mexico that it rarely reaches its delta in the Gulf of California. In 2014 a deliberate “pulse flow” released from Morelos Dam reconnected it with the sea for the first time in decades.

### missouri-river

clue: Missouri River, United States 🇺🇸

At 3,767 km the Missouri is the longest river in North America, longer than the Mississippi it joins at St Louis. In 1805 Lewis and Clark spent about a month portaging its five Great Falls in Montana, hauling boats and gear some 18 miles overland around them.

### mount-sinai

clue: Mount Sinai, Egypt 🇪🇬

This 2,285 m granite peak is traditionally identified as the mountain where Moses received the Ten Commandments. At its foot stands St Catherine’s Monastery, founded in the sixth century and still home to monks, beside the site pilgrims venerate as the Burning Bush.

### kangchenjunga

clue: Kangchenjunga, Nepal 🇳🇵

At 8,586 m it is the third-highest mountain on Earth, and until surveys in 1852 it was thought to be the highest. Its name means “the five treasures of snow” for its five summits, and by a tradition honoured since the first ascent in 1955, climbers stop a few feet short of the very top.
## Test and manifest changes

1. `test/pack-pools.test.mjs`: PACK_LANDFORM_IDS size 194 → 204, test
   title updated to match.
2. `test/passport-packs.test.mjs`: section totals [207, 243, 194] →
   [207, 243, 204]; combined total 644 → 654.
3. `test/extent-aware-scoring.test.mjs`: the four new areas added to the
   test's APPROVED_AREAS manifest (the approved-areas sync, not a count).
4. `scripts/validate-landmarks.mjs`: the same four areas added to its
   APPROVED_AREAS map. Note the validator still fails on this tree for
   pre-existing reasons unrelated to this chunk (chunk-2/5/6 spike-rescore
   difficultyWhy suffixes its regex predates, and chunk 3's twelve areas
   were never synced into its map); verified identical failures on the
   pristine branch tree. This chunk adds no new validator failures.

No other test touched. The extent-manifest assertions pass with the four
new river records synced (pool extent ids equal the sidecar keys).

## Files changed

- `assets/locations-landmarks-sol.json`: +10 entries (488 total).
- `assets/extents.json`: +4 river records; all prior records
  byte-identical; regenerates byte-for-byte.
- `build/make-extents.mjs`: four river configs appended (existing order
  untouched) and the held-Thames note added to the assembly comment.
- `scripts/pack-landforms/derive.py`: ten ids in CURATED_ADDITION_IDS;
  'Batu Caves' and 'Mount Vernon' added to EXCLUSIONS.
- `src/meta/pack-landforms.js`: regenerated by derive.py, +10 / -0.
- `scripts/validate-landmarks.mjs`, `test/extent-aware-scoring.test.mjs`,
  `test/pack-pools.test.mjs`, `test/passport-packs.test.mjs`: above.
