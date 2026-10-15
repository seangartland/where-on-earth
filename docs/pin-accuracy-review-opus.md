# Pin coordinate accuracy review (Opus, 2026-10-15)

Review only. No code, data or deploy changes. Every number below is tagged **[measured]** (computed by a script in `shots/pin-audit/` against the shipped code, the repo, or a cached API answer) or **[estimate]** / **[judged]** (a model assumption or Opus's reading of reverse-geocode text and known geography). Reviewer: Claude Opus 5.5 via claude-run, resuming a run killed by a VM restart (see Method notes at the end).

## Bottom line

The dataset is about as accurate as the reference sources agree with each other: the median stored pin sits 0.78 km from Wikidata, and Wikidata and GeoNames themselves disagree by a median 0.74 km [measured]. At that scale a 1 to 2 km "error" costs zero points and only matters at the edge of the 5 km Pinpoint ring. The real problem is a tail: **24 entries (3%) are judged far enough off the obvious centre that a player who taps the right spot with perfect knowledge still misses Pinpoint**, including Dubai (21 km, on a motorway in Dubailand), Kinshasa (14 km), Bogotá (11 km), Ho Chi Minh City (9.5 km), Xi'an (9 km), Tokyo (Suginami, 10.6 km from Tokyo Station) and Singapore (a nature-reserve trail). The pipeline's only coordinate check flags offsets over 50 km, ten times the Pinpoint radius, so it cannot catch any of these.

## 1. Scoring sensitivity (from the shipped code)

Verified in code [measured]: `src/game/scoring.js` `distanceScore(km) = 1000 * Math.exp(-((km / 3500) ** 1.13))`, base rounded with `Math.round`, then multiplied by `WEIGHTS = [1, 1, 2, 3, 3]` (`src/core/config.js:34`, daily maximum 10,000). Tiers (`config.js:41-49`): Pinpoint `km < 5`, Bullseye `km < 25`, postcard ("near") `km < 150`, all strict. Distance is great-circle haversine with R = 6371.0088 km (`src/core/math.js:10-16`).

`shots/pin-audit/sensitivity.mjs` imports the shipped modules and was re-run for this report [measured]:

| stored error (km) | raw score | rounded base | points lost, round 1-2 (x1) | points lost, round 4-5 (x3) | tier at that distance |
|---|---|---|---|---|---|
| 0.5 | 999.955 | 1000 | 0 | 0 | Pinpoint |
| 1 | 999.901 | 1000 | 0 | 0 | Pinpoint |
| 2 | 999.784 | 1000 | 0 | 0 | Pinpoint |
| 3 | 999.658 | 1000 | 0 | 0 | Pinpoint |
| 4.99 | 999.392 | 999 | 1 | 3 | Pinpoint |
| 5 | 999.391 | 999 | 1 | 3 | Bullseye (Pinpoint lost) |
| 10 | 998.667 | 999 | 1 | 3 | Bullseye |
| 25 | 996.250 | 996 | 4 | 12 | Near / postcard (Bullseye lost) |

Rounding thresholds [measured]: the base score stays 1000 up to 4.197 km, drops to 999 beyond that, to 998 beyond 11.10 km, 997 beyond 17.45 km. So a perfect 10,000 day actually requires every guess under 4.2 km, slightly tighter than Pinpoint.

**Where the 1-2 km concern holds and where it does not:**

- **Points: it does not hold.** A 2 km stored error can cost at most 1 base point, and only when the player's tap is already 2.2 to 4.2 km away. Worst case 3 weighted points out of 10,000 [measured].
- **Bullseye (25 km): it does not hold.** A 1-2 km shift is 4 to 8% of the ring.
- **Pinpoint (5 km): it holds partially.** A stored error of e km shrinks the player's usable Pinpoint ring around the true centre to 5 - e km in the direction of the error. Modelled share of taps that still earn Pinpoint, taps uniform within radius r of the true centre (`window.py`, [estimate], the tap model is assumed, not measured from player data):

  | player tap spread r | e = 0 | e = 1 km | e = 2 km | e = 3 km | e = 5 km |
  |---|---|---|---|---|---|
  | 2 km (careful, knows the city) | 100% | 100% | 100% | 100% | 46% |
  | 3 km | 100% | 100% | 100% | 85% | 44% |
  | 5 km (good, not exact) | 100% | 87% | 75% | 62% | 39% |

  So 1-2 km costs a good-but-imprecise player roughly 13 to 25% of their Pinpoints on that city, and costs a precise player nothing. From 5 km up, even a perfect tap is not Pinpoint.
- **Reference noise: it cannot be fixed below about 1-2 km anyway.** Independent sources disagree on where "the centre" of a city is by more than 1 km for 31 to 41% of entries (Section 3). A 1-2 km error is not reliably definable.
- Tap precision context: the player's zoom floor gives about 0.17 km per CSS pixel on a 390 px phone (comment at `config.js:9-10`, not re-measured), so finger placement at full zoom is sub-kilometre [estimate]; the player's knowledge of where a city's core is will usually be the larger error.

## 2. Provenance: how the 805 coordinates were made, and what they claim to mark

Evidence: `shots/pin-audit/lineage.json` (first commit and every coordinate change per id, from `git log` of `assets/locations.json`), `provenance.py` (exact-match test against GeoNames cities1000), the locations skill, and the batch logs [measured unless stated].

| lineage (first commit introducing the id) | entries | stored point equals a GeoNames row (<10 m) | median offset to Wikidata |
|---|---|---|---|
| A `010da11` 2026-10-04 initial 1000 | 223 | 17 | 0.67 km |
| B `8b966c8` 2026-10-04 1000 to 1500 | 238 | 238 | 1.05 km |
| C `870ebf0` 2026-10-04 1500 to 2000 | 162 | 125 | 0.79 km |
| D later batches 2026-10-04 to 2026-10-13 | 182 | 79 | 0.55 km |

- Across all 805: 421 stored points equal a GeoNames cities1000 row to every decimal, 32 more equal it at 4 decimals, and 47 more are within 100 m [measured]. About 56% of pins are GeoNames points; 62% are within 100 m of one.
- Batch B and most of C are GeoNames rows. This is an inference from the 238/238 and 125/162 exact matches; the commit messages do not say so. Batch D's later additions record it explicitly: `.batch2/log.md` says "Coordinates: GeoNames cities15000 rows ... checked by Nominatim" [measured, read].
- Batch A was LLM-written. Only 17 of 223 equal GeoNames, values are mostly 4 decimals, and the skill's generation step asks the model for "POINT locations only, precise coordinates" [measured, read]. Many batch A values are the widely circulated default placemarks for a city name (Tokyo 35.6762, 139.6503; Singapore 1.3521, 103.8198; Kinshasa -4.4419, 15.2663; New York 40.7128, -74.0060; London 51.5074, -0.1278) [judged by recognition; not verified against any map service]. Those defaults are good for some cities (New York, London, Los Angeles, Mexico City) and poor for others (Tokyo, Singapore, Kinshasa).
- `.build-tmp/cities/build-cities.mjs` in the initial commit builds `assets/cities.json` from GeoNames, but that is a separate 10,000-city list, not `locations.json`. The guess globe shows no city labels, so players tap on satellite imagery [measured, grep of `src/`].
- Coordinates almost never change after introduction: 3 entries in total. Suzhou moved 427 km (33.636, 116.979 to 31.304, 120.595, a wrong same-name city fixed 2026-10-12), Barcelona moved 1.4 km, and Fortaleza was rounded [measured, lineage.json].
- **What the stored point claims to represent: nothing is defined.** No field, skill rule or doc says whether the pin is the historic core, CBD, city hall or a centroid. The skill says "precise coordinates" and audits with "Nominatim ... flag if >50 km from the batch coordinates. Manual review, never auto-overwrite" (SKILL.md Step 6). GeoNames' P-feature point is likewise just "the populated place" with no anchor rule. So the pins are a mix of GeoNames' legacy points and LLM-recalled placemarks, audited at a tolerance that is 10 times the Pinpoint radius.

## 3. Measured audit of all 805

References per entry [measured, cached API answers]:
- **Wikidata P625**: the entry's QID comes from the repo's own difficulty resolver (`scripts/difficulty/v2-data/resolved-v2.json` plus `.batch1/.batch2`). 805 of 805 have a QID and a coordinate. Precision caveat: 77 Wikidata points are stored to the arc-minute (about 1.8 km) and 29 have no precision recorded.
- **GeoNames** (cities1000 2026-10-04 plus cities15000 2026-10-12): 654 matched by the item's P1566 GeoNames id, 136 by same-name populated place within 50 km (weaker), 15 unmatched.
- **OSM mapped centre** (Nominatim search on the clue text): used only when the result is a place object or a boundary with a linked place node (`extratags.linked_place`) AND its `wikidata` tag equals the entry's QID. 685 usable. Excluded: 63 boundary centroids, 36 QID mismatches, 17 wrong entities more than 50 km away, 4 no result.
- **Reverse geocode** of every stored point (Nominatim, zoom 18): 805 of 805 answered.

### Offset distribution, stored point vs each reference [measured]

Counts per band, cumulative in brackets.

| comparison | n | < 0.5 km | 0.5-1 | 1-2 | 2-5 | 5-10 | 10-25 | >= 25 |
|---|---|---|---|---|---|---|---|---|
| stored vs Wikidata | 805 | 320 (320) | 137 (457) | 177 (634) | 130 (764) | 32 (796) | 8 (804) | 1 |
| stored vs GeoNames | 790 | 594 (594) | 65 (659) | 83 (742) | 37 (779) | 6 (785) | 5 (790) | 0 |
| stored vs OSM mapped centre | 685 | 254 (254) | 124 (378) | 144 (522) | 121 (643) | 28 (671) | 8 (679) | 6 |
| stored vs nearest independent ref | 805 | see note | | | | | | 24 at >= 5 km, 30 at 3-5 km |

Note: "independent" means Wikidata, the OSM centre, and GeoNames only where the stored point is not a copy of it (offset > 10 m). Stored vs GeoNames looks best because 453 pins were copied from GeoNames; it is not an accuracy measure for those.

Medians [measured]: stored vs Wikidata 0.78 km (p90 3.32, p95 5.04, max 34.1); stored vs GeoNames 0.00 km (p90 1.65).

### Reference-vs-reference noise floor [measured]

| comparison | n | < 0.5 | < 1 | < 2 | < 5 | < 10 | < 25 | >= 25 |
|---|---|---|---|---|---|---|---|---|
| Wikidata vs GeoNames | 790 | 320 | 464 | 636 | 759 | 786 | 789 | 1 |
| Wikidata vs GeoNames, P1566-linked only | 654 | 265 | 379 | 526 | 630 | 652 | 654 | 0 |
| Wikidata vs OSM mapped centre | 678 | 367 | 472 | 584 | 661 | 676 | 678 | 7 |
| GeoNames vs OSM mapped centre | 678 | 253 | 377 | 529 | 640 | 668 | 672 | 6 |

(Cumulative counts.) Wikidata vs GeoNames median 0.74 km. Two reputable sources agree within 1 km on only 59% (WD vs GN) to 70% (WD vs OSM) of these cities, and within 2 km on 80 to 86%. The stored data's distribution against Wikidata (median 0.78 km, 79% within 2 km) is the same shape as the noise floor: below about 2 km you cannot tell a stored error from reference disagreement. References are not ground truth either: OSM's linked place node puts Tianjin, Changsha, Xining, Lanzhou and Kaifeng 26 to 36 km out (prefecture-level nodes) and Moscow 14.5 km south of the Kremlin; Wikidata puts Can Tho 34 km off (a provincial point) and Mexico City 8.8 km south of the Zócalo, where the stored pin correctly sits.

### Match failures [measured]

- Wikidata: none.
- GeoNames, no row (15): hallstatt, heimaey-iceland, isle-of-skye-gb, jericoacoara, koh-phi-phi-th, loch-ness, meteora-greece, oymyakon-russia, persepolis, petra-nabatean-treasury, port-arthur, santorini-gr, skellig-michael-ireland, stari-most, troy. Most are islands, sites or landscapes; note that several are not cities although the skill says the active set is cities only (out of scope here, flagged only).
- OSM search, no result (4): jericoacoara, nanortalik-greenland, petra-nabatean-treasury, qaqortoq-greenland.
- OSM search, wrong entity, more than 50 km from Wikidata (17): chongqing-cn, dalian-cn, dnipro-ua (Dnieper River), dongshi (a Taipei street), karagandy (region), khabarovsk-ru (krai), koh-phi-phi-th (Ko Phi, Trat), mendoza-argentina, rajshahi (division), salta-ar, san-luis-potosi-mx, santo-domingo-de-los-colorados-ec, shigatse-tibet (prefecture), tomsk-ru (oblast), valparaiso-ascensor-artilleria (region), veracruz-mx, zamboanga (a Laoag barangay). These are all reference failures, not pin failures; the entries fall back to Wikidata.
- Reverse geocode: no failures. No stored point lands on an airport, water, farmland or military land; the one keyword hit (juneau-usa, "17th Coast Guard District" office) is a downtown office building, a false positive.

### Worst 30 offenders

Ranked by the smallest offset to any independent reference, so an entry ranks high only when every source disagrees with the stored point (ranking by the largest offset instead surfaces reference errors such as Tianjin and Changsha). Full table with coordinates is in Appendix A. Likely cause per entry [judged]:

| # | id | min indep. offset | likely cause [judged] |
|---|---|---|---|
| 1 | polonnaruwa-sri-lanka | 21.5 km | LLM point (batch A) in Siripura village; ancient city is 22 km north |
| 2 | dubai | 21.4 km | GeoNames legacy point on a motorway in Dubailand ("City of Arabia"), 13.8 km from the Burj Khalifa (point taken by Opus [estimate]) and 21 km from Deira |
| 3 | kinshasa-dr-congo | 13.8 km | LLM default placemark at a school in Kimwenza on the southern outskirts; Gombe is 14 km north |
| 4 | majuro-marshall-islands | 12.8 km | LLM point mid-atoll; capital centre (Delap-Uliga-Djarrit) is 13 km east |
| 5 | bogota-colombia | 11.3 km | widely circulated default point on Calle 127 in the north; historic centre 11 km south |
| 6 | fatehpur-sikri | 10.9 km | LLM point at Undra village; the monument complex is 11 km south |
| 7 | loch-ness | 9.8 km | area feature (a 37 km lake), no single centre |
| 8 | visakhapatnam | 9.7 km | GeoNames point in Old Gajuwaka industrial suburb |
| 9 | busan | 9.6 km | GeoNames point in Jung-gu (Nampo, the old downtown); WD and OSM use City Hall. Defensible, ambiguous |
| 10 | ho-chi-minh-city-vn | 9.5 km | GeoNames point in the northwest (Phan Huy Ich St); District 1 is 9.5 to 11 km away |
| 11 | xian-china | 9.0 km | LLM point north of the walled city (Weiyang District) |
| 12 | surrey-ca | 8.8 km | GeoNames point in southern Surrey; City Centre is 9 km north |
| 13 | san-juan | 8.0 km | point in Río Piedras (university district), not a GeoNames copy; Old San Juan 8 km |
| 14 | palembang-id | 7.7 km | GeoNames point in Sukarami (airport district); Ampera bridge core 8 km |
| 15 | tashkent | 7.4 km | GeoNames point in a southwest mahalla |
| 16 | medina-saudi-arabia | 7.3 km | LLM point 7 km from the Prophet's Mosque |
| 17 | isle-of-skye-gb | 6.3 km | area feature (an island) |
| 18 | ciudad-guayana-ve | 6.2 km | twin-city sprawl (Puerto Ordaz and San Félix); ambiguous |
| 19 | riyadh | 5.5 km | GeoNames point in As Salamah residential; 5 to 6 km from both the old centre and Olaya |
| 20 | astana-kz | 5.3 km | GeoNames point on the old right bank; WD on the new left bank. Ambiguous |
| 21 | brasilia-br | 5.3 km | GeoNames point in Cruzeiro, off the Plano Piloto axis |
| 22 | algiers | 5.2 km | GeoNames point in Kouba, inland from the Casbah and port |
| 23 | jeddah-sa | 5.1 km | GeoNames point in Al-Balad, the historic core. Defensible |
| 24 | chongqing-cn | 5.0 km | GeoNames point on the Yuzhong peninsula, the CBD. Defensible |
| 25 | baku | 5.0 km | GeoNames point in Khatai raion, 5 km east of the Old City |
| 26 | tijuana | 4.9 km | GeoNames point in El Grano residential |
| 27 | hangzhou | 4.9 km | GeoNames point at a university campus north of the centre; West Lake core 5 to 6.5 km |
| 28 | krasnoyarsk-ru | 4.8 km | GeoNames point in Sovetsky district, north of the river centre |
| 29 | mecca-saudi-arabia | 4.8 km | LLM point in Al Naseem; Masjid al-Haram is 4.8 km away, Pinpoint with no margin |
| 30 | banissa | 4.8 km | small town, GeoNames ward point |

Pattern [measured lineage, judged cause]: of the 24 entries at 5 km or more, 14 are GeoNames copies (batches B, C and D), 8 are not GeoNames copies (6 LLM-written batch A points plus Bogotá and San Juan) and 2 are area features. GeoNames' representative point for a large city is often a legacy or suburban point. The LLM failure mode is a confident default placemark.

## 4. Large cities

**Definition [measured]:** population 1M or more by GeoNames or Wikidata P1082 (344 entries), plus a notorious-sprawl list (Opus's choice [judged]: Los Angeles, Houston, Phoenix, Dallas, Atlanta, Las Vegas, Tokyo, Mexico City, São Paulo, Jakarta, Dubai, Brasília, Canberra, Chongqing, Beijing, Shanghai, Moscow, Istanbul, Cairo, Lagos, Delhi, Karachi, Manila, Bangkok, Kinshasa, Shenzhen, Guangzhou, Johannesburg, Riyadh, Buenos Aires, Tehran, Seoul, London, New York, Sydney, Melbourne), adding 3 more. **347 entries.** The per-city table (stored point, what it sits on, distance to Wikidata and to the OSM mapped centre, class) is Appendix B.

**Downtown reference:** Wikidata P625 (usually the infobox point at the historic core or city hall) and the OSM mapped place node (QID-matched). Both are independent of the stored point. When they agree within 3 km (627 of 805 entries [measured]) the centre is well defined. When they disagree, the entry is not forced to one answer; it gets a bound instead.

**Risk classes [measured]**, by stored distance to the downtown references, for a perfect-knowledge player who taps the reference point exactly:

| class | rule | all 805 | large cities (347) |
|---|---|---|---|
| A | 5 km or more from every centre reference: misses Pinpoint even with a perfect tap | 29 | 19 |
| B | 5 km or more from one reference, under 5 from the other: depends which centre the player picks | 35 | 25 |
| C | 3 to 5 km: Pinpoint with a perfect tap, little margin; beyond 4.2 km the round also drops to 999 | 65 | 37 |
| D | under 3 km from all references: safe | 676 | 266 |

Class A and B mix real pin errors with reference errors, so each of the 64 was read against its reverse geocode [judged]:

**Likely miss for a perfect-knowledge player (24 entries, 3.0% of 805):**
- Class A, confirmed (17): dubai, kinshasa-dr-congo, bogota-colombia, visakhapatnam, ho-chi-minh-city-vn, xian-china, palembang-id, tashkent, medina-saudi-arabia, riyadh, brasilia-br, algiers, polonnaruwa-sri-lanka, majuro-marshall-islands, fatehpur-sikri, surrey-ca, san-juan.
- Seven more: muscat (class A; Al Khuwair; Wikidata and OSM agree on Old Muscat/Mutrah 19 km east; GeoNames shares the stored point, which is why it is not in the independent ranking), tokyo-japan (class B; residential Suginami: 4.0 km from Shinjuku, 10.6 km from Tokyo Station), singapore (class B; MacRitchie nature trail, the island's middle; Marina Bay is 8.9 km away), toronto (class B; midtown St. Paul's, 6 km from the downtown waterfront), baku (class B; 5 km east of the Old City), cartagena (class B; 4.5 to 6.4 km from the walled city), ibiza-es (class A; inland at Can Cantó, 7.5 km from Ibiza town; the clue may also read as the island).
- 17 of these 24 are large cities.

**Ambiguous centre, more than one defensible centre 5 km or more apart (10):** busan, ciudad-guayana-ve, astana-kz, jeddah-sa, chongqing-cn (class A); khartoum, batam-id, manaus-br, ciudad-juarez-mx, hangzhou (class B). A product decision, not a data error. Hong Kong (class C, Mong Kok, 4.3 to 4.7 km from the references) is the most famous thin-margin case.

**Reference error, stored pin is fine (30):** mexico-city-mexico (stored is the Zócalo), kigali-rwanda (stored is the Kiyovu CBD), tarawa-kiribati (Bairiki, GeoNames agrees), moscow-russia (Kitay-gorod beside the Kremlin), can-tho-vn, kansas-city, incheon-kr, tulsa-usa, qingdao-cn, changsha, yazd, lanzhou-cn, haiphong-vn, mykonos-gr, phuket-thailand, funafuti-tuvalu, kaifeng-cn, tianjin-cn, xining-cn, luoyang-cn, bulawayo-zw, apia-samoa, phnom-penh-cambodia, haikou, dhaka, saint-petersburg-russia (3.2 km from Palace Square, class C in practice), bamako and port-moresby (both about 4 to 5 km, class C in practice), and the two area features loch-ness and isle-of-skye-gb.

**Spread alone [measured, proxy]:** for 232 large cities with a QID-matched OSM boundary, the admin area's equal-area radius has a median of 14.2 km (p25 9.9, p75 26.8); 227 exceed 5 km and 61 exceed 25 km. A Pinpoint disk covers a median 12% of the city's admin area. Admin boundaries overstate built-up area (Chinese prefecture cities especially), so treat this as an upper bound. What it means: **spread does not by itself cost a perfect-knowledge player Pinpoint when the pin is downtown.** Los Angeles (Civic Center), New York (City Hall), London (Charing Cross), Houston, Phoenix, Dallas and Atlanta (downtown), São Paulo, Shanghai, Sydney and Melbourne (CBD) all sit within 1.3 km of both references [measured]. Spread costs Pinpoint only for a player who taps a different, equally famous part of the metro (Hollywood instead of downtown Los Angeles is about 10 km [estimate]). That is a difficulty property of big cities, not a data defect, and only a scoring change (fix 5) addresses it.

**Stored points no player would tap [judged from reverse geocode]:** Dubai (a motorway in Dubailand), Kinshasa (a school on the southern outskirts), Singapore (a reservoir nature trail), Tokyo (a residential street in Suginami), Bogotá (Calle 127, far north), Ho Chi Minh City (a primary link road in the northwest), Visakhapatnam (Gajuwaka industrial suburb), Palembang (Sukarami, the airport district), Surrey (a southern neighbourhood), San Juan (Río Piedras), Polonnaruwa and Fatehpur Sikri (neighbouring villages). Airports: none [measured]. Wrong same-name place: none in the current data. The one historical case, Suzhou (a different Suzhou, 427 km off), was fixed on 2026-10-12 [measured, lineage].

## 5. Verdict and ranked fixes

**Verdict.** Sean's instinct is right about the threshold and wrong about the scale. A 1 to 2 km offset is within the disagreement between Wikidata, GeoNames and OpenStreetMap, costs no points, and only trims Pinpoint odds for players already near the 5 km edge. That level of precision is neither achievable nor worth chasing. What does cost players is a tail of 24 pins (3%, 17 of them big cities, including Dubai, Tokyo, Singapore, Bogotá, Kinshasa, Ho Chi Minh City, Xi'an and Riyadh) placed 5 to 21 km from where anyone would tap. On those, a perfect answer is a guaranteed Bullseye, never Pinpoint. They exist because nothing defines what point a pin marks and the only audit tolerates 50 km. Large cities as a class are handled fine when the pin is downtown, which is true for most of them. The failures are bad points, not sprawl.

**Ranked options** (sizes are [estimate]):

1. **Re-anchor the 24 likely-miss pins and rule on the 10 ambiguous ones.** Fixes every case where a perfect answer cannot earn Pinpoint. Method: per entry, take the Wikidata and OSM-centre points where they agree within 2 km, else a human-recorded choice of the historic or commercial core; record the source per entry. Risks: daily pins and the archive store ids only, so line-ups are unaffected [measured]; players' saved past results would not be recomputed (not verified how history is stored); a moved pin must still pass the 25 km proximity rule. Size: small, about 34 entries, one Opus judgement session plus a mechanical edit and a re-run of `analyze4.py`.
2. **Define the anchor and tighten the audit in the locations skill.** Write the anchor rule ("historic or commercial core a well-informed player would tap; never a GeoNames point unchecked") and replace Step 6's 50 km Nominatim flag with a gate that flags any new entry 3 km or more from every independent reference (Wikidata P625 and the QID-matched OSM place node), reusing `analyze4.py`'s logic. Fixes recurrence; batch D still copies GeoNames. Risk: about 7% of entries would flag at 3 km on today's data (54 of 805 [measured]), so it costs some review time per batch. Size: small.
3. **Tighten the 30 entries in the 3 to 5 km band**, top-fame cities first (Tokyo, Jakarta, Hong Kong, Mecca, Chicago, Taipei, Caracas, Baghdad). Fixes thin-margin Pinpoints and the 999-point rounding. Risk: low. Size: small to medium. Marginal benefit.
4. **Re-anchor all 805 to one source.** Not recommended. Every source has 14 to 36 km failures (OSM Tianjin, Changsha, Moscow; Wikidata Can Tho, Mexico City), it would move hundreds of pins by 1 to 2 km with zero score effect, and it creates churn and new errors. Size: large.
5. **Size-aware Pinpoint** (Pinpoint inside the city's boundary, or within max(5 km, k times city radius)). The only fix for sprawl and ambiguous centres (Tokyo, Muscat, Ciudad Guayana), but it changes tier semantics and passport comparability and needs boundary data shipped to the client. A game-design decision for Sean, not a data fix. Size: large.

**Recommendation: do 1 and 2 together.** Option 1 removes every measured Pinpoint-breaking pin; option 2 stops new ones from shipping. Together they are a small, bounded change. Do not chase 1 to 2 km precision.

## Method notes and audit of the banked artifacts

- Resumed run. Banked artifacts audited before reuse [measured]: `lineage.json` (805 keys) and `refs.json` / `refs2.json` (805 keys) re-validated, and `analyze1.py` reproduced the same distributions. `sensitivity.mjs` re-run against the shipped modules with identical output. `osm-cache.json` was healthy (1,317 entries, no errors or nulls); `fetch_osm.py` resumed from item 657 and completed 805/805 with zero retries. `api-cache.json` was reused, with no refetch.
- `audit.json` at 425 rows was not corrupt: `analyze2.py` skips entries without cached OSM data. It was re-run to 805 rows with the same method.
- **Methodology corrections (redone, not reused):** (a) `fetch_osm.py`'s docstring assumes Nominatim's point for a boundary is the admin centre; for 63 unlinked boundaries it is the polygon centroid (Dubai's is 12 km out in the desert). `analyze4.py` uses the OSM point only when it is a place object or a linked boundary with a matching QID. (b) `analyze2.py`'s "consensus centre" can pair GeoNames with another source, but GeoNames is the stored point for 453 entries, which makes that consensus circular. `analyze3.py`'s "stored vs consensus" figures are therefore optimistic and are not used in this report. Risk classes use only Wikidata and the OSM centre; the worst-30 ranking adds GeoNames only where it is not the stored point.
- The reverse-geocode "place name mismatch" heuristic in `analyze4.py` (91 hits) was used only as a reading aid, not as a count.
- New scripts this run: `analyze4.py` (downtown references, risk classes, writes `audit4.json`) and `tables.py` (appendix tables). All judged labels in Sections 3 to 5 are Opus readings of reverse-geocode text plus general geography, not measurements.

## Appendix A and B (generated by `shots/pin-audit/tables.py` from `audit4.json`)

Columns: lineage A to D as in Section 2; `d WD`, `d GN`, `d OSM` are stored-point offsets in km [measured]; "sits on" is the Nominatim reverse geocode of the stored point (name / category:type / neighbourhood / place). Large-city class letters are the A to D risk classes of Section 4.

### Worst 30 (ranked by the SMALLEST offset to any independent reference)

| # | id | lineage | stored | Wikidata | GeoNames | OSM centre | d WD | d GN | d OSM | min indep | stored sits on (reverse geocode) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | polonnaruwa-sri-lanka | A | 7.7409, 81.0184 | 7.9333, 81.0000 | 7.9397, 81.0027 |  | 21.49 | 22.17 |  | 21.49 | highway:residential / Siripura |
| 2 | dubai | C | 25.07725, 55.30927 | 25.2697, 55.3094 | 25.0772, 55.3093 |  | 21.40 | 0.00 |  | 21.40 | Sheikh Mohammed Bin Zayed Road / highway:motorway / City of Arabia |
| 3 | kinshasa-dr-congo | A | -4.4419, 15.2663 | -4.3219, 15.3119 | -4.3276, 15.3136 | -4.3197, 15.3424 | 14.27 | 13.75 | 16.00 | 13.75 | C.S Eucalyptus / amenity:school / Matadi Kibala / Kimwenza |
| 4 | majuro-marshall-islands | A | 7.0667, 171.2667 | 7.0918, 171.3802 | 7.0897, 171.3803 | 7.0910, 171.3816 | 12.83 | 12.79 | 12.97 | 12.79 | Lagoon Road / highway:primary / Anenelibw / Majuro |
| 5 | bogota-colombia | D | 4.7111, -74.0722 | 4.6097, -74.0817 | 4.6097, -74.0817 |  | 11.32 | 11.32 |  | 11.32 | Avenida Calle 127 / highway:primary / Campania / Bogota |
| 6 | fatehpur-sikri | A | 27.1909, 77.67 | 27.0911, 77.6611 | 27.0937, 77.6600 |  | 11.13 | 10.85 |  | 10.85 | highway:secondary / Undra |
| 7 | loch-ness | A | 57.324, -4.607 | 57.3000, -4.4500 |  |  | 9.80 |  |  | 9.80 | Marchfield / place:hamlet / Balnain |
| 8 | visakhapatnam | C | 17.68009, 83.20161 | 17.6939, 83.2922 | 17.6801, 83.2016 | 17.6936, 83.2921 | 9.72 | 0.00 | 9.71 | 9.71 | highway:residential / Turakalapalem / Old Gajuwaka |
| 9 | busan | C | 35.10168, 129.03004 | 35.1800, 129.0750 | 35.1017, 129.0300 | 35.1800, 129.0752 | 9.62 | 0.00 | 9.63 | 9.62 | Junggu-ro 44beon-gil / highway:residential / Sinchang-dong 3(sam)-ga / |
| 10 | ho-chi-minh-city-vn | B | 10.82302, 106.62965 | 10.7756, 106.7019 | 10.8230, 106.6296 | 10.7737, 106.7166 | 9.50 | 0.00 | 10.97 | 9.50 | Phan Huy Ich St. / highway:primary_link / Khu phố 8 / Ho Chi Minh City |
| 11 | xian-china | A | 34.3416, 108.9398 | 34.2611, 108.9422 | 34.2583, 108.9286 | 34.2610, 108.9423 | 8.95 | 9.32 | 8.96 | 8.95 | 西安地铁大厦 / building:yes / Hancheng / Weiyang District |
| 12 | surrey-ca | B | 49.10635, -122.82509 | 49.1833, -122.8500 | 49.1063, -122.8251 | 49.1913, -122.8491 | 8.75 | 0.00 | 9.61 | 8.75 | Provincial Court of British Columbia Surrey / amenity:courthouse / Sul |
| 13 | san-juan | C | 18.406389, -66.063889 | 18.4653, -66.1167 | 18.4663, -66.1057 |  | 8.60 | 7.99 |  | 7.99 | place:house / Urbanización University Gardens / Río Piedras |
| 14 | palembang-id | B | -2.91673, 104.7458 | -2.9833, 104.7644 | -2.9167, 104.7458 | -2.9888, 104.7569 | 7.69 | 0.00 | 8.11 | 7.69 | highway:residential / Sukarami / Palembang |
| 15 | tashkent | C | 41.26465, 69.21627 | 41.3111, 69.2797 | 41.2647, 69.2163 | 41.3123, 69.2787 | 7.40 | 0.00 | 7.44 | 7.40 | building:yes / Gavkhar mahalla / Tashkent |
| 16 | medina-saudi-arabia | A | 24.5247, 39.5692 | 24.4700, 39.6100 | 24.4686, 39.6142 | 24.4712, 39.6111 | 7.35 | 7.72 | 7.31 | 7.31 | highway:unclassified / Az Zahrah / Medina |
| 17 | isle-of-skye-gb | D | 57.3, -6.35 | 57.3500, -6.3000 |  | 57.3630, -6.3023 | 6.32 |  | 7.57 | 6.32 | B8009 / highway:secondary / Carbost |
| 18 | ciudad-guayana-ve | B | 8.35122, -62.64102 | 8.3224, -62.6897 | 8.3512, -62.6410 | 8.3224, -62.6897 | 6.24 | 0.00 | 6.24 | 6.24 | Calle 18 / highway:residential / Municipio Caroní |
| 19 | riyadh | C | 24.68773, 46.72185 | 24.6383, 46.7150 | 24.6877, 46.7219 | 24.6389, 46.7160 | 5.54 | 0.00 | 5.46 | 5.46 | Al Hareth Ibn Al Habbab / highway:residential / As Salamah / Riyadh |
| 20 | astana-kz | B | 51.1801, 71.44598 | 51.1333, 71.4333 | 51.1801, 71.4460 |  | 5.27 | 0.00 |  | 5.27 | Шин Line / shop:tyres / Bayqoñır district / Astana |
| 21 | brasilia-br | B | -15.77972, -47.92972 | -15.7939, -47.8828 | -15.7797, -47.9297 | -15.7940, -47.8828 | 5.26 | 0.00 | 5.27 | 5.26 | S1 / highway:trunk / Cruzeiro Velho / Cruzeiro |
| 22 | algiers | C | 36.73225, 3.08746 | 36.7764, 3.0586 | 36.7323, 3.0875 | 36.7729, 3.0588 | 5.54 | 0.00 | 5.19 | 5.19 | Avenue des Frères Abdeslami / highway:secondary / Jolie Vue / Kouba |
| 23 | jeddah-sa | B | 21.49012, 39.18624 | 21.5292, 39.1611 | 21.4901, 39.1862 | 21.5504, 39.1742 | 5.06 | 0.00 | 6.82 | 5.06 | highway:primary / Al-Balad / Jeddah |
| 24 | chongqing-cn | B | 29.56026, 106.55771 | 29.5500, 106.5069 | 29.5603, 106.5577 |  | 5.04 | 0.00 |  | 5.04 | leisure:pitch / 七星岗街道 / Yuzhong District |
| 25 | baku | C | 40.37767, 49.89201 | 40.3667, 49.8352 | 40.3777, 49.8920 | 40.3756, 49.8328 | 4.97 | 0.00 | 5.02 | 4.97 | 8 November Avenue / highway:trunk / Khatay Raion |
| 26 | tijuana | C | 32.5027, -117.00371 | 32.5364, -117.0372 | 32.5027, -117.0037 | 32.5365, -117.0371 | 4.89 | 0.00 | 4.89 | 4.89 | place:house / El Grano / Tijuana |
| 27 | hangzhou | C | 30.29365, 120.16142 | 30.2500, 120.1675 | 30.2936, 120.1614 | 30.2490, 120.2052 | 4.89 | 0.00 | 6.51 | 4.89 | Zhejiang University of Technology (Zhaohui Campus) / amenity:universit |
| 28 | krasnoyarsk-ru | B | 56.03742, 92.93136 | 56.0089, 92.8719 | 56.0374, 92.9314 | 56.0091, 92.8726 | 4.87 | 0.00 | 4.82 | 4.82 | highway:speed_camera / Советский район / Krasnoyarsk |
| 29 | mecca-saudi-arabia | A | 21.3891, 39.8579 | 21.4225, 39.8261 | 21.4266, 39.8256 | 21.4208, 39.8269 | 4.96 | 5.35 | 4.77 | 4.77 | highway:tertiary / Al Naseem / Makkah Al Mukarramah |
| 30 | banissa | C | 3.94102, 40.34248 | 3.9000, 40.3300 | 3.9410, 40.3425 |  | 4.77 | 0.00 |  | 4.77 | highway:unclassified / Banissa ward |

### Large cities (n=347)

| id | pop | stored | sits on (reverse geocode) | d WD | d OSM centre | WD vs OSM | class |
|---|---|---|---|---|---|---|---|
| dubai (sprawl list) | 3.9M | 25.0772, 55.3093 | Sheikh Mohammed Bin Zayed Road / highway:motorway / City of Arabia | 21.4 |  |  | A |
| muscat | 1.4M | 23.5889, 58.4083 | Al Ghubrah Street / highway:primary / Al Khuwair / Bawshar Province | 18.9 | 19.1 | 0.2 | A |
| kinshasa-dr-congo (sprawl list) | 16.0M | -4.4419, 15.2663 | C.S Eucalyptus / amenity:school / Matadi Kibala / Kimwenza | 14.3 | 16.0 | 3.4 | A |
| bogota-colombia | 8.0M | 4.7111, -74.0722 | Avenida Calle 127 / highway:primary / Campania / Bogota | 11.3 |  |  | A |
| ho-chi-minh-city-vn | 14.0M | 10.8230, 106.6296 | Phan Huy Ich St. / highway:primary_link / Khu phố 8 / Ho Chi Minh City | 9.5 | 11.0 | 1.6 | A |
| visakhapatnam | 2.0M | 17.6801, 83.2016 | highway:residential / Turakalapalem / Old Gajuwaka | 9.7 | 9.7 | 0.0 | A |
| busan | 3.5M | 35.1017, 129.0300 | Junggu-ro 44beon-gil / highway:residential / Sinchang-dong 3(sam)-ga / | 9.6 | 9.6 | 0.0 | A |
| xian-china | 13.0M | 34.3416, 108.9398 | 西安地铁大厦 / building:yes / Hancheng / Weiyang District | 9.0 | 9.0 | 0.0 | A |
| mexico-city-mexico (sprawl list) | 12.3M | 19.4326, -99.1332 | Constitution Square / highway:pedestrian / Centro / Mexico City | 8.8 |  |  | A |
| palembang-id | 1.8M | -2.9167, 104.7458 | highway:residential / Sukarami / Palembang | 7.7 | 8.1 | 1.0 | A |
| tashkent | 3.0M | 41.2647, 69.2163 | building:yes / Gavkhar mahalla / Tashkent | 7.4 | 7.4 | 0.2 | A |
| medina-saudi-arabia | 1.4M | 24.5247, 39.5692 | highway:unclassified / Az Zahrah / Medina | 7.4 | 7.3 | 0.2 | A |
| jeddah-sa | 4.7M | 21.4901, 39.1862 | highway:primary / Al-Balad / Jeddah | 5.1 | 6.8 | 2.7 | A |
| kigali-rwanda | 1.7M | -1.9441, 30.0619 | amenity:fountain / Kiyovu / City of Kigali | 6.0 | 5.9 | 0.2 | A |
| algiers | 2.4M | 36.7323, 3.0875 | Avenue des Frères Abdeslami / highway:secondary / Jolie Vue / Kouba | 5.5 | 5.2 | 0.4 | A |
| riyadh (sprawl list) | 7.0M | 24.6877, 46.7219 | Al Hareth Ibn Al Habbab / highway:residential / As Salamah / Riyadh | 5.5 | 5.5 | 0.1 | A |
| astana-kz | 1.5M | 51.1801, 71.4460 | Шин Line / shop:tyres / Bayqoñır district / Astana | 5.3 |  |  | A |
| brasilia-br (sprawl list) | 3.0M | -15.7797, -47.9297 | S1 / highway:trunk / Cruzeiro Velho / Cruzeiro | 5.3 | 5.3 | 0.0 | A |
| chongqing-cn (sprawl list) | 32.1M | 29.5603, 106.5577 | leisure:pitch / 七星岗街道 / Yuzhong District | 5.0 |  |  | A |
| xining-cn | 2.5M | 36.6255, 101.7574 | amenity:school / Guchengtai Subdistrict / Chengxi | 1.9 | 35.9 | 37.5 | B |
| can-tho-vn | 3.2M | 10.0371, 105.7883 | Uỷ ban nhân dân thành phố Cần Thơ / amenity:townhall / Phường Ninh Kiề | 34.1 | 0.1 | 34.0 | B |
| lanzhou-cn | 4.4M | 36.0570, 103.8399 | 甘肃省委 / office:political_party / Guangwumen Subdistrict / Lanzhou | 0.9 | 31.5 | 30.7 | B |
| kaifeng-cn | 4.8M | 34.7986, 114.3074 | Kaifeng Municipal People's Government / office:government / Jinyao / K | 3.5 | 27.7 | 25.4 | B |
| tianjin-cn | 13.9M | 39.1422, 117.1767 | highway:living_street / Gulou / Nankai District | 2.5 | 27.3 | 25.2 | B |
| changsha | 10.0M | 28.1987, 112.9709 | Wuyi Square / railway:stop / Dingwangtai / Furong District | 0.0 | 26.9 | 26.9 | B |
| haikou | 3.0M | 20.0342, 110.3465 | Haifu Road / highway:primary / Bo'ai / Meilan District | 3.2 | 15.8 | 13.3 | B |
| moscow-russia (sprawl list) | 13.3M | 55.7558, 37.6173 | amenity:vending_machine / Kitay-gorod / Moscow | 0.6 | 14.5 | 13.9 | B |
| saint-petersburg-russia | 5.7M | 59.9311, 30.3609 | Лиговский проспект / highway:primary / округ Смольнинское / Saint Pete | 3.2 | 11.7 | 8.9 | B |
| tokyo-japan (sprawl list) | 14.3M | 35.6762, 139.6503 | highway:residential / Izumi 2 / Suginami | 4.0 | 10.3 | 6.7 | B |
| phnom-penh-cambodia | 2.1M | 11.5564, 104.9282 | highway:pedestrian / Khan Boeng Keng Kang | 1.7 | 7.9 | 6.9 | B |
| haiphong-vn | 2.6M | 20.8648, 106.6834 | Ủy ban nhân dân Thành phố Hải Phòng / amenity:townhall / Minh Khai / H | 7.4 | 2.1 | 9.3 | B |
| ciudad-juarez-mx | 1.5M | 31.7202, -106.4608 | Boulevard N. Municipio Libre / highway:primary / Ciudad Juárez | 6.9 | 3.0 | 9.9 | B |
| hangzhou | 11.9M | 30.2936, 120.1614 | Zhejiang University of Technology (Zhaohui Campus) / amenity:universit | 4.9 | 6.5 | 3.6 | B |
| dhaka | 16.8M | 23.7104, 90.4074 | highway:living_street / Zindabahar / Dhaka | 2.4 | 6.3 | 4.0 | B |
| singapore | 5.9M | 1.3521, 103.8198 | MacRitchie Nature Trail / highway:path / Central Water Catchment / Sin | 6.2 | 0.6 | 6.7 | B |
| luoyang-cn | 7.1M | 34.6735, 112.4368 | Renmin West Road / highway:secondary / 市府院社区 / Xigong District | 2.0 | 6.1 | 4.8 | B |
| qingdao-cn | 10.1M | 36.0649, 120.3804 | building:commercial / 五四广场社区 / Shinan District | 6.0 | 0.3 | 5.9 | B |
| toronto | 2.8M | 43.7064, -79.3986 | building:commercial / Toronto-St. Paul's / Toronto | 4.1 | 6.0 | 1.9 | B |
| manaus-br | 2.3M | -3.1019, -60.0250 | highway:secondary / Conjunto Jardim Haydéa I / Manaus | 1.9 | 5.8 | 4.6 | B |
| khartoum | 5.3M | 15.5518, 32.5324 | highway:residential / Al Nuzha / Khartoum | 5.7 | 1.3 | 4.5 | B |
| batam-id | 1.3M | 1.1494, 104.0249 | highway:residential / Bengkong Indah / Batam | 3.8 | 5.4 | 3.4 | B |
| bamako | 4.2M | 12.6091, -7.9752 | highway:tertiary / Faso Kanu / Bamako | 4.5 | 5.2 | 1.0 | B |
| incheon-kr | 3.0M | 37.4565, 126.7052 | Incheon City Hall / office:government / Guwol-dong / Incheon | 5.1 | 0.1 | 5.1 | B |
| baku | 2.4M | 40.3777, 49.8920 | 8 November Avenue / highway:trunk / Khatay Raion | 5.0 | 5.0 | 1.0 | B |
| conakry-gn | 1.9M | 9.5380, -13.6773 | amenity:school / Coleah Cité / Conakry | 5.0 | 3.4 | 1.6 | C |
| mecca-saudi-arabia | 2.4M | 21.3891, 39.8579 | highway:tertiary / Al Naseem / Makkah Al Mukarramah | 5.0 | 4.8 | 0.2 | C |
| tijuana | 2.0M | 32.5027, -117.0037 | place:house / El Grano / Tijuana | 4.9 | 4.9 | 0.0 | C |
| tbilisi | 1.3M | 41.6914, 44.8341 | George W. Bush Street / highway:primary / Metromsheni / Tbilisi | 4.9 | 2.7 | 3.3 | C |
| krasnoyarsk-ru | 1.1M | 56.0374, 92.9314 | highway:speed_camera / Советский район / Krasnoyarsk | 4.9 | 4.8 | 0.0 | C |
| santo-domingo-do | 2.2M | 18.4719, -69.8923 | Avenida Simón Bolívar / highway:secondary / San Lazaro / Santo Domingo | 4.7 | 0.1 | 4.8 | C |
| hong-kong | 7.4M | 22.3193, 114.1694 | Mong Kok / railway:stop / Mong Kok / Hong Kong | 4.7 | 4.3 | 0.4 | C |
| omdurman-sd | 2.8M | 15.6445, 32.4777 | 6th of April Street / highway:tertiary / Arda North / موقف مواصلات الق | 4.6 | 0.0 | 4.6 | C |
| abidjan-ivory-coast | 6.3M | 5.3600, -4.0083 | agban bti / office:government / Gendarmerie Agban / Abidjan | 3.3 | 4.5 | 2.1 | C |
| san-jose | 1.0M | 37.3394, -121.8950 | place:house / Saint James Square Historic District / San Jose | 4.4 | 0.5 | 3.9 | C |
| nay-pyi-taw | 1.2M | 19.7450, 96.1297 | မြို့တော်ခန်းမ / amenity:townhall / Zay Ya Theik Di Ward / Za Bu Thi R | 1.6 | 4.4 | 3.3 | C |
| caracas-ve | 3.0M | 10.4880, -66.8792 | highway:residential / Colinas de Bello Monte / Caracas | 4.3 | 4.4 | 0.0 | C |
| baghdad | 8.1M | 33.3406, 44.4009 | King Ghazi Street / highway:tertiary / محلة 125 / Baghdad | 4.3 | 4.0 | 2.2 | C |
| jakarta-indonesia (sprawl list) | 11.1M | -6.2088, 106.8456 | LA / highway:elevator / South Jakarta / Special Capital Region of Jaka | 4.3 | 4.2 | 0.0 | C |
| taipei | 7.9M | 25.0531, 121.5264 | amenity:drinking_water / Kangle Village / Taipei | 4.0 | 4.1 | 0.1 | C |
| taichung-tw | 3.0M | 24.1469, 120.6839 | place:house / Xinxing Village / Taichung | 0.6 | 4.1 | 3.9 | C |
| harare-zimbabwe | 2.1M | -17.8216, 31.0492 | Herbert Chitepo Avenue / highway:secondary / Milton Park / Harare | 0.9 | 4.1 | 3.2 | C |
| belem-br | 1.5M | -1.4558, -48.5044 | La Pizzeria n'Amazônia / amenity:restaurant / Cidade Velha / Belém | 0.1 | 4.1 | 4.0 | C |
| barquisimeto-ve | 1.2M | 10.0647, -69.3570 | highway:residential / Urbanización Andrés Eloy Blanco / Barquisimeto | 1.2 | 4.1 | 2.9 | C |
| chicago | 2.7M | 41.8500, -87.6500 | amenity:parking / Bridgeport / Chicago | 4.0 | 3.5 | 0.8 | C |
| ulaanbaatar-mongolia | 1.4M | 47.8864, 106.9057 | соёмбо / shop:supermarket / Zaisan / Ulaanbaatar | 3.9 | 3.7 | 1.0 | C |
| rio-de-janeiro-brazil | 6.7M | -22.9068, -43.1729 | Avenida Presidente Antônio Carlos / highway:primary / Castelo / Rio de | 3.4 | 3.8 | 0.4 | C |
| maracaibo-ve | 1.8M | 10.6423, -71.6109 | highway:residential / Santa Bárbara / Parroquia Bolívar | 2.6 | 3.8 | 2.2 | C |
| doha-qatar | 1.2M | 25.2854, 51.5310 | Wadi Mushaireb Street / highway:tertiary / Mushaireb / Doha | 0.2 | 3.6 | 3.5 | C |
| addis-ababa-ethiopia | 5.7M | 9.0320, 38.7469 | Gobena Aba Tigu Street / highway:primary / Atekelet Tera / Addis Ababa | 0.7 | 3.6 | 4.0 | C |
| lahore | 13.0M | 31.5580, 74.3507 | Badar Street / highway:residential / Garhi Shahu / Civil Lines | 1.1 | 3.6 | 3.3 | C |
| suwon | 1.2M | 37.2911, 127.0089 | building:yes / Yeonghwa-dong / Suwon-si | 0.6 | 3.6 | 3.0 | C |
| gwalior-in | 1.1M | 26.2298, 78.1734 | highway:residential / Gwalior / Gwalior | 2.0 | 3.3 | 2.2 | C |
| almaty | 2.2M | 43.2525, 76.9115 | Baizakov Street / highway:tertiary / Almaly District / Almaty | 1.4 | 3.3 | 2.5 | C |
| jaipur-india | 3.1M | 26.9124, 75.7873 | Acharya Shri Tulsi Setu / highway:trunk / Hasanpura-C / Jaipur | 3.3 | 3.2 | 0.1 | C |
| wuhan-cn | 13.7M | 30.5833, 114.2667 | amenity:parking / Wansong / Jianghan District | 3.2 | 2.5 | 1.9 | C |
| hyderabad-india | 9.2M | 17.3841, 78.4564 | Sitarambagh Temple / amenity:place_of_worship / Habeeb Nagar / Hyderab | 3.2 | 3.2 | 0.1 | C |
| canberra-australia (sprawl list) | 0.4M | -35.2809, 149.1300 | Theatre Lane / highway:service / City / Canberra | 1.4 | 3.2 | 2.4 | C |
| basrah-iq | 1.3M | 30.5085, 47.7804 | Al-Tamem Street / highway:secondary / الاولى / حي الخليج العربي - الرا | 2.9 | 3.1 | 2.2 | C |
| lilongwe-mw | 1.1M | -13.9669, 33.7873 | Youth Drive / highway:tertiary / Lilongwe | 3.0 | 3.1 | 0.1 | C |
| damascus-syria | 2.7M | 33.5138, 36.2765 | نفق الأمويين / highway:trunk / Rabwa Neighborhood / Al-Mazza Municipal | 1.4 | 3.1 | 1.6 | C |
| omsk-ru | 1.2M | 54.9924, 73.3686 | building:retail / Центральный административный округ / Omsk | 3.0 | 0.2 | 2.8 | C |
| samara-ru | 1.2M | 53.2077, 50.1355 | Osipenko Street / highway:secondary / Oktyabrskiy rayon / Samara | 3.0 | 2.6 | 1.7 | D |
| tehran (sprawl list) | 8.7M | 35.6944, 51.4215 | موبایل / shop:mobile_phone / Ferdowsi / Tehran | 2.9 | 2.9 | 0.0 | D |
| zhengzhou-cn | 12.6M | 34.7578, 113.6486 | highway:unclassified / Minggonglu / Zhengzhou | 1.4 | 2.9 | 3.8 | D |
| tainan-tw | 1.9M | 22.9908, 120.2133 | place:house / Dongmen Village / Tainan | 2.9 | 2.9 | 0.1 | D |
| fez-morocco | 1.2M | 34.0181, -5.0078 | highway:residential / Al-Adarissa / Fez | 2.8 | 2.0 | 1.5 | D |
| urumqi-cn | 4.1M | 43.8010, 87.6005 | amenity:parking / 新华社区 / Ürümqi | 2.6 | 2.8 | 0.2 | D |
| pyongyang-north-korea | 3.2M | 39.0392, 125.7625 | highway:tertiary / Kyongsang-dong / P'yŏngyang | 2.8 | 2.3 | 0.6 | D |
| pointe-noire-cg | 1.4M | -4.7761, 11.8635 | highway:residential / Stade MvouMvou / Mvou-Mvou (arrondissement 2) | 2.8 | 2.8 | 0.0 | D |
| barranquilla-co | 1.3M | 10.9685, -74.7813 | Avenida Calle 30 / highway:trunk / San Roque / Perímetro Urbano Barran | 2.8 |  |  | D |
| bishkek-kyrgyzstan | 1.2M | 42.8746, 74.5698 | Аль Барака / amenity:restaurant / Lenin District / Bishkek City | 0.9 | 2.8 | 3.2 | D |
| tangier-ma | 1.3M | 35.7673, -5.7998 | highway:residential / Charf-Mghogha ⵛⴰⵕⴼ ⵎⵖⵓⵖⴰ الشرف مغوغة / Tangier | 0.5 | 2.7 | 2.4 | D |
| dakar | 2.6M | 14.6937, -17.4441 | highway:residential / Colobane / Dakar | 2.7 |  |  | D |
| makassar-id | 1.5M | -5.1486, 119.4319 | highway:living_street / Ballaparang / Makassar | 2.7 | 2.7 | 0.2 | D |
| tegucigalpa-hn | 1.1M | 14.0818, -87.2068 | 6a Avenida Este / highway:residential / Barrio La Granja / Tegucigalpa | 2.7 | 2.7 | 0.0 | D |
| luanda-angola | 2.8M | -8.8147, 13.2302 | Capricciosa / amenity:bar / Mutamba / Luanda | 2.7 | 2.1 | 1.6 | D |
| touba-sn | 1.1M | 14.8623, -15.8753 | N 3 / highway:primary / Touba Mosquée / Touba | 2.6 | 0.3 | 2.5 | D |
| benin-city-ng | 1.8M | 6.3381, 5.6258 | Mountain of Fire Miracle Ministry / amenity:place_of_worship / Benin C | 2.6 | 0.7 | 1.9 | D |
| suzhou-cn | 12.7M | 31.3041, 120.5954 | 苏州市彩香实验小学校 / amenity:school / 彩香一村三区社区 / Gusu District | 2.3 | 2.6 | 1.2 | D |
| lucknow-in | 3.4M | 26.8393, 80.9231 | highway:residential / Naka Hindola / Lucknow | 2.5 | 1.1 | 1.6 | D |
| giza-eg | 4.5M | 30.0094, 31.2086 | place:house / Been Al-Sarayat / Giza | 2.5 | 2.5 | 0.0 | D |
| rosario-ar | 1.2M | -32.9468, -60.6393 | Mogok Joyas / shop:jewelry / Martin / Rosario | 1.2 | 2.5 | 2.1 | D |
| alexandria-egypt | 5.4M | 31.2001, 29.9187 | place:house / Alexandria | 2.5 | 2.2 | 0.3 | D |
| montevideo-uruguay | 1.3M | -34.9011, -56.1645 | place:house / Tres Cruces / Montevideo | 2.5 | 2.5 | 0.0 | D |
| havana | 2.5M | 23.1330, -82.3830 | Calixto García / highway:bus_stop / Príncipe / Havana | 2.5 | 2.5 | 0.2 | D |
| mumbai-india | 15.4M | 19.0760, 72.8777 | Shahid Major Kaustubh Rane flyover / highway:trunk / Hallow Pul / Mumb | 0.0 | 2.5 | 2.5 | D |
| antalya | 2.4M | 36.9081, 30.6956 | highway:unclassified / Cumhuriyet Mahallesi / Antalya | 0.0 | 2.5 | 2.5 | D |
| cairo (sprawl list) | 9.8M | 30.0626, 31.2497 | Ramsis Street / highway:primary / El Fagala / Cairo | 2.4 | 2.4 | 0.0 | D |
| yekaterinburg-ru | 1.5M | 56.8573, 60.6153 | улица Челюскинцев / highway:secondary / Екатерининский Парк / Yekateri | 2.4 | 2.3 | 0.8 | D |
| monrovia-lr | 1.8M | 6.3005, -10.7969 | Camp Johnson Road / highway:secondary / Bassa Community / Monrovia | 1.4 | 2.4 | 1.1 | D |
| yokohama-jp | 3.8M | 35.4333, 139.6500 | building:apartments / Mugitacho 4-chome / Yokohama | 2.4 | 2.4 | 0.0 | D |
| istanbul (sprawl list) | 15.7M | 41.0138, 28.9497 | Bıçakçı Alaaddin Cami / amenity:place_of_worship / İskenderpaşa Mahall | 1.0 | 2.4 | 1.4 | D |
| aden | 1.2M | 12.7796, 45.0385 | Mohammed Ali Luqman Street / highway:tertiary / البادري / Aden City | 2.3 | 1.6 | 1.3 | D |
| yichang-cn | 4.0M | 30.7144, 111.2847 | 东夷路 / highway:tertiary / Gezhouba / Xiling District | 0.8 | 2.3 | 1.6 | D |
| mexicali-mx | 1.0M | 32.6278, -115.4545 | Avenida Mal Paso / highway:residential / Fracc. Residencias / Mexicali | 2.2 | 2.3 | 0.4 | D |
| ankara-tr | 5.8M | 39.9199, 32.8543 | Denizbank / amenity:bank / Meşrutiyet Mahallesi / Ankara | 2.2 | 0.1 | 2.1 | D |
| delhi (sprawl list) | 26.5M | 28.6519, 77.2315 | highway:residential / Dharampura / Delhi | 2.2 | 2.1 | 0.0 | D |
| santiago | 6.3M | -33.4569, -70.6483 | highway:pedestrian / Santiago / Santiago | 2.2 | 2.2 | 0.1 | D |
| jerusalem | 1.1M | 31.7683, 35.2137 | place:house / Kiryat Shmuel / Jerusalem | 2.1 | 1.6 | 0.8 | D |
| karbala | 1.2M | 32.6160, 44.0249 | highway:secondary / Karbala | 0.8 | 2.1 | 2.6 | D |
| varanasi | 1.2M | 25.3167, 83.0104 | highway:residential / Varanasi | 0.3 | 2.1 | 1.9 | D |
| karachi-pakistan (sprawl list) | 14.9M | 24.8607, 67.0011 | Embankment Road / highway:primary / Miranpir / Lyari Town | 0.9 | 2.1 | 1.2 | D |
| patna-in | 1.7M | 25.5941, 85.1356 | NIFT Patna / amenity:university / Patna | 1.9 | 2.1 | 1.8 | D |
| fortaleza-br | 2.6M | -3.7172, -38.5431 | place:house / Jacarecanga / Fortaleza | 2.1 |  |  | D |
| kharkiv-ua | 1.4M | 49.9818, 36.2548 | Топольок / shop:stationery / Захарківська слобода / Kharkiv | 2.1 | 2.1 | 0.0 | D |
| mandalay | 1.2M | 21.9747, 96.0836 | 80th Street / highway:secondary / Aung Nan Yeik Thar (East) Ward / Man | 0.9 | 2.0 | 2.8 | D |
| harbin-cn | 10.0M | 45.7500, 126.6500 | 光芒街 / highway:tertiary / Gexin / Harbin | 1.3 | 2.0 | 1.1 | D |
| maceio-br | 1.0M | -9.6658, -35.7353 | Rua do Imperador / highway:trunk / Centro / Maceió | 0.0 | 2.0 | 2.0 | D |
| guadalajara-mexico | 1.4M | 20.6597, -103.3496 | shop:florist / Mexicaltzingo / Guadalajara | 2.0 | 1.8 | 0.6 | D |
| abu-dhabi-ae | 1.8M | 24.4512, 54.3970 | Sultan Bin Zayed The First Street / highway:primary / Al Nahyan / Abu  | 0.0 | 2.0 | 2.0 | D |
| quetta-pk | 1.6M | 30.1841, 67.0014 | New Al-Gellani Road Quetta / highway:residential / Jan Muhammad Road A | 2.0 | 2.0 | 0.0 | D |
| guilin-cn | 5.1M | 25.2802, 110.2964 | Hotel Universal Guilin / tourism:hotel / 解东社区 / Xiufeng District | 2.0 | 0.6 | 1.5 | D |
| nanjing-cn | 9.3M | 32.0617, 118.7778 | North Zhongshan Road / highway:primary / Hunanlu / Gulou District | 0.1 | 2.0 | 1.9 | D |
| islamabad-pk | 1.0M | 33.6844, 73.0479 | Agha Shahi (9th) Avenue / highway:primary / G-9/4 / Islamabad | 1.9 | 1.9 | 2.7 | D |
| la-paz-bolivia | 2.0M | -16.5000, -68.1500 | Avenida Eduardo Avaroa / highway:tertiary / Los Andes / La Paz | 1.8 | 1.8 | 0.0 | D |
| srinagar | 1.2M | 34.0857, 74.8055 | Raghunath Mandir / amenity:place_of_worship / Nawa bazar / Srinagar | 0.6 | 1.8 | 2.2 | D |
| isfahan-iran | 2.0M | 32.6546, 51.6680 | craft:tailor / khalaja / Isfahan | 0.7 | 1.8 | 2.2 | D |
| jacksonville | 1.0M | 30.3322, -81.6556 | place:house / Jacksonville | 1.8 | 0.7 | 1.3 | D |
| guangzhou-cn (sprawl list) | 18.7M | 23.1167, 113.2500 | Tiancheng Road / highway:tertiary / Renmin / Yuexiu District | 1.8 | 1.6 | 0.2 | D |
| bursa-tr | 3.1M | 40.1956, 29.0601 | highway:primary / Ulu / Osmangazi | 1.8 | 1.6 | 1.5 | D |
| prague-czech-republic | 1.4M | 50.0755, 14.4378 | amenity:parking / Vyšehrad / Prague | 1.8 | 1.8 | 0.0 | D |
| quito | 2.8M | -0.2298, -78.5250 | Florencio O'Leary / highway:residential / Dos Puentes / Quito | 1.8 | 1.8 | 0.0 | D |
| fukuoka-jp | 1.6M | 33.6000, 130.4167 | highway:tertiary / Chiyo 2-chome / Fukuoka | 1.8 |  |  | D |
| santa-cruz-de-la-sierra-bo | 3.1M | -17.7863, -63.1812 | Gravetal Bolivia S.A. / office:yes / La Adobería / Santa Cruz de la Si | 1.8 | 0.3 | 1.8 | D |
| bangkok-thailand (sprawl list) | 5.7M | 13.7563, 100.5018 | information:map / Lang Wat Ratchanatda Community / Bangkok | 1.8 | 1.0 | 2.5 | D |
| diyarbakr-tr | 1.8M | 37.9136, 40.2172 | Akkoyunlu Bulvarı / highway:primary / Kooperatifler Mahallesi / Yenişe | 1.7 | 1.7 | 0.6 | D |
| maiduguri-ng | 1.2M | 11.8469, 13.1571 | highway:unclassified / Talbari / Maiduguri | 1.7 |  |  | D |
| kisangani-cd | 1.6M | 0.5153, 25.1910 | Avenue des Cocotiers / highway:residential / Makiso / Kisangani | 0.0 | 1.7 | 1.7 | D |
| belgrade | 1.3M | 44.8040, 20.4651 | building:apartments / МЗ Западни Врачар / Vracar Urban Municipality | 1.7 |  |  | D |
| khulna-bd | 1.5M | 22.8098, 89.5644 | highway:residential / Roypara / Khulna | 1.7 |  |  | D |
| barcelona-spain | 1.7M | 41.3888, 2.1590 | Yamadori / amenity:restaurant / l'Antiga Esquerra de l'Eixample / Barc | 1.7 | 1.7 | 0.0 | D |
| tripoli-libya | 1.3M | 32.8872, 13.1913 | Al Mabrouk Oil Operations Company / office:company / Dahra / Tripoli | 0.4 | 1.6 | 1.4 | D |
| puebla-mexico | 1.7M | 19.0414, -98.2063 | Calle 7 Sur / highway:residential / Centro Histórico de Puebla / Puebl | 1.6 |  |  | D |
| kaohsiung-tw | 2.7M | 22.6163, 120.3133 | place:house / Zhongxiao Village / Kaohsiung | 1.6 | 0.5 | 1.6 | D |
| kuala-lumpur-malaysia | 9.0M | 3.1390, 101.6869 | Jalan Damansara / highway:primary / Bangsar / Kuala Lumpur | 1.3 | 1.6 | 0.5 | D |
| yantai-cn | 7.1M | 37.4765, 121.4408 | 观海路 / highway:primary / Huanghailu / Laishan District | 1.5 | 1.6 | 0.5 | D |
| lima-peru | 9.9M | -12.0464, -77.0428 | highway:pedestrian / Lima | 1.6 | 1.3 | 1.7 | D |
| recife-marco-zero | 1.7M | -8.0631, -34.8711 | Rosa dos Ventos / tourism:artwork / Bairro do Recife / Recife | 1.5 | 1.6 | 0.7 | D |
| mbuji-mayi-cd | 2.9M | -6.1360, 23.5898 | highway:residential / Kanshi | 1.6 | 1.6 | 0.0 | D |
| maputo-mozambique | 1.3M | -25.9655, 32.5832 | Rua dos Dadores de Sangue / highway:residential / Central "A" / Maputo | 1.1 | 1.6 | 0.7 | D |
| rome-italy | 2.7M | 41.9028, 12.4964 | Nymph of the Rivers / tourism:artwork / Castro Pretorio / Rome | 1.6 | 1.5 | 0.0 | D |
| nashik-in | 1.5M | 19.9973, 73.7910 | highway:residential / Bhadrakali / Nashik | 0.9 | 1.6 | 1.4 | D |
| bucharest-romania | 1.9M | 44.4268, 26.1025 | Fântâna lui Bucur / amenity:fountain / Calicilor / Bucharest | 1.5 | 1.0 | 2.6 | D |
| novosibirsk-ru | 1.6M | 55.0226, 82.9317 | man_made:bridge / Шевченковский / Novosibirsk | 1.5 | 0.9 | 0.6 | D |
| montreal-canada | 1.9M | 45.5019, -73.5674 | Boulevard René-Lévesque Ouest / highway:secondary / Ville-Marie / Mont | 1.5 | 0.2 | 1.3 | D |
| n-djamena-td | 1.4M | 12.1067, 15.0444 | highway:residential / Gardole قاردول / N'Djamena | 0.7 | 1.5 | 1.0 | D |
| surat-in | 5.9M | 21.1959, 72.8302 | highway:residential / Salabatpura / Surat | 1.4 | 1.5 | 1.0 | D |
| berlin-germany | 3.7M | 52.5200, 13.4050 | Spandauer Straße / highway:secondary / Nikolaiviertel / Berlin | 1.5 | 0.7 | 0.8 | D |
| veracruz-mx | 8.1M | 19.1809, -96.1429 | Calle Constituyentes / highway:residential / Ortiz Rubio / Veracruz Ci | 1.5 |  |  | D |
| edmonton-canada | 1.0M | 53.5461, -113.4937 | place:house / Downtown / Edmonton | 1.5 | 0.2 | 1.5 | D |
| surabaya-id | 3.0M | -7.2492, 112.7508 | Jalan Ngaglik / highway:primary / RW 05 / Surabaya | 1.5 | 1.5 | 0.0 | D |
| asuncion-py | 1.5M | -25.2865, -57.6470 | Cristobal Colón / highway:primary / Tacumbú / Asuncion | 1.5 | 1.5 | 0.0 | D |
| dar-es-salaam | 5.4M | -6.8235, 39.2695 | building:commercial;residential / Mchikichini / Dar es Salaam | 1.4 | 1.5 | 0.0 | D |
| casablanca | 3.7M | 33.5883, -7.6114 | Boulevard Rahal El Meskini شارع رحال المسكيني / highway:secondary / Ce | 1.4 | 1.1 | 0.5 | D |
| volgograd-ru | 1.0M | 48.7138, 44.4976 | building:apartments / Tsentralnyy District / Volgograd | 1.4 | 1.4 | 0.1 | D |
| shenzhen-cn (sprawl list) | 17.5M | 22.5455, 114.0683 | Huanggang Road / highway:trunk / Tianmian / Futian District | 1.4 | 1.4 | 0.2 | D |
| hanoi-vietnam | 8.7M | 21.0285, 105.8542 | People's Committee of Hanoi City / amenity:townhall / Old Quarter / Hà | 1.4 | 0.0 | 1.4 | D |
| ulsan | 1.1M | 35.5372, 129.3167 | Daldong Community Service Center / amenity:townhall / Dal-dong / Ulsan | 1.4 | 0.5 | 1.3 | D |
| ashgabat-turkmenistan | 1.0M | 37.9375, 58.3800 | Garaşsyzlyk meýdany / highway:tertiary / Kopetdag District / Ashgabat | 1.4 |  |  | D |
| gqeberha-za | 1.1M | -33.9611, 25.6149 | Roslyn Flats / building:apartments / South End / Gqeberha | 1.4 | 0.4 | 1.8 | D |
| brazzaville-cg | 2.1M | -4.2661, 15.2832 | highway:residential / Poto-Poto / Brazzaville (municipality) | 1.4 | 1.4 | 0.0 | D |
| beijing-china (sprawl list) | 21.9M | 39.9042, 116.4074 | 台基厂头条14号院-10号院 / landuse:residential / 台基厂社区 / Dongcheng District | 0.0 | 1.4 | 1.4 | D |
| jos-ng | 1.0M | 9.9285, 8.8921 | Bauchi Road / highway:trunk / Jos | 1.1 | 1.4 | 2.4 | D |
| dalian-cn | 7.5M | 38.9122, 121.6022 | 黄河路 / highway:primary / Renminguangchang Subdistrict / Dalian | 1.4 |  |  | D |
| port-harcourt-ng | 3.5M | 4.7774, 7.0134 | highway:residential / Old GRA / Port-Harcourt | 1.4 | 1.2 | 0.4 | D |
| krasnodar-ru | 1.2M | 45.0453, 38.9818 | Kommunarov Street / highway:secondary / Центральный округ / Krasnodar | 1.3 | 1.2 | 0.5 | D |
| gwangju | 1.5M | 35.1547, 126.9156 | building:commercial / Daein-dong / Gwangju | 1.3 |  |  | D |
| kunming-cn | 8.5M | 25.0389, 102.7183 | 朱氏楼（明礼楼） / historic:building / 和平后村 / Kunming | 1.3 | 0.2 | 1.2 | D |
| houston-usa (sprawl list) | 2.3M | 29.7604, -95.3698 | West Walker Tunnel / highway:footway / Downtown / Houston | 1.3 | 0.3 | 1.5 | D |
| beirut-lebanon | 2.4M | 33.8938, 35.5018 | Cheikh Toufic Khaled / highway:motorway_link / Serail / Beirut | 1.3 |  |  | D |
| salvador-br | 2.7M | -12.9756, -38.4910 | Rua Metropolitana / highway:residential / Vila Baixa do Tubo / Salvado | 0.8 | 1.3 | 1.2 | D |
| seoul-south-korea (sprawl list) | 10.3M | 37.5665, 126.9780 | Happy Plus Cafe / amenity:cafe / Taepyeongno 1-ga / Seoul | 1.3 | 0.0 | 1.3 | D |
| kumasi-ghana | 3.9M | 6.6885, -1.6244 | amenity:parking / Adum / Kumasi | 1.3 | 1.1 | 0.2 | D |
| odesa-ua | 1.0M | 46.4857, 30.7438 | amenity:clock / Centre / Odesa | 1.3 | 0.9 | 0.8 | D |
| niamey-ne | 1.5M | 13.5137, 2.1098 | Avenue de la Mairie / highway:tertiary / Maourey / Niamey | 0.8 | 1.2 | 1.4 | D |
| peshawar-pk | 4.8M | 34.0080, 71.5785 | highway:living_street / Sethi Mohallah / Peshawar City Tehsil | 1.2 | 0.5 | 1.1 | D |
| antananarivo | 1.3M | -18.9137, 47.5361 | Sambika Chocolat / amenity:restaurant / Ampasanisadoda / Antananarivo | 1.2 | 1.2 | 0.1 | D |
| cordoba-ar | 2.1M | -31.4065, -64.1885 | Intendente Ramón Bautista Mestre Sur / highway:primary / Alberdi / Cor | 1.2 | 1.2 | 0.0 | D |
| shenyang-cn | 9.1M | 41.7922, 123.4328 | 三盛巷 / highway:living_street / Zhujianlu Subdistrict / Shenhe District | 1.2 | 1.2 | 0.0 | D |
| yangon | 6.9M | 16.8053, 96.1561 | Shwe Gone Tine (south) / highway:bus_stop / Ngar Htat Gyi(West/Yae Lel | 1.2 | 1.1 | 0.2 | D |
| lusaka | 2.5M | -15.4067, 28.2871 | Chiyanga Road / highway:residential / Thorn Park / Lusaka | 1.2 | 1.2 | 0.2 | D |
| da-nang-vn | 2.8M | 16.0678, 108.2208 | Goom Vegan / amenity:restaurant / Tổ dân phố 32 Hải Châu / Đà Nẵng | 1.2 | 0.4 | 1.5 | D |
| prayagraj | 6.0M | 25.4448, 81.8432 | highway:residential / George Town / Prayagraj | 0.9 | 1.2 | 2.1 | D |
| durban-south-africa | 3.3M | -29.8587, 31.0218 | Mr Price / shop:clothes / eThekwini Ward 28 / Durban | 0.3 | 1.2 | 1.5 | D |
| copenhagen-denmark | 1.2M | 55.6761, 12.5683 | highway:pedestrian / Vestervold / Copenhagen | 0.0 | 1.2 | 1.2 | D |
| mosul-iq | 1.8M | 36.3350, 43.1189 | highway:secondary / Mosul | 1.2 |  |  | D |
| kabul-af | 5.3M | 34.5281, 69.1723 | گوهرشاد بیگم / highway:secondary / 2nd District / Kabul | 0.8 | 1.2 | 1.9 | D |
| kayseri | 1.5M | 38.7322, 35.4853 | Arif Molu MTAL / amenity:school / Mevlana Mahallesi / Kocasinan | 1.1 | 1.2 | 0.1 | D |
| dallas-usa (sprawl list) | 1.3M | 32.7767, -96.7970 | Dallas City Hall / amenity:townhall / Downtown PID / Dallas | 1.1 | 0.0 | 1.2 | D |
| kobe-jp | 1.5M | 34.6913, 135.1830 | 地方公務員災害補償基金兵庫県支部 / office:government / Shimoyamatedori 6-chome / Kobe | 1.1 | 1.1 | 0.4 | D |
| shymkent | 1.2M | 42.3099, 69.6004 | Yandex taxi drivers center / office:company / Al-Farabi District / Shy | 1.1 | 1.1 | 1.9 | D |
| cologne-de | 1.0M | 50.9333, 6.9500 | building:yes / Cäcilienviertel / Cologne | 1.1 | 0.9 | 0.5 | D |
| izmir-tr | 4.5M | 38.4127, 27.1384 | Rakım Erkutlu Caddesi / highway:secondary / Dolaplıkuyu Mahallesi / İz | 0.0 | 1.1 | 1.1 | D |
| agra-in | 1.6M | 27.1833, 78.0167 | Ram Swaroop Singhal Girls Inter College / amenity:college / Subhash Ba | 0.5 | 1.1 | 1.1 | D |
| hohhot-cn | 3.4M | 40.8106, 111.6522 | 温商小区车道 / highway:residential / Tongdaojie / Huimin District | 1.0 | 1.1 | 0.4 | D |
| manila-philippines (sprawl list) | 1.9M | 14.5995, 120.9842 | JG Plaza / building:commercial / Barangay 383 / Manila | 0.9 | 1.1 | 0.7 | D |
| medan-id | 2.5M | 3.5833, 98.6667 | highway:residential / Petisah Hulu / City of Medan | 1.1 | 1.1 | 0.0 | D |
| davao-ph | 1.8M | 7.0731, 125.6128 | Fr. Mateo Gisbert SJ Library / amenity:library / Barangay 32-D / Davao | 0.8 | 1.1 | 0.2 | D |
| cali-co | 2.5M | 3.4305, -76.5199 | Calle 25 / highway:primary / Aguablanca / Cali | 1.1 |  |  | D |
| faisalabad-pk | 3.8M | 31.4155, 73.0897 | Rajbah Road / highway:primary / Faisalabad City Tehsil | 1.1 | 0.8 | 1.3 | D |
| kathmandu-nepal | 1.4M | 27.7172, 85.3240 | Narayanhiti Palace Museum / tourism:museum / Lainchaur / Kathmandu Met | 0.9 | 1.0 | 0.2 | D |
| calgary-canada | 1.3M | 51.0447, -114.0719 | Indigo Lot 082 / amenity:parking / Downtown Commercial Core / Calgary | 0.7 | 1.0 | 0.4 | D |
| yaounde-cm | 2.4M | 3.8667, 11.5167 | CCA Maché central / amenity:bank / Centre Commercial / Yaoundé | 1.0 | 0.6 | 1.3 | D |
| hue-vn | 1.4M | 16.4619, 107.5955 | Thành uỷ Huế / office:political_party / Tổ dân phố 8 / Huế | 1.0 | 1.0 | 0.0 | D |
| madurai-in | 1.6M | 9.9190, 78.1195 | Sri Meenakshi Amman Temple / amenity:place_of_worship / Jaihindpuram / | 0.1 | 1.0 | 0.9 | D |
| daegu-kr | 2.4M | 35.8703, 128.5911 | 죠주 (jyoju) / amenity:pub / Jongno 2(i)-ga / Daegu | 1.0 | 1.0 | 0.0 | D |
| ibadan-ng | 3.6M | 7.3776, 3.9059 | highway:unclassified / Ibadan North East | 0.0 | 1.0 | 1.0 | D |
| abuja-ng | 2.7M | 9.0579, 7.4951 | Eagle Square Bus Stop / highway:bus_stop / Municipal Area Council | 0.5 | 1.0 | 1.0 | D |
| kazan-ru | 1.3M | 55.7887, 49.1221 | building:apartments / Старо-Татарская слобода / Kazan | 0.5 | 0.9 | 0.5 | D |
| buenos-aires-argentina (sprawl list) | 3.1M | -34.6037, -58.3816 | Obelisco / tourism:attraction / Microcentro / Buenos Aires | 0.4 | 0.9 | 1.3 | D |
| guwahati-in | 1.1M | 26.1844, 91.7458 | highway:residential / Paltan Baazar / Guwahati | 0.6 | 0.9 | 0.4 | D |
| belo-horizonte-br | 2.7M | -19.9208, -43.9378 | Rua Espírito Santo / highway:tertiary / Centro / Belo Horizonte | 0.9 | 0.8 | 0.7 | D |
| amritsar-india | 1.2M | 31.6340, 74.8723 | highway:secondary / Hussainpura / Amritsar | 0.9 | 0.6 | 1.0 | D |
| ouagadougou-burkina-faso | 2.5M | 12.3714, -1.5197 | Rond-Point des Nations Unis / highway:trunk / Bilbalogho / Ouagadougou | 0.9 | 0.9 | 0.1 | D |
| chennai-in | 6.6M | 13.0878, 80.2785 | Ekambareswara Agraharam Street / highway:residential / Sowcarpet / Che | 0.7 | 0.9 | 0.7 | D |
| kano | 4.9M | 12.0001, 8.5167 | highway:residential / Shahuchi / Shahuchi | 0.0 | 0.9 | 0.9 | D |
| ahmedabad-in | 7.6M | 23.0258, 72.5873 | highway:tertiary / Historic City of Ahmadabad / Ahmedabad | 0.9 | 0.9 | 0.1 | D |
| marrakech-morocco | 1.0M | 31.6295, -7.9811 | O'Tacos / amenity:fast_food / Sidi Youb / Marrakesh | 0.0 | 0.9 | 0.9 | D |
| tabriz-ir | 1.6M | 38.0800, 46.2919 | سوق کرزات / shop:wine / Bazzar / Tabriz | 0.8 | 0.9 | 0.2 | D |
| sanaa-ye | 3.0M | 15.3545, 44.2065 | شارع علي عبدالمغني / highway:primary / As Suwaydi / Sana'a | 0.9 |  |  | D |
| las-vegas-usa (sprawl list) | 0.6M | 36.1699, -115.1398 | Wild / amenity:restaurant / Fremont East Entertainment District / Las  | 0.8 | 0.8 | 0.0 | D |
| kolkata-india | 4.6M | 22.5726, 88.3639 | Chatterjee Lane / highway:residential / Bowbazar / Kolkata | 0.8 | 0.0 | 0.8 | D |
| bengaluru-in | 12.3M | 12.9719, 77.5937 | Kasturba Road / highway:secondary / Sampangirama Nagar / Bengaluru | 0.8 | 0.7 | 0.3 | D |
| chengdu-cn | 20.9M | 30.6667, 104.0667 | Chen Mapo Tofu / amenity:restaurant / Gulou / Qingyang District | 0.8 | 0.8 | 0.0 | D |
| nairobi-kenya | 5.5M | -1.2921, 36.8219 | Haile Selassie Avenue / highway:secondary / Starehe location / Nairobi | 0.8 |  |  | D |
| amman-jordan | 4.0M | 31.9454, 35.9284 | Palms Plaza / tourism:attraction / الياسمين / Amman | 0.7 | 0.8 | 0.9 | D |
| shiraz | 1.6M | 29.6103, 52.5311 | ۲ مشیر شرقی(شهید بینا) / highway:residential / Zand / Shiraz | 0.0 | 0.8 | 0.8 | D |
| mombasa-kenya | 1.2M | -4.0435, 39.6682 | Sheikh Abdullas F.Road / highway:secondary / Buxton / Mombasa | 0.7 | 0.8 | 0.1 | D |
| hargeysa | 1.2M | 9.5600, 44.0650 | highway:secondary / Burco Duurrey / Hargeisa | 0.8 | 0.4 | 0.4 | D |
| hiroshima-japan | 1.2M | 34.3853, 132.4553 | 地方公務員災害補償基金広島市支部 / office:association / Kokutaijimachi 2-chome / Hiros | 0.0 | 0.8 | 0.8 | D |
| cape-town-south-africa | 4.8M | -33.9249, 18.4241 | highway:pedestrian / Cape Town Ward 115 / Cape Town | 0.0 | 0.8 | 0.7 | D |
| oslo-norway | 1.1M | 59.9139, 10.7522 | amenity:recycling / Sjøtomta / Oslo | 0.7 | 0.7 | 0.0 | D |
| nouakchott-mr | 1.4M | 18.0858, -15.9785 | Bakar Ould Soueid Ahmad أحمد ولد بكر سويد / highway:residential / Noua | 0.0 | 0.7 | 0.7 | D |
| zamboanga | 1.0M | 6.9103, 122.0739 | Governor Alvarez Avenue / highway:secondary / Zone Ⅰ / Zamboanga City | 0.7 |  |  | D |
| medellin-co | 2.5M | 6.2450, -75.5715 | Carrera 52 / highway:secondary / Colón / Medellín | 0.7 |  |  | D |
| kirkuk | 1.0M | 35.4681, 44.3922 | Shuhada Bridge / highway:pedestrian / Kirkuk | 0.7 | 0.5 | 0.7 | D |
| nagoya-jp | 2.3M | 35.1815, 136.9064 | 地方公務員災害補償基金名古屋市支部 / office:government / Sannomaru 3-chome / Nagoya | 0.0 | 0.7 | 0.7 | D |
| monterrey-mexico | 1.1M | 25.6866, -100.3161 | Colón / highway:residential / Monterrey | 0.3 | 0.7 | 0.5 | D |
| sao-luis-br | 1.0M | -2.5297, -44.3028 | Convento e Igreja de Nossa Senhora do Carmo / building:yes / Praia Gra | 0.0 | 0.7 | 0.7 | D |
| konya | 2.2M | 37.8713, 32.4846 | 3A Bilişim Teknolojileri / shop:computer / İhsaniye Mahallesi / Konya | 0.7 | 0.7 | 0.0 | D |
| guayaquil-ec | 2.7M | -2.1962, -79.8862 | José Joaquín de Olmedo / highway:tertiary / Rocafuerte / Guayaquil | 0.7 | 0.7 | 0.1 | D |
| ningbo-cn | 9.4M | 29.8782, 121.5494 | Starbucks Coffee / amenity:cafe / 仓水社区 / Haishu District | 0.4 | 0.7 | 0.3 | D |
| multan-pk | 2.2M | 30.1968, 71.4782 | highway:living_street / Hussain Agahi / Multan | 0.7 | 0.6 | 0.1 | D |
| van-turkey | 1.1M | 38.5017, 43.4089 | Ferit Melen Bulvarı / highway:secondary / Şerefiye Mahallesi / Van | 0.7 |  |  | D |
| lome-tg | 2.2M | 6.1287, 1.2215 | Avenue de la Nouvelle Marche / highway:tertiary / Sanguéra / Lomé | 0.6 | 0.7 | 0.0 | D |
| ahvaz | 1.2M | 31.3190, 48.6842 | highway:residential / khiaban 30 metri / Ahwaz | 0.0 | 0.6 | 0.7 | D |
| atlanta-usa (sprawl list) | 0.5M | 33.7490, -84.3880 | Capitol Hill Post Office / amenity:post_office / South Downtown / Atla | 0.6 | 0.6 | 0.0 | D |
| douala-cm | 2.8M | 4.0483, 9.7043 | Hôpital Laquintinie / amenity:hospital / Bali / Douala I | 0.5 | 0.6 | 1.0 | D |
| santiago-de-queretaro-mx | 1.6M | 20.5881, -100.3881 | amenity:bench / Centro / Querétaro | 0.0 | 0.6 | 0.6 | D |
| perth-australia | 2.4M | -31.9505, 115.8605 | highway:pedestrian / Perth Cultural Centre / Perth | 0.6 | 0.6 | 0.1 | D |
| nagpur-in | 2.4M | 21.1463, 79.0849 | highway:residential / Ramdaspeth / Nagpur | 0.6 | 0.5 | 0.2 | D |
| chattogram-bd | 3.9M | 22.3384, 91.8317 | highway:residential / Chattogram | 0.4 | 0.6 | 0.2 | D |
| munich-germany | 1.5M | 48.1351, 11.5820 | Turmstüberl / amenity:cafe / Graggenauerviertel / Munich | 0.6 | 0.5 | 0.1 | D |
| kuwait-city-kuwait | 3.0M | 29.3759, 47.9774 | Ahmed Al-Jaber Street / highway:primary / Sharq - Block 6 / Sharq | 0.3 | 0.6 | 0.8 | D |
| johannesburg-south-africa (sprawl list) | 9.4M | -26.2041, 28.0473 | Von Weilligh Street / highway:secondary / Newtown / Johannesburg | 0.6 | 0.3 | 0.8 | D |
| ottawa-canada | 1.0M | 45.4215, -75.6972 | Embassy of Mexico / office:diplomatic / Centretown / Ottawa | 0.4 | 0.6 | 0.6 | D |
| enugu-ng | 1.0M | 6.4413, 7.4988 | highway:residential / Ogui / Enugu | 0.5 |  |  | D |
| lubumbashi-cd | 2.2M | -11.6609, 27.4794 | Avenue Mama Yemo / highway:residential / Ujamara / Lubumbashi | 0.5 | 0.5 | 0.0 | D |
| hamburg-germany | 2.0M | 53.5511, 9.9937 | Plan / highway:residential / Altstadt / Hamburg | 0.4 | 0.5 | 0.1 | D |
| trujillo-pe | 1.1M | -8.1160, -79.0300 | place:house / Urbanización El Recreo 1ª Etapa / Trujillo | 0.5 | 0.5 | 0.0 | D |
| accra | 2.0M | 5.5560, -0.1969 | leisure:pitch / Ridge / Accra | 0.0 | 0.5 | 0.5 | D |
| shanghai-china (sprawl list) | 24.9M | 31.2304, 121.4737 | East Yan'an Road / highway:primary / Junle / Shanghai | 0.5 | 0.4 | 0.2 | D |
| stockholm-sweden | 1.5M | 59.3293, 18.0686 | Gustav Adolfs Torg / highway:pedestrian / Klara / Stockholm | 0.0 | 0.5 | 0.5 | D |
| san-luis-potosi-mx | 2.8M | 22.1523, -100.9714 | Calle Manuel José Othón / highway:primary / Fraccionamiento Nuevo Pase | 0.5 |  |  | D |
| gaziantep-tr | 2.2M | 37.0594, 37.3825 | highway:residential / Alaybey Mahallesi / Gaziantep | 0.5 | 0.5 | 0.0 | D |
| merida-mx | 1.2M | 20.9670, -89.6232 | Calle 60 / highway:secondary / Centro / Mérida | 0.5 | 0.1 | 0.5 | D |
| sao-paulo-br (sprawl list) | 12.4M | -23.5475, -46.6361 | place:house / Glicério / São Paulo | 0.4 | 0.4 | 0.1 | D |
| yerevan | 1.1M | 40.1776, 44.5126 | Republic Square / highway:primary / Kentron / Yerevan | 0.4 | 0.0 | 0.4 | D |
| port-au-prince-ht | 1.2M | 18.5435, -72.3388 | Haiti National Palace / historic:ruins / Champs de Mars / Port-au-Prin | 0.4 | 0.4 | 0.1 | D |
| qom | 1.2M | 34.6401, 50.8764 | Lalea / tourism:hotel / Eram / Qom | 0.0 | 0.4 | 0.4 | D |
| brussels-belgium | 1.3M | 50.8503, 4.3517 | highway:pedestrian / Quartier du Centre - Centrumwijk / Brussels | 0.4 |  |  | D |
| kaduna-ng | 1.9M | 10.5264, 7.4388 | Independence Way / highway:secondary / Shaba | 0.4 |  |  | D |
| auckland-new-zealand | 1.5M | -36.8485, 174.7633 | highway:cyclist_waiting_aid / Victoria Quarter / Auckland | 0.2 | 0.4 | 0.4 | D |
| minsk-by | 2.0M | 53.9002, 27.5665 | place:house / Liachaŭskaja Slabada / Minsk | 0.4 | 0.4 | 0.0 | D |
| quezon-city-ph | 3.1M | 14.6488, 121.0509 | Elliptical Road / highway:primary / Central / Quezon City | 0.4 | 0.4 | 0.2 | D |
| semarang-id | 1.7M | -6.9931, 110.4208 | Jalan Pahlawan / highway:pedestrian / RW 06 / Semarang | 0.4 | 0.4 | 0.1 | D |
| nizhniy-novgorod-ru | 1.3M | 56.3287, 44.0020 | amenity:bench / Кремль / Nizhny Novgorod | 0.4 | 0.3 | 0.2 | D |
| mwanza-tz | 1.1M | -2.5167, 32.9000 | amenity:parking / Mabatini / Mwanza | 0.0 | 0.4 | 0.4 | D |
| sharjah-ae | 1.8M | 25.3342, 55.4122 | Sheikh Khalifa bin Zayed Al Nahyan Road / highway:trunk / Industrial A | 0.4 |  |  | D |
| datong | 3.3M | 40.0936, 113.2914 | 小皮巷 / highway:pedestrian / Gucheng / Pingcheng District | 0.0 | 0.4 | 0.4 | D |
| xiamen-cn | 5.2M | 24.4798, 118.0819 | Guanren Road / highway:unclassified / Yundang Subdistrict / Siming Dis | 0.0 | 0.4 | 0.3 | D |
| brisbane-australia | 2.8M | -27.4698, 153.0251 | McDonald's / amenity:fast_food / Golden Triangle / Brisbane | 0.3 | 0.2 | 0.4 | D |
| dammam-sa | 1.3M | 26.4344, 50.1033 | highway:residential / Al Adamah / Dammam | 0.3 | 0.3 | 0.6 | D |
| goiania-br | 1.5M | -16.6786, -49.2539 | Rua 19 / highway:residential / Setor Central / Goiânia | 0.3 | 0.3 | 0.3 | D |
| rostov-on-don-ru | 1.1M | 47.2200, 39.7077 | KFC / amenity:fast_food / Ленинский район / Rostov-on-Don | 0.3 |  |  | D |
| nanning-cn | 8.7M | 22.8167, 108.3167 | 城隍庙东巷 / highway:pedestrian / Chaoyang / Nanning | 0.3 | 0.2 | 0.5 | D |
| kampala | 1.7M | 0.3163, 32.5822 | amenity:nightclub / Nakasero / Kampala | 0.3 |  |  | D |
| aleppo-sy | 2.1M | 36.2012, 37.1612 | amenity:place_of_worship / Bayadah district / Aleppo | 0.2 | 0.3 | 0.3 | D |
| mogadishu-so | 2.6M | 2.0371, 45.3438 | leisure:playground / Shangani District / Mogadishu | 0.3 | 0.3 | 0.5 | D |
| milan-it | 1.4M | 45.4642, 9.1900 | 1_33051 / highway:pedestrian / Municipio 1 / Milan | 0.3 | 0.0 | 0.3 | D |
| sendai | 1.1M | 38.2667, 140.8667 | レジデンス27番館 / building:apartments / Kokubuncho 3-chome / Sendai | 0.3 | 0.2 | 0.1 | D |
| kakamega-ke | 1.9M | 0.2842, 34.7523 | Cannon Awori Street / highway:residential / Sheywe ward | 0.3 |  |  | D |
| curitiba-br | 1.9M | -25.4278, -49.2731 | building:yes / Curitiba Historical Centre / Curitiba | 0.2 | 0.3 | 0.1 | D |
| lagos (sprawl list) | 15.4M | 6.4541, 3.3947 | Ricca Street / highway:residential / Obalende / Lagos | 0.3 | 0.1 | 0.1 | D |
| san-diego-usa | 1.4M | 32.7157, -117.1611 | East Broadway / highway:primary / Gaslamp Quarter / San Diego | 0.2 | 0.3 | 0.1 | D |
| birmingham-gb | 1.2M | 52.4814, -1.8998 | amenity:waste_basket / Rea Valley / Birmingham | 0.2 |  |  | D |
| pune-in | 6.2M | 18.5196, 73.8554 | amenity:fountain / Kasba Peth / Pune | 0.2 | 0.2 | 0.1 | D |
| chiang-mai-thailand | 1.2M | 18.7883, 98.9853 | Jhaban Road / highway:residential / แขวงศรีวิชัย / Chiang Mai City Mun | 0.2 | 0.1 | 0.3 | D |
| los-angeles-usa (sprawl list) | 3.9M | 34.0522, -118.2437 | Los Angeles Police Department Headquarters / amenity:police / Civic Ce | 0.0 | 0.2 | 0.2 | D |
| pretoria | 2.1M | -25.7449, 28.1878 | Paul Kruger Street / highway:unclassified / Tshwane Ward 58 / Pretoria | 0.2 | 0.1 | 0.1 | D |
| san-antonio-usa | 1.5M | 29.4241, -98.4936 | highway:pedestrian / Downtown / San Antonio | 0.1 | 0.2 | 0.1 | D |
| sydney-australia (sprawl list) | 5.6M | -33.8688, 151.2093 | Nina Armando / shop:clothes / Wynyard / Sydney | 0.1 | 0.1 | 0.3 | D |
| philadelphia-usa | 1.6M | 39.9526, -75.1652 | North 15th Street / highway:primary / Rittenhouse Square / Philadelphi | 0.1 | 0.1 | 0.0 | D |
| adelaide-australia | 1.5M | -34.9285, 138.6007 | Victoria Square / highway:secondary / Adelaide / Adelaide | 0.1 | 0.1 | 0.1 | D |
| rabat-morocco | 1.7M | 34.0209, -6.8416 | Avenue Hassan II شارع الحسن الثاني / highway:primary / Arrondissement  | 0.0 | 0.1 | 0.1 | D |
| vienna-austria | 2.0M | 48.2082, 16.3738 | highway:pedestrian / Stubenviertel / Vienna | 0.1 | 0.1 | 0.0 | D |
| daejeon-kr | 1.5M | 36.3491, 127.3849 | amenity:parking / Dunsan-dong / Daejeon | 0.1 | 0.1 | 0.0 | D |
| warsaw-poland | 1.9M | 52.2297, 21.0122 | man_made:tunnel / Śródmieście Północne / Warsaw | 0.1 |  |  | D |
| osaka-japan | 2.8M | 34.6937, 135.5023 | Osaka Shiyakusho-nai Post Office / amenity:post_office / Nakanoshima 1 | 0.0 | 0.1 | 0.1 | D |
| melbourne-australia (sprawl list) | 5.4M | -37.8136, 144.9631 | place:house / Greek Precinct / Melbourne | 0.1 | 0.1 | 0.0 | D |
| panama-city | 1.5M | 8.9711, -79.5347 | Alcaldía de Panamá / amenity:townhall / Calidonia / Panama City | 0.0 | 0.1 | 0.1 | D |
| mashhad-ir | 3.0M | 36.2981, 59.6057 | amenity:toilets / Saad Abad / Mashhad | 0.1 | 0.1 | 0.0 | D |
| budapest-hungary | 1.7M | 47.4979, 19.0402 | Clark Ádám tér / highway:pedestrian / Buda / Budapest | 0.1 |  |  | D |
| arequipa-pe | 1.2M | -16.3990, -71.5375 | Metys tour Arequipa / shop:travel_agency / 7 Esquinas / Arequipa | 0.1 | 0.1 | 0.0 | D |
| kyiv-ukraine | 3.0M | 50.4501, 30.5234 | highway:pedestrian / Centre / Kyiv | 0.0 | 0.1 | 0.0 | D |
| dublin-ireland | 1.0M | 53.3498, -6.2603 | Spire of Dublin / tourism:attraction / North City ED / Dublin | 0.0 | 0.0 | 0.0 | D |
| bandung-id | 2.9M | -6.9222, 107.6069 | Bandung Basin Metropolitan Area BRT Corridor / highway:construction /  | 0.0 | 0.0 | 0.0 | D |
| madrid-spain | 3.5M | 40.4168, -3.7038 | Puerta del Sol Clock / amenity:clock / Barrio de los Austrias / Madrid | 0.0 | 0.0 | 0.0 | D |
| porto-alegre-br | 1.5M | -30.0328, -51.2302 | leisure:playground / Historic District / Porto Alegre | 0.0 | 0.0 | 0.0 | D |
| london-uk (sprawl list) | 9.0M | 51.5074, -0.1278 | Mileage Central Point of London Plaque / historic:memorial / Westminst | 0.0 | 0.0 | 0.0 | D |
| sofia-bulgaria | 1.2M | 42.6977, 23.3219 | Knyaz Alexander Dondukov Blvd. / highway:primary / Centre / Sofia | 0.0 | 0.0 | 0.0 | D |
| sapporo-japan | 2.0M | 43.0618, 141.3545 | 札幌市役所地下食堂 / amenity:restaurant / Odori-Nishi 2-chome / Sapporo | 0.0 | 0.0 | 0.0 | D |
| phoenix-usa (sprawl list) | 1.7M | 33.4484, -112.0740 | place:house / Downtown / Phoenix | 0.0 | 0.0 | 0.0 | D |
| new-york-usa (sprawl list) | 8.8M | 40.7128, -74.0060 | New York City Hall / amenity:townhall / Tribeca / New York | 0.0 | 0.0 | 0.0 | D |
| paris-france | 2.1M | 48.8566, 2.3522 | amenity:clock / 4th Arrondissement / Paris | 0.0 |  |  | D |
| erbil-iq | 1.6M | 36.1912, 44.0094 | فلکەی قەڵات / highway:residential / قەرات / Erbil | 0.0 | 0.0 | 0.0 | D |
| kyoto-japan | 1.5M | 35.0116, 135.7681 | 京都市役所 / amenity:townhall / Nakagyo Ward / Kyoto | 0.0 | 0.0 | 0.0 | D |
