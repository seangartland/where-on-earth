# Lakes and national parks integration

## Result

Sourced 22 extent-aware `kind: "area"` entries (13 lakes and 9 parks); 20 are banked after the Wonder photo-validation pass described in the addendum at the end of this report (2 held out there by name). The Landmark Survival pool and Passport Landmarks shelf rise from 341 to 361. The exact banked IDs are:

`lake-baikal`, `lake-superior`, `lake-victoria`, `lake-titicaca`, `lake-bled`, `crater-lake`, `great-salt-lake`, `moraine-lake`, `plitvice-lakes`, `lake-como`, `lake-malawi`, `lake-balkhash`, `yellowstone-national-park`, `serengeti-national-park`, `kruger-national-park`, `fiordland-national-park`, `etosha-national-park`, `masai-mara`, `sagarmatha-national-park`, and `grand-teton-national-park`.

This checkout has no network access. Coordinates, Wikidata IDs, Wikipedia extracts/infobox values, Commons P18 filenames, and boundary measurements came from the repository's existing `.build-tmp/lakes-parks` sourcing cache. Facts were checked against those cached Wikipedia extracts. Each selected photograph is the feature's cached Wikidata P18 image, and its filename or cached Wikipedia caption describes the feature shown. Except where the repository's image-audit cache supplies a license below, author and license metadata was not present in the local sourcing records. Those fields are recorded as **not recoverable offline**, not guessed; they must be checked before release.

## Audit

Both `assets/locations.json` and `assets/locations-landmarks-sol.json` were checked by ID, normalized name, descriptive text, and coordinate proximity before adding anything.

- `loch-ness` already exists in `assets/locations.json` at 57.324, -4.607. Held out rather than silently adding an area duplicate. The existing point is about 9.8 km from the cached Wikidata anchor and would also fail the 3 km anchor gate.
- `denali` already exists as a point landmark at the mountain summit. Denali National Park was held out for Sean because the proposed park and existing famous summit substantially overlap.
- `snowdon` already exists as a point landmark within Snowdonia/Eryri. The park was held out for Sean.
- `torres-del-paine-base-viewpoint` already exists as a point landmark and is stored under the wrong country (`Argentina`; the feature is in Chile). A second cached Torres del Paine record is also a viewpoint, 29.2 km from the park's Wikidata anchor. The park was held out and the bad stored country is flagged for Sean rather than changed in this scoped integration.
- Yellowstone already has the distinct `grand-prismatic-yellowstone` and `old-faithful-yellowstone` point landmarks, 28–30 km from the park anchor. The park area was admitted because it represents the whole protected area rather than duplicating either point, but Sean should confirm that this amount of same-park coverage is wanted.
- `banff` exists in the city bank 2 km from the park's cached anchor. It is the townsite, while `banff-national-park` is the surrounding 6,641 km² protected area, so the park was admitted as the clearly better area representation. Sean should confirm keeping both.
- `moraine-lake` is inside Banff National Park. Both were admitted because one is a specific lake and the other is the much larger park; this is intentional nested coverage.
- `plitvice-lakes` appeared in historical review/frozen-Daily records but was absent from both current banks, so it is not a current-bank duplicate.
- `lake-titicaca-uros` exists only in the separate Trivia bank and describes the Uros floating islands, not the lake area. Trivia is an independent catalog, so the lake was admitted.

## Passing entries and sources

`extentKm` is the cached great-circle distance from the exact Wikidata coordinate to the farthest vertex of the feature's Q-linked OSM shoreline/boundary. The table also records the documented Wikipedia/Wikidata infobox dimensions used to sanity-check that measurement. “Anchor” is the stored-pin distance from the cached Wikidata coordinate; all admitted entries use that coordinate exactly.

| ID | Documented dimensions; measured extent | Anchor | Photo source | Author and license |
|---|---|---:|---|---|
| `lake-baikal` | 636 × 79 km; 31,722 km²; farthest shore 342.7 km | 0.0 km (Q5513) | Commons `Olkhon Island and Lake Baikal.jpg` | Unverified offline |
| `lake-superior` | 563 × 257 km; 82,350 km²; farthest shore 338.0 km | 0.0 km (Q1066) | Commons `Lake Superior, ISS.jpg` | Unverified offline |
| `lake-victoria` | 337 × 240 km; 68,100 km²; farthest shore 246.7 km | 0.0 km (Q5505) | Commons `Getting out to fish at dusk.jpg` | Unverified offline |
| `lake-titicaca` | 204 × 80 km; 8,372–8,562 km²; farthest shore 83.7 km | 0.0 km (Q35342) | Commons `00 1635 Reed Islands of Lake Titicaca.jpg` | Unverified offline |
| `lake-bled` | 2.12 × 1.38 km; 1.45 km²; farthest shore 1.1 km | 0.0 km (Q648902) | Commons `Aerial image of Lake Bled (view from the southwest).jpg` | Unverified offline |
| `crater-lake` | 9.6 × 8 km; 53.2 km²; farthest shore 4.9 km | 0.0 km (Q329266) | Commons `Day 181 - Crater Lake, Oregon (18695528363).jpg` | Unverified offline |
| `lake-toba` | 87 × 27 km; 1,145 km²; farthest shore 47.7 km | 0.0 km (Q183360) | Commons `Toba zoom.jpg` | Unverified offline |
| `great-salt-lake` | 120 × 45 km; listed area 4,400 km² (variable); farthest current cached shoreline 58.1 km | 0.0 km (Q178741) | Commons `Great Salt Lake by Sentinel-2.jpg` | Unverified offline |
| `moraine-lake` | 0.5 km²; farthest shore 0.8 km | 0.0 km (Q1072342) | Commons `Moraine Lake 17092005.jpg` | Author not in local record; PD-self (local image-audit cache; live metadata unverified) |
| `plitvice-lakes` | National park 296.85 km²; farthest boundary 16.5 km | 0.0 km (Q189849) | Commons `Plitvice Lakes National Park (2).jpg` | Unverified offline |
| `lake-como` | 46 × 4.5 km; 145 km²; farthest shore 25.7 km | 0.0 km (Q15523) | Commons `Panoramic view of Como Lake … 2015-10-25.JPG` | Unverified offline |
| `lake-malawi` | 570 × 75 km; 29,600 km²; farthest shore 301.2 km | 0.0 km (Q5532) | Commons `Otter Point, Cape Maclear (Malawi).jpg` | Unverified offline |
| `lake-balkhash` | 620 × 70 km; 18,200–18,740 km²; farthest shore 334.3 km | 0.0 km (Q134485) | Commons `STS039-085-00E Lake Balkhash, Kazakhstan April 1991.jpg` | Unverified offline |
| `yellowstone-national-park` | 8,983.17 km²; farthest boundary 74.8 km | 0.0 km (Q351) | Commons `Grand Prismatic Spring 2013.jpg` | Unverified offline |
| `serengeti-national-park` | 14,763 km²; farthest boundary 110.9 km | 0.0 km (Q11812902) | Commons `Serengeti-Landscape-2012.JPG` | Unverified offline |
| `banff-national-park` | 6,641 km²; farthest boundary 166.9 km | 0.0 km (Q41858) | Commons `Moraine Lake 17092005.jpg` | Author not in local record; PD-self (local image-audit cache; live metadata unverified) |
| `kruger-national-park` | 19,623 km²; farthest boundary 191.0 km | 0.0 km (Q24451) | Commons `Impalas and Zebras at Duke's Waterhole (16589771331).jpg` | Unverified offline |
| `fiordland-national-park` | 12,500 km²; farthest boundary 128.5 km | 0.0 km (Q877719) | Commons `Mountains in Fiordland National Park 08.jpg` | Unverified offline |
| `etosha-national-park` | 22,270 km²; farthest boundary 203.3 km | 0.0 km (Q675633) | Commons `Zebras Etosha Namibia(1).jpg` | Unverified offline |
| `masai-mara` | Cached infobox area 1,510 km²; Q-linked reserve boundary 1,539.5 km²; farthest boundary 40.6 km | 0.0 km (Q207724) | Commons `Mara River Massai Mara.jpg` | Author/license not recoverable offline |
| `sagarmatha-national-park` | 1,148 km²; farthest boundary 29.3 km | 0.0 km (Q2211959) | Commons `Everest, Nuptse, Khumbu Glacier, Nepal, Himalayas.jpg` | Unverified offline |
| `grand-teton-national-park` | 1,254.51 km²; farthest boundary 33.0 km | 0.0 km (Q222695) | Commons `Barns grand tetons.jpg` | Unverified offline |

The clues name the exact lake or protected area, and each fact identifies a feature specific to that named place. Countries and continents were checked against the cached Wikidata country claims and geographic reality. For transnational lakes, the stored country string names every bordering country rather than silently choosing the country under the representative pin.

## Held out

| Candidate | Reason |
|---|---|
| Loch Ness | Current city-bank duplicate; existing pin is 9.8 km from the Wikidata anchor. |
| Denali National Park | Existing `denali` summit point landmark; requires Sean's duplicate judgment. |
| Snowdonia / Eryri National Park | Existing `snowdon` point landmark; requires Sean's duplicate judgment. |
| Torres del Paine National Park | Two overlapping viewpoint records in sourcing/current data, one with an incorrect stored country; no clean 3 km park-anchor record was available offline. |

No substitute candidates were forced in merely to reach the cap. Lake Tahoe, Lake Michigan, Lake Tanganyika, Lake Garda, Zion National Park, and the Lake District were measured in the cache but were outside Sean's fame-first list and unnecessary once 22 candidates passed.

## Per-mode confirmation

- **Landmark Survival:** `src/modes/landmarks.js` admits playable `kind: "area"` records with an own, finite, positive `extentKm`. All 20 banked IDs pass. A scripted before/after assertion produced exactly these 20 additions, no removals, and no point-landmark status changes. Pool total: **361** (341 before this integration).
- **Daily postcard pack:** there is no implemented pack mode or pack selector in this checkout. `BRIEF-pack-spec.md` describes it as future work, while current code exposes `landmarkPool` only to Landmark Survival and the Passport shelf. If the future pack consumes `landmarkPool` as Sean's integration brief anticipates, its landmark side will be **361**; this cannot be confirmed as current runtime behavior and is flagged for Sean.
- **Passport:** `src/main.js` passes `landmarkPool` as `landmarkShelf`, and `src/meta/passport.js` renders that pool as a separate Landmarks shelf. The shelf rises from **341 to 361**. Its continent/country Places shelves and their totals are deliberately unaffected because landmark entries are kept separate.
- **Weekly Expeditions:** all 20 banked entries pass the `isPoolLandmark` eligibility rule enforced by `scripts/validate-weekly-expeditions.mjs`, so they are valid candidates for future Weekly routes. Runtime resolves only IDs explicitly listed in `assets/weekly-expeditions.json`; none of the 20 occurs in any of the 37 current routes, so none is currently scheduled. The classic Expeditions file also contains none of them.
- **Daily:** the launch Daily loads and selects from `assets/locations.json`; landmark-file entries have `kind` and are launch-excluded. These 22 never enter Daily.
- **PvP:** the worker catalog is generated from `assets/locations.json`, not the landmark bank. These 22 never enter PvP.
- **Trivia:** Trivia loads only `assets/trivia-bank.json`. These 22 never enter Trivia.

## Verification

- `node scripts/validate-landmarks.mjs`: 447 entries, 333 playable point-landmark candidates, 29 approved playable areas; the only failure is the accepted pre-existing `isla-foca` difficulty baseline.
- `node scripts/validate-weekly-expeditions.mjs`: 37 routes and 259 distinct stops; pass.
- `node --test test/extent-aware-scoring.test.mjs`: pass.
- JSON parse for all touched data: pass.
- `git diff --check`: pass.
- Scripted pool assertion: before 341, after 361, exact delta is the 20 banked IDs listed above, removed IDs `[]`.

## Items for Sean

1. Confirm the admitted whole-park coverage for Yellowstone despite its two existing point landmarks.
2. Confirm keeping both Banff town and Banff National Park, plus the nested Moraine Lake entry.
3. Decide whether Denali National Park and Eryri/Snowdonia should coexist with their existing summit landmarks.
4. Decide how to repair the existing Torres del Paine viewpoint's incorrect `Argentina` country before considering a park-area entry.
5. ~~Live-check all 22 Commons author/license records and the cached photo contents before release~~ Resolved by the Wonder validation addendum below: all 22 photos were viewed and all licenses read live from Commons; no license holds.
6. Resolve whether “Daily postcard pack via `landmarkPool`” refers to a not-yet-landed branch; it is not present in this checkout.

## Banking addendum: Wonder photo validation (orchestrator, 2026-10-18)

The sourcing lane ran offline, so its photo URLs and license claims were unverified. Per Sean's 2026-10-18 ruling, a Muse Wonder validation pass fetched and actually viewed every candidate photo and read every license live from Wikimedia Commons (full table: goal workspace hidden_files/wonder-lakes-parks-validation.md). Result: 20 PASS, 2 HOLD, no license holds (all 22 files are CC BY, CC BY-SA, or Public domain on their live Commons pages, authors recorded in the validation table).

Held out at banking (not in the banked data):
- `lake-toba`: its image is a false-colour Landsat rendering (lake black, land pink/green), not one real photograph. License is fine (Public domain, NASA). Needs a natural-colour or ground photo before it can be added.
- `banff-national-park`: its image file is byte-identical to `moraine-lake`'s (same Commons file, Moraine_Lake_17092005.jpg). Moraine Lake is inside Banff National Park, so the location is right, but one photo cannot be the distinct photo for two entries. It stays banked under `moraine-lake`; Banff needs a different photo (for example Lake Louise or the Bow Valley).

Borderline passes Sean may want to weigh in on: `lake-superior`, `great-salt-lake`, and `lake-balkhash` use natural-colour satellite/astronaut photos of the whole lake rather than ground-level photos; `crater-lake` and `kruger-national-park` are single-scene panoramas; `lake-victoria`, `lake-malawi`, `serengeti-national-park`, and `masai-mara` are genuine but generic scenery whose location rests on the Commons source page.

Pack ambiguity resolved: this report was written against the lane's base checkout, where the Daily postcard pack was not yet implemented. On current main the pack is implemented and consumes `landmarkPool()` (src/modes/pack.js), so its landmark side is the pool total, 361 after this banking.

Banking note: only the 20 validated entries, their validator/test allowlist rows, this report, and the brief were committed. Data is NOT deployed; it rides the next batch deploy.
