# Weekly Expeditions route authoring report

Date: 2026-10-16. Author: Claude Opus 5.5, working directly in one session (no delegation). Data and script only: no game code changed, nothing deployed.

## What shipped

- `assets/weekly-expeditions.json`: **37 routes**, each `{id, name, sub, locationIds}` with exactly 7 stops. 259 distinct stops, none repeated across routes and none taken from the 4 classic expeditions (`assets/expeditions.json` is untouched).
- `scripts/validate-weekly-expeditions.mjs`: checks every route rule and exits nonzero on any violation. Run from `demo/`: `node scripts/validate-weekly-expeditions.mjs`.
- Mix (measured): 132 landmark stops and 127 city stops; 18 of 37 routes are landmark-majority (4 or more landmark stops).

## Method

- **Design source:** `docs/expeditions-rethink-opus.md`, Proposal 3, with Sean's amendment that routes may be city themed.
- **Pool (measured):** 805 playable cities in `assets/locations.json` and 332 entries in `assets/locations-landmarks-sol.json` that pass `isPoolLandmark` (kind landmark, playable, v2 rated). Area and settlement entries are excluded by that rule.
- **Authoring (judgment):** I read every eligible stop with its country, stored difficulty and `sets` tags. I kept the tag sets that form a coherent journey (Silk Road, Himalaya, Wine Country, Port Cities, Megacities, Great Rivers, Caribbean, Mediterranean Islands, Arctic Circle, Balkans, Alps, Colonial Towns, Sacred Sites, Mountains, Ancient Ruins) and authored the rest from untagged material. I wrote 47 candidate routes, cut 10 on taste, and shipped 37.
- **Every number in this report comes from a script or the validator**, not an estimate.
- **Difficulty values are the stored ones.** Some look surprising (Times Square 7, Hollywood Sign 9, Pearl Harbor 10) but I did not override them; the rules run on the data as it stands.

## Validator rules

These rules come straight from the brief:
- every stop resolves either to a playable city in `locations.json` or to an `isPoolLandmark` entry
- no stop is used twice across routes, and no stop comes from a classic expedition
- at least 4 distinct countries per route, with at most 2 stops from any one country
- mean stored difficulty between 3 and 8 inclusive, with at least one stop at 4 or below and one at 6 or above
- route ids are unique slugs, and `name` and `sub` are present and contain no em dashes
- the pool holds 34 to 38 routes

I added two rules:
- **No photo shared between two stops.** This comes from the rethink doc's quality bar, so each postcard looks different.
- **Stops in non-decreasing difficulty order.** This guards the ordering principle below.

**Country counting:** England, Scotland, Wales and Northern Ireland count as one country (United Kingdom), and Cabo Verde and Cape Verde count as one. Without this, a route of four British stops could pass the 4-country rule.

## Ordering principle

Each route runs from the lowest stored difficulty to the highest, so Monday is the warm-up and Sunday is the hardest stop. Where two stops share a difficulty, the more famous one goes first. This fits catch-up Sunday: the toughest stop lands on the day the week's missed stops also reopen.

## The 37 routes

Stops by country use the validator's counting (UK nations merged). "L/C" is landmark and city stops.

| # | id | Name | Sub | L/C | Mean | Stops by country |
|---|---|---|---|---|---|---|
| 1 | pilgrim-week | Pilgrim Week | Seven places people cross the world to stand in. | 7/0 | 4.14 | Saudi Arabia 1, Israel 2, Nepal 1, Portugal 1, India 1, Colombia 1 |
| 2 | summit-week | Summit Week | Seven peaks, from Kilimanjaro to Denali. | 7/0 | 4.71 | Tanzania 1, Switzerland 2, United Kingdom 1, Iceland 1, Germany 1, United States 1 |
| 3 | roof-of-the-world | Roof of the World | Base camps, monasteries and mountain towns in the Himalaya. | 3/4 | 6.14 | Pakistan 1, Nepal 2, India 2, Bhutan 1, China 1 |
| 4 | silk-road | Silk Road | Caravan cities between Istanbul and Xi'an. | 2/5 | 6.00 | Turkey 1, Iran 2, China 1, Uzbekistan 2, Tajikistan 1 |
| 5 | roman-roads | Roman Roads | Across the Roman Empire, from Libya to Hadrian's Wall. | 5/2 | 4.86 | Italy 1, United Kingdom 2, Libya 1, Jordan 1, Turkey 1, France 1 |
| 6 | ruins-week | Ruins Week | Troy, Knossos, Persepolis and the lost cities of the Indus. | 5/2 | 4.14 | Turkey 2, Greece 2, Iran 1, Pakistan 1, India 1 |
| 7 | before-columbus | Before Columbus | Cities the Americas built long before Europe arrived. | 7/0 | 6.57 | Mexico 2, Guatemala 1, Bolivia 1, Peru 2, United States 1 |
| 8 | temple-trail | Temple Trail | Stupas, spires and jungle stone across Southeast Asia. | 6/1 | 5.86 | Cambodia 2, Thailand 1, Indonesia 1, Myanmar 1, Laos 2 |
| 9 | imperial-capitals | Imperial Capitals | Old seats of emperors and kings across East Asia. | 2/5 | 4.71 | Japan 1, South Korea 2, China 2, Vietnam 1, Mongolia 1 |
| 10 | nordic-coast | Nordic Coast | Harbour towns from Reykjavik to Helsinki. | 2/5 | 3.86 | Iceland 1, Finland 1, Sweden 1, Denmark 2, Norway 2 |
| 11 | restless-earth | Restless Earth | Geysers, hot pools and a gas crater that has burned for decades. | 7/0 | 6.14 | Iceland 2, Turkey 1, New Zealand 2, Turkmenistan 1, United States 1 |
| 12 | pacific-capitals | Pacific Capitals | Capitals scattered across the biggest ocean on Earth. | 0/7 | 7.14 | United States 1, New Zealand 1, Papua New Guinea 1, France 1, Samoa 1, Tonga 1, Vanuatu 1 |
| 13 | megacities | Megacities | Seven cities of ten million people or more. | 0/7 | 3.14 | Mexico 1, Brazil 1, Peru 1, Pakistan 1, Philippines 1, DR Congo 1, China 1 |
| 14 | great-rivers | Great Rivers | From the Dnieper to the Amazon, one big river a day. | 0/7 | 6.43 | Ukraine 1, India 1, Russia 1, Egypt 1, China 1, Vietnam 1, Brazil 1 |
| 15 | desert-week | Desert Week | Dunes, salt flats and fortresses in the driest places on Earth. | 7/0 | 6.86 | Israel 1, Morocco 1, Namibia 1, Peru 1, Saudi Arabia 1, Mongolia 1, United States 1 |
| 16 | wine-country | Wine Country | Port, claret and champagne, then four wine regions further afield. | 0/7 | 6.14 | Portugal 1, France 2, Georgia 1, Argentina 1, India 1, Canada 1 |
| 17 | port-cities | Port Cities | Seven harbours that made their cities rich. | 1/6 | 3.71 | Singapore 1, Germany 1, Egypt 1, Chile 1, Tanzania 1, Ukraine 1, Italy 1 |
| 18 | african-capitals | African Capitals | Seven capitals, from Dakar on the Atlantic to Nairobi. | 0/7 | 5.00 | Kenya 1, Senegal 1, Ghana 1, Nigeria 1, Uganda 1, Rwanda 1, Zambia 1 |
| 19 | africa-through-time | Africa Through Time | Early humans at Olduvai, pharaohs on the Nile, castles at Gondar. | 7/0 | 7.14 | Egypt 2, Ethiopia 2, Tanzania 2, Botswana 1 |
| 20 | caribbean-week | Caribbean Week | Harbours, reefs and twin peaks around the Caribbean. | 2/5 | 5.71 | Bahamas 1, Cuba 1, Haiti 1, Colombia 1, Belize 1, Trinidad and Tobago 1, Saint Lucia 1 |
| 21 | mediterranean-islands | Mediterranean Islands | Seven islands, one sea. | 0/7 | 4.86 | Malta 1, Cyprus 1, Greece 1, Italy 2, Spain 2 |
| 22 | arctic-circle | Arctic Circle | Seven stops north of the Arctic Circle. | 1/6 | 7.57 | Norway 2, United States 1, Denmark 1, Canada 1, Russia 2 |
| 23 | the-balkans | The Balkans | Bridges, bazaars and capitals across the Balkans. | 0/7 | 3.71 | Serbia 2, Bulgaria 1, North Macedonia 1, Albania 1, Bosnia and Herzegovina 1, Croatia 1 |
| 24 | the-alps | The Alps | Lakes, peaks and ski towns across the Alps. | 1/6 | 4.71 | Liechtenstein 1, Switzerland 2, Austria 2, Italy 1, France 1 |
| 25 | sports-week | Sports Week | Centre Court, Camp Nou and the field where the Olympics began. | 6/1 | 5.00 | United Kingdom 2, Spain 1, France 1, Greece 1, United States 2 |
| 26 | skyline-week | Skyline Week | Towers, a big wheel and a giant atom. | 7/0 | 4.43 | United Arab Emirates 2, United States 2, Belgium 1, United Kingdom 1, Italy 1 |
| 27 | turning-points | Turning Points | Battles, a charter and a church door that changed what came next. | 6/1 | 5.71 | United Kingdom 2, Greece 1, Germany 1, France 1, Turkey 1, United States 1 |
| 28 | twentieth-century | Twentieth Century | Seven places where the last century made headlines. | 6/1 | 6.29 | Netherlands 1, Germany 1, Japan 1, Ukraine 1, Russia 1, United States 2 |
| 29 | music-week | Music Week | From Mozart's Salzburg to the studio where Elvis cut his first record. | 2/5 | 3.43 | United Kingdom 1, Austria 2, Brazil 1, Jamaica 1, United States 2 |
| 30 | movie-week | Movie Week | Bollywood, Nollywood, Hollywood and the film sets in between. | 4/3 | 5.71 | India 1, Nigeria 1, New Zealand 1, France 1, Tunisia 1, United States 2 |
| 31 | stone-age | Stone Age | Standing stones, painted caves and rock art from the deep past. | 7/0 | 6.00 | United Kingdom 2, Ireland 1, France 1, Tanzania 1, Australia 1, Brazil 1 |
| 32 | castle-week | Castle Week | Walls, towers and fortresses from Edinburgh to Granada. | 5/2 | 4.71 | United Kingdom 2, France 2, Spain 2, Austria 1 |
| 33 | town-squares | Town Squares | Piazzas, plazas and the squares where cities gather. | 7/0 | 5.43 | Colombia 1, United Kingdom 1, Italy 2, Spain 2, United States 1 |
| 34 | old-towns | Old Towns | Cobbled lanes and town walls from Tallinn to Toledo. | 2/5 | 4.14 | Estonia 1, Belgium 1, Italy 1, Spain 1, Czech Republic 1, Germany 1, France 1 |
| 35 | indian-ocean | Indian Ocean | Spice ports and island capitals around the Indian Ocean. | 0/7 | 6.29 | Sri Lanka 1, India 1, Kenya 1, Australia 1, Mauritius 1, Comoros 1, Seychelles 1 |
| 36 | built-on-rock | Built on Rock | Monasteries and fortresses perched on rock. | 6/1 | 5.43 | France 1, Sri Lanka 2, Ireland 1, Greece 1, Georgia 2 |
| 37 | colonial-towns | Colonial Towns | Painted streets and old churches left by empires overseas. | 2/5 | 6.14 | Dominican Republic 1, Ecuador 1, Malaysia 1, Tanzania 1, Brazil 2, Argentina 1 |

The array order in the file is the authoring order, not a schedule. The UI build sets the rotation.

## Rejected candidates

### Cut on taste (10)

These candidates passed the rules, or could have with small swaps, but did not make a coherent or distinct week:

| Candidate | Reason |
|---|---|
| Container Ports | A second harbour route; too close to Port Cities. |
| Southern Africa | A region rather than an idea. African Capitals already covers the city slot. |
| Grand Tour | Nimes and Dresden were stretches, and the strong stops (Florence, Venice, Vienna) fit other routes better. |
| Hidden Capitals | The premise ("capitals people forget") is a matter of opinion; a player may disagree with every stop. |
| Buddha Week | Bangkok and Yangon fit only through a single temple each, and it overlapped Temple Trail. |
| Middle East | A grab-bag of cities that overlapped Pilgrim Week and Silk Road. |
| Island Chain (Lesser Antilles) | Six of its seven stops are rated 8 or 9: a week of small capitals that are hard to tell apart. |
| Desert Cities | Overlapped Desert Week. I kept the landmark version because the rethink doc found landmark-led weeks more valuable (city postcards are often already owned). |
| Discovery Week (science sites) | Oxford, Nalanda and Roslin had no shared thread beyond "ideas". |
| Fire Mountains (volcanoes) | Too close to the classic Volcano Week, which stays always open. |

### Could not meet the rules (no coherent version found)

| Candidate | Rule that blocked it |
|---|---|
| US Road Trip, American landmarks | Every stop is in one country; the 2-per-country cap allows only 2. |
| Single-country themes (Japan, Britain, Italy, Egypt and the Nile) | Same cap. |
| Waterfalls | All 3 pool waterfalls (Gullfoss, Dettifoss, Skógafoss) are in Iceland. |
| Andes | Only 3 unused pool stops carry the tag, and two of them are rated 10. |
| Remote Pacific islands | The remaining island capitals (Tarawa, Majuro, Palikir, Yaren, Funafuti, Honiara, Alofi) are all rated 10: mean over 8 and no stop at 4 or below. |
| Cliffs and coasts | Every cliff candidate (Moher, Dover, Preikestolen, Trolltunga, Kjeragbolten, Twelve Apostles, Lifou) is rated 5 or above, so the route has no stop at 4 or below. |
| A second Megacities route | The remaining megacities are rated 1 or 2. Reaching a mean of 3 with a stop at 6 or above needed cities that are not megacities. |
| Safari | Only 3 tagged stops, 2 of them in Tanzania. |
| Wonders of the World, Volcanoes, Pacific Islands sets | Most of their stops are already in the classic expeditions. |

## Data notes for Sean and the wiring build

- **Wrong photo in the city file (not fixed: out of scope).** `armenia` (Armenia, El Salvador) uses `Ait_Benhaddou_Pano.jpg`, the Moroccan ksar. `ait-benhaddou-ksar` has the correct photo and is a Desert Week stop. `armenia` is in no route, so the validator passes, but the Daily and Survival show that city with a Moroccan photo.
- **Same-place pairs avoided by hand.** A few places exist twice under different ids. `petra-nabatean-treasury` (cities file) is Petra, and `el-castillo-chichen-itza` is Chichen Itza; both are left out because the classics already have them. I also kept adjacent pairs out of the same week where I could: Forbidden City is used and Tiananmen is not; Red Square is used and the Kremlin is not.
- **Schema differs from the classics.** Classics carry `theme` and `emoji`; weekly routes carry `name` and `sub` as the brief specified, and no emoji. The picker card build will need to read `name` and `sub`, or emoji can be added in a later data pass.
- **City-led weeks.** 19 routes are city-majority. Following Sean's amendment, they are themed journeys, but a player who has played the Daily for a while will already own some of their postcards.

## Validator output

```
37 routes, 259 distinct stops
  pilgrim-week           diff [1 2 2 4 5 7 8] mean 4.14 | 7 landmarks, 0 cities | 6 countries: Saudi Arabia, Israel x2, Nepal, Portugal, India, Colombia
  summit-week            diff [2 3 4 5 5 7 7] mean 4.71 | 7 landmarks, 0 cities | 6 countries: Tanzania, Switzerland x2, United Kingdom, Iceland, Germany, United States
  roof-of-the-world      diff [2 2 5 7 8 9 10] mean 6.14 | 3 landmarks, 4 cities | 5 countries: Pakistan, Nepal x2, India x2, Bhutan, China
  silk-road              diff [1 4 5 7 7 9 9] mean 6.00 | 2 landmarks, 5 cities | 5 countries: Turkey, Iran x2, China, Uzbekistan x2, Tajikistan
  roman-roads            diff [1 5 5 5 5 6 7] mean 4.86 | 5 landmarks, 2 cities | 6 countries: Italy, United Kingdom x2, Libya, Jordan, Turkey, France
  ruins-week             diff [1 1 2 5 6 6 8] mean 4.14 | 5 landmarks, 2 cities | 5 countries: Turkey x2, Greece x2, Iran, Pakistan, India
  before-columbus        diff [4 6 6 6 7 7 10] mean 6.57 | 7 landmarks, 0 cities | 5 countries: Mexico x2, Guatemala, Bolivia, Peru x2, United States
  temple-trail           diff [1 4 6 6 7 8 9] mean 5.86 | 6 landmarks, 1 cities | 5 countries: Cambodia x2, Thailand, Indonesia, Myanmar, Laos x2
  imperial-capitals      diff [2 4 5 5 5 6 6] mean 4.71 | 2 landmarks, 5 cities | 5 countries: Japan, South Korea x2, China x2, Vietnam, Mongolia
  nordic-coast           diff [2 2 4 4 4 5 6] mean 3.86 | 2 landmarks, 5 cities | 5 countries: Iceland, Finland, Sweden, Denmark x2, Norway x2
  restless-earth         diff [4 5 6 6 6 7 9] mean 6.14 | 7 landmarks, 0 cities | 5 countries: Iceland x2, Turkey, New Zealand x2, Turkmenistan, United States
  pacific-capitals       diff [2 4 5 9 10 10 10] mean 7.14 | 0 landmarks, 7 cities | 7 countries: United States, New Zealand, Papua New Guinea, France, Samoa, Tonga, Vanuatu
  megacities             diff [1 2 3 3 3 4 6] mean 3.14 | 0 landmarks, 7 cities | 7 countries: Mexico, Brazil, Peru, Pakistan, Philippines, DR Congo, China
  great-rivers           diff [3 5 6 7 7 8 9] mean 6.43 | 0 landmarks, 7 cities | 7 countries: Ukraine, India, Russia, Egypt, China, Vietnam, Brazil
  desert-week            diff [4 6 7 7 7 8 9] mean 6.86 | 7 landmarks, 0 cities | 7 countries: Israel, Morocco, Namibia, Peru, Saudi Arabia, Mongolia, United States
  wine-country           diff [4 5 5 6 7 7 9] mean 6.14 | 0 landmarks, 7 cities | 6 countries: Portugal, France x2, Georgia, Argentina, India, Canada
  port-cities            diff [1 2 2 4 5 5 7] mean 3.71 | 1 landmarks, 6 cities | 7 countries: Singapore, Germany, Egypt, Chile, Tanzania, Ukraine, Italy
  african-capitals       diff [3 3 4 4 6 7 8] mean 5.00 | 0 landmarks, 7 cities | 7 countries: Kenya, Senegal, Ghana, Nigeria, Uganda, Rwanda, Zambia
  africa-through-time    diff [3 7 7 7 8 8 10] mean 7.14 | 7 landmarks, 0 cities | 4 countries: Egypt x2, Ethiopia x2, Tanzania x2, Botswana
  caribbean-week         diff [3 4 4 6 7 7 9] mean 5.71 | 2 landmarks, 5 cities | 7 countries: Bahamas, Cuba, Haiti, Colombia, Belize, Trinidad and Tobago, Saint Lucia
  mediterranean-islands  diff [3 4 5 5 5 6 6] mean 4.86 | 0 landmarks, 7 cities | 5 countries: Malta, Cyprus, Greece, Italy x2, Spain x2
  arctic-circle          diff [3 7 7 7 9 10 10] mean 7.57 | 1 landmarks, 6 cities | 5 countries: Norway x2, United States, Denmark, Canada, Russia x2
  the-balkans            diff [2 3 3 3 4 5 6] mean 3.71 | 0 landmarks, 7 cities | 6 countries: Serbia x2, Bulgaria, North Macedonia, Albania, Bosnia and Herzegovina, Croatia
  the-alps               diff [4 4 4 4 5 6 6] mean 4.71 | 1 landmarks, 6 cities | 5 countries: Liechtenstein, Switzerland x2, Austria x2, Italy, France
  sports-week            diff [4 4 4 5 5 6 7] mean 5.00 | 6 landmarks, 1 cities | 5 countries: United Kingdom x2, Spain, France, Greece, United States x2
  skyline-week           diff [1 2 4 4 4 7 9] mean 4.43 | 7 landmarks, 0 cities | 5 countries: United Arab Emirates x2, United States x2, Belgium, United Kingdom, Italy
  turning-points         diff [1 4 5 6 6 8 10] mean 5.71 | 6 landmarks, 1 cities | 6 countries: United Kingdom x2, Greece, Germany, France, Turkey, United States
  twentieth-century      diff [4 5 5 5 7 8 10] mean 6.29 | 6 landmarks, 1 cities | 6 countries: Netherlands, Germany, Japan, Ukraine, Russia, United States x2
  music-week             diff [1 1 1 3 4 6 8] mean 3.43 | 2 landmarks, 5 cities | 5 countries: United Kingdom, Austria x2, Brazil, Jamaica, United States x2
  movie-week             diff [1 3 5 7 7 8 9] mean 5.71 | 4 landmarks, 3 cities | 6 countries: India, Nigeria, New Zealand, France, Tunisia, United States x2
  stone-age              diff [1 4 5 5 7 10 10] mean 6.00 | 7 landmarks, 0 cities | 6 countries: United Kingdom x2, Ireland, France, Tanzania, Australia, Brazil
  castle-week            diff [1 4 4 5 6 6 7] mean 4.71 | 5 landmarks, 2 cities | 4 countries: United Kingdom x2, France x2, Spain x2, Austria
  town-squares           diff [3 4 5 6 6 7 7] mean 5.43 | 7 landmarks, 0 cities | 5 countries: Colombia, United Kingdom, Italy x2, Spain x2, United States
  old-towns              diff [2 3 4 4 5 5 6] mean 4.14 | 2 landmarks, 5 cities | 7 countries: Estonia, Belgium, Italy, Spain, Czech Republic, Germany, France
  indian-ocean           diff [3 4 6 6 8 8 9] mean 6.29 | 0 landmarks, 7 cities | 7 countries: Sri Lanka, India, Kenya, Australia, Mauritius, Comoros, Seychelles
  built-on-rock          diff [2 4 4 5 5 9 9] mean 5.43 | 6 landmarks, 1 cities | 5 countries: France, Sri Lanka x2, Ireland, Greece, Georgia x2
  colonial-towns         diff [3 4 6 6 7 8 9] mean 6.14 | 2 landmarks, 5 cities | 6 countries: Dominican Republic, Ecuador, Malaysia, Tanzania, Brazil x2, Argentina
PASS
```

I also fed the validator deliberately broken copies of the file. It reported every violation: a reused stop, a classic stop, an area entry, an unresolved id, a duplicate route id, an em dash, a 6-stop route, 4 UK stops in one route, wrong stop order, mean 10, mean 1.86, no stop at 4 or below, and a shared photo. It exited 1 each time and 0 on the clean file.

## Commits

- `eb55759` Weekly Expeditions route pool (1/2): 37 routes and validator
- `cc75447` Weekly Expeditions validator: write the em dash check as an escape (the first version contained the literal character it searches for)
- The commit that adds this report (report only).
