# Famous five landforms sourcing report (2026-10-29)

## Result

All five targets were sourced into the landmarks bank and the Landforms pack
set: Table Mountain, Giant's Causeway, Milford Sound, Perito Moreno Glacier,
and Mount Elbrus. The landmarks bank now contains 337 entries.
`scripts/pack-landforms/derive.py` generates 138 Landforms (133 + 5 curated
additions), the exclusive Landmarks pack pool stays 199, World Capitals stays
207, and the combined pack total is 544. The Survival landmark pool is 305
(all five are playable point landmarks), 1,110 with the 805 cities.

Provenance note: the original generation lane (Claude Code Opus) added the
five entries, the derive additions, and the pool count updates, then died on
the Claude session limit before verification. The Wonder failover audited the
partial work instead of restarting: every verification below was run by the
failover (Wikidata coordinate comparison, live pageview fetch, image viewing,
pin audit, dedupe, proximity, full suite). One defect was found and fixed by
the failover: the combined pack total assertion in
test/passport-packs.test.mjs still expected 539; it now expects the correct
544. No entry content needed changes.

## Per-entry audit

Difficulty is framework v2 through the same adapted path as the famous nine.
Pageviews are the trailing 12 complete months (2025-10 through 2026-09) from
the Wikimedia REST API, fetched live by the failover; the spike check compares
the 12-month mean against the median of monthly daily means.

| ID | Pin and coordinate reference | Difficulty basis | Image, license, author | Proximity |
|---|---|---|---|---|
| `table-mountain` | -33.9622, 18.4135; main terrace; Wikidata Q213360 P625 matches to ~5 m | 8; mean 543.6/day, median 554.9/day, ratio 0.98, no spike | [file](https://commons.wikimedia.org/wiki/File:Table_Mountain_from_Blouberg_beach.jpg), CC BY-SA 4.0, Michael Rowe | Cape Town (cities bank) 4.3 km: the mountain rises directly above the city; covering-entry overlap of the K2 Base Camp class, retained as the feature itself |
| `giants-causeway` | 55.2408, -6.5116; main outcrop; Wikidata Q106187 P625 matches to ~7 m | 3; mean 1,098.6/day, median 1,090.4/day, ratio 1.01, no spike | [file](https://commons.wikimedia.org/wiki/File:The_Giant%27s_Causeway_landscape.jpg), CC0, Yujin | Belfast 80.7 km; none within 10 km in the landmarks bank (Newgrange 171.9 km) |
| `milford-sound` | -44.6715, 167.9237; inner basin at Freshwater Basin under Mitre Peak (brief anchor); Wikidata Q187197 town-centroid sits 7.59 km up the fiord, flagged by the audit and retained deliberately; reverse geocode lands on Milford Sound foreshore | 8; mean 332.2/day, median 323.1/day, ratio 1.03, no spike | [file](https://commons.wikimedia.org/wiki/File:Mitre_Peak_from_Freshwater_Basin_in_Milford_Sound.jpg), public domain, Pseudopanax at English Wikipedia | Fiordland National Park 91.5 km; the park entry does not cover the sound (gap audit call) |
| `perito-moreno-glacier` | -50.4688, -73.0322; main viewing front (brief anchor); Wikidata Q367943 glacier centroid sits 7.30 km west, flagged by the audit and retained deliberately; reverse geocode lands on Paseo de la Costa, Lago Argentino | 10; mean 248.4/day, median 253.6/day, ratio 0.98, no spike | [file](https://commons.wikimedia.org/wiki/File:Looking_out_from_the_observation_deck_of_the_Perito_Moreno_Glacier_in_Los_Glaciers_National_Park_in_Southern_Argentine_Patagonia.jpg), CC0, Stch2022 | Torres del Paine base viewpoint 53.0 km |
| `mount-elbrus` | 43.3524, 42.4378; western summit; Wikidata Q43105 P625 matches to ~16 m | 8; mean 1,097.6/day, median 1,067.2/day, ratio 1.03, no spike | [file](https://commons.wikimedia.org/wiki/File:%D0%92%D0%B8%D0%B4_%D0%BD%D0%B0_%D0%B3%D0%BE%D1%80%D1%83_%D0%AD%D0%BB%D1%8C%D0%B1%D1%80%D1%83%D1%81.JPG), public domain, Alexander Tanchugin | Katskhi Pillar 134.3 km |

## Final entries

```json
{"id":"table-mountain","short":"Table Mountain","clue":"Table Mountain, South Africa 🇿🇦","fact":"Its level summit plateau runs about three kilometres from side to side, and it is the only land feature to give its name to a constellation: Mensa, “the table.”","lat":-33.9622,"lng":18.4135,"difficulty":8,"image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Table_Mountain_from_Blouberg_beach.jpg/500px-Table_Mountain_from_Blouberg_beach.jpg","country":"South Africa","continent":"Africa","sets":["Mountains"],"difficultyWhy":"p.58·fb1027·K0·iso664 → 98.5 → 8","category":"city","kind":"landmark"}
{"id":"giants-causeway","short":"Giant's Causeway","clue":"Giant's Causeway, Northern Ireland","fact":"Roughly 40,000 interlocking basalt columns, most of them hexagonal, formed here as lava from a fissure eruption cooled and cracked 50 to 60 million years ago.","lat":55.2408,"lng":-6.5116,"difficulty":3,"image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e7/The_Giant%27s_Causeway_landscape.jpg/500px-The_Giant%27s_Causeway_landscape.jpg","country":"Northern Ireland","continent":"Europe","sets":[],"difficultyWhy":"p.77·fb67·K0·iso213 → 8.8 → 3","category":"city","kind":"landmark"}
{"id":"milford-sound","short":"Milford Sound","clue":"Milford Sound, New Zealand 🇳🇿","fact":"Despite its name it is a glacier-carved fiord, not a river-cut sound; the sealer John Grono named it in 1823 after Milford Haven in his native Wales.","lat":-44.6715,"lng":167.9237,"difficulty":8,"image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Mitre_Peak_from_Freshwater_Basin_in_Milford_Sound.jpg/500px-Mitre_Peak_from_Freshwater_Basin_in_Milford_Sound.jpg","country":"New Zealand","continent":"Oceania","sets":["Fjords & Glaciers"],"difficultyWhy":"p.47·fb845·K0·iso1042 → 101.1 → 8","category":"city","kind":"landmark"}
{"id":"perito-moreno-glacier","short":"Perito Moreno Glacier","clue":"Perito Moreno Glacier, Argentina 🇦🇷","fact":"Its five-kilometre ice front periodically pushes across Lago Argentino and dams the Brazo Rico arm until the trapped water bursts through in a dramatic rupture.","lat":-50.4688,"lng":-73.0322,"difficulty":10,"image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Looking_out_from_the_observation_deck_of_the_Perito_Moreno_Glacier_in_Los_Glaciers_National_Park_in_Southern_Argentine_Patagonia.jpg/500px-Looking_out_from_the_observation_deck_of_the_Perito_Moreno_Glacier_in_Los_Glaciers_National_Park_in_Southern_Argentine_Patagonia.jpg","country":"Argentina","continent":"South America","sets":["Fjords & Glaciers","Andes"],"difficultyWhy":"p.40·fb2164·K0·iso1902 → 270.5 → 10","category":"city","kind":"landmark"}
{"id":"mount-elbrus","short":"Mount Elbrus","clue":"Mount Elbrus, Russia 🇷🇺","fact":"Europe's highest peak is a dormant volcano with twin domes: the western summit reaches 5,642 metres, just 21 metres above the eastern one.","lat":43.3524,"lng":42.4378,"difficulty":8,"image":"https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/%D0%92%D0%B8%D0%B4_%D0%BD%D0%B0_%D0%B3%D0%BE%D1%80%D1%83_%D0%AD%D0%BB%D1%8C%D0%B1%D1%80%D1%83%D1%81.JPG/500px-%D0%92%D0%B8%D0%B4_%D0%BD%D0%B0_%D0%B3%D0%BE%D1%80%D1%83_%D0%AD%D0%BB%D1%8C%D0%B1%D1%80%D1%83%D1%81.JPG","country":"Russia","continent":"Europe","sets":["Mountains","Volcanoes"],"difficultyWhy":"p.77·fb1613·K0·iso270 → 81.4 → 8","category":"city","kind":"landmark"}
```

## Quality and validation

- Dedupe by ID and accent-stripped short name passed against both banks; no
  existing entry already covers any of the five (Fiordland National Park is
  91.5 km from the Milford Sound pin and does not cover it, per the gap
  audit).
- All five clues and facts were read by the failover: specific, distinct, no
  template structure, no banned phrases. The Giant's Causeway clue carries no
  flag emoji, matching the bank's existing Northern Ireland convention
  (Belfast is clued the same way).
- Every image URL returns 200 as a real JPEG, is unique across both datasets,
  and was VIEWED by the failover: Table Mountain's flat top from
  Bloubergstrand, the Causeway's hexagonal columns, Mitre Peak from
  Freshwater Basin, the Perito Moreno ice front from the observation deck,
  and Elbrus's twin snow domes. All five survive a center square crop with
  the feature intact. Licenses and authors were confirmed on the Commons
  file pages (one CC BY-SA, two CC0, two public domain).
- Pin audit (scripts/pin-audit.py against the landmarks bank, with reverse
  geocode): 3 of 5 pins sit within 0.5 km of Wikidata P625. Milford Sound
  (7.59 km) and Perito Moreno (7.30 km) flag against the Wikidata centroids
  because both pins use the brief's deliberate anchors (inner basin,
  viewing front); both reverse geocodes land on the feature itself. This is
  the same accepted pattern as Mather Point and Heart Reef in the nine.
- Full suite: node --test test/*.test.mjs, 70 tests, 70 pass, 0 fail,
  including the updated Landforms 138 and combined 544 assertions.

## Pool counts after

- Landmarks bank 337; quarantine 116 (unchanged).
- World Capitals 207; Landmarks pack pool 199; Landforms 138; combined
  packs 544.
- Survival: 805 cities + 305 landmarks = 1,110.
