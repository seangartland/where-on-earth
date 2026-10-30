# Porto-Novo batch report (2026-10-29)

One city added: Porto-Novo, Benin. It was the only sovereign capital missing from the World Capitals pack set. Brief: `.build-tmp/porto-novo-brief.md`. Pipeline: the locations skill (`~/workspace/custom-skills/local-where-on-earth-locations/SKILL.md`). Claude Opus 5.5 did the work in-session. Nothing was committed, pushed or deployed. Working files are in `.batch-porto-novo/`.

## Final entry (appended to `assets/locations.json`, 804 → 805 cities)

```json
{
 "id": "porto-novo-bj",
 "short": "Porto-Novo",
 "clue": "Porto-Novo, Benin 🇧🇯",
 "fact": "Porto-Novo's Great Mosque, completed in 1925, is built like a Brazilian chapel with a stucco-decorated facade, a legacy of the Afro-Brazilians who resettled in the city after emancipation in Brazil.",
 "lat": 6.48333,
 "lng": 2.61667,
 "difficulty": 8,
 "image": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fc/Rue_de_l%27injeps_Porto-Novo_01.jpg/500px-Rue_de_l%27injeps_Porto-Novo_01.jpg",
 "country": "Benin",
 "region": {
  "id": "BJ.16",
  "name": "Oueme",
  "outline": "BJ.16"
 },
 "continent": "Africa",
 "sets": [],
 "difficultyWhy": "p.47·fb134·K1·iso86 → 97.3 → 8",
 "category": "city"
}
```

## 1. Dedupe [measured]

I checked the id and the short name, both raw and with diacritics stripped, against both `assets/locations.json` (804 entries) and `assets/locations-landmarks-sol.json` (333 entries). Neither file has a Porto-Novo entry under any id. The only Benin entry is `cotonou-bj`. The other hits on "porto" or "novo" were Porto, Porto Alegre, Porto Velho, Novosibirsk and Novovolynsk, which are all different places.

## 2. Coordinates [measured, reference data only]

These are the reference points for Q3799. The en.wikipedia article "Porto-Novo" resolves to wikibase_item Q3799, described as "capital of Benin".

| reference | lat, lng | to stored pin |
|---|---|---|
| Wikidata P625 (Q3799) | 6.4833333, 2.6166667 | 0.00 km (the anchor) |
| QID-matched OSM place node 1669842684 (place=city, wikidata=Q3799) | 6.4990718, 2.6253361 | 2.00 km |
| GeoNames 2392087 (PPLC, admin1 BJ.16) | 6.49646, 2.60359 | 2.05 km |

**Anchor: the Wikidata P625 point, rounded to 5 decimals.** Wikidata and OSM are 2.00 km apart, which is right at the pin-reanchor report's 2 km midpoint threshold. I chose by the anchor rule instead, which says to pin the historic core. The old town is the Avassa/Gbedji quarter. I located its landmarks with OSM via Nominatim: the Grande Mosquée de Porto-Novo is at 6.47174, 2.62811 and the Musée Honmè (royal palace) is at 6.46933, 2.62516. Distances from each reference to those landmarks:

| reference | Grande Mosquée | Musée Honmè |
|---|---|---|
| Wikidata | 1.81 km | 1.82 km |
| OSM node | 3.05 km | 3.31 km |
| GeoNames | 3.86 km | 3.84 km |
| Wikidata/OSM midpoint | about 2.6 km | |

Wikidata is the reference closest to the historic core. Its reverse geocode lands in Gbedji, the same quarter as the mosque and the museum (see section 7). No coordinate came from memory.

## 3. Proximity (25 km rule) [measured, haversine R 6371.0088]

The nearest active entry is `cotonou-bj` at 6.36536, 2.41833, which is **25.54 km** from the stored pin, so the rule is not triggered. Because this is close to the line, I also measured Cotonou against every other candidate anchor. All of them clear 25 km, so the result does not depend on which anchor I picked:

- Wikidata: 25.54 km
- OSM node: 27.28 km
- GeoNames: 25.13 km
- Wikidata/OSM midpoint: 26.41 km
- Grande Mosquée: 26.02 km

The next nearest entries are Lagos at 86.0 km, Lomé at 159.2 km and Ibadan at 173.6 km. The nearest landmarks-file entry is the Richat Structure at 2,218 km. Porto-Novo and Cotonou are distinct cities, the official capital and the economic capital, so the twin-city precedent (Incheon/Seoul) applies.

## 4. Clue, fact and region

- **Clue.** `Porto-Novo, Benin 🇧🇯`, the standard non-US `City, Country` format plus flag, with no region in the clue.
- **Fact.** Sourced from two en.wikipedia articles:
  - "Great Mosque of Porto-Novo": construction 1912 to 1925, an Afro-Brazilian architectural style resembling a chapel, and a front facade with stucco moulding.
  - "Porto-Novo": "Many Afro-Brazilians settled in Porto-Novo following their return to Africa after emancipation in Brazil."
- **Banned-phrase check.** No hits on the clue or the fact. With a single entry there is no template or sampling check to run.
- **Region: needs Sean's review.** The brief said to store Ouémé and to mirror Cotonou's region storage shape. However, **Cotonou has no `region` field.** Regions Step A classified Benin as `not-applicable`: its country dispersion is 166 km, under the 200 km gate (`scripts/regions-analysis/dispersion.json`, `step-a-changes.json`). The same applies to Lomé and Accra. I followed the brief's explicit instruction and the skill's "every entry gets its region stored" rule. I used the production shape every region-bearing entry has (`{id, name, outline}`, code = GeoNames admin1). The name comes from GeoNames' ASCII column, `Oueme` (from `admin1CodesASCII.txt` row `BJ.16 Ouémé Oueme 2392325`), because every production region name uses that column. For example, the file stores "Bolivar" and "Atlantico", and no region name in the file contains a non-ASCII character. Porto-Novo is therefore the only Benin entry carrying a region. If Sean prefers Step A consistency, deleting the `region` key is the one-line revert. No test reads region data. The game's population-centre region data (regions.json) does not include this id, so there is no measured centre for it. The field is stored data only and does not affect scoring, because non-US entries score on the country clue.

## 5. Image

**Chosen:** [File:Rue de l'injeps Porto-Novo 01.jpg](https://commons.wikimedia.org/wiki/File:Rue_de_l%27injeps_Porto-Novo_01.jpg)

- **License:** CC0 (Creative Commons Zero, public domain dedication; Commons `AttributionRequired: false`). This is the skill's happy path: no credit required.
- **Author:** Chado07 (own work, uploaded 2024-06-20, taken 2024-06-20).
- **Description:** "Rue de l'injeps asphaltée à Porto-Novo". It names Porto-Novo, and the file is in Commons category "Porto-Novo".
- **Content:** a real photograph of a paved avenue in Porto-Novo, with solar street lamps, palms, red-brick walls and motorbikes. It shows the city itself, not a single landmark.

How I found it: I ran nine Commons searches by name ("Porto-Novo", "Vue de Porto-Novo", "Porto-Novo panorama/quartier/rue/lagune/marché", "vue aérienne Porto-Novo", "Porto Novo Benin"). That gave 296 JPEG candidates after the denylist and the requirement that the description name Porto-Novo; the list is in `.batch-porto-novo/commons-candidates.txt`. **Openverse was unreachable from this host** (no HTTP response), so it was not searched.

I did not choose any of the PD or CC0 alternatives:
- The public-domain results are all historic, c. 1900 (Fortier) and 1930 (Gadmer).
- The other CC0 files are an iroko tree, a hospital and a garden sign, plus "Lac porto-novo", whose description says Lac Nokoué rather than Porto-Novo.

**Viewed:** yes. I looked at the full 500 px image and at its centre square crop, side by side with the two runner-ups (`.batch-porto-novo/image-candidates-square-crops.jpg`). The crop keeps the road, the lamps and the trees, with no sky-only or corner crop.

**Validation [measured]:**
- HEAD returns 200 with content-type image/jpeg (82,559 bytes).
- The file is a baseline JPEG, 500×667, and byte-identical to the file I viewed (`.batch-porto-novo/image-viewed-500px.jpg`).
- The URL, and the filename substring `injeps`, appear 0 times in either dataset.
- No montage or collage filenames appear anywhere in the active dataset.
- No placeholder was used.

**Note for Sean: the CC0 photo is a fairly generic avenue.** The best wider city view is the CC BY-SA runner-up below. It shows rooftops over Porto-Novo toward the lagoon and also survives the square crop. If Sean prefers a wider view over the no-credit rule, it is a drop-in swap:
- [File:Porto-Novo vue.jpg](https://commons.wikimedia.org/wiki/File:Porto-Novo_vue.jpg), CC BY-SA 4.0, author Élisée.Adad (own work, 2019-08-19), 834×567. Commons category "Views of Porto-Novo". 500 px URL: `https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Porto-Novo_vue.jpg/500px-Porto-Novo_vue.jpg`
- Second alternate: [File:Vue de Porto Novo (Bénin).jpg](https://commons.wikimedia.org/wiki/File:Vue_de_Porto_Novo_(B%C3%A9nin).jpg), CC BY-SA 4.0, SebEsteban, 2005 photo (Wiki Loves Africa 2016).

## 6. Difficulty (frozen v2 scorer) [measured]

`.batch-porto-novo/score.py` uses batch 2's resolution guards and execs `score_v2.py`'s own definitions (frozen CUTS `[4.7, 7.0, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7]`, K tables, centre(), p_know(), L(), level()), the same way `.batch2/score_batch.py` did. It does not write to v2-data.

**Resolved article:** en.wikipedia "Porto-Novo" → Q3799.
- Description: "Capital of Benin"; Wikidata type: city.
- Not a disambiguation page, and it passes the human-settlement check.
- The article's coordinates are 2 km from the pin.
- No resolution flags. This is the city itself.

**Pageviews:** en.wikipedia user views, 2025-10 through 2026-09.

| | views/day | scorer output | level |
|---|---|---|---|
| 12-month mean | **245.1** | p.47·fb134·K1·iso86 → 97.3 → 8 | 8 |
| median month | **202.0** | p.43·fb134·K1·iso86 → 104.7 → 8 | 8 |

**Spike check:**
- Mean and median both land in level 8, and the mean is only 1.21× the median, so the entry is **not spike-contaminated**. I accepted the mean score, as the pipeline does by default.
- The largest month is December 2025 at 17,117 views, 2.79× the median.
- Monthly views: 6969, 7008, 17117, 8893, 5746, 5478, 8450, 5930, 5694, 6160, 5902, 6122.

**Level 8 (Rare).** `difficultyWhy` is the scorer's own string. Benin's K is 1, the same as Cotonou's (`p.54·fb143·K1·iso108 → 85.6 → 8`).

## 7. Coordinate audit [measured]

`python3 scripts/pin-audit.py --ids porto-novo-bj --reverse` exited 0. Rows are in `.batch-porto-novo/pin-audit.json`.

- **QID:** Q3799, looked up via en.wikipedia. pin-audit's resolver list names only `.batch1` and `.batch2`, so it used its own lookup, which resolved to the city.
- **Distances:** 0.0005 km to Wikidata and 1.995 km to the OSM mapped centre. Risk class D (lowest risk).
- **3 km gate:** 0 flagged.
- **Nearest other entry:** cotonou-bj, 25.5 km.
- **Reverse geocode:** "Gbedji, Porto-Novo, Porto Novo, Ouémé Department, Benin" (city = Porto-Novo). This is the historic quarter of the Grande Mosquée and the Musée Honmè.
- **Cache:** the run added the new lookups to `scripts/pin-audit-cache.json`, which already had uncommitted changes before this run.

## 8. Capitals set

`python3 scripts/pack-capitals/derive.py .build-tmp/mledoze-countries.json` printed "207 capitals" and exited 0. I used the cached reference file and confirmed it is byte-identical to a fresh download of mledoze `countries.json`, where Benin's capital is `["Porto-Novo"]`. The diff to `src/meta/pack-capitals.js` is exactly one line: `+ 'porto-novo-bj',`. **206 → 207.** No override was needed, because Porto-Novo matches the reference capital by name.

## 9. Tests

`node --test test/*.test.mjs` on the first run: 70 tests, 65 pass, 5 fail. Every failure was a pinned count or a pinned derived selection. After updating them honestly, the final run is **70 tests, 70 pass, 0 fail** (log: `.batch-porto-novo/test-run.log`). `node --check src/main.js` and the module-mode check both pass.

Count assertions updated:
- `test/pack-capitals.test.mjs`: capital set 206 → 207 (test name too); distinct capital countries 201 → 202, since Benin is newly covered.
- `test/pack-pools.test.mjs`: capital pool 206 → 207 (test name too).
- `test/passport-packs.test.mjs`: World Capitals section total 206 → 207; Passport total 539 → 540.
- `test/survival-merge.test.mjs`: cities in the Survival pool 804 → 805.

**Derived Daily fixture (worth a look):** `test/extent-aware-scoring.test.mjs` freezes the Daily for 2026-11-03.
- That date is derived from the city pool, not pinned. `assets/daily-pins.json` covers only 2026-10-12 to 2026-10-31.
- Growing the pool to 805 changes the derived selection. It was hamburg-germany, zaragoza-es, ostersund, diyarbakr-tr, ipoh-my. It is now zanzibar-city-tanzania, stuttgart-de, raleigh-usa, zaranj, ottawa-canada.
- I regenerated that fixture row (ids, exact distances, scores) with `.batch-porto-novo/fixture-1103.mjs`, which runs the test's own computation.
- To check the method, I ran the same script against the HEAD pool. It reproduces the old fixture exactly.
- Note: the 2026-10-18 pinned fixture did not change. This test file already had uncommitted edits (extent geometry test) before this run, and I left those untouched.

**Daily impact, for the eventual deploy [measured, `.batch-porto-novo/daily-check.mjs`]:**
- Over the next 365 days, 362 derived dates change selection versus the HEAD pool. The first is 2026-11-01. Pinned dates do not change.
- `porto-novo-bj` appears in 2 of those 365 Dailies.
- This is the designed behaviour of adding a city: deploy.sh pins the in-play window. Per the skill, pin coverage must be checked before deploying. The pins currently end 2026-10-31.

## Not done / flagged

- **Not committed, pushed or deployed**, per the brief.
- **PvP worker catalog not regenerated.** `pvp-worker/src/catalog.js` is generated from locations.json (`pvp-worker/scripts/build-catalog.mjs`). Its committed `CATALOG_VERSION` (sha256:820324cf…) was already stale before this change: it matches neither the HEAD data (sha256:fe029977…, 804) nor the current data (sha256:d459784a…, 805). Later edits such as the image restores were never regenerated into it. Regenerating now would ship that unrelated drift as well, so I left it for Sean to decide alongside a PvP deploy.
- **The region field disagrees with Cotonou's and Step A's treatment of Benin** (section 4).
- **The image is a CC0 street view, not the wider CC BY-SA rooftop view** (section 5). There is one alternate for each choice.
