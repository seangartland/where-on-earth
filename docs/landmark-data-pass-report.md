# Landmark data pass report

Date: 2026-10-15. Author: Claude Opus 5.5, working directly in this session (no delegation). Design source: `docs/expeditions-rethink-opus.md`, Proposal 2, data prerequisites (Sean approved it 2026-10-15). Nothing was deployed.

Every number below was measured from the repo or from live Wikipedia and Wikimedia pageview APIs during this run, unless it is marked as a judgment.

## Read first: items for Sean

1. **`isla-foca` fails validation.** It is a playable landmark with no English Wikipedia article, so the frozen method has no fame measurement for it. I did not estimate one. Options: drop it from the bank, rule a parent article, or keep it out of any landmark pool until a source is approved.
2. **US landmarks skew Legendary.** 39 of the 75 rated US landmarks land at level 9 or 10, including Alcatraz (9) and the Hollywood Sign (9). The cause is clue display, not the scorer. US landmark clues show only "United States", so under skill rule 4 the fallback is the US population centre, 1,400 to 2,500 km from these pins. The cities avoided this by showing the state in every US clue. Showing the state in US landmark clues is your call; if you make it, rule 4 says to re-score only those entries.
3. **15 settlements the cull missed are tagged `kind: "settlement"`.** The brief says to flag these rather than classify them. The validator, though, requires a kind on every entry. I resolved that by using a third value the game treats as non-landmark (deviation, see Phase 1). The list is under Phase 1 for removal or a ruling.
4. **Spike rule edge cases.** The skill's band clause moves Pentagon from 2 to 5 and One World Trade Center from 2 to 5 on a mean-to-median gap of 15 to 30 percent. These are US pins on the steep part of the fame curve. I applied the rule as written. The table under Phase 3 lists all 14 entries scored on the median month.
5. **Country errors found but not touched** (hard limit: only kind, continent, difficulty and difficultyWhy). `pantanal-porto-jofre` says Bolivia; Porto Jofre is in Brazil. `laguna-colorada-viewpoint` says Chile; the lake is in Bolivia. `torres-del-paine-base-viewpoint` says Argentina; the park is in Chile. All three keep their stored country, which also drove their continent (South America either way) and their difficulty fallback centre.
6. **Overseas territories read as their sovereign's continent.** The country table maps France and the United Kingdom to Europe, so Kourou and Saint-Laurent (French Guiana), Lifou (New Caledonia), Pitcairn and Diego Garcia now say "Europe". The same is already true of existing entries `mt-orohena`, `mata-utu-wallis`, `tristan-da-cunha` and `peros-banhos`. A fix belongs in the shared table (more `FLAG_CONTINENT` rows, or a territory field), not in this pass.

## Commits

| Phase | Commit | Content |
|---|---|---|
| 1 | c03154c | `kind` on all 427 entries; `isLaunchExcluded()` reads `kind` |
| 2 | 5c91550 | `continent` backfilled on 274 entries |
| 3 | 21ad495 | v2 difficulty on 405 entries |
| 4 | 5c8b82a | `scripts/validate-landmarks.mjs` |
| Report | this commit | this file |

Scripts for every phase live in `scripts/landmark-pass/`, and each can be rerun from `demo/`.

## Audit before starting

The git log held no commits from this pass, so it started at phase 1. The working tree carried unrelated uncommitted changes from earlier work: `.gitignore`, `scripts/difficulty/v2-data/wd-cache.json`, six `shots/baseline/*.png` files and untracked favicon files. None were staged in this pass's commits. The bank held 427 entries, as the brief said.

## Phase 1: classification

**Method.** I read all 427 entries by hand (id, clue, short name, country, fact) and judged each on what it is, not on its name. The calls and their reasons are in `scripts/landmark-pass/classify.py` (tables `AREA`, `SETTLEMENT`, `LANDMARK_CALLS`). The script refuses to run if any of the 9 `extentKm` entries is not `area`.

**Result.** 360 landmark, 52 area, 15 settlement.

**Area rule (judgment).** The types in Sean's ruling: lakes, lagoons, valleys (including canyons and fjords), island groups and islands (including atolls), deserts (including salt flats and dune fields), forests and large parks, coasts, deltas, straits, canals and ranges. Large reefs, bays and ice caps were added for the same reason. A name alone was never enough. Area entries:

aitutaki-lagoon, amalfi-coast-d34-58, bering-strait, black-forest, bumthang-valley-bhutan, chuuk-wrecks, copper-canyon, daintree-rainforest, danakil-depression, danube-delta, dead-sea, gobi-desert-dinosaur-nemegt, great-ocean-road, great-sea-reef, ha-long-bay, jokulsarlon-glacier-lagoon, kakadu, lituya-bay-megatsunami, napa-valley-ava, okefenokee-swamp, phong-nha-ke-bang, richat-structure, savusavu-bay, sea-of-galilee, strait-of-gibraltar, suez-canal, uyuni-salt-hotel, yosemite-valley, zhangjiajie-national-forest-park, tsingy-de-bemaraha, wadi-rum, yolyn-am-mongolia, redwood-national-and-state-parks, fitz-roy-laguna-de-los-tres, salar-de-uyuni, lencois-maranhenses, laguna-colorada-viewpoint, valle-de-la-luna-chile, kiriwina-trobriands, atafu-loto, manihiki-oma, nanumea-tuvalu, pavuvu-russells, tabuaeran, teraina, peros-banhos, tristan-da-cunha, geirangerfjord-no, vatnajökull-d34-44, galapagos-islands, easter-island, lord-howe-island.

**Name-scan false friends judged landmark.** blue-lagoon-iceland (a spa), valley-of-kings and valley-of-queens-luxor (compact necropolis sites), monument-valley-mitten (one butte), blyde-river-canyon and colca-canyon-condor-cross (viewpoints), ol-duvai-gorge and monkey-gorge-zimbabwe (sites), cliffs-of-moher and white-cliffs-of-dover (named cliffs), amsterdam and gothenburg canals (districts), chocolate-hills, tsodilo-hills-bw, ngorongoro-crater-rim, thingvellir, badlands-national-park (clued as the Badlands Wall), badwater-basin, queenstown-bay, alcatraz-island, mont-saint-michel, murano, palm-jumeirah, chagos-diego-garcia-point (clued as a point), el-porvenir-san-blas, isla-foca, the two volcano entries (Hunga Tonga, Krakatau), kanyakumari-india (clued as India's southern tip), huacachina-peru and alert-nunavut (a station, the same class as the Antarctic stations).

**Settlement stragglers (deviation, flagged for Sean).** Plain towns and cities with no landmark subject: gold-coast, east-london, pietermaritzburg-za, tabas, santiago-de-cuba-cu, santiago-de-los-caballeros-do, zaporizhzhya-ua, thanh-hoa, abala, sri-jayawardenepura-kotte, grise-fiord, pangai-haapai, mata-utu-wallis, ambunti-sepik, pukapuka-village. The brief says to flag these instead of classifying them, and also makes the validator fail on any entry without a kind. `kind: "settlement"` satisfies both: it keeps them out of any landmark or area pool and keeps the validator meaningful. The rethink doc itself proposed `kind: landmark | settlement`. If you would rather they carry no kind, delete them; the validator then passes unchanged.

**Possible stragglers classified landmark (your call).**
- **Districts, under the brief's rule that districts are landmarks:** soweto-za, brooklyn-us, queens-us, the-bronx. The rethink doc counted Soweto as a settlement.
- **Same-name twins of active cities** (your earlier city-plaza pattern): georgetown-st-georges-cathedral (active `georgetown-guyana`, pin 1.5 km away) and paramaribo-presidential-palace (active `paramaribo-suriname`, 6.6 km). Their clues name only the city. You explicitly kept `medellin-botero-plaza` and `ouro-preto-tiradentes-square`, so those were not re-flagged.
- **Whole-town heritage sites outside your old-town group:** hoi-an, pingyao-ancient-city, cesky-krumlov-d34-18, monschau-d34-79, san-gimignano-d34-52, vlkolinec-slovakia, lucca-walls-d34-50.
- **Near-duplicates:** uyuni-salt-hotel (clue "Uyuni Salt Flats", 51 km from the Salar de Uyuni article point) duplicates salar-de-uyuni; both are area. The active cities file holds `petra-nabatean-treasury`, 0.2 km from `petra-jordan` in this bank.
- **Saharanpur:** not in the bank. It is in the 2026-10-15 removed archive.

**Code migration.** `isLaunchExcluded()` in `src/daily.js` (aliased by `isLandmark()`) now returns `kind !== 'city'` when an entry has a kind, and otherwise falls through to the old `category` check. Every landmarks-file entry now reads as excluded (427 of 427). Before, they all read as cities because every one carried `category: "city"`. No current caller passes landmark entries to it: Survival, Endless and the Daily filter only `state.locations` (the cities file), and Expeditions and the Passport shelf never call it. The cities file has no `kind`, so cities still go through `category` (805 of 805 are `city`, 0 excluded before and after). I did not add `kind` to the 805 cities because this pass's write scope is the landmarks file. `pvp-worker/scripts/build-catalog.mjs` also reads `category`, but only on the cities file; it was left as is.

**Zero behavior change, checked.** `dailyIds()` from the pre-change and post-change `daily.js` gives identical ids for all 365 dates from 2026-10-01 to 2027-09-30 (0 differ). The 17-stop shelf and Expeditions read ids from `expeditions.json` and never read `kind` or `category`. Three Expedition stops are now `kind: area` (easter-island, galapagos-islands, lord-howe-island); nothing reads that yet, so they stay stops.

## Phase 2: continent backfill

**Method.** `scripts/landmark-pass/continent.mjs` reads `COUNTRY_CONTINENT` and `FLAG_CONTINENT` straight from the source text of `scripts/add-continent.mjs`, the code path that set continent on the city file, so no table was copied. Countries added to the city game after that script ran fall back to the country-to-continent pairs already stored in `locations.json`. Entries that already had a continent were left alone.

The brief names `scripts/difficulty/v2-data/country_continent.json`. That file does not exist anywhere under `map-game/`; `add-continent.mjs` is the real code path.

**Result.** 274 backfilled, 0 missing (was 274 missing). 266 came from the table, 5 from the city-file pairs (Uruguay 2, Guyana, Suriname, Lesotho), 0 from flag overrides and 3 from judgment calls:

| Entry | Continent | Reason |
|---|---|---|
| bering-strait | North America | Country is International Waters. The pin sits on the US-Russia line, and the Russia table value (Europe) does not fit a Pacific strait. |
| strait-of-gibraltar | Europe | Country is International Waters and the clue names no country. The strait is named for Gibraltar, a European territory on its north shore. |
| pico-do-fogo-cape-verde | Africa | Cape Verde is in neither table; it is an African island state. |

After the backfill: Europe 114, North America 94, Asia 80, South America 48, Africa 36, Oceania 36, Antarctica 19.

## Phase 3: v2 difficulty re-rate

### Scorer-shape finding

The frozen scorer (`scripts/difficulty/v2-data/score_v2.py`) needs, per entry: `id`, `country` (mapped to a GeoNames population centre), `lat`/`lng`, the clue's display unit, and a measured views-per-day figure from the entry's own en.wikipedia article. The landmark entries carry all of these except views, so the shape can feed it. Four gaps, each handled without touching the scorer:

1. **Views.** The production resolver (`v2-data/resolve.py`) rejects any article that is not a human settlement, by design for cities. For landmarks I used Slice A's precedent: resolve to the article of the place itself, with the same window (2025-10 to 2026-09), the same user-agent pageviews and the same mean (sum / 365). The resolver's other guards were kept.
2. **No fallback centre.** Antarctica (19 entries) and International Waters (2) have no centre in the scorer, which exits on them, so these 21 stay unrated. All 19 Antarctic entries are unplayable; both International Waters entries are area.
3. **Cape Verde.** GeoNames names it "Cabo Verde" and the scorer's name table has no alias, so the harness calls the frozen `centre('CV')` by ISO code, as the batch-2 harness did for US states.
4. **Clue units.** Six US clues display a state (Arizona, New Jersey twice, Montana, California twice), so they use the state's centre (skill rule 4, batch-2 precedent). `piton-de-la-fournaise` displays the Réunion flag, so it uses Réunion's centre (the `noumea-new-caledonia` precedent). `tristan-da-cunha` uses its own pin, following `measure.py`. Clues that name a city ("Dealey Plaza, Dallas", "Sun Studio, Memphis") have no frozen rule and use the country centre. That likely overstates their difficulty, since the city is in the clue.

### Method

- **`resolve.py`** picks the title in this order: a hand title, the title behind an existing v2 score (15 from `resolved-v2.json`, 7 from Slice A), then the clue's lead segment. 88 hand titles are in `scripts/landmark-pass/hand-titles.json`, each chosen after an API probe. They cover the article of the place the clue names where the lead is missing or a disambiguation page (for example "Christ the Redeemer (statue)") and six wrong first matches, including "The Alamo" resolving to the battle.
- **Parent articles** (judgment; Slice A's Cotopaxi precedent and the `FAME_VIA` rule) where the place has none: K2 for its base camp, Annapurna Sanctuary, Fitz Roy for Laguna de los Tres, Colonia del Sacramento for its lighthouse, Saint-Laurent-du-Maroni for the penal camp, Savusavu, Queenstown, Avatiu, Mana Pools National Park, Monument Valley, Gothenburg for its canals, and Fuji Television for its building.
- **Moved pages.** Three articles were renamed inside the window (move log checked): Phong Nha-Kẻ Bàng National Park, Hội An (now "Hội An (city)") and Thanh Hóa (now "Thanh Hóa (city)"). Months before the new title existed come from the old title, so each has 12 months. Redirect hits after the move are not added, matching the resolver.
- **`score.py`** execs `score_v2.py`'s definitions up to its production loop and runs the identical loop body (the `.batch2/score_batch.py` method). `score_v2.py` is unchanged (`git diff` empty). `waikiki` and `salvador-pelourinho` use their parent city's fame through the scorer's own `FAME_VIA`.
- **Reproduction check.** Of the 22 entries that already carried a v2 score, 21 reproduce exactly on the mean. The 22nd, `brooklyn-us`, has the same loss (6.6) but the stored level is 3. It was scored before the growth addendum re-cut the first two cuts (6.4 to 7.0), so 2 is correct under the frozen CUTS.

### Spike rule

Applied per the skill. Every entry's 12-month mean and median month (median of monthly views / 30.4, the batch-2 method) are in `scripts/landmark-pass/scores.json`.

Interpretation (judgment): an entry is contaminated when its mean is above its median **and** either the mean is at least 3 times the median or the two land in different rarity bands (Common 1-3, Uncommon 4-6, Rare 7-8, Legendary 9-10, the bands the skill names). The "mean above median" condition exists because a spike can only raise the mean. The literal band test also caught Alcatraz and Denali, whose medians are higher than their means, which is a dip, not a spike. 14 entries were scored on the median month:

| id | mean/day | median/day | level on mean | level on median (stored) |
|---|---|---|---|---|
| augusta-national-golf-club | 1148.9 | 390.3 | 7 | 9 |
| bondi-beach | 1376.7 | 371.7 | 5 | 7 |
| burj-al-arab | 855.4 | 730.7 | 3 | 4 |
| camp-nou | 2025.6 | 1731.6 | 3 | 4 |
| chagos-diego-garcia-point | 3622.5 | 1425.4 | 4 | 9 |
| kennedy-space-center | 862.7 | 562.9 | 8 | 9 |
| lunch-atop-skyscraper-rockefeller | 678.6 | 621.5 | 8 | 9 |
| ol-duvai-gorge | 195.9 | 181.6 | 6 | 7 |
| pyramids-of-giza | 862.9 | 792.6 | 3 | 4 |
| pentagon-us | 2510.8 | 2125.2 | 2 | 5 |
| one-world-trade-center-us | 2868.7 | 2202.7 | 2 | 5 |
| queens-us | 1606.0 | 1503.7 | 6 | 7 |
| leshan-giant-buddha | 329.1 | 290.0 | 8 | 9 |
| tristan-da-cunha | 2813.8 | 1963.3 | 4 | 7 |

If "bands" meant single levels instead, 15 more entries would move: alcatraz-island (9 to 8), alert-nunavut (9 to 10), badwater-basin (9 to 10), bodh-gaya-india (7 to 8), delicate-arch-utah (9 to 10), denali (7 to 6), dome-of-the-rock (2 to 3), georgetown-st-georges-cathedral (7 to 8), krakatoa-1883-eruption (4 to 5), lumbini-nepal (4 to 5), suez-canal (1 to 2), trevi-fountain-rome (2 to 3), western-wall-jerusalem (2 to 3), wimbledon-all-england-club (4 to 5) and arc-de-triomphe-paris (2 to 3). The two parent-fame entries (waikiki, salvador-pelourinho) use the scorer's parent mean and have no median check.

### Result

405 rated and 22 unrated. The unrated entries keep their old stored values, which are v1 estimates; none of them is a playable landmark except `isla-foca`:
- 19 Antarctic entries, no fallback centre;
- bering-strait and strait-of-gibraltar, International Waters, no fallback centre;
- isla-foca, no en.wikipedia article. amundsen-scott-south, scott-hut-cape-evans and shackleton-hut-cape-royds also have no article, and are Antarctic.

285 of 427 difficulty values changed.

**Pins that sit far from their article's coordinates** (for a later pin audit; not touched): longmen-grottos 44 km, vlkolinec-slovakia 38 km, ak-baital-pass 32 km, challenger-deep 43 km, plus area-scale offsets for badlands-national-park, chocolate-hills, flaming-cliffs-bayanzag, gobi-desert-dinosaur-nemegt and uyuni-salt-hotel.

## Counts before and after

**By kind.** Before, no entry had a kind and all 427 said `category: "city"`. After: landmark 360, area 52, settlement 15.

| | Real image | Imageless | Antarctic | Playable (`isPlayableLocation`) |
|---|---|---|---|---|
| landmark | 351 | 9 | 19 | 333 |
| area | 49 | 3 | 0 | 49 |
| settlement | 12 | 3 | 0 | 12 |

All 15 imageless entries are still in the file and still classified.

**By difficulty level (1 to 10).**

| Set | Before | After |
|---|---|---|
| All 427 | 1, 32, 31, 40, 62, 67, 49, 63, 52, 30 | 15, 15, 8, 39, 57, 57, 67, 29, 66, 74 |
| landmark (360) | 1, 32, 28, 37, 51, 61, 44, 46, 37, 23 | 14, 14, 8, 36, 50, 50, 55, 24, 59, 50 |
| area (52) | 0, 0, 3, 2, 8, 3, 5, 13, 12, 6 | 1, 1, 0, 2, 5, 6, 9, 3, 5, 20 |
| settlement (15) | 0, 0, 0, 1, 3, 3, 0, 4, 3, 1 | 0, 0, 0, 1, 2, 1, 3, 2, 2, 4 |
| playable landmarks with v2 (332) | n/a | 14, 14, 8, 36, 50, 46, 52, 23, 48, 41 |

Formula in use: 22 entries carried the v2 formula before, 405 after.

The rethink doc expected a hard skew. It is real: 89 of the 332 playable rated landmarks (27 percent) are at level 9 or 10. 39 of the 123 rated entries at 9 or 10 are US landmarks (see item 2 at the top), and 66 of the 123 have under 100 views a day. The doc's suggested ramp for a Landmarks mode (bands 9 and 10 only after round 5) still looks necessary.

## Phase 4: validation

`scripts/validate-landmarks.mjs` fails on any of the following:
- an entry with no kind, or a kind other than landmark, area or settlement;
- an entry with no continent;
- a playable landmark (kind landmark that the game's own `isPlayableLocation()` accepts: real image, not Antarctic) whose `difficultyWhy` is not a v2 string, or whose stored difficulty differs from the level at the end of that string;
- a repeated id.

Output:

```
427 entries; by kind {"landmark":360,"area":52,"settlement":15}
playable landmark candidates: 333
FAIL: 1 problem(s)
  playable landmark without v2 difficultyWhy: isla-foca (F5·A2·K0·C0·S0 → 8)
exit 1
```

The one failure is a real gap (item 1 at the top), not a script fault. Passing it needs your ruling on isla-foca; I did not estimate a difficulty to make the gate green.

## Gates

The builder's session ended while its second PvP rerun was in flight, so the
orchestrator completed the gates independently on 2026-10-15 (Muse,
in-session):

- `node scripts/validate-landmarks.mjs`: 427 entries; by kind
  {"landmark":360,"area":52,"settlement":15}; playable landmark candidates
  333; exactly one failure, `isla-foca` without a v2 difficultyWhy, as
  reported in Phase 4 above. Exit 1 by design until Sean rules on isla-foca.
- `scripts/regression.sh` full run: 12 of 12 suites PASS, including PvP
  H2H 3b and 4, which had failed intermittently during the swipe build's
  verification and were proven there to predate that change. On this code
  they pass, so those failures read as timing flakes.
- Zero-behavior-change evidence for the `isLaunchExcluded()` migration
  stands as the builder measured it: `dailyIds()` identical across all 365
  dates from 2026-10-01 to 2027-09-30.

## Hard limits, checked

- Ids, entry order and every lat/lng are identical before and after (script comparison against 1a9e9e5).
- The only fields that changed are kind, continent, difficulty and difficultyWhy (script comparison: no other field differs on any entry).
- No localStorage code, Daily pins (`assets/daily-pins.json`), share text or scorer source was touched. `score_v2.py` diff is empty.
- No stored `playable` field. Playability stays derived by `isPlayableLocation()`.
