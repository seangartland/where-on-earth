# MapTap distribution cross-check

## Executive read

Our active pool is broad but shallow. It already has at least one city in every country represented by MapTap after MapTap's regional and territory anchors are rolled up to our country labels. The weakness is depth, not country acquisition.

The largest raw deficit is the United States (387 MapTap entries versus 63 active for us), but that overstates a product gap: 171 of MapTap's US entries are not `city`, and MapTap is unusually US-heavy. The more consequential lightweight areas are India (113 total / 98 `city` versus 28 active), England (54 / 26 versus 9), France (56 / 32 versus 14), Italy (40 / 26 versus 12), Japan (44 / 28 versus 17), Indonesia (30 / 20 versus 12), and especially Malaysia (16 / 11 versus 3). China and Brazil also have large absolute gaps, although our 36 and 24 active cities respectively are less thin in proportional terms.

Chile is the clearest small-count warning: MapTap has 20 entries, including 8 `city`, while we have only 2 active. Relative to geographic size and prominence, India, China, Brazil, Indonesia, Malaysia, Chile, and populous England/France deserve more attention than another broad US expansion. Our preserved pool is often deep in exactly these places (for example China 130, India 59, Brazil 44, and Chile 14), but preserved entries do not repair coverage in active city modes.

## 1. Distribution

The table is the 40 largest `MapTap total - our active` gaps. “MapTap city” means the exact MapTap type `city`; its `capital` and `state_capital` types remain in MapTap total but not that column. “Preserved” counts every entry in `assets/locations-landmarks-sol.json`, as requested, even where its historical category is surprising.

| Country (our label) | MapTap total | MapTap `city` | Our active | Our preserved | Total − active |
|---|---:|---:|---:|---:|---:|
| United States | 387 | 216 | 63 | 85 | 324 |
| India | 113 | 98 | 28 | 59 | 85 |
| China | 84 | 66 | 36 | 130 | 48 |
| England | 54 | 26 | 9 | 16 | 45 |
| France | 56 | 32 | 14 | 18 | 42 |
| Italy | 40 | 26 | 12 | 17 | 28 |
| Japan | 44 | 28 | 17 | 22 | 27 |
| Brazil | 50 | 46 | 24 | 44 | 26 |
| Spain | 30 | 18 | 10 | 12 | 20 |
| Germany | 33 | 25 | 14 | 9 | 19 |
| Indonesia | 30 | 20 | 12 | 13 | 18 |
| Chile | 20 | 8 | 2 | 14 | 18 |
| Mexico | 37 | 31 | 20 | 44 | 17 |
| Russia | 37 | 30 | 21 | 22 | 16 |
| Australia | 27 | 18 | 11 | 12 | 16 |
| Turkey | 26 | 16 | 13 | 11 | 13 |
| Malaysia | 16 | 11 | 3 | 2 | 13 |
| Canada | 33 | 23 | 21 | 14 | 12 |
| Greece | 18 | 4 | 6 | 5 | 12 |
| Argentina | 19 | 12 | 9 | 5 | 10 |
| Switzerland | 16 | 8 | 6 | 3 | 10 |
| South Africa | 15 | 5 | 5 | 7 | 10 |
| New Zealand | 13 | 4 | 3 | 9 | 10 |
| Ukraine | 16 | 11 | 7 | 8 | 9 |
| Pakistan | 15 | 10 | 7 | 14 | 8 |
| Tanzania | 13 | 4 | 5 | 6 | 8 |
| Egypt | 14 | 5 | 7 | 9 | 7 |
| Peru | 12 | 7 | 5 | 11 | 7 |
| Poland | 12 | 10 | 5 | 7 | 7 |
| Belgium | 11 | 8 | 4 | 2 | 7 |
| Iceland | 9 | 2 | 2 | 12 | 7 |
| Philippines | 12 | 6 | 6 | 11 | 6 |
| Israel | 9 | 3 | 3 | 5 | 6 |
| Palestine | 8 | 3 | 2 | 0 | 6 |
| Scotland | 11 | 5 | 6 | 6 | 5 |
| Ireland | 9 | 3 | 4 | 4 | 5 |
| Kenya | 9 | 3 | 4 | 1 | 5 |
| Portugal | 8 | 3 | 3 | 4 | 5 |
| Netherlands | 7 | 6 | 2 | 3 | 5 |
| Morocco | 11 | 6 | 7 | 4 | 4 |

### Coverage edges

**Countries MapTap covers that we lack entirely in active:** none, after aligning anchors to our labels. This is a useful result: the next batch should deepen weak countries rather than chase MapTap-only flags.

**Countries with only 1–2 active entries while MapTap has 6+:**

| Country | MapTap total | MapTap `city` | Our active | Comment |
|---|---:|---:|---:|---|
| Chile | 20 | 8 | 2 | The standout gap: large, prominent, and geographically long/diverse. |
| Iceland | 9 | 2 | 2 | Mostly a future-mode gap; MapTap itself has only two `city` entries. |
| Palestine | 8 | 3 | 2 | Modest city gap, larger landmark/religious-site gap. |
| Netherlands | 7 | 6 | 2 | Clear active-city depth gap. |
| Nepal | 6 | 0 | 2 | Not an active-city gap: all six MapTap entries are non-city types. |
| Sweden | 6 | 4 | 2 | Small but real active-city depth gap. |

The count table should not be read as a target ratio. MapTap mixes cities with monuments, islands, parks, regions, and natural features, and it contains near-duplicate representations (for example city/capital variants and bare-name twins). Its US count is therefore a useful discovery source, not a sensible quota.

## 2. Missing big locations

These 40 candidates have no match in either our committed active set or preserved file under the stated rule. They are an editorially selected prominent subset of the 834 unmatched MapTap records, sorted by MapTap `difficultyLevel` (then editorially within a level). “City?” follows MapTap's type literally: only type `city` is marked yes, so monuments, islands, parks, natural wonders, and ancient monuments are no.

| Level | MapTap entry | Country | City? | MapTap type | Difficulty |
|---:|---|---|:---:|---|---|
| 1 | Angel Falls | Venezuela | No | `natural_wonder` | easy |
| 1 | Antofagasta | Chile | Yes | `city` | easy |
| 1 | Arequipa | Peru | Yes | `city` | easy |
| 1 | Babylon | Iraq | No | `ancient_monument` | easy |
| 1 | Banff National Park | Canada | No | `national_park` | easy |
| 1 | Bari | Italy | Yes | `city` | easy |
| 1 | Bologna | Italy | Yes | `city` | easy |
| 1 | Cape Horn | Chile | No | `natural_wonder` | easy |
| 1 | Catania | Italy | Yes | `city` | easy |
| 1 | Corsica | France | No | `island` | easy |
| 1 | Coventry | England | Yes | `city` | easy |
| 1 | Crete | Greece | No | `island` | easy |
| 1 | Durrës | Albania | Yes | `city` | easy |
| 1 | Entebbe | Uganda | Yes | `city` | easy |
| 1 | Goa | India | Yes | `city` | easy |
| 1 | Giant's Causeway | Northern Ireland | No | `natural_wonder` | easy |
| 1 | Guanajuato | Mexico | Yes | `city` | easy |
| 1 | Hanover | Germany | Yes | `city` | easy |
| 1 | Ipoh | Malaysia | Yes | `city` | easy |
| 1 | Leicester | England | Yes | `city` | easy |
| 1 | Limassol | Cyprus | Yes | `city` | easy |
| 1 | Mount Rushmore | United States | No | `monument` | easy |
| 1 | Nantes | France | Yes | `city` | easy |
| 1 | Okinawa | Japan | No | `island` | easy |
| 1 | Palermo | Italy | Yes | `city` | easy |
| 1 | Santos | Brazil | Yes | `city` | easy |
| 1 | Tartu | Estonia | Yes | `city` | easy |
| 1 | Timișoara | Romania | Yes | `city` | easy |
| 1 | Trabzon | Turkey | Yes | `city` | easy |
| 1 | Trieste | Italy | Yes | `city` | easy |
| 1 | Uppsala | Sweden | Yes | `city` | easy |
| 1 | Verona | Italy | Yes | `city` | easy |
| 1 | Yellowstone National Park | United States | No | `national_park` | easy |
| 2 | Aarhus | Denmark | Yes | `city` | easy |
| 2 | Cologne | Germany | Yes | `city` | easy |
| 2 | Guwahati | India | Yes | `city` | easy |
| 2 | Haifa | Israel | Yes | `city` | easy |
| 2 | Mysore | India | Yes | `city` | easy |
| 2 | Pisa | Italy | Yes | `city` | easy |
| 2 | Virunga National Park | DR Congo | No | `national_park` | easy |

These are candidates, not automatic additions. MapTap's “easy” labels are not a clean fame ranking—some obscure records also have level 1—so the selection above applies an editorial prominence filter before sorting by level.

## 3. Next-batch shortlist

### Active city candidates (25)

All of these are MapTap type `city` and therefore eligible for active modes. Flags show where a pick addresses one of the larger or more consequential distribution gaps.

| Candidate | Country | Why now |
|---|---|---|
| Antofagasta | Chile | **Big lightweight gap:** moves a large country beyond only two active cities. |
| Arequipa | Peru | Major second city and strengthens a 5-active country. |
| Bari | Italy | **Big gap:** southern counterweight in a 40-vs-12 country. |
| Bologna | Italy | **Big gap:** major, recognizable northern city. |
| Catania | Italy | **Big gap:** adds Sicily to active city coverage. |
| Coventry | England | **Big gap:** England is 54-vs-9 overall. |
| Durrës | Albania | Important Adriatic port; adds depth beyond the capital. |
| Entebbe | Uganda | Internationally recognizable gateway city. |
| Guanajuato | Mexico | Distinctive, prominent heritage city. |
| Hanover | Germany | Major German city missing from both pools. |
| Ipoh | Malaysia | **Big lightweight gap:** Malaysia has only 3 active against 11 MapTap cities. |
| Leicester | England | **Big gap:** meaningful English city depth. |
| Limassol | Cyprus | Major Cypriot city beyond Nicosia. |
| Nantes | France | **Big gap:** large French regional city. |
| Palermo | Italy | **Big gap:** major island capital and obvious omission. |
| Santos | Brazil | **Big gap:** famous port in a 50-vs-24 country. |
| Tartu | Estonia | Strong second-city choice. |
| Timișoara | Romania | Major regional and cultural center. |
| Trabzon | Turkey | Adds Black Sea coverage. |
| Trieste | Italy | **Big gap:** distinctive border-port city. |
| Uppsala | Sweden | **Lightweight:** Sweden has only 2 active against 4 MapTap cities. |
| Aarhus | Denmark | Clear second-city candidate. |
| Cologne | Germany | One of the most conspicuous large-city omissions. |
| Guwahati | India | **Big lightweight gap:** fills Northeast India. |
| Mysore | India | **Big lightweight gap:** recognizable southern Indian city. |

No candidate would create a country's first active location: there are no MapTap-covered countries at zero active after label alignment. If batch size is tight, prioritize Antofagasta, Ipoh, Guwahati, Mysore, Palermo, Nantes, Cologne, Uppsala, and Arequipa for the best mix of prominence and geographic repair. I did **not** shortlist Goa despite MapTap's `city` type: the record names the state/region rather than a city, so Sean's city-only rule should win over MapTap's taxonomy.

### Preserved-only candidates for future modes (8)

These are explicitly **not** active-city additions because MapTap types them as non-cities.

| Candidate | Country | MapTap type | Rationale |
|---|---|---|---|
| Angel Falls | Venezuela | `natural_wonder` | Globally famous natural feature. |
| Babylon | Iraq | `ancient_monument` | Canonical ancient site. |
| Banff National Park | Canada | `national_park` | Top-tier park candidate. |
| Cape Horn | Chile | `natural_wonder` | Famous geographic landmark; also reflects Chile's overall thinness. |
| Giant's Causeway | Northern Ireland | `natural_wonder` | Iconic and geographically distinctive. |
| Mount Rushmore | United States | `monument` | Extremely recognizable monument. |
| Yellowstone National Park | United States | `national_park` | Canonical future park-mode entry. |
| Virunga National Park | DR Congo | `national_park` | Globally significant African park. |

### Both-missing spot check

An exact normalized-name check found these notable cities in neither enabled MapTap nor either of our two inputs: **Wrocław, Katowice, Cluj-Napoca, Split, Varna, Hai Phong, Port Elizabeth, and Sylhet**. This is only a deliberate handful, not an exhaustive third-party-city audit. It matters because MapTap cannot reveal every omission: Wrocław and Split in particular are conspicuous candidates that should survive into a future independent world-city review.

## 4. Method and caveats

### Inputs and counts

- MapTap: parsed the array in `.build-tmp/maptap-xcheck/master_locations.js` and excluded every row with `disabled: true`: **1,901 active**.
- Ours active: read the committed blob with `git show HEAD:assets/locations.json`, not the modified working-tree file: **754 entries**.
- Ours preserved: read `assets/locations-landmarks-sol.json`: **901 entries**.
- Match result: **845** MapTap rows matched at least one active entry; a further **222** matched only preserved; **1,067 matched either pool** and **834 were unmatched in both**. Counts are MapTap-row counts, not unique-place counts, so separate MapTap city/capital/bare-name variants can each match the same one of our entries.

### Country alignment

For a normal MapTap name, the final comma-separated anchor was treated as the geographic anchor. All 50 US states plus the District of Columbia map to `United States`; `England`, `Scotland`, `Wales`, and `Northern Ireland` stay separate to match our labels. Country aliases were normalized to our vocabulary, including `Ivory Coast` → `Côte d'Ivoire`, `UAE` → `United Arab Emirates`, `DR Congo` variants → `DR Congo`, `Czechia` → `Czech Republic`, `Cape Verde` → `Cabo Verde`, and `Palestinian Territories`/`West Bank` → `Palestine`.

MapTap has exceptions to the stated anchor convention. Canadian provinces were rolled into Canada; Puerto Rico/US Virgin Islands/Guam/Midway into United States; French Guiana/Guadeloupe/French Polynesia into France; Canary Islands into Spain; Sicily into Italy; Hong Kong into China; Greenland into Denmark; and comparable region/territory anchors into the closest label in our taxonomy. A few transboundary or ocean labels required a single-country assignment for counting (for example Niagara Falls → United States, K2 → Pakistan, Everest → Nepal, and Titanic wreck site → England). These choices make the table usable but are policy choices, not claims that sovereignty or identity is always simple.

There are **58** enabled MapTap rows without a comma, including the 50 bare-name experiment twins. Bare rows inherited country from a same-coordinate labeled MapTap record where available, then from an entry in either of our pools within 15 km. The three still unresolved by those steps were assigned manually by location: Bab-el-Mandeb Strait → Yemen, Bouvet Island → Norway, and Tsushima Strait → Japan. No MapTap row remained countryless.

### Matching

For each MapTap row, I removed its final anchor to obtain the place name and normalized Unicode accents, case, punctuation, ampersands, and whitespace. Our comparison names were each entry's normalized `short` plus the place portion (before the first comma) of `clue`. A match required the same aligned country and either:

1. an exact normalized place-name match; or
2. a haversine distance of **15 km or less**.

The active and preserved pools were tested separately. Section 2 contains only MapTap rows matching neither.

### Caveats

- MapTap is not a city-only benchmark. Its enabled pool includes capitals, venues/monuments, historical events or battle sites, islands, parks, regions, religious sites, and natural features. Raw total gaps therefore exaggerate active-city gaps; the `MapTap city` column is the cleaner comparison.
- MapTap contains intentional bare-name twins and other near-duplicates. Distribution counts faithfully count records, while match counts may have several MapTap rows converge on one of ours.
- Exact normalized names do not resolve synonyms or renamed places (`Mysore`/`Mysuru`-style cases) unless coordinates also fall within 15 km. Conversely, a 15 km radius can merge neighboring municipalities or a landmark with its host city. Country equality prevents cross-border proximity matches but can also miss politically or taxonomically disputed cases.
- Difficulty is MapTap's own 1–8 field. Its low levels are noisy as a fame signal, so the missing-big list uses editorial prominence within the unmatched set and only then orders by level.
- This is a point-in-time comparison against committed active data and the preserved Sol file. It intentionally ignores the working-tree regions rework.
