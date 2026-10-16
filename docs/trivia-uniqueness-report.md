# Trivia uniqueness pass: report

Date: 2026-10-16. Done by Claude Opus 5.5, working directly in this session (no delegation).

Rule (Sean, 2026-10-16): if a trivia clue can describe more than one place, it is not a good clue. This pass checks uniqueness only. Truth was already checked in the fact pass.

## Method

- Scope: every playable entry (`photo === 'verified'`) in `assets/trivia-bank.json` at the fact-pass head `fb4af2a`. That is 432 entries, taken in playable-list order in four slices of 108.
- Test for each clue: from the clue text alone, could a knowledgeable player name a different real place that fits every fact the clue states? If no competitor could be named, the clue passed. A flag counts only if its verdict record names the competitor places.
- How the judging was done: I judged the clues and named the competitors from my own knowledge. I did not look anything up for that step, so the competitor lists are judgments, not measurements. Every discriminating fact in a rewrite was checked against the entry's fact field or its English Wikipedia article. I read the articles from the fact pass's cached extracts (`scripts/trivia-fact-pass/wiki-cache.json`) using `scripts/trivia-uniqueness/wgrep.py`, and each verdict's `note` names its source.
- Rewrite rules: keep the clue's question word ("Where" or "Which") and roughly its length, never name the answer, add no compass words, and use zero em dashes. The validator enforces the question word, the em-dash ban and the no-own-name rule.
- Files, all in `scripts/trivia-uniqueness/`:
  - `slice1.json` to `slice4.json`: one verdict per playable clue. A PASS record is `{"v": "PASS"}`. A flagged record also holds `clue_before`, `competitors`, the new `clue`, and a `note` on where the new fact came from.
  - `flags-sliceN.json`: the hand-written flags that `mkslice.py` merges into the slice files.
  - `apply.mjs`: applies the verdicts with text edits inside each entry, so no other bytes change. It is safe to rerun.
  - `validate.mjs`: the validation script described below.

## Results

| | Count |
|---|---|
| Clues checked | 432 |
| PASS | 379 |
| Flagged | 53 |
| Rewritten | 53 |
| Pulled | 0 |

By slice (flagged / checked): slice 1 18/108, slice 2 12/108, slice 3 18/108, slice 4 5/108. Slice 4 is mostly "Which" clues that name a country, state or signature feature (Fenway's Green Monster, Graceland in Memphis), so few of them could fit another place.

Pulled list (empty: every flagged place could be told apart from its competitors without a giveaway):
<!-- pulled:start -->
(none)
<!-- pulled:end -->

Judgment calls worth knowing:
- Three rewrites lean on a location word to rule out a neighbour, following the repair pass's precedent ("Chinese city", "Italian lake"):
  - Serengeti says "Tanzanian grassland". The Maasai Mara is part of the same migration, and no other fact separates them cleanly. (The article's "endless plains" etymology is disputed, so I did not use it.)
  - Socotra keeps "Arabian Sea" from its fact field to rule out Tenerife's dragon trees.
  - Hegra says "its country's first UNESCO site in 2008" rather than naming Saudi Arabia.
- Kinabalu: the old clue ("highest mountain in Southeast Asia") was also loose on truth. Hkakabo Razi and Puncak Jaya are both higher. The rewrite ("highest mountain on the world's third-largest island") fixes both problems.
- Larnach Castle: the repair report's sample listed it in this class, but I could not name a real competitor that fits every stated fact (a nineteenth-century castle-styled mansion on a peninsula ridge above a long natural harbour). Under the rule, a flag needs a named competitor, so it PASSES.
- The other three clues the repair report named (Hagia Sophia, Piton de la Fournaise, Quilmes) and Sean's example (Jokulsarlon) are all flagged and rewritten.
- Close neighbours that I did not count as separate places: Deadvlei, which is inside the Sossusvlei pan area (`sossusvlei`), and the CMS detector at CERN (`higgs-boson-cern-atlas`; the announcement was made at CERN itself).

## Flagged clues

| Entry | Slice | Named competitors | Outcome |
|---|---|---|---|
| `mont-saint-michel` | 1 | St Michael's Mount, Cornwall (tidal island crowned by a former Benedictine priory church and castle) | REWRITE |
| `serengeti-tanzania` | 1 | Maasai Mara, Kenya (the same wildebeest migration crosses its grassland every year) | REWRITE |
| `dead-sea` | 1 | Great Salt Lake, Utah; Lake Assal, Djibouti | REWRITE |
| `hagia-sophia` | 1 | Mosque-Cathedral of Cordoba; Hagia Sophia, Trabzon; Hagia Sophia, Iznik; Lala Mustafa Pasha Mosque (St Nicholas Cathedral), Famagusta | REWRITE |
| `plitvice-lakes` | 1 | Jiuzhaigou, China; Band-e Amir, Afghanistan; Krka National Park, Croatia | REWRITE |
| `socotra-island` | 1 | Tenerife, Canary Islands (Dracaena draco, also called the dragon's blood tree) | REWRITE |
| `pamukkale-turkey` | 1 | Mammoth Hot Springs, Yellowstone; Hierve el Agua, Mexico | REWRITE |
| `wadi-rum` | 1 | Monument Valley, USA; Valle de la Luna, Chile | REWRITE |
| `mount-kinabalu` | 1 | Hkakabo Razi, Myanmar (5,881 m); Puncak Jaya, New Guinea (4,884 m) | REWRITE |
| `flaming-cliffs-bayanzag` | 1 | Khermen Tsav, Gobi (red-cliff canyon) | REWRITE |
| `gobekli-tepe` | 1 | Karahan Tepe, Turkey; Nevali Cori, Turkey | REWRITE |
| `cologne-cathedral` | 1 | Basel Minster (Gothic, twin towers above the Rhine) | REWRITE |
| `prague-astronomical-clock` | 1 | Wells Cathedral clock, England (c. 1390, dial shows sun and moon) | REWRITE |
| `pompeii` | 1 | Herculaneum; Stabiae; Oplontis | REWRITE |
| `blue-lagoon-iceland` | 1 | Myvatn Nature Baths, Iceland (milky blue geothermal water among lava) | REWRITE |
| `jokulsarlon-glacier-lagoon` | 1 | Tasman Lake, New Zealand; Laguna San Rafael, Chile; Columbia Glacier lagoon, Alaska; Fjallsarlon, Iceland | REWRITE |
| `dettifoss` | 1 | Gullfoss, Iceland (powerful glacier-river falls into a canyon) | REWRITE |
| `newgrange` | 1 | Maeshowe, Orkney (winter solstice sun lights its chamber, built about 2800 BC) | REWRITE |
| `manarola` | 2 | Riomaggiore; Vernazza; Monterosso al Mare (all colourful Cinque Terre fishing villages above the sea) | REWRITE |
| `kotors-old-town` | 2 | Herceg Novi, Montenegro (fortified old town on the slopes of the same bay) | REWRITE |
| `cape-coast-castle` | 2 | Fort William, Anomabo; James Fort, Accra; Fort Metal Cross, Dixcove (all British slaving forts on the Gold Coast) | REWRITE |
| `piton-de-la-fournaise` | 2 | Karthala, Grande Comore; Barren Island, Andaman Sea; Big Ben, Heard Island | REWRITE |
| `mutianyu` | 2 | Jinshanling; Badaling; Simatai (all well-preserved Ming sections with many watchtowers) | REWRITE |
| `phong-nha-ke-bang` | 2 | Puerto Princesa Subterranean River, Palawan (marketed as among the world's longest underground rivers) | REWRITE |
| `monument-valley` | 2 | Sedona, Arizona (red sandstone buttes rising from the valley floor) | REWRITE |
| `bryce-canyon` | 2 | Cedar Breaks National Monument, Utah (amphitheatre of orange hoodoos in the same rock formation) | REWRITE |
| `kennedy-space-center` | 2 | Cape Canaveral Space Force Station, Florida (Mercury and Gemini crewed launches; Starliner from SLC-41) | REWRITE |
| `tikal` | 2 | El Mirador; Yaxha; Uaxactun (Maya temple sites in the Peten rainforest) | REWRITE |
| `jericoacoara` | 2 | Lencois Maranhenses, Brazil (white dunes and freshwater lagoons near the equatorial Atlantic coast) | REWRITE |
| `waitomo-caves` | 2 | Te Anau Glowworm Caves, New Zealand (boat rides beneath glowworms) | REWRITE |
| `ait-benhaddou-ksar` | 3 | Tamdaght, Morocco (kasbah village of earthen towers on the Ounila); Telouet kasbah (upstream on the same Ounila caravan route) | REWRITE |
| `kuelap-fortress-peru` | 3 | Gran Pajaten, Peru (Chachapoya mountaintop settlement); Olan, Peru (Chachapoya settlement) | REWRITE |
| `hegra-qasr-al-farid` | 3 | Petra, Jordan (Nabataean tombs carved into sandstone) | REWRITE |
| `vardzia-cliff-monastery` | 3 | Vanis Kvabebi, Georgia (cave monastery in the same river-valley cliffs); David Gareja, Georgia | REWRITE |
| `dunnottar-headland-fortress` | 3 | Dunluce Castle, Northern Ireland (ruin on a sheer coastal headland); Tantallon Castle, Scotland | REWRITE |
| `zipaquira-salt-cathedral` | 3 | Wieliczka Salt Mine, Poland (Chapel of St Kinga carved in the mine) | REWRITE |
| `brimstone-hill-fortress` | 3 | Fort Shirley, Dominica; Fort Charlotte, St Vincent; Fort George, Grenada (British hill forts above Caribbean coasts) | REWRITE |
| `ani-cathedral-ruin` | 3 | Mren Cathedral, Turkey (roofless medieval cathedral in grassland near the Armenian border) | REWRITE |
| `larabanga-adobe-mosque` | 3 | Nakore Mosque, Ghana; Bole Mosque, Ghana (Sudano-Sahelian adobe mosques with timber spikes and buttresses) | REWRITE |
| `banteay-chhmar-face-towers` | 3 | Bayon, Angkor Thom (moat-bound face towers and long reliefs, also Jayavarman VII); Ta Prohm | REWRITE |
| `khami-stone-terraces` | 3 | Naletale, Zimbabwe (patterned dry-stone walls); Danangombe (Dhlo-Dhlo), Zimbabwe | REWRITE |
| `quilmes-hillside-ruins` | 3 | Pucara de Tilcara, Argentina (reconstructed walls on an arid slope); Tastil, Argentina; El Shincal, Argentina | REWRITE |
| `humberstone-saltpeter-works` | 3 | Chacabuco, Chile (nitrate town with a theatre); Santa Laura, Chile | REWRITE |
| `san-ignacio-mini-mission` | 3 | Jesus de Tavarangue, Paraguay; Santisima Trinidad de Parana, Paraguay; Sao Miguel das Missoes, Brazil (red-sandstone Jesuit mission ruins) | REWRITE |
| `yapahuwa-rock-citadel` | 3 | Sigiriya, Sri Lanka (rock citadel approached by a monumental stairway beneath a sheer rock) | REWRITE |
| `franz-josef-glacier` | 3 | Fox Glacier, New Zealand (20 km south, also descends into rainforest) | REWRITE |
| `alice-springs` | 3 | Yulara, Northern Territory (resort town that is the direct gateway to Uluru) | REWRITE |
| `jungfrau` | 3 | Mönch, Switzerland (Bernese Alps peak also reached from the Jungfraujoch station) | REWRITE |
| `lake-ohrid` | 4 | Lake Prespa (ancient lake also shared by North Macedonia and Albania, plus Greece) | REWRITE |
| `redwood-national-and-state-parks` | 4 | Humboldt Redwoods State Park, California (coastal redwood park with many of the tallest trees) | REWRITE |
| `palm-jumeirah` | 4 | Palm Jebel Ali, Dubai (the second palm-shaped island, named in the article) | REWRITE |
| `lascaux` | 4 | Font-de-Gaume, Dordogne (painted horses and bison of similar age); Rouffignac, Dordogne | REWRITE |
| `miraflores-locks` | 4 | Cocoli Locks (Neopanamax locks at the Pacific end); Pedro Miguel Locks | REWRITE |

## Before and after examples

| Entry | Before | After |
|---|---|---|
| jokulsarlon-glacier-lagoon | Where do icebergs calve off a glacier into a lagoon and roll out to sea through its shallow mouth? | Where do icebergs from Breiðamerkurjökull calve into a lagoon and float out to sea under a ring-road bridge? |
| hagia-sophia | Where does a building that has served as both a cathedral and a mosque stand? | Where does a cathedral completed in AD 537, later a mosque, enclose what was the world's largest interior space? |
| piton-de-la-fournaise | Where is the active volcano on an island in the Indian Ocean? | Where has an island volcano in the Indian Ocean erupted more than 150 times since the 17th century? |
| quilmes-hillside-ruins | Which pre-Hispanic settlement spreads as low stone foundations and reconstructed walls across an arid mountain slope? | Which pre-Hispanic hillside settlement resisted outside rule for centuries until its people were forcibly displaced in 1667? |
| dead-sea | Where is a lake so salty that swimmers float effortlessly on its surface? | Where is a lake so salty that swimmers float, its shores the lowest dry land on Earth? |
| pompeii | Where was the Roman town frozen in ash by a volcano in AD 79? | Where was a Roman town frozen in ash in AD 79, its victims recovered as plaster casts of the hollows they left? |
| newgrange | Where does midwinter sunlight enter a stone mound and light up a chamber built 5,000 years ago? | Where does midwinter sunrise shine through a roof box into the chamber of a stone mound built 5,000 years ago? |
| kennedy-space-center | Where is the Florida launch site for NASA crewed missions? | Where did all six Apollo Moon landing missions lift off aboard the Saturn V? |
| cologne-cathedral | Where does a landmark Gothic cathedral raise twin spires above the Rhine? | Where does the world's tallest twin-spired church rise above the Rhine? |
| alice-springs | Which outback town in Australia's Red Centre is the gateway to Uluru country? | Which outback town near Australia's geographic centre is named for the wife of telegraph pioneer Charles Todd? |
| miraflores-locks | Where do ships climb or descend the final steps at the Pacific end of the Panama Canal? | Where do ships rise or fall 16.5 metres in two lock stages at the Pacific end of the Panama Canal? |

## Playable pool after the pass

432 entries, unchanged because nothing was pulled. Per difficulty band:

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 |
|---|---|---|---|---|---|
| Entries | 159 | 63 | 116 | 62 | 32 |

## Validation

`node scripts/trivia-uniqueness/validate.mjs` compares the bank against `fb4af2a`. It proves that:
- on kept entries only the clue changed, and every clue change is a REWRITE verdict (every REWRITE was applied);
- flag removals exactly match the PULL verdicts and this report's pulled list;
- no other field or entry changed, and the file's text diff touches exactly the changed lines;
- every flag names a competitor, and rewrites keep their question word, contain no em dash and do not name the answer;
- the counts reconcile: playable before = playable after + pulled.

I also tested the PULL path once on a throwaway verdict, which I did not commit. The flag was removed, the line diff and the count reconcile both held, and the bank was then restored.

Output at the report commit:

```
base fb4af2a; verdict files: slice1.json, slice2.json, slice3.json, slice4.json
verdicts: 432 of 432 playable; {"PASS":379,"REWRITE":53}
bank changes: 53 entries touched, 53 clues rewritten, 0 flags removed
playable before 432 = after 432 + pulled 0
report pulled list: 0 ids, matches
PASS: all checks
```

## Commits (all pushed to origin/main)

- `7aca9d6` slice 1 (entries 1-108): 18 rewrites
- `06d181a` slice 2 (entries 109-216): 12 rewrites
- `45247f9` slice 3 (entries 217-324): 18 rewrites
- `b7dbf5f` slice 4 (entries 325-432): 5 rewrites
- report commit: this file, plus a fix to the em-dash checks in `apply.mjs` and `validate.mjs`. They had a literal em dash in their regex; it is now the `\u2014` escape, which behaves the same.

Not deployed. The orchestrator verifies and deploys.
