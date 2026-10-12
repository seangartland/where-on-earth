# Difficulty v2: implementation report

Date: 2026-10-12. Done by Muse (Opus 5.5) directly, no delegation, per Sean's instruction.
Framework: `map-game/docs/difficulty-framework-v2.md` (approved by Sean in full, including the 75-country K list and the larger 9–10 pool).
Code and data: `scripts/difficulty/v2-data/`, mainly `resolve.py` (titles and pageviews), `score_v2.py` (production scorer, `--apply` writes `locations.json`), `hand-titles.json`, `resolved-v2.json`, `rated-v2-final.json`. Not committed (large or re-fetchable): GeoNames `cities15000.txt`/`.zip` (download.geonames.org/export/dump/), the HTTP answer cache `resolved-cache.json`, `__pycache__/`.

## Summary

- 746 locations re-rated (748 − Tristan da Cunha − Lincoln). Every entry got a new `difficulty` and a v2-format `difficultyWhy`; 540 levels changed.
- The cut points are the framework's frozen values (`3.7, 6.4, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7`), not re-cut. Recalibrating on the final 746 would have given almost the same cuts (`3.7, 6.4, 9.3, 14.6, 24.2, 44.6, 78.1, 112.5, 179.8`); the framework's rule is "re-cut never", so they stay as published.
- **Portland: 1** (was 9). Expected loss 3.2 points. See §4.
- Levels 9–10 now hold **94** cities (was 11).

## 1. Data fixes (before the re-rate)

| Fix | Change |
|---|---|
| `tristan-da-cunha`, `lincoln` | Removed from `locations.json`. Both full entries, byte-identical to HEAD, appended to `locations-landmarks-sol.json` (892 → 894). `assets/daily/` untouched. |
| `suzhou-cn` pin | 33.63611, 116.97889 (Suzhou, Anhui) → **31.30408, 120.59538** (Suzhou, Jiangsu city centre, GeoNames 1886760). |
| `bristol` clue | "Bristol, Wales" → "Bristol, England" (no flag, per the UK constituent-country rule). |
| `portland-oregon-usa` | → "Portland, Oregon, United States 🇺🇸" (pin 45.52, −122.68 = Oregon) |
| `columbus` | → "Columbus, Ohio, United States 🇺🇸" (pin 39.96, −83.00 = Columbus, OH; GeoNames match to 5 decimals) |
| `roswell-ufo-incident` | → "Roswell, New Mexico, United States 🇺🇸" (pin 33.39, −104.52 = Roswell, NM) |
| `jacksonville` | → "Jacksonville, Florida, United States 🇺🇸" (pin 30.33, −81.66 = Jacksonville, FL) |

Style note: the four new state clues use Sean's specified format "City, State, United States 🇺🇸". The older state clues (Tampa, Tucson, Albuquerque, Anchorage) use "City, State 🇺🇸". I didn't change those because they weren't in scope; Sean can decide whether to unify them.

**Side effect to know about:** Tristan da Cunha was the only entry with `country: "United Kingdom"`, so the dataset now has 202 countries instead of 203. England (9), Scotland (6), Wales (1) and Northern Ireland (1) are still present. The Countries tab builds its rows from the data, so the "United Kingdom" row disappears. Players who already visited Tristan keep a passport id that no longer resolves. This comes directly from the approved removal; I've flagged it, not worked around it.

## 2. Distribution, before → after

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Before (HEAD, 748) | 27 | 34 | 134 | 112 | 158 | 124 | 110 | 38 | 9 | 2 |
| Before (same 746) | 27 | 34 | 134 | 112 | 158 | 124 | 110 | 36 | 9 | 2 |
| **After (v2, 746)** | **36** | **61** | **86** | **96** | **102** | **102** | **94** | **75** | **61** | **33** |
| Framework target % → count | 37 | 60 | 82 | 97 | 104 | 104 | 90 | 75 | 60 | 37 |

- Daily band pools (1–2 / 3–4 / 5–6 / 7–8 / 9–10): 61 / 246 / 282 / 146 / 11 → **97 / 182 / 204 / 169 / 94**. Round 5 goes from an 11-day cycle to a 94-day cycle.
- Rarity frames (common 1–3 / uncommon 4–6 / rare 7–8 / legendary 9–10): 195 / 394 / 146 / 11 → **183 / 300 / 169 / 94**. Legendary frames grow roughly 8.5×; this is visible in the UI, as the framework noted.
- Level moves: 206 unchanged, 493 within ±1, 114 moved by 3 or more (92 up, 22 down; full histogram: −8:1, −4:6, −3:15, −2:34, −1:118, 0:206, +1:169, +2:105, +3:67, +4:22, +5:2, +6:1).

## 3. Pilot gate (run before scaling)

Rated the framework's pilot 30 first. Tristan da Cunha is removed, so 29 were rated.

- **Worked examples (§4 of the framework):** all 17 surviving examples reproduce the framework value exactly, except the two moves the data fixes predict:
  - Portland: 3 → 1, because the clue now names Oregon (framework §5 option b said "~1–2").
  - Suzhou: 5 → 7, because the pin moved to Jiangsu (dFb 283 → 609 km, nearest 1M city 35 km).
- **Pilot 30 vs the framework's intended levels:** 28/29 within ±1 (all 28 of those exact), none off by ≥3. Pass (gate is ≥24/30 within ±1, none ≥3). The single miss is Portland (Δ−2), explained above.
- Then I scaled to all 746 with no parameter changes.

## 4. Portland

`p.99·fb68·K0·iso884 → 3.2 → 1`

- 2,569 views/day ("Portland, Oregon", correct article), so p = 0.99.
- The clue now names Oregon, whose population centre is 68 km from Portland, so a non-knower's tap is close too.
- Expected loss is 3.2 points, under the first cut (3.7): **level 1**.
- For comparison: 3 with the old "United States" clue; 9 under v1 (which measured "Portland Building", 49 views/day).

## 5. Waikiki / Pelourinho overrides

Rule: a district whose clue names only the district takes its **parent city's measured fame** (en.wikipedia views of the parent article, same 12-month window). It applies when the district is the parent's signature quarter, so the player who knows the parent knows where the district is. Geography (dFb, d1M) stays the district's own pin. It is implemented as an explicit two-entry list (`FAME_VIA` in `score_v2.py`), marked `(via …)` in the why-string. Nothing else in the dataset is overridden.

| id | own article (views/day) | parent article (views/day) | level with own fame | **applied** | was |
|---|---|---|---|---|---|
| `waikiki` | Waikīkī (195.4) | Honolulu (1,746.9) | 10 (loss 503.7) | **8** (`p.91(via Honolulu)·fb6356·K0·iso4119 → 81.3`) | 7 |
| `salvador-pelourinho` | Historic Center of Salvador (20.5) | Salvador, Bahia (585.1) | 10 (loss 201.7, exactly on the 9/10 cut) | **7** (`p.66(via Salvador)·fb936·K0·iso476 → 72.6`) | 10 |

Reasoning:

- **Waikiki is the strong case.** The name is near-synonymous with Honolulu/Hawaii, and its own article's 195/day badly understates how many players can place it. It now rates the same as Honolulu.
- **Pelourinho is the weaker case**, and I'm flagging it honestly. The clue doesn't mention Salvador, and the name Pelourinho is much less widely known than Salvador. Full inheritance rates it as easy as Salvador itself (7), which probably flatters it a little. Own-fame (10) measures the wrong thing, though: the "Pelourinho" title redirects into a low-traffic heritage article because readers go to "Salvador, Bahia". I applied the same rule to both for consistency, as Sean's brief suggested. If Sean wants it harder, the principled alternative is to drop it from `FAME_VIA` (→ 10). A per-city split isn't principled.
- **Not overridden:** other parent-city districts named in the framework §7.8 (Coyoacán 275/day → measured as is; Champs-Élysées 805/day; Murano, Giza). Sean only asked about these two.

## 6. The 20 biggest movers

Ties at the boundary are broken by expected loss. The full list of +4 and −3 movers is in `rated-v2-final.json`.

### Up

| City | old → new | Why |
|---|---|---|
| Victoria, Seychelles | 3 → 9 | Never measured by v1. K1 (Seychelles can't be placed borders-free) and 1,345 km from any 1M city. |
| Bridgetown, Barbados | 3 → 8 | Never measured by v1. K1 Caribbean microstate, 842 km from a 1M city. |
| Port Louis, Mauritius | 3 → 8 | Never measured by v1. K1, 1,053 km of open ocean around it. |
| Baku, Azerbaijan | 2 → 6 | Well known (p .88), but Azerbaijan is K1: a non-knower can't find it in the Caucasus. |
| Doha, Qatar | 2 → 6 | K1 Gulf state. A non-knower's tap lands region-scale off. |
| Yerevan, Armenia | 2 → 6 | K1 Caucasus. v1 gave small countries a free pass (A0). |
| Monrovia, Liberia | 3 → 7 | K1 West Africa. |
| Kuwait City, Kuwait | 3 → 7 | Never measured by v1. K1 Gulf state. |
| Kigali, Rwanda | 3 → 7 | K1 East-Central Africa. |
| Manama, Bahrain | 3 → 7 | Never measured by v1. K1 Gulf island state. |
| Bandar Seri Begawan, Brunei | 4 → 8 | Never measured by v1. K1, moderate fame (p .57). |
| Honolulu, United States | 4 → 8 | "United States" sends a non-knower to Missouri, 6,357 km away. |
| Bujumbura, Burundi | 4 → 8 | K1, moderate fame (p .50). |
| Lomé, Togo | 4 → 8 | K1, moderate fame (p .47). |
| St. George's, Grenada | 4 → 8 | Never measured by v1. K1, low fame (p .42). |
| Beverly Hills, United States | 4 → 8 | v1 lent it LA's rating (neighbor rule). A non-knower taps Missouri, 2,279 km off. |
| Vladivostok, Russia | 5 → 9 | 5,632 km from where Russia's people live. |
| Khiva, Uzbekistan | 5 → 9 | K1 and low fame (p .46); 683 km from Uzbekistan's population centre. |
| Suva, Fiji | 5 → 9 | K1 Pacific, 2,111 km from any 1M city. |
| Khabarovsk, Russia | 6 → 10 | 5,392 km from Russia's population centre. |

Also +4 (tied): Apia, Funafuti, Nuku'alofa, Palikir, Tarawa (K2 Pacific, all now 10).

### Down

| City | old → new | Why |
|---|---|---|
| Portland, Oregon | 9 → 1 | v1 measured "Portland Building" (49/day); real article 2,569/day. The clue now names Oregon. |
| San Luis Potosí, Mexico | 9 → 5 | v1 measured a university article (12/day); the city gets 136/day, and it's 71 km from Mexico's population centre. |
| Denpasar, Bali | 8 → 4 | The clue names Bali, so the fallback is Bali (17 km), not Indonesia. |
| Valparaíso, Chile | 8 → 4 | v1's per-country width penalised Chile's length; Valparaíso is 88 km from where Chileans live. |
| Nagpur, India | 8 → 4 | v1 measured "Nagpur Lok Sabha constituency" (116/day); the city gets 631/day, near India's centre. |
| St. John's, Newfoundland | 7 → 3 | The clue names Newfoundland: 44 km fallback, not Canada-wide. |
| Albuquerque, New Mexico | 6 → 2 | Famous (2,120/day) and the clue names the state. v1 charged full US width. |
| Pelourinho, Brazil | 10 → 7 | District override (§5). |
| Santiago de Querétaro, Mexico | 8 → 5 | Close to Mexico's population centre (121 km). v1 charged full Mexico width. |
| Kochi, Kerala | 7 → 4 | The clue names Kerala: 41 km fallback. |
| Longyearbyen, Svalbard | 6 → 3 | The clue names Svalbard. Svalbard is itself the unit, so the fallback is the town. |
| Rosario, Argentina | 6 → 3 | 60 km from Argentina's population centre. |
| San Juan, Puerto Rico | 6 → 3 | The clue names Puerto Rico: 20 km fallback. |
| Tampa, Florida | 6 → 3 | The clue names Florida: 114 km fallback. |
| Tucson, Arizona | 6 → 3 | The clue names Arizona: 151 km fallback. |
| Austin, United States | 5 → 2 | 2,456/day: near-universally known, so the 1,023 km fallback rarely matters. |
| Anchorage, Alaska | 5 → 2 | The clue names Alaska, and Anchorage is Alaska's population centre. |
| Columbus, Ohio | 5 → 2 | Famous (1,877/day), and the clue now names Ohio. |
| Nuuk, Greenland | 5 → 2 | The clue names Greenland. v1 measured from Denmark. |
| Hong Kong | 4 → 1 | 8,220/day. v1 charged China's width plus a clue penalty. |

Also −3 (tied): Macau, Petra (v1 measured the Al-Khazneh tomb article, 336/day; "Petra" gets 2,542/day).

## 7. Inputs actually used: measured vs judged

| Input | Type | What was actually done |
|---|---|---|
| Fame (views/day) | **MEASURED** | `resolve.py`: Wikimedia REST pageviews, en.wikipedia, user agent, monthly 2025-10 → 2026-09, ÷365. **Re-measured for all 746 entries** (not reused from the v1 cache). |
| Article resolution | MEASURED + guarded | Candidate title from hand list > v2 analysis title > v1 title. Every title is then checked: not missing, not disambiguation (redirects followed); Wikidata P31/P279* must reach human settlement (Q486972) or municipality (Q15284); not a country article (except city-states); article coords within 25 km of the pin; GeoNames pop ≥500k with <200 views/day flagged. |
| Hand-mapped titles | JUDGMENT (listed) | 23 total. 16 carried from the framework analysis (Portland, Nagpur, Odesa, Ibiza, Suzhou, San Luis Potosí, Shigatse, Caxias do Sul, Pointe-Noire, Alberobello, Chihuahua City, Matera, Taiz, Doun Kaev, Djibouti City, City of San Marino). **7 new wrong-article catches this run:** Enugu (was "Enugu State"), Niigata (was "Niigata Prefecture"), Ōita (was "Ōita Prefecture"), Oaxaca (was the state), Puebla (was the state), Petra (was the Al-Khazneh tomb), Lo Manthang. |
| Guard flags reviewed by hand | JUDGMENT | 33 non-settlement or no-coordinate flags were reviewed and accepted. These are places the clue itself names as a non-city (islands: Capri, Skye, Santorini, Mykonos, Ibiza, Heimaey, Ko Pha-ngan, Phi Phi, Skellig Michael; Loch Ness, Meteora, Stari Most, Trolltunga, Vagator Beach, Champs-Élysées, Coyoacán, Kharkhorin, Phuket province = the island; Brussels = the Brussels article, a region in Wikidata; Kaohsiung). The rest are correct city articles that lack primary coordinates in the API. 56 big-city/low-views flags (Arusha, Kaduna, Mbuji-Mayi, Yichang…) were checked: correct city articles, just genuinely low English-Wikipedia traffic. They stay as measured. |
| Fallback distance dFb | **MEASURED** | GeoNames cities15000 population-weighted centre of the clue's unit (country, or the named state/territory for 20 clue-unit entries, including the 4 new state clues). Recomputed with the moved Suzhou pin. **Bug fixed:** Palau's only GeoNames city has population 0, which put its centre at 0°,0° (dFb 14,916 km). It now uses equal weights; Ngerulmud 10 → 9. The analysis copy had the same bug. |
| Isolation d1M | **MEASURED** | GeoNames: km to the nearest other city ≥1M people. |
| Scoring curve | **MEASURED** | `distanceScore` from `src/main.js`. |
| K (country locatability) | **JUDGMENT, Sean-approved** | `k-proposed.json` unchanged: 74 country entries plus per-id units (Papeete K2, Nouméa K1; Tristan's entry is moot after removal). The framework rounded this as "75 countries". |
| p anchors (30 / 2,500), known-tap 20–100 km, floors 100 / 800 km | ESTIMATE (framework defaults, unchanged) | The pilot agreed, so no parameter changed. |
| District fame override | JUDGMENT | Two entries (§5). |
| Cut points | DERIVED, frozen | Framework values, not re-cut. |

## 8. Verification

- `locations.json` is valid JSON, exactly 746 entries, 746 unique IDs, same order and key order as HEAD, and the same compact formatting.
- Field diff against git HEAD, per entry:
  - `difficulty` changed on 540, `difficultyWhy` on 746
  - `clue` on 5 (bristol + 4 state clues)
  - `lat`/`lng` on 1 (suzhou-cn)
  - **no other field changed**
- Countries: 203 → 202. Only "United Kingdom" left, with Tristan (§1).
- `locations-landmarks-sol.json`: the first 892 entries are unchanged, and the 2 appended entries are identical to their HEAD versions.

## 9. Left for Sean (flagged, not changed)

- Clue typos seen in passing: "Olympia, Greece, Greece 🇬🇷", "Alofi, Niue, Niue".
- State-clue format is now mixed (§1).
- The UK row disappears from the Countries tab (§1).
- Pelourinho override direction (§5).
