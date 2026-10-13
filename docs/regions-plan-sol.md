# Region clues and reveal outlines: measured design plan

Status: **plan only**. No game data or runtime files are changed. Measurements were run on 2026-10-12 against the checked-in 754-location dataset and the cached source extracts under `scripts/regions-analysis/` / `.build-tmp/regions/`.

## Executive decision

Do this in two releases, in Sean's required order:

1. **Step A:** add a useful first-level region to clues where it materially narrows a country, assign a stable region identity to those records, and re-score only records that gain new clue information.
2. **Step B:** after Step A has shipped and been verified, reveal the correct location's region boundary inside the already-correct country boundary. Draw the two parts as one composite answer highlight, never as two countries or two competing answers.

“Applicable” should not mean merely “Natural Earth has an Admin-1 polygon.” Almost every non-microstate has one, including tiny countries where a district name is noise. Use a measured usefulness gate: a country is applicable when the population-weighted mean distance from its `cities15000` places to the country's population centre is at least **200 km**. This selects broad countries where Admin-1 information changes a plausible fallback tap. It selects the intended examples (US, Canada, Australia, Germany, Spain, Brazil, India, Mexico and France), rejects city-states and small compact unitary countries, and is reproducible as the dataset grows.

Measured scope:

- 754 entries and 202 game country keys.
- 59 applicable country keys, containing 493 locations.
- 354 locations have a usable, non-redundant first-level region; 125 are omitted because the place and region normalize to the same name; 4 currently lack a usable region assignment; 10 territory-unit clues remain governed by their existing unit treatment.
- 20 clues already communicate a first-level region (16 US states, Washington D.C., plus Bali, Kerala, and Newfoundland); therefore **334 entries gain new information and are re-scored**.
- Normalizing all 354 usable clues to the new three-part template changes 338 strings: the 334 new-information clues plus four existing-information normalizations. This distinction matters: text changes are not automatically difficulty changes.

## 1. Current state

### Dataset and exact formats

The inventory of `assets/locations.json` is:

| Literal clue shape | Count | Notes |
|---|---:|---|
| `City, Country + flag` | 712 | Standard form with one comma and flag. |
| `City, Country` | 19 | No flag: 16 England/Scotland/Wales/Northern Ireland clues plus Gaborone, Riga Old Town, and the incorrect Bristol/England record now present. |
| `City, Region, Country + flag` | 17 | All are US clues; 16 name states and Washington names `D.C.` rather than an Admin-1 display name. |
| `City + flag` | 6 | Hong Kong, Jerusalem, Macau, Monaco, Singapore, Vatican City. |

The 16 existing full state clues are Albuquerque/New Mexico, Anchorage/Alaska, Columbus/Ohio, Jacksonville/Florida, Portland/Oregon, Roswell/New Mexico, Tampa/Florida, Tucson/Arizona, Boise/Idaho, Oklahoma City/Oklahoma, Des Moines/Iowa, Little Rock/Arkansas, Buffalo/New York, Juneau/Alaska, Spokane/Washington, and Providence/Rhode Island. Washington also already discloses D.C. In addition, `Denpasar, Bali`, `Kochi, Kerala`, and `St. John's, Newfoundland` already disclose an Admin-1 unit but omit the dataset's country display name. Thus existing region/state information by country is **United States 17, Indonesia 1, India 1, Canada 1; every other country 0**. Washington needs a display normalization from `D.C.` to `District of Columbia`, but that does not add clue information.

The v2 scorer already treats 19 of those 20 region clues as unit clues; Washington D.C. is the omission. Portland's current Oregon-aware `dFb=68 km` and difficulty 1 are therefore the baseline; this project must not “discover” Oregon again and re-rate it. Washington's pre-existing scorer omission should be logged separately rather than smuggled into this clue-change scope.

### Reproducibility

The measurements come from:

- `pip.py`: location-to-Natural-Earth Admin-1 point-in-polygon and coastal fallback.
- `regions.py`: Natural Earth to GeoNames Admin-1 crosswalk, region population centres and country dispersion.
- `regviews.py`: English Wikipedia pageviews for region articles, using the same 2025-10 through 2026-09 window as v2.
- `rescore_sim.py`: baseline reproduction and a dry-run region model.
- `region_layer.py` and `region-sizes.mjs`: outline populations and byte estimates.

All generated JSON is analysis evidence, not proposed shipping data. The production implementation should turn these checks into deterministic build commands and record source versions/checksums.

## 2. The applicable-country rule

### Rule

For each game country key, use GeoNames `cities15000` and the same spherical, population-weighted centre calculation as v2. Compute:

`dispersion = population-weighted mean(distance(each city, country population centre))`.

A country gets region clues when `dispersion >= 200 km`, subject to these mechanical exclusions:

- England, Scotland, Wales and Northern Ireland are already top-level game answers; do not expose their smaller Admin-1/ceremonial units in this pass.
- A separately clued territory (Greenland, Puerto Rico, New Caledonia, French Polynesia, Svalbard, Hong Kong, Macau) keeps its existing clue unit rather than inheriting the sovereign country's regions.
- Omit the region token when normalized place name equals normalized region name (ignore words such as city, state, province, oblast, department, district and punctuation). This avoids `Tokyo, Tokyo, Japan`, `Algiers, Algiers, Algeria`, and similar tautologies.
- If no trustworthy Admin-1 name or centre is available, leave the clue unchanged and fail the build report rather than inventing one.

The 200 km threshold is a design estimate, selected because it directly measures clue usefulness under v2 rather than using government type or area. It is not player-observed. Sensitivity at 150/250/300 km must be printed at the Step A review gate; changing the threshold later would only affect newly qualifying/dequalifying entries and would require the same frozen-boundary treatment.

### Measured per-country result

Columns are `locations / region shown / same-name omitted / unresolved`. “Region shown” includes already-region-clued records.

| Country | Result | Country | Result |
|---|---:|---|---:|
| Afghanistan | 3 / 1 / 2 / 0 | Algeria | 2 / 0 / 2 / 0 |
| Angola | 1 / 0 / 1 / 0 | Argentina | 9 / 5 / 4 / 0 |
| Australia | 11 / 11 / 0 / 0 | Bolivia | 4 / 2 / 2 / 0 |
| Brazil | 24 / 22 / 2 / 0 | Cameroon | 2 / 2 / 0 / 0 |
| Canada | 21 / 19 / 1 / 1 | Chad | 1 / 0 / 1 / 0 |
| Chile | 2 / 0 / 2 / 0 | China | 36 / 30 / 4 / 0 |
| Colombia | 9 / 8 / 1 / 0 | Cuba | 1 / 0 / 1 / 0 |
| DR Congo | 6 / 5 / 1 / 0 | Ethiopia | 2 / 1 / 1 / 0 |
| France | 14 / 12 / 0 / 0 | Germany | 14 / 12 / 2 / 0 |
| India | 28 / 27 / 1 / 0 | Indonesia | 12 / 10 / 2 / 0 |
| Iran | 9 / 5 / 4 / 0 | Iraq | 8 / 2 / 6 / 0 |
| Italy | 12 / 12 / 0 / 0 | Japan | 17 / 8 / 9 / 0 |
| Kazakhstan | 4 / 1 / 3 / 0 | Libya | 4 / 2 / 2 / 0 |
| Madagascar | 1 / 1 / 0 / 0 | Malaysia | 3 / 2 / 1 / 0 |
| Mauritania | 1 / 0 / 0 / 1 | Mexico | 20 / 14 / 6 / 0 |
| Mongolia | 2 / 1 / 1 / 0 | Mozambique | 3 / 1 / 2 / 0 |
| Myanmar | 3 / 1 / 2 / 0 | Namibia | 1 / 1 / 0 / 0 |
| New Zealand | 3 / 1 / 2 / 0 | Niger | 2 / 0 / 2 / 0 |
| Nigeria | 10 / 6 / 4 / 0 | Norway | 8 / 5 / 2 / 0* |
| Pakistan | 7 / 6 / 1 / 0 | Papua New Guinea | 1 / 1 / 0 / 0 |
| Peru | 5 / 3 / 2 / 0 | Philippines | 6 / 5 / 1 / 0 |
| Russia | 21 / 9 / 11 / 1 | Saudi Arabia | 6 / 3 / 3 / 0 |
| Somalia | 2 / 1 / 0 / 1 | South Africa | 5 / 5 / 0 / 0 |
| South Sudan | 1 / 1 / 0 / 0 | Spain | 10 / 8 / 2 / 0 |
| Sudan | 3 / 2 / 1 / 0 | Sweden | 2 / 1 / 1 / 0 |
| Tanzania | 5 / 1 / 4 / 0 | Turkey | 13 / 3 / 10 / 0 |
| Turkmenistan | 2 / 1 / 1 / 0 | Ukraine | 7 / 2 / 5 / 0 |
| United States | 63 / 62 / 0 / 0 | Uzbekistan | 4 / 2 / 2 / 0 |
| Venezuela | 4 / 4 / 0 / 0 | Vietnam | 7 / 3 / 4 / 0 |
| Zambia | 2 / 1 / 1 / 0 |  |  |

`*` Norway's eighth record is the existing Svalbard territory-unit clue, not an unresolved mainland assignment. The four true missing assignments in the simulation are Iqaluit, Hargeysa, Nouakchott and Pevek. Iqaluit and Pevek are coastal/coverage failures that should be manually verified against the source; Hargeysa is politically sensitive; Nouakchott's source mapping is incomplete.

### Awkward cases and policy

- **City equals region:** omit the region token. This affects 125 records. Keep the `region` identity internally if Step B needs it, but never display `City, City, Country`.
- **Capital of a differently named region:** show it; `Canberra, Australian Capital Territory, Australia` is informative. “Capital” is not itself a reason to suppress a region.
- **Capital whose region repeats it:** suppress through the same-name rule; do not special-case capitals.
- **Renamed/outdated:** use current player-facing English short names from a reviewed display-name table, keyed by stable GeoNames/NE IDs. Example: normalize the existing `Newfoundland` to `Newfoundland and Labrador`. Never derive display text blindly from Natural Earth's old `name` field.
- **Disputed regions:** use the same worldview and country-key membership as the existing country-outline build. Flag Hargeysa/Somaliland, Jerusalem, Crimea/Sevastopol, Western Sahara and any NE `fclass_*` disagreement for explicit review; do not let point-in-polygon silently choose the clue's political wording.
- **Unhelpful fine divisions:** the dispersion gate acts at country level, but a region can still be obscure. That is acceptable only if it improves a plausible tap. The six currently unmeasured region pageviews—Ho Chi Minh City, Balearic Islands (two locations), Ladakh, and National Capital Region (two)—must be resolved or reviewed before scoring.
- **Administrative-level mismatch:** Natural Earth sometimes stores departments/provinces below the player-recognizable first level (notably France, Italy and Spain). Dissolve polygons to the GeoNames Admin-1 identity before display or outline generation; do not show a French department when the clue policy says region.

## 3. Clue format and readability

Canonical display:

`{short}, {regionDisplay}, {countryDisplay} {flag}`

Examples: `Portland, Oregon, United States 🇺🇸`; `Munich, Bavaria, Germany 🇩🇪`; `Barcelona, Catalonia, Spain 🇪🇸`; `Agra, Uttar Pradesh, India 🇮🇳`.

Exceptions:

- Keep the current no-flag convention for England/Scotland/Wales/Northern Ireland, though those keys are excluded from new region clues.
- Territory clues retain their existing display unit and flag.
- Same-name regions are omitted from clue text.
- Give Washington a display override (`District of Columbia`) and make sure comma parsing is data-driven, not string-splitting (`D.C.` is punctuation, not structure).
- Prefer familiar English short names and accents; remove parenthetical database disambiguators such as `Ho Chi Minh City (HCMC)`.

Measured length for the 354 canonical three-part clues: minimum 21 characters, median 32, p90 43, p95 46, maximum 58; 7 exceed 50 and none exceed 60. The longest measured cases include Santa Cruz de la Sierra (58), Washington (56), Ho Chi Minh City (53), Quezon City and Canberra (52). Verification must test those seven at the narrowest supported viewport with the real font. Recommended UI behavior is a maximum of two lines with balanced wrapping after a comma; do not truncate the country or flag. If two lines still overflow, use a reviewed short region label rather than reducing all clue text.

## 4. Difficulty re-scoring design

### Frozen-boundary rule

Sean has decided that new region clues change difficulty. Follow v2's established rule: **keep the frozen loss cut points and re-score only the 334 entries that gain region information**. Do not recalibrate the distribution and do not touch the 420 unaffected entries. The 20 already-region-clued entries, including Portland and Washington D.C., remain byte-for-byte at their present rating/why unless correcting an independently identified data error. The four clue-only normalizations (D.C./District of Columbia, Bali/Indonesia, Kerala/India, Newfoundland and Labrador/Canada) do not add player information and therefore do not trigger re-scoring.

### Model extension

Preserve v2's city fame `p`, known-city miss, `K`, `d1M`, scoring curve and frozen cut points. Add a region-recognition branch:

- `q = p_know(region article views/day)`, using the same pageview window and log curve as city fame.
- `dFbCountry` is distance from the pin to the country population centre.
- `dFbRegion` is distance from the pin to the population-weighted centre of the location's GeoNames Admin-1 region.
- A non-city-knower who recognizes the region falls back to `dFbRegion`; one who does not falls back to `dFbCountry`. Apply the existing `K × max(800,d1M)` penalty to the country-level branch. For the region branch, do not add `K`: recognizing the named region implies locating it within the already named country.
- Cap the region branch at the country branch (`missRegion = min(missRegion, missCountry)`), so extra clue information cannot mathematically make an answer harder.
- For a city-knower, keep the existing known miss; the region name cannot reduce already-local knowledge.

This is more defensible than unconditionally replacing the country centre: “Uttar Pradesh” helps only players who can place Uttar Pradesh. It also keeps the current UNIT behavior as a compatibility baseline. The implementation should first reproduce 754/754 current v2 losses and levels, then activate the new branch only for the 334 affected IDs.

### Inputs to measure and freeze

- Region ID and reviewed English display name.
- Region English-Wikipedia article title and average user pageviews/day for the same 12 full months as the city's v2 views.
- GeoNames `cities15000` membership, population and coordinates for each Admin-1; calculate the same spherical population-weighted centre as `score_v2.py`.
- `dFbRegion`, `dFbCountry`, `q`, source IDs/version dates, and a reason string sufficient to reproduce the score.
- A coverage report for regions with no qualifying city. Do not silently use polygon centroids; either use a broader GeoNames population source and document it or hold the record for review.

The cached analysis resolved 381 used region identities and obtained usable pageviews for all but the six cases listed above. GeoNames documents that `cities15000` contains cities over 15,000 or capitals, provides Admin-1 codes/names and population fields, and is CC BY 4.0: [GeoNames export readme](https://download.geonames.org/export/dump/readme.txt).

### Measured dry-run, not an approved rating output

The dry-run reproduced the existing baseline 754/754. Among the 334 information-changing entries, six lack `q`; for the other 328, the tentative level deltas were: 103 unchanged, 119 down 1, 59 down 2, 32 down 3, 12 down 4, 1 down 5, and 2 down 6. No affected entry became harder. That direction is expected: adding a useful region primarily lowers difficulty.

Illustrative measured cases (current → tentative):

| Location | Region views/day | country → region fallback km | Level |
|---|---:|---:|---:|
| Adelaide / South Australia | 884.4 | 602 → 3 | 5 → 3 |
| Agra / Uttar Pradesh | 3,141.5 | 684 → 180 | 6 → 4 |
| Jaipur / Rajasthan | 2,159.9 | 703 → 86 | 6 → 3 |
| Perth / Western Australia | 1,180.8 | 2,724 → 8 | 6 → 4 |
| Vancouver / British Columbia | 2,592.2 | 2,594 → 27 | 3 → 1 |
| Banff / Alberta | 2,502.3 | 2,038 → 165 | 8 → 4 |

These are real pageview and centre inputs from the cached 2025-10–2026-09 analysis, but the results remain provisional until the six missing articles, the applicable threshold, and the formula implementation pass review. Portland/Oregon is deliberately absent: it was already scored as a region clue and stays at level 1.

## 5. Region assignment data

### Assignment pipeline

Use the same family of geometry operations as the country build:

1. Load Natural Earth 1:10m Admin-1 states/provinces and map each feature to an existing game country unit (`adm0_a3`, with the UK/territory rules above).
2. Point-in-polygon each location using its existing pin.
3. Crosswalk the polygon to a GeoNames Admin-1 ID by population-majority of `cities15000` points inside it; this supplies current names, centres and a dissolve key where Natural Earth's stored level is finer.
4. For a pin outside its own country's polygon, find the nearest boundary only within the expected game country units; accept automatically only within a documented coastal tolerance, otherwise require review.
5. Store the reviewed result and source IDs; builds revalidate rather than dynamically reassigning production clues.

Natural Earth's official 1:10m theme contains first-order internal divisions and exposes states/provinces polygons; it currently describes over 4,500 such divisions: [Natural Earth 1:10m cultural vectors](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/).

### Measured match rate and coastal pins

Of 754 pins, **716 (95.0%)** fell inside an Admin-1 polygon belonging to their game country; 38 needed nearest-own-unit fallback; none remained geometrically unassigned. Thirteen fall more than 1 km outside: Banjul 1.02, Florianópolis 1.06, Quebec City 1.06, Tiksi 1.06, Mombasa 1.24, Cairns 1.34, Nuku'alofa 1.38, Guayaquil 1.44, Tromsø 1.64, Tarawa 4.02, Capri 8.27, Skellig Michael 13.29, and Koh Phi Phi 26.40 km. Vatican City's point falls inside Italy's Admin-1 geometry but is correctly rejected because Italy is not its game unit.

Recommended gates: auto-accept inside; auto-snap an outside coastal pin only at `<=2 km`; review 2–15 km; require an explicit island/geometry override above 15 km. Therefore Tarawa, Capri, Skellig Michael and Koh Phi Phi require human confirmation before Step A. Never move the game pin merely to make assignment pass.

### `locations.json` field design

Add one optional structured field only where a region identity is needed:

```json
"region": { "id": "US.OR", "name": "Oregon", "outline": "US.OR" }
```

- `id`: stable canonical GeoNames Admin-1 code used by scoring and joins.
- `name`: reviewed player-facing text frozen with the clue.
- `outline`: shipped geometry key; normally equals `id`, but allows a stable explicit dissolve/override without corrupting the semantic ID.

Do not store centres, pageviews, match distances or Natural Earth row names in every location; those belong in versioned scorer/build inputs. Do not infer the region later by parsing `clue`.

## 6. Step B: region outlines

### Source and shipping set

Use Natural Earth 1:10m Admin-1 polygons from the same pinned release/worldview as Step A. Dissolve finer NE features to the canonical region outline key, clip/match them to the exact country-build units, build topology, simplify with the country pipeline's 0.02° Douglas-Peucker tolerance, restore collapsed rings, and quantize to the same 1e-4° grid.

Ship **only regions referenced by a location**, not all regions of applicable countries. The reveal can only request those keys; unused polygons add no gameplay value. Measured at 0.02°:

| Layer | Regions | Points | Raw JSON | gzip |
|---|---:|---:|---:|---:|
| Referenced regions | 381 | 51,061 | 634 KB | 238 KB |
| All regions of 59 applicable countries | 1,375 | 105,928 | 1,408 KB | 515 KB |

For comparison, the current country-outline asset is 1,211,450 raw bytes / 466,248 gzip bytes. Referenced-only adds about 52% of its gzip payload; all-regions adds about 110%. An interior-edge-only referenced layer measured 114 KB gzip when edges are classified against the full neighbor set, but it leaves six referenced island/single-unit regions without an internal edge (Shanghai, Chiba, Balearic Islands, Australian Capital Territory, Bali and Hawaii) and requires exact compositing with the country outline. Prefer the complete referenced-region polygons first; optimize to interior-only only after visual and cache profiling.

The simplified region/country junction check measured 502 boundary endpoints: p50 0.33 km, p90 1.22, p99 1.90, maximum 2.19, with three above 2 km. That is close but not pixel-proof at high zoom. The production build should derive country and region boundaries from one shared topology or snap endpoints before simplification; a screenshot gate should reject visible dangling seams.

### Display and Sean's one-border rule

Recommended reveal sequence:

1. Draw the correct **country outline** exactly as today.
2. Immediately add the correct region's **internal boundary segments** in the same answer color, thinner than the outer country stroke; optionally fill the correct region with a faint tint.
3. Treat both strokes as one composite highlight owned by the single correct answer. Do not animate a second country, neighbor, comparison outline or alternative candidate.

This preserves geographic context and Sean's hard rule: only the correct answer's border system is visible. Showing the region instead of the country would remove country context and makes island/coastal regions indistinguishable from the existing answer; sequencing two full outlines risks reading as two answers. The runtime should reuse the country outline material, reveal lifecycle, depth settings and disposal path, adding only selection of region arcs. The country outer stroke remains visually dominant; shared coastline should not be double-stroked.

For records whose region is suppressed from the clue because city=region, Step B may still show the region only if Sean chooses “all assigned regions” rather than strict clue parity (decision below). For countries below the applicability gate or unresolved records, Step B remains country-only.

## 7. Ordered phases and verification gates

### Phase 0 — Freeze sources and audit

- Pin Natural Earth release/worldview, GeoNames extract date, pageview window and existing country-key mapping.
- Re-run inventory, assignment, dispersion, length and score-baseline reports.
- **Gate:** 754 locations, 202 keys; current v2 reproduces 754/754; all reported totals match this plan or differences are explained before edits.

### Phase 1 — Step A assignment review

- Generate the 59-country applicability report at 150/200/250/300 km.
- Produce a review CSV with old clue, proposed clue, canonical IDs, assignment method/distance, same-name decision and political/name flags.
- Manually clear all 38 fallback pins, especially the four beyond 2 km, all disputed cases, and every display-name override.
- **Gate:** 100% of the 354 displayed-region records have an approved semantic ID/name; no unresolved record changes clue; no `City, City, Country` output.

### Phase 2 — Step A scoring dry run

- Resolve region articles/pageviews and centres; implement the branch above while preserving the current scorer's baseline.
- Re-score exactly the 334 new-information IDs with frozen cuts. Emit before/after why strings and distribution impact, but do not write `locations.json` yet.
- **Gate:** 754/754 baseline reproduction; zero missing scoring inputs (the present six are blockers); unaffected 420 ratings unchanged; all 20 existing region clues unchanged; region branch never worse than country branch.

### Phase 3 — Step A data/UI release

- Add reviewed `region` objects, canonical clue strings and approved ratings in one data migration.
- Test all four legacy clue shapes plus the seven >50-character clues, narrow/mobile layouts, flags, accessibility text, daily and survival selection.
- **Gate:** schema/audit passes; 338 expected clue-string diffs and 334 expected scoring scopes, with exact ID manifests; no game behavior depends on comma parsing. Release and observe before Step B.

### Phase 4 — Step B geometry build

- Build referenced-only dissolved topology from the pinned Admin-1 source using shared country topology/snap rules.
- Verify keys, coverage, winding, islands, holes, seam endpoints, size budget and deterministic output.
- **Gate:** every requested outline key exists; no extra region can be selected; no visible >1 px dangling seam in a high-zoom screenshot suite; payload near the measured 634 KB raw / 238 KB gzip or variance explained.

### Phase 5 — Step B runtime/reveal

- Extend the current outline layer to render the composite country-plus-internal-region highlight and dispose it on every reveal transition.
- Test same-name, island, capital-district, territory, non-applicable and unresolved fallbacks.
- **Gate:** automated instrumentation asserts at most one answer highlight owner and one country key per reveal; screenshots show country outer stroke plus only the correct region's internal edges; country-only behavior is unchanged where no region applies.

## 8. Genuine remaining decisions for Sean

Difficulty re-scoring is **not** a decision; it is required for the 334 entries gaining information.

1. **Approve the 200 km applicability threshold.** Recommendation: approve, after viewing the required 150/200/250/300 sensitivity report. It translates “useful region” into the game's actual fallback geometry and avoids an arbitrary country list.
2. **Same-name clue policy.** Recommendation: omit the redundant region in text (the measured 125) while retaining its internal identity. Repetition reads like a data bug.
3. **Step B parity for same-name regions.** Recommendation: still show their region boundary when the country passed the gate. The border adds visual teaching value even when the label would repeat; if strict “only what the clue added” semantics matter more, keep those 125 country-only.
4. **Canonical political worldview for flagged regions.** Recommendation: inherit the current country-outline worldview and require explicit overrides for Somaliland/Hargeysa, Jerusalem, Crimea/Sevastopol and Western Sahara. Do not introduce a second geopolitical policy through Admin-1 data.
5. **Clue wrapping treatment.** Recommendation: two lines with comma-aware breaks and reviewed short display names; no truncation and no global font shrink.
6. **Step B asset form.** Recommendation: ship complete referenced-region polygons first (238 KB gzip measured). Consider the 114 KB interior-edge optimization only after the shared-topology seam test and island fallback are proven.
7. **Step B reveal timing.** Recommendation: country outline first, internal region edges immediately after as one composite highlight. Do not replace the country outline and do not present two independently styled borders.
