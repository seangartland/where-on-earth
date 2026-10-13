# Regions Step A pilot report

Status: **pilot complete; review artifact is ready for review.** No game file and no `assets/locations.json` data was changed.

## Result

The pipeline accounts for all 754 locations exactly once. At the approved 200 km gate, 59 countries apply. The proposed inventory is 333 locations gaining clue information, 20 already-region clues, 126 same-name omissions, 4 unmatched locations, 10 separately treated territory-unit clues, and 261 non-applicable locations. The resulting text proposal changes 337 strings: 333 information additions plus the four approved normalizations.

The plan's stated 125 same-name / 334 re-score counts contain a reproducible flaw. `VN.79` is stored as `Ho Chi Minh City (HCMC)`. The dry run treated that suffix as making the region different from the city, while the same plan requires removing the parenthetical suffix for display. Once displayed as `Ho Chi Minh City`, the approved same-name rule correctly suppresses `Ho Chi Minh City, Ho Chi Minh City, Vietnam`. The honest totals are therefore 126 and 333. No substitute entry was added merely to preserve the estimate.

All 333 re-scores are complete. The orchestrator fetched the missing Wikimedia API series for the English articles Balearic Islands (Ibiza and Palma de Mallorca), Ladakh (Leh), and Metro Manila (Manila and Quezon City); the raw responses are retained under `scripts/regions-analysis/pageviews/`. Each contains 12 monthly all-access/user observations from October 2025 through September 2026. Following the existing v2 cache convention, the scorer sums those monthly views, divides by 365, and rounds to one decimal view per day. This produces 1,044.1 views/day for Balearic Islands, 1,658.1 for Ladakh, and 977.5 for Metro Manila.

## Assignment and exception audit

Natural Earth Admin-1 geometry placed 716/754 pins (95.0%) inside a polygon belonging to their game country. The other 38 use the nearest own-unit boundary. Of those, 25 are at most 1 km offshore, nine are between 1 and 2 km (Banjul, Florianópolis, Quebec City, Tiksi, Mombasa, Cairns, Nuku'alofa, Guayaquil, Tromsø), and four require explicit review: Tarawa 4.02 km, Capri 8.27 km, Skellig Michael 13.29 km, and Koh Phi Phi 26.40 km. Vatican City lies in Italy's Admin-1 geometry but is correctly rejected as foreign to its game unit.

The four unmatched applicable locations are Iqaluit (Nunavut), Pevek (Chukotka), Nouakchott, and Hargeysa. Iqaluit and Pevek have trustworthy polygon identities but no GeoNames `cities15000` population centre in the current crosswalk, so the approved rule holds them rather than using a polygon centroid. Nouakchott's GeoNames city has a blank Admin-1 code while the current city is divided among three capital regions. Hargeysa is held by the explicit Somaliland override: the country build treats the answer as Somalia, while Natural Earth returns a Somaliland map unit, so the pilot does not silently convert a sovereignty decision into an Admin-1 label.

The other political overrides are explicit in the changes file. Jerusalem remains the existing Israel-unit clue because Israel is below the applicability gate. There are no current Crimea/Sevastopol or Western Sahara locations; their override entries record the country-build worldview and a zero-location match rather than pretending an override was exercised.

The 126 same-name omissions include Tokyo/Tokyo, Algiers/Algiers, Berlin/Berlin, Buenos Aires/Buenos Aires, and—after reviewed display cleanup—Ho Chi Minh City/Ho Chi Minh City. Their region identity and GeoNames population centre remain in the proposal, but their clue text stays unchanged. US proper names such as Oklahoma City/Oklahoma are not treated as tautologies.

## Threshold sensitivity

| Threshold | Countries applicable | Clues changed | Entries to re-score |
|---:|---:|---:|---:|
| 150 km | 80 | 367 | 367 |
| 200 km | 59 | 333 | 333 |
| 250 km | 52 | 309 | 309 |
| 300 km | 35 | 274 | 274 |

These counts apply the corrected Ho Chi Minh City same-name decision at every threshold.

## Changed clues by country

| Country | Count | Country | Count | Country | Count |
|---|---:|---|---:|---|---:|
| Afghanistan | 1 | Argentina | 5 | Australia | 11 |
| Bolivia | 2 | Brazil | 22 | Cameroon | 2 |
| Canada | 19 | China | 30 | Colombia | 8 |
| DR Congo | 5 | Ethiopia | 1 | France | 12 |
| Germany | 12 | India | 27 | Indonesia | 10 |
| Iran | 5 | Iraq | 2 | Italy | 12 |
| Japan | 8 | Kazakhstan | 1 | Libya | 2 |
| Madagascar | 1 | Malaysia | 2 | Mexico | 14 |
| Mongolia | 1 | Mozambique | 1 | Myanmar | 1 |
| Namibia | 1 | New Zealand | 1 | Nigeria | 6 |
| Norway | 5 | Pakistan | 6 | Papua New Guinea | 1 |
| Peru | 3 | Philippines | 5 | Russia | 9 |
| Saudi Arabia | 3 | Somalia | 1 | South Africa | 5 |
| South Sudan | 1 | Spain | 8 | Sudan | 2 |
| Sweden | 1 | Tanzania | 1 | Turkey | 3 |
| Turkmenistan | 1 | Ukraine | 2 | United States | 46 |
| Uzbekistan | 2 | Venezuela | 4 | Vietnam | 2 |
| Zambia | 1 |  |  |  |  |

The table totals 337 because it includes the four non-informative clue normalizations. Somalia's one changed clue is Mogadishu; Hargeysa remains held.

## Difficulty dry run

The existing v2 baseline reproduces 754/754 records with the frozen boundaries. Across all 333 re-scores, the final level delta distribution is: 103 unchanged, 121 down one, 61 down two, 32 down three, 13 down four, one down five, and two down six. No re-score becomes harder; no other location changes level. The five completed re-scores are Ibiza 5→3, Palma de Mallorca 6→4, Leh 9→5, Manila 3→2, and Quezon City 5→4. Portland and all other already-region records remain outside the re-score scope.

## What looks wrong

Besides the Ho Chi Minh City count bug, the assignment source is not sufficient to satisfy the plan's own “every assigned region has a population centre” gate for Nunavut and Chukotka. Both are valid Admin-1 identities, but `cities15000` provides no qualifying centre for Nunavut and the current polygon crosswalk fails to reach Chukotka's single qualifying city. The production pipeline should use a documented broader GeoNames population extract for these sparse regions, then re-run the review; it should not use polygon centroids or the pin itself.

The four long coastal fallbacks are also not mechanically safe. Their proposed assignments should remain review flags even though only Capri is in the 200 km applicable set. Koh Phi Phi's 26.40 km snap is especially large and should be an explicit island override if retained.

## Verification

`validate_step_a.py` passes with 754/754 source records reconciled, zero missing pageview inputs, mutually exclusive status reconciliation, no out-of-scope region assignments, exact re-score scoping, no literal city/region duplication in display text, and protection of Portland-class already-region entries. `assets/locations.json` and game/runtime files are untouched.
