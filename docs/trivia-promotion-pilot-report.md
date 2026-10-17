# Trivia promotion pilot (slice 0): report

Date: 2026-10-16. Done by Claude Opus 5.5, working directly in one session with no delegation. Plan: docs/trivia-promotion-recommendation-opus.md (approved by Sean 2026-10-16). This is slice 0 only. Nothing was deployed.

## Summary

- 30 held entries went through the gate chain: 10 from each thin band (9-10, 7-8, 3-4), taken in bank order from assets/trivia-bank.json at base commit 47cbe5e among entries without `photo === 'verified'`. None were skipped or swapped.
- **25 promoted, 5 held.** By band: 9-10 promoted 7 of 10, 7-8 promoted 8 of 10, 3-4 promoted 10 of 10.
- The losses fall into two kinds. **Wrong pins** (3 entries, gate 1): gurudongmar-lake, chiefs-island-moremi and anakena-beach have pins that do not mark the place, and this pass may not move pins. **No photograph of the place exists** (2 entries, gate 3): point-nemo (open ocean) and first-barcode-scan-troy-ohio (no photo of the Troy store). No entry failed at gate 2.
- The text gates changed 20 fields across 15 entries, all of them promoted entries. Gate 2 flagged 3 clues with named competitors, and all 3 were rewritten.
- Playable pool: 432 before, 457 after. By band (1-2, 3-4, 5-6, 7-8, 9-10): 159 / 73 / 116 / 70 / 39.
- Validation script: PASS. Trivia harness: 28 of 28.

## Method

- **Selection.** `scripts/trivia-promotion/pilot-list.mjs` derives the 30 ids from the bank at 47cbe5e. An earlier run of this dispatch had left `pilot.mjs` and `pilot.json` uncommitted in the same folder. I committed them with group 1 before I noticed they were from that run. Their 30 ids are identical to pilot-list.mjs's, so they agree with the selection; that run left no other work behind.
- **Gate 1, fact and clue**, under the fact pass's rules (docs/trivia-fact-pass-report.md). `fetch-wiki.mjs` is the fact pass's fetcher pointed at the pilot ids. It cached each entry's English Wikipedia article in `scripts/trivia-promotion/wiki-cache.json`, fetched 2026-10-16. Twelve automatic resolutions were wrong (for example Pantheon resolved to the Panthéon in Paris, the Sarajevo assassination to Mysia, the Webb swim to Normandy landings, the Manchester atom entry to Adam Rutherford) and were refetched by title. Event entries got their event article appended (for example First observation of gravitational waves, Universal Product Code, Latin Bridge). Every specific claim was searched in the cached text with `grep.mjs`. A claim stayed only if the article supports it; a fact was rewritten when it did not; a clue was rewritten only when it states something false. The article's coordinates were compared with the pin. An entry whose pin marks a different place fails, because the pilot may change only fact, clue, image and photo.
- **Gate 2, uniqueness**, under docs/trivia-uniqueness-report.md's rules: name a real place that fits every fact the clue states, or PASS. As in that pass, **the competitors are my own judgments from knowledge, not lookups.** Every discriminating fact used in a rewrite comes from the cached article. Rewrites keep the question word and roughly the length, never name the answer, and use zero em dashes.
- **Gate 3, photo.** `commons.mjs` searches Wikimedia Commons and downloads the 500px thumb. **I viewed every candidate image before giving a verdict** (method V for all 25 passes). Source order: public domain or CC0 when one is usable at the game's standard, otherwise CC BY, then CC BY-SA. Where a public-domain or CC0 candidate was passed over, the verdict says why (for example hazy, a distorted panorama, a plaque close-up, a slide border). `photo-meta.mjs` copied each chosen file's license, author and 500px thumb URL from the Commons API into the verdict record, so none of those were typed by hand. All 25 URLs returned an image (HTTP 200, image content type), and none is shared with any other bank entry. URL format: `https://thumb.wikimedia.org/wikipedia/commons/thumb/<a>/<ab>/<file>/500px-<file>`, the same as the 94 bank entries with untagged thumbs.
- **Recording.** Verdicts are in a sibling file, **docs/trivia-promotion-pilot-verdicts.json** (docs/trivia-photo-verdicts.json is unchanged). There is one record per entry: per gate PASS, FAIL or NOT RUN with the reason, the competitors at gate 2, the photo file, license, author, Commons page and searches at gate 3, and every text change with before, after and why. The records are built by `record.py` from hand-written `spec-group1.json` to `spec-group3.json`. record.py copies each `before` from the base bank, so a record cannot misquote the text it changes.
- **Applying.** `apply.mjs` edits only promoted entries, as text inside each entry's block: final fact and clue, new image, then `"photo": "verified"` after the image line. Held entries stay byte-identical. It can be rerun.
- **Banking.** One commit and push per band group, before the next group started.
- **Cost.** I did not time individual entries, so this pilot gives no measured per-entry cost. The commit clock on this VM does not give usable timings either. What it does show is where effort went. Photo search was the long step for moment sites (the Troy barcode needed 7 searches to rule out). City and landmark entries usually needed one search plus one view.

## The 30 entries

| # | Entry | Band (d) | Gate 1 fact | Gate 2 unique | Gate 3 photo | Promoted | Failure reason |
|---|---|---|---|---|---|---|---|
| 1 | `point-nemo` | 9-10 (9) | PASS | PASS | FAIL | no | gate 3: Open ocean with no marker: no photograph of the place exists on Commons. Every hit is a map or diagram (Oceanic pole of inaccessibility.png, Location of Point Nemo in the South Pacific Ocean.png, Distancia a la costa.png). |
| 2 | `gurudongmar-lake` | 9-10 (9) | FAIL | NOT RUN | NOT RUN | no | gate 1: Premise unsalvageable within this pass's allowed fields. The pin (32.2417, 78.8067) is 1,061 km from the article's lake in Sikkim (Wikidata Q2264090: 28.02, 88.71). |
| 3 | `first-barcode-scan-troy-ohio` | 9-10 (9) | PASS | PASS | FAIL | no | gate 3: No photograph of the Troy, Ohio Marsh store found. Commons has Marsh stores in Indianapolis, Nora and Lafayette, two unlocated 'Marsh Supermarket 01/02' (description gives no town), the Marsh logo, and Troy town photos that do not show the store. |
| 4 | `first-photograph-le-gras` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 5 | `first-traffic-signal-london` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 6 | `zodiac-lake-berryessa-attack` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 7 | `channel-swim-captain-webb` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 8 | `guadalupe-mx` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 9 | `acapulco-de-juarez-mx` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 10 | `brampton-ca` | 9-10 (9) | PASS | PASS | PASS | yes |  |
| 11 | `palace-of-culture-warsaw` | 7-8 (7) | PASS | PASS | PASS | yes |  |
| 12 | `little-bighorn-battlefield` | 7-8 (8) | PASS | PASS | PASS | yes |  |
| 13 | `chiefs-island-moremi` | 7-8 (7) | FAIL | NOT RUN | NOT RUN | no | gate 1: Premise unsalvageable within this pass's allowed fields. The pin (19.2833, 22.9) is in the northern hemisphere, 4,276 km from the Moremi Game Reserve article's coordinates. |
| 14 | `anakena-beach` | 7-8 (7) | FAIL | NOT RUN | NOT RUN | no | gate 1: The pin (-27.15, -109.4333) is 14 km from the article's beach, near Hanga Roa on the island's southwest corner, while Anakena is on the north coast. A pin move is outside this pass, so the entry stays held for a pin repair. |
| 15 | `gravitational-waves-ligo-hanford` | 7-8 (8) | PASS | PASS | PASS | yes |  |
| 16 | `first-atom-split-manchester` | 7-8 (8) | PASS | PASS | PASS | yes |  |
| 17 | `first-telephone-call-boston` | 7-8 (7) | PASS | PASS | PASS | yes |  |
| 18 | `first-film-screening-grand-cafe` | 7-8 (7) | PASS | PASS | PASS | yes |  |
| 19 | `migrant-mother-nipomo` | 7-8 (8) | PASS | PASS | PASS | yes |  |
| 20 | `star-wars-lars-homestead-interior` | 7-8 (7) | PASS | PASS | PASS | yes |  |
| 21 | `pantheon-rome` | 3-4 (4) | PASS | PASS | PASS | yes |  |
| 22 | `archduke-assassination-sarajevo` | 3-4 (4) | PASS | PASS | PASS | yes |  |
| 23 | `daegu-kr` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 24 | `nanchang-cn` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 25 | `queens-us` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 26 | `mashhad-ir` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 27 | `shaoxing-cn` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 28 | `nantong-cn` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 29 | `gaziantep-tr` | 3-4 (3) | PASS | PASS | PASS | yes |  |
| 30 | `lubumbashi-cd` | 3-4 (3) | PASS | PASS | PASS | yes |  |

## Pass rates

Each gate's rate counts only the entries that reached it.

| Band | Gate 1 fact | Gate 2 unique | Gate 3 photo | Promoted | Entries with text changes | Clues flagged at gate 2 |
|---|---|---|---|---|---|---|
| 9-10 | 9 of 10 (90%) | 9 of 9 (100%) | 7 of 9 (78%) | 7 of 10 (70%) | 4 | 0 |
| 7-8 | 8 of 10 (80%) | 8 of 8 (100%) | 8 of 8 (100%) | 8 of 10 (80%) | 6 | 1 |
| 3-4 | 10 of 10 (100%) | 10 of 10 (100%) | 10 of 10 (100%) | 10 of 10 (100%) | 5 | 2 |
| All | 27 of 30 (90%) | 27 of 27 (100%) | 25 of 27 (93%) | 25 of 30 (83%) | 15 | 3 |

Where the losses concentrate:
- **Pins, gate 1: 3 of 30 entries.** 1 of 10 in 9-10, 2 of 10 in 7-8, 0 in 3-4. They are unrelated data errors: a pin in the wrong hemisphere (Chief's Island, latitude sign), a pin on another region (Gurudongmar, known since the fact pass), and a pin on the wrong end of an island (Anakena, 14 km off). Each is a cheap fix (move the pin to the article's coordinates) in a pass that is allowed to change pins.
- **Photos, gate 3: 2 of 27 reaching it, both in 9-10, both obscure moment sites.** One has no visible place at all (Point Nemo). The other is a building that has no photograph on Commons (the Troy, Ohio Marsh store). The other six 9-10 moment sites passed, though three of their photos show the wider place rather than the exact spot: Lake Berryessa (the lake), Calais beach (the landing is only "near Calais"), and Nipomo (the researched field, documented but not recognisable by itself).
- **Text rewrites do not lose entries.** The pilot entries were in worse shape than the playable bank. Gate 1 rewrote 16 fields on 13 of the 27 entries that passed it (the fact pass corrected 37% of playable facts). Gate 2 flagged 3 of 27 (11%, against the uniqueness pass's 12%). All were salvageable.

## Before and after: every rewritten fact and clue

All 20 changes are on promoted entries, so all are applied to the bank. The validation script checks that the bank holds exactly the final `after` text.

| Entry | Gate | Field | Before | After | Why |
|---|---|---|---|---|---|
| `first-photograph-le-gras` | 1 | fact | Around 1826 or 1827, Niépce exposed a pewter plate for hours through an upstairs window at his estate, producing View from the Window at Le Gras. | In 1827, Niépce exposed a bitumen-coated pewter plate for hours, perhaps days, at a high window of his estate, producing View from the Window at Le Gras. | date and exposure length corrected to the article |
| `channel-swim-captain-webb` | 1 | fact | Webb swam from Dover to the Calais coast in nearly 22 hours in 1875, battling currents and jellyfish without a wetsuit. | Webb swam from Dover to the coast near Calais in nearly 22 hours in 1875, in a red silk costume, fighting currents and a jellyfish sting. | unsourced 'without a wetsuit' replaced with the article's red silk costume; 'Calais coast' made 'near Calais' as the article says |
| `guadalupe-mx` | 1 | clue | Which municipality beneath Cerro de la Silla is home to the BBVA football stadium and the cascading La Pastora park? | Which municipality beneath Cerro de la Silla is home to the BBVA football stadium and La Pastora park with its zoo? | 'cascading' not supported; replaced with the park's zoo from the article |
| `guadalupe-mx` | 1 | fact | Guadalupe is part of greater Monterrey and holds Estadio BBVA, the home of the Rayados football club. | Guadalupe is part of greater Monterrey and holds the BBVA Stadium, where Liga MX club Monterrey plays its home games. | 'Rayados' not in the source; club named as the article names it |
| `brampton-ca` | 1 | clue | Which city northwest of Toronto is known for its extraordinary South Asian community and large Sikh gurdwaras? | Which Canadian city, once called the Flower Town of Canada for its greenhouses, now has a South Asian majority? | unsupported gurdwara claim removed; relative-compass phrase cut; sourced Flower Town and 2021 census facts used |
| `brampton-ca` | 1 | fact | Brampton is a fast-growing city near Toronto with one of Canada's largest South Asian communities. | Brampton is part of the Greater Toronto Area, and people of South Asian origin made up 52.4% of its population in 2021. | 'fast-growing' not in the source; census figure from the article |
| `palace-of-culture-warsaw` | 1 | fact | The Palace of Culture was sent by Stalin to Poland in 1955 as a gift, its construction materials shipped in from 168 Soviet locations. | The Palace of Culture was a Soviet gift to the people of Poland, completed in 1955 by thousands of Soviet and Polish workers and first dedicated to Stalin. | unsupported '168 Soviet locations' and 'sent by Stalin' replaced with the article's construction facts |
| `gravitational-waves-ligo-hanford` | 2 | clue | Where was the first direct detection of gravitational waves made as twin detectors registered colliding black holes? | Where in Washington state did one of LIGO's twin detectors make the first direct detection of gravitational waves, from colliding black holes? | Livingston also fits the old clue; state added to make it one place |
| `first-atom-split-manchester` | 1 | clue | Where did Ernest Rutherford's team first split the atomic nucleus in 1917? | Where did Ernest Rutherford first induce a nuclear reaction, by bombarding nitrogen with alpha particles in 1917? | 'first split the atomic nucleus' is credited to Cockcroft and Walton in 1932; rewritten to the article's 1917 claim |
| `first-atom-split-manchester` | 1 | fact | At the University of Manchester, Rutherford bombarded nitrogen with alpha particles and identified emitted hydrogen nuclei, the first artificial transmutation of an element. | At the University of Manchester, Rutherford bombarded nitrogen with alpha particles and saw it eject hydrogen nuclei, the first artificially induced nuclear reaction. | worded to the article's 'first artificially induced nuclear reaction' |
| `first-telephone-call-boston` | 1 | fact | Bell spoke the famous request in his Boston laboratory on March 10, 1876. The original building is gone, but a plaque near the site records the call. | Bell spoke 'Mr. Watson, come here, I want to see you' on March 10, 1876, in rooms above the Palace Theatre at 109 Court Street. | unsourced plaque and demolition claims replaced with the article's address and wording |
| `first-film-screening-grand-cafe` | 1 | clue | Where did the Lumière brothers stage the first commercial public film screening in 1895? | Where did the Lumière brothers hold their own first commercial public film screening, in December 1895? | earlier commercial screenings by others are in the article; made the Lumières' own first |
| `star-wars-lars-homestead-interior` | 1 | fact | A traditional underground Berber dwelling in Matmata became the Lars homestead dining room. Its Star Wars decorations have been restored for visitors. | The Hotel Sidi Driss, a traditional Berber troglodyte home dug into the ground at Matmata, was filmed as the Lars home in 1976 and again for a 2002 prequel. | unsourced dining-room and restoration claims replaced with the article's filming facts |
| `pantheon-rome` | 1 | fact | The Panthe's oculus is one 43-metre hole cut in the dome and the only light the interior gets, so rain falls straight onto the marble floor. | The height to the Pantheon's oculus equals the rotunda's 43-metre width, and the oculus and the door are the interior's only natural light. | 43 m belongs to the rotunda, not the oculus; rain claim unsourced; typo fixed |
| `pantheon-rome` | 2 | clue | Where does an ancient domed rotunda with a single oculus open onto the sky? | Where does an ancient Roman dome, still the world's largest of unreinforced concrete, open to the sky through an oculus? | Baiae's Temple of Mercury also fits the old clue; record-size dome added |
| `queens-us` | 1 | fact | Queens is often called the most ethnically diverse urban area on Earth, with well over 100 languages spoken. | Queens is called the most linguistically diverse place in the world, and about 47% of its residents were born abroad. | superlative corrected to the article's; unsourced language count replaced |
| `mashhad-ir` | 1 | fact | Mashhad is Iran's holiest city, home to the vast shrine of Imam Reza that draws millions of pilgrims each year. | Mashhad holds the shrine of Imam Reza, the most pilgrimaged site in Islam, visited by nearly 30 million people each year. | unsourced 'holiest city' replaced with the article's pilgrimage figure |
| `shaoxing-cn` | 1 | fact | Shaoxing is a canal town famous for its amber rice wine and as the hometown of writer Lu Xun. | Shaoxing gives its name to Shaoxing wine, China's famous rice wine, and is the birthplace of the writer Lu Xun. | unsourced 'canal town' and 'amber' removed |
| `lubumbashi-cd` | 2 | clue | Which copper-belt city has a courthouse and cathedral from its colonial mining era and streets shaded by jacaranda trees? | Which mining city, founded under Belgian rule as Élisabethville, is now the DR Congo's second-largest? | generic Copperbelt clue; former name and rank make it one place |
| `lubumbashi-cd` | 2 | fact | Lubumbashi is the copper-mining capital of the DR Congo's Katanga region, founded by Belgian colonists as Élisabethville. | Lubumbashi is the capital of Haut-Katanga Province and the hub of a regional copper mining industry. | reworded so it does not repeat the new clue's former name |

## Gate 2: competitors considered

| Entry | Gate 2 | Competitors named | Note |
|---|---|---|---|
| `point-nemo` | PASS | none | Considered the northern pole of inaccessibility on the Arctic pack ice: it is farthest from land only within the Arctic Ocean, so it does not fit 'the point in the ocean farthest from any land'. No competitor fits. |
| `first-barcode-scan-troy-ohio` | PASS | none | Only one first retail UPC scan; no competitor fits. |
| `first-photograph-le-gras` | PASS | none | Names Niépce and the oldest surviving camera photograph; only Le Gras fits. |
| `first-traffic-signal-london` | PASS | none | Year 1868 and 'world's first' rule out later firsts such as the 1914 electric signal in Cleveland. |
| `zodiac-lake-berryessa-attack` | PASS | none | Considered the Lake Herman Road shootings (also Zodiac, also students): a roadside shooting in a car, no hood, not beside the lake. Only Berryessa fits every stated fact. |
| `channel-swim-captain-webb` | PASS | none | Names Webb and the first unaided Channel swim; no competitor. |
| `guadalupe-mx` | PASS | none | Cerro de la Silla plus BBVA Stadium: Monterrey municipality claims the hill as its icon but the article places both in Guadalupe, and the stadium is only in Guadalupe. |
| `acapulco-de-juarez-mx` | PASS | none | La Quebrada's divers are only in Acapulco. |
| `brampton-ca` | PASS | none | Considered Surrey, BC and Mississauga: large South Asian communities but not majorities, and neither was the Flower Town of Canada. |
| `palace-of-culture-warsaw` | PASS | none | Considered Moscow's Seven Sisters and the Latvian Academy of Sciences in Riga: Stalin-era towers, but none was a Soviet gift to another country. |
| `little-bighorn-battlefield` | PASS | none | 'Custer's Last Stand' names one battle. |
| `gravitational-waves-ligo-hanford` | PASS (rewritten) | LIGO Livingston Observatory, Louisiana (the other twin detector, same first detection) | Flagged: the old clue fits both twin detectors. Rewritten with a location word to rule out Livingston, following the uniqueness pass's precedent ('Tanzanian grassland'). The article places Hanford on the DOE Hanford Site in Washington. |
| `first-atom-split-manchester` | PASS | none | Considered the Cavendish Laboratory, Cambridge (Cockcroft and Walton's 1932 split): it does not fit 1917 or nitrogen. |
| `first-telephone-call-boston` | PASS | none | Considered 5 Exeter Place, Bell's house, where earlier line tests ran: the source puts the 'come here' call at 109 Court Street, so the clue fits one place. |
| `first-film-screening-grand-cafe` | PASS | none | One event, one room; the Lumières' earlier 1895 shows were not commercial. |
| `migrant-mother-nipomo` | PASS | none | Names one photograph. |
| `star-wars-lars-homestead-interior` | PASS | none | Considered the Lars homestead exterior set at Chott el Djerid: the clue asks for the interior scenes, which only Sidi Driss fits. |
| `pantheon-rome` | PASS (rewritten) | Temple of Mercury, Baiae (ancient Roman domed rotunda open to the sky through an oculus) | Flagged: the old clue fits other ancient domed rotundas with an oculus. Rewritten with the article's 'world's largest unreinforced concrete dome'. |
| `archduke-assassination-sarajevo` | PASS | none | One assassination; the clue names it. |
| `daegu-kr` | PASS | none | Apples, textiles and the Yangnyeongsi market together fit only Daegu. |
| `nanchang-cn` | PASS | none | 'Jiangxi capital' names one city. |
| `queens-us` | PASS | none | The Unisphere stands only in Queens. |
| `mashhad-ir` | PASS | none | The shrine of Imam Reza is in Mashhad only. |
| `shaoxing-cn` | PASS | none | Lu Xun plus the rice wine fit only Shaoxing. |
| `nantong-cn` | PASS | none | The Hao River ring is Nantong's own. |
| `gaziantep-tr` | PASS | none | Considered Sanliurfa: no Zeugma mosaics or Antep pistachio. Only Gaziantep fits all four. |
| `lubumbashi-cd` | PASS (rewritten) | Ndola, Zambia (Copperbelt city with colonial-era civic buildings and jacaranda streets); Kitwe, Zambia; Likasi, DR Congo (colonial copper-mining town) | Flagged: the old clue is a generic Copperbelt description. Clue rewritten with the article's former name and rank. The fact was reworded so it no longer repeats the new clue's Elisabethville. |

## Photo sources and licenses

License mix of the 25 photos: public domain 6, CC0 4, CC BY 8 (2.0: 4, 2.5: 1, 4.0: 3), CC BY-SA 7 (2.0: 2, 4.0: 5). The 15 CC BY and CC BY-SA photos need attribution if the game ever credits images. The author and license are in each verdict record.

| Entry | Commons file | License | Author |
|---|---|---|---|
| `first-photograph-le-gras` | [Saint-Loup-de-Varennes. Le Gras. Maison où Nicéphore Niépce inventa la photographie - btv1b10848908v.jpg](https://commons.wikimedia.org/wiki/File:Saint-Loup-de-Varennes._Le_Gras._Maison_o%C3%B9_Nic%C3%A9phore_Ni%C3%A9pce_inventa_la_photographie_-_btv1b10848908v.jpg) | Public domain | Petiot-Groffier, Fortuné Joseph (1788-1855). Photographe, auteur du modèle |
| `first-traffic-signal-london` | [London - Westminster - Bridge Street & Houses of Parliament - geograph.org.uk - 1785067.jpg](https://commons.wikimedia.org/wiki/File:London_-_Westminster_-_Bridge_Street_%26_Houses_of_Parliament_-_geograph.org.uk_-_1785067.jpg) | CC BY-SA 2.0 | Lewis Clarke |
| `zodiac-lake-berryessa-attack` | [Lake Berryessa AW.jpg](https://commons.wikimedia.org/wiki/File:Lake_Berryessa_AW.jpg) | CC0 | Alex Wild |
| `channel-swim-captain-webb` | [Calais beach 2012.jpg](https://commons.wikimedia.org/wiki/File:Calais_beach_2012.jpg) | CC BY-SA 4.0 | Nilfanion |
| `guadalupe-mx` | [Estadio BBVA Bancomer (1).jpg](https://commons.wikimedia.org/wiki/File:Estadio_BBVA_Bancomer_(1).jpg) | CC BY 2.0 | Presidencia de la República Mexicana |
| `acapulco-de-juarez-mx` | [Santa Lucia Bay in Acapulco, Mexico.jpg](https://commons.wikimedia.org/wiki/File:Santa_Lucia_Bay_in_Acapulco,_Mexico.jpg) | CC BY 2.0 | Nam from D-Block, USA |
| `brampton-ca` | [Brampton Town Centre Main St 2021.jpg](https://commons.wikimedia.org/wiki/File:Brampton_Town_Centre_Main_St_2021.jpg) | CC BY 4.0 | Canmenwalker |
| `palace-of-culture-warsaw` | [Palace of Culture and Science, 2026, Warsaw, Poland.jpg](https://commons.wikimedia.org/wiki/File:Palace_of_Culture_and_Science,_2026,_Warsaw,_Poland.jpg) | CC BY 4.0 | Igor123121 |
| `little-bighorn-battlefield` | [Visitors Walking to Last Stand Hill (6a3e6cef-1dd8-b71b-0b42-3db0575b20b8).jpg](https://commons.wikimedia.org/wiki/File:Visitors_Walking_to_Last_Stand_Hill_(6a3e6cef-1dd8-b71b-0b42-3db0575b20b8).jpg) | Public domain | NPS |
| `gravitational-waves-ligo-hanford` | [LIGO Hanford aerial 05.jpg](https://commons.wikimedia.org/wiki/File:LIGO_Hanford_aerial_05.jpg) | Public domain | LIGO Laboratory |
| `first-atom-split-manchester` | [Rutherford Building.jpg](https://commons.wikimedia.org/wiki/File:Rutherford_Building.jpg) | CC BY-SA 4.0 | Doctorneroli |
| `first-telephone-call-boston` | [Birthplace of the First Telephone, Boston, MA - IMG 7007.JPG](https://commons.wikimedia.org/wiki/File:Birthplace_of_the_First_Telephone,_Boston,_MA_-_IMG_7007.JPG) | Public domain | Daderot |
| `first-film-screening-grand-cafe` | [Plaque Lumière2.jpg](https://commons.wikimedia.org/wiki/File:Plaque_Lumi%C3%A8re2.jpg) | Public domain | Tangopaso |
| `migrant-mother-nipomo` | [NipomoLocationOfMigrantMotherPhotoJan52025.jpg](https://commons.wikimedia.org/wiki/File:NipomoLocationOfMigrantMotherPhotoJan52025.jpg) | CC0 | AlmanacHobbyist |
| `star-wars-lars-homestead-interior` | [Hotel Sidi Driss-underground view only.jpg](https://commons.wikimedia.org/wiki/File:Hotel_Sidi_Driss-underground_view_only.jpg) | CC BY 2.0 | Neil Rickards from Cambridge, England |
| `pantheon-rome` | [Pantheon (Rome), Dome interior.jpg](https://commons.wikimedia.org/wiki/File:Pantheon_(Rome),_Dome_interior.jpg) | CC0 | Wilfredor |
| `archduke-assassination-sarajevo` | [Latin bridge in Sarajevo 2012.jpg](https://commons.wikimedia.org/wiki/File:Latin_bridge_in_Sarajevo_2012.jpg) | CC0 | Tumi-1983 |
| `daegu-kr` | [Yangnyeongsi (Daegu) 20221126 001.jpg](https://commons.wikimedia.org/wiki/File:Yangnyeongsi_(Daegu)_20221126_001.jpg) | CC BY-SA 4.0 | Mobius6 |
| `nanchang-cn` | [Tengwang Pavilion, Nanchang.jpg](https://commons.wikimedia.org/wiki/File:Tengwang_Pavilion,_Nanchang.jpg) | CC BY-SA 4.0 | Ashish Yadav |
| `queens-us` | [Flushing Meadows Corona Park Unisphere 001.jpg](https://commons.wikimedia.org/wiki/File:Flushing_Meadows_Corona_Park_Unisphere_001.jpg) | CC BY-SA 4.0 | Kidfly182 |
| `mashhad-ir` | [The Golden Dome of Imam Reza shrine - 21 March 2018 (13970101 0339269).jpg](https://commons.wikimedia.org/wiki/File:The_Golden_Dome_of_Imam_Reza_shrine_-_21_March_2018_(13970101_0339269).jpg) | CC BY 4.0 | khamenei.ir |
| `shaoxing-cn` | [Shaoxing.jpg](https://commons.wikimedia.org/wiki/File:Shaoxing.jpg) | CC BY 2.0 | Taco Witte |
| `nantong-cn` | [City of Nantong and the River Hao.jpg](https://commons.wikimedia.org/wiki/File:City_of_Nantong_and_the_River_Hao.jpg) | Public domain | Jwzjwz2003cn (talk) (Uploads) |
| `gaziantep-tr` | [Gaziantep Castle in 2018.jpg](https://commons.wikimedia.org/wiki/File:Gaziantep_Castle_in_2018.jpg) | CC BY-SA 2.0 | William John Gauthier |
| `lubumbashi-cd` | [Downtown Lubumbashi, Democratic Republic of the Congo - 20061130.jpg](https://commons.wikimedia.org/wiki/File:Downtown_Lubumbashi,_Democratic_Republic_of_the_Congo_-_20061130.jpg) | CC BY 2.5 | Oasisk. |

Judgment calls for the reviewer:
- `first-photograph-le-gras` uses an archival public-domain photograph of the house (a scan with its mount border and a pencilled inventory number), chosen over clearer CC BY-SA modern views under the public-domain-first rule.
- `first-telephone-call-boston` and `first-film-screening-grand-cafe` show commemorative markers at the site (a monument, and a hotel entrance with the plaque), so the reveal shows text. It appears only after the guess.
- `migrant-mother-nipomo` shows a field documented as the photo site. It is real and correctly placed, but it does not say much on its own.
- `first-telephone-call-boston`: the source puts the 1876 call at 109 Court Street, and the entry follows it. Other accounts place it at Bell's rooms on Exeter Place. The monument marks the 109 Court Street site.

## Projection for slices 1 to 3

Built only from the pilot's measured promotion rates per band (n = 10 per band). The ranges are 95% Wilson intervals on those rates. Ten entries per band is a small sample, so the ranges are wide.

| Slice | Band | Pool now | Target | Measured rate | Entries to run | Expected yield | Candidates left |
|---|---|---|---|---|---|---|---|
| 1 | 9-10 | 39 | all held (no surplus) | 7 of 10 (40% to 89%) | 127 | about 89 (51 to 113) | 127 |
| 2 | 7-8 | 70 | 150 (80 more) | 8 of 10 (49% to 94%) | about 100 (85 to 163) | 80 | 173 |
| 3 | 3-4 | 73 | 150 (77 more) | 10 of 10 (72% to 100%) | about 77 (77 to 107) | 77 | 273 |

- Slices 1 to 3 together: about 304 entries run (289 to 397).
- Expected pool after slice 3: 1-2: 159; 3-4: 150; 5-6: 116; 7-8: 150; 9-10: about 128 (90 to 152). Total about 703.
- Where the losses will concentrate: in 9-10, obscure moment sites at gate 3 (2 of 9 that reached it) plus pins (1 of 10). In 7-8, pins (2 of 10). In 3-4, the pilot lost nothing. Even at the low end of each range, 7-8 and 3-4 reach 150 from the candidates left.
- A pin check ahead of slice 1 would turn most gate-1 losses into promotions. The check is mechanical: compare each held entry's pin with its Wikipedia or Wikidata coordinates. It would need Sean's approval, because those passes may not change pins. The pilot cannot measure how many held entries have wrong pins beyond these 3 of 30.

## Playable pool per band after the pilot

| Band | 1-2 | 3-4 | 5-6 | 7-8 | 9-10 | Total |
|---|---|---|---|---|---|---|
| Before (47cbe5e) | 159 | 63 | 116 | 62 | 32 | 432 |
| After the pilot | 159 | 73 | 116 | 70 | 39 | 457 |

## Validation

`node scripts/trivia-promotion/validate.mjs` (can be rerun; it diffs the bank against 47cbe5e). It checks:
- the same entries in the same order, with changes only on the 30 pilot entries;
- on those, only fact, clue, image and photo changed;
- every byte outside the pilot entries' blocks is identical to the base;
- the flags added exactly match the verdicts' promoted list, and no flag was removed;
- the bank text equals the verdicts' final text, and held pilot entries are unchanged;
- gate bookkeeping: a FAIL needs a reason, NOT RUN needs an earlier FAIL, a gate-2 rewrite needs named competitors, and a photo PASS needs a file, license, author and URL;
- new images are unshared 500px Commons thumbs;
- zero em dashes in the changed text, the verdicts file and this report;
- counts reconcile.

Output:

```
base 47cbe5e; pilot entries 30 (9-10: 10, 7-8: 10, 3-4: 10)
verdict records 30; entries changed 25; flags added 25; promoted 25
playable before 432, after 457, after minus flags added 432
playable per band (1-2, 3-4, 5-6, 7-8, 9-10): before 159 / 63 / 116 / 62 / 32; after 159 / 73 / 116 / 70 / 39
PASS: all checks
```

## Trivia harness

`shots/trivia/trivia-shot.mjs`, run from shots/trivia with Playwright linked in from ~/workspace/map-game/shots/hub-landmarks/node_modules (the same method as the repair pass; I removed the link afterwards). The copy at ~/workspace/map-game/shots/passport/trivia-shot.mjs is stale: it has 27 checks and the pre-flag playable rule. I started it by mistake, then stopped it before it finished, and did not use its output.

Result: **28 of 28 checks pass**, bank 1,303 entries, playable 457. The hub shows the enlarged pool ("457 clues · Best 3,013"). The drawn targets were rottnest-island (d2), sensoji-temple (d4), hoi-an (d5), hunga-tonga-2022-eruption (d7) and isdal-woman-discovery (d10). The harness draws at random and none of these are pilot entries, so the harness proves that the enlarged pool plays and that every drawn target is flagged. It does not render a pilot entry's reveal. The validator covers the pilot entries' data. shots/trivia/harness-result.json and the five screenshots are from this run.

```
{
 "passed": 28,
 "of": 28,
 "checks": {
  "hubTriviaLive": true,
  "hubPhotoComingSoon": true,
  "hubOrder": true,
  "fiveRounds": true,
  "everyRoundClue": true,
  "noNameBeforeGuess": true,
  "noPhotoBeforeGuess": true,
  "photoAtReveal": true,
  "revealNamesPlace": true,
  "targetsInBank": true,
  "targetsVerified": true,
  "noRepeatTarget": true,
  "bandSpread": true,
  "lastNextIsResults": true,
  "resultsTotal": true,
  "resultsLines": true,
  "bestKeyHolds": true,
  "shareTrivia": true,
  "passportUnchanged": true,
  "onlyNewKey": true,
  "hubShowsBest": true,
  "playAgain": true,
  "bestIsMax": true,
  "leaveConfirm": true,
  "landmarksScreenRestored": true,
  "codeBankOnly": true,
  "noPageErrors": true,
  "noHorizontalScroll": true
 },
 "bankEntries": 1303,
 "playable": 457,
 "hubAfter": "457 clues · Best 3,013",
 "targets": [
  "rottnest-island (d2)",
  "sensoji-temple (d4)",
  "hoi-an (d5)",
  "hunga-tonga-2022-eruption (d7)",
  "isdal-woman-discovery (d10)"
 ],
 "errs": []
}
```

## Files

- assets/trivia-bank.json: 25 entries promoted (fact, clue, image, photo only).
- docs/trivia-promotion-pilot-verdicts.json: 30 verdict records.
- scripts/trivia-promotion/: pilot-list.mjs, fetch-wiki.mjs, grep.mjs, commons.mjs, photo-meta.mjs, record.py, spec-group1.json to spec-group3.json, apply.mjs, validate.mjs, report-tables.py, report-template.md, wiki-cache.json, plus the earlier run's pilot.mjs and pilot.json.
- shots/trivia/: harness-result.json and screenshots from the harness run.

## Commits

| Commit | Content |
|---|---|
| 770481b | Group 1, band 9-10: 7 promoted, 3 held |
| 8c16951 | Group 2, band 7-8: 8 promoted, 2 held |
| 12d7eba | Group 3, band 3-4: 10 promoted |
| (this commit) | Report, harness result and screenshots |
