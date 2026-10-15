# Pin re-anchor report (fixes 1 and 2, Opus, 2026-10-15)

Implements fixes 1 and 2 of `docs/pin-accuracy-review-opus.md`, as approved by Sean. Work done in-session by Claude Opus 5.5 (claude-run). Fresh start: the audit of git log and the tree found no prior work on these fixes (HEAD was the review commit `4d3f4d1`).

Every coordinate below was copied from a reference dataset row already in the review's data (`shots/pin-audit/audit4.json`: Wikidata P625, the QID-matched OSM place node, GeoNames rows). None came from memory and none were hand-approximated. New values are those reference values rounded to 5 decimals (about 1 m). Reverse geocodes are live Nominatim answers, cached in `scripts/pin-audit-cache.json` [measured].

## Commits

| commit | content |
|---|---|
| `d717071` | Fix 1: `assets/locations.json` lat/lng for 29 entries, plus per-entry anchor data in `docs/pin-reanchor-data.json` |
| `6b8ed0e` | Fix 2: `scripts/pin-audit.py` (promoted audit, 3 km gate) and its cache `scripts/pin-audit-cache.json` |
| this report | `docs/pin-reanchor-report.md` |

The skill file `~/workspace/custom-skills/local-where-on-earth-locations/SKILL.md` lives outside the demo repo and is **not git-tracked with the game**; it was edited in place (diff in the Fix 2 section).

## Fix 1: re-anchored pins

29 entries moved: all 24 likely-miss pins, plus 5 of the 10 ambiguous-centre pins. 5 ambiguous pins were left where they are (rulings below).

Anchor method per entry:
- Wikidata and the OSM place node agree within 2 km: the **midpoint** (13 entries). Exception: Ho Chi Minh City, where the two agree within 1.61 km but the midpoint reverse-geocodes onto a pedestrian bridge construction site on the Thu Thiem side of the Saigon River. The Wikidata point (District 1, Le Loi Street) was used instead, as the rule allows.
- Only Wikidata usable (no QID-matched OSM place node): the **Wikidata point** (Dubai, Bogota, Fatehpur Sikri, San Juan, Astana).
- References disagree, or the case rests on where players tap: chosen per entry, below.

### Per-entry table

Offsets are from `scripts/pin-audit.py` on the new data [measured]. "to anchor" is the distance from the new pin to its chosen anchor reference (0.00 because the pin IS the anchor value, rounded to 5 decimals). Class is the review's risk class A to D, before / after.

| id | old lat, lng | new lat, lng | anchor source | to anchor (km) | new d WD | new d OSM | class before / after | nearest other entry |
|---|---|---|---|---|---|---|---|---|
| muscat | 23.588889, 58.408333 | 23.61313, 58.59302 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.23 km) | 0.00 | 0.12 | 0.12 | A / D | al-ain-city 295.0 km |
| visakhapatnam | 17.68009, 83.20161 | 17.69372, 83.29218 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.04 km) | 0.00 | 0.02 | 0.02 | A / D | hyderabad-india 513.9 km |
| ho-chi-minh-city-vn | 10.82302, 106.62965 | 10.77556, 106.70194 | Wikidata P625 | 0.00 | 0.00 | 1.61 | A / D | can-tho-vn 129.3 km |
| xian-china | 34.3416, 108.9398 | 34.26106, 108.94228 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.02 km) | 0.00 | 0.01 | 0.01 | A / D | luoyang-cn 323.6 km |
| palembang-id | -2.91673, 104.7458 | -2.98608, 104.76065 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 1.04 km) | 0.00 | 0.52 | 0.52 | A / D | jakarta-indonesia 426.4 km |
| tashkent | 41.26465, 69.21627 | 41.31172, 69.27922 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.16 km) | 0.00 | 0.08 | 0.08 | A / D | shymkent 114.1 km |
| medina-saudi-arabia | 24.5247, 39.5692 | 24.47058, 39.61056 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.17 km) | 0.00 | 0.09 | 0.09 | A / D | jeddah-sa 334.2 km |
| riyadh | 24.68773, 46.72185 | 24.63862, 46.71551 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.12 km) | 0.00 | 0.06 | 0.06 | A / D | dammam-sa 394.2 km |
| brasilia-br | -15.77972, -47.92972 | -15.79394, -47.88279 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.01 km) | 0.00 | 0.01 | 0.01 | A / D | goiania-br 176.4 km |
| algiers | 36.73225, 3.08746 | 36.77466, 3.05873 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.38 km) | 0.00 | 0.19 | 0.19 | A / D | ibiza-es 276.9 km |
| majuro-marshall-islands | 7.0667, 171.2667 | 7.0914, 171.38092 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.18 km) | 0.00 | 0.09 | 0.09 | A / D | tarawa-kiribati 664.8 km |
| surrey-ca | 49.10635, -122.82509 | 49.1873, -122.84957 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 0.89 km) | 0.00 | 0.45 | 0.45 | A / D | vancouver-canada 22.4 km |
| toronto | 43.70643, -79.39864 | 43.66188, -79.3853 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 1.88 km) | 0.00 | 0.94 | 0.94 | B / D | mississauga-ca 23.8 km |
| baku | 40.37767, 49.89201 | 40.37112, 49.83399 | midpoint of Wikidata P625 and QID-matched OSM place node (agree within 1.01 km) | 0.00 | 0.51 | 0.51 | B / D | makhachkala-ru 348.7 km |
| ibiza-es | 38.9067, 1.4206 | 38.90883, 1.43296 | GeoNames row id 2516479 (Ibiza Town, PPLA3) | 0.00 | 7.92 | 7.38 | A / A | palma-de-mallorca 127.8 km |
| dubai | 25.07725, 55.30927 | 25.26972, 55.30944 | Wikidata P625 | 0.00 | 0.00 | n/a | A / D | sharjah-ae 12.6 km |
| bogota-colombia | 4.7111, -74.0722 | 4.60971, -74.08175 | Wikidata P625 | 0.00 | 0.00 | n/a | A / D | pereira-co 180.2 km |
| fatehpur-sikri | 27.1909, 77.67 | 27.09111, 77.66111 | Wikidata P625 | 0.00 | 0.00 | n/a | A / D | agra-in 36.6 km |
| san-juan | 18.406389, -66.063889 | 18.46528, -66.11667 | Wikidata P625 | 0.00 | 0.00 | n/a | A / D | basseterre-st-kitts-and-nevis 382.2 km |
| kinshasa-dr-congo | -4.4419, 15.2663 | -4.3197, 15.34242 | QID-matched OSM place node | 0.00 | 3.39 | 0.00 | A / C | brazzaville-cg 8.9 km (under 10) |
| astana-kz | 51.1801, 71.44598 | 51.13333, 71.43333 | Wikidata P625 | 0.00 | 0.00 | n/a | A / D | karagandy 189.4 km |
| ciudad-guayana-ve | 8.35122, -62.64102 | 8.32238, -62.68966 | Wikidata P625 | 0.00 | 0.00 | 0.00 | A / D | port-of-spain-trinidad-and-tobago 290.2 km |
| khartoum | 15.55177, 32.53241 | 15.60308, 32.52654 | Wikidata P625 | 0.00 | 0.00 | 4.48 | B / C | omdurman-sd 7.0 km (under 10) |
| manaus-br | -3.10194, -60.025 | -3.11889, -60.02167 | Wikidata P625 | 0.00 | 0.00 | 4.57 | B / C | porto-velho-br 760.2 km |
| hangzhou | 30.29365, 120.16142 | 30.25, 120.1675 | Wikidata P625 | 0.00 | 0.00 | 3.63 | B / C | suzhou-cn 124.1 km |
| tokyo-japan | 35.6762, 139.6503 | 35.67686, 139.76389 | QID-matched OSM place node | 0.00 | 6.67 | 0.00 | B / B | yokohama-jp 29.0 km |
| cartagena | 10.39817, -75.49328 | 10.42656, -75.54417 | QID-matched OSM place node | 0.00 | 2.09 | 0.00 | B / D | barranquilla-co 102.9 km |
| polonnaruwa-sri-lanka | 7.7409, 81.0184 | 7.93965, 81.00274 | GeoNames row (P1566 id 1229901) | 0.00 | 0.76 | n/a | A / D | colombo-sri-lanka 168.9 km |
| singapore | 1.3521, 103.8198 | 1.28967, 103.85007 | GeoNames row (name match within 50 km of Wikidata point, id 1880252) | 0.00 | 5.68 | 8.23 | B / A | johor-bahru 22.1 km |

Every one of the 24 likely-miss pins now sits under 5 km from its chosen anchor reference (0.00 km in all cases) [measured].

### Judgement calls among the 24 (choice and rejected alternative)

- **dubai**: Wikidata P625 (Naif, Deira, by the Creek: the historic and commercial core). No usable OSM centre: Nominatim's Dubai result is an unlinked boundary whose point is a polygon centroid (25.074, 55.189), rejected. Downtown Dubai (Burj Khalifa) is the other famous core, about 9 km south, but it is not in any reference dataset, so it was not used. Players who tap Burj Khalifa get Bullseye, not Pinpoint; that is the twin-core problem the review files under option 5.
- **kinshasa-dr-congo**: OSM place node (Gare, Gombe: the CBD). Rejected Wikidata (-4.32194, 15.31194, Aketi in Kinshasa commune, 3.39 km south of Gombe). Wikidata and OSM disagree by 3.39 km, so this was a judgement call; Gombe is the commercial core.
- **tokyo-japan**: OSM place node (Marunouchi, Chiyoda, beside Tokyo Station and Tokyo International Forum), per the brief's player-tap case for the eastern core. Rejected Wikidata (35.68944, 139.69167, Tokyo Metropolitan Government, Nishi-Shinjuku), 6.67 km west. Tokyo stays class B in the audit because the two references sit 6.67 km apart; a player who taps Shinjuku still misses Pinpoint, as the review predicted for any single anchor.
- **singapore**: GeoNames row 1880252 (North Bridge Road, City Hall, Civic District, Downtown Core), per the brief's Marina Bay downtown case. Rejected Wikidata (1.3, 103.8, an arc-minute rounded point at a Queenstown primary school) and the OSM place node (1.35711, 103.8195, Drongo Trail, Bishan, the island's middle, 0.56 km from the old pin). **Known consequence:** by the WD/OSM gate Singapore goes from class B to class A (5.68 km from Wikidata, 8.23 km from OSM) and is flagged by the 3 km gate. This is the only entry whose audit class worsened, and it is deliberate: both of those references are poor centres for Singapore (one rounded, one the island centroid in a nature reserve). Documented here so a later gate run does not "fix" it back.
- **cartagena**: OSM place node (India Catalina monument, La Matuna, at the gate of the walled city). Rejected Wikidata (10.42361, -75.52528, Calle 62, Paraiso II, a residential barrio about 2 km east). They disagree by 2.09 km.
- **polonnaruwa-sri-lanka**: GeoNames row 1229901 (P1566-linked). Rejected Wikidata (7.93333, 81.0) because it is stored at arc-minute precision (about 1.8 km); the two are 0.76 km apart and both reverse-geocode to Polonnaruwa town. No usable OSM centre (unlinked district boundary).
- **ibiza-es**: GeoNames row 2516479 (Ibiza Town, PPLA3; reverse geocode Passeig de Vara de Rey, s'Alamera, Ibiza). The entry's QID Q52631 is the **island**: its Wikidata point and OSM place node (place=island) sit inland in the island's middle (Santa Eularia and Sant Antoni municipalities), so both were rejected; the active set is cities only, so the pin marks Ibiza Town. The old pin (Can Canto) was already 1.1 km from Ibiza Town, so this was a small move. Ibiza stays class A and stays flagged by the gate because its only references describe the island; fixing the QID is out of scope.
- **ho-chi-minh-city-vn**: see the midpoint exception above.

### Ambiguous-centre pins: rulings

| id | ruling | anchor or reason |
|---|---|---|
| busan | **leave** | Stored point is Gukje Market / Nampo-dong in Jung-gu, the old downtown and port core. Wikidata and OSM agree on City Hall in Yeonje-gu (Yeonsan-dong), an administrative relocation 9.6 km away, not the core a player taps on imagery. The stored point is the better anchor. |
| ciudad-guayana-ve | **move** to Wikidata P625 (= OSM node, identical) | Stored point is a residential street in Chirica parish, southern San Felix, not the core of either half of the twin city. The references sit on the Puente Caroni between Puerto Ordaz and San Felix, the seam of the twin city. Reverse geocode: Puente Caroni, Municipio Caroni (the city's municipality). |
| astana-kz | **move** to Wikidata P625 | Stored point is on the right bank (Baikonur district residential). Wikidata is on the left bank, Esil district, the government and monument core the city is known for. No usable OSM centre. Wikidata is arc-minute precision, so this anchor is good to about 1 km. |
| jeddah-sa | **leave** | Stored point is Al-Balad, the historic core [judged]. Wikidata (Al Hamra Street) and OSM (Al Andalus) are 5.1 and 6.8 km north in newer districts. Stored is the better anchor. |
| chongqing-cn | **leave** | Stored point is Qixinggang on the Yuzhong peninsula, the CBD. Wikidata (Hualongqiao subdistrict, 5 km west, on the Yuzhong/Jiulongpo edge) is no better; OSM search returned a wrong entity. Stored is the better anchor. |
| khartoum | **move** to Wikidata P625 | Stored point is Al Nuzha, residential south of the airport; the OSM node (Al Diyum West) is also residential. Wikidata is Al Baladia Street, downtown by the Blue Nile. Rejected OSM, 4.48 km south. |
| batam-id | **leave** | Stored point is Bengkong, beside Nagoya (Lubuk Baja), Batam's old commercial core. Wikidata is the Batam Centre administrative roundabout (3.8 km) and OSM a junction in Taman Baloi (5.4 km). Neither is a better core, and the stored point is already under 5 km from Wikidata. |
| manaus-br | **move** to Wikidata P625 | Wikidata is Rua Silva Ramos, Centro (the historic centre). Stored was Chapada, 1.9 km north. Rejected OSM (Distrito Industrial I, 4.57 km east). |
| ciudad-juarez-mx | **leave** | The better reference is the OSM node in Centro (Avenida 16 de Septiembre), and the stored point is already 2.97 km from it, inside the 3 km gate. Moving it would gain little and would put it 2.2 km from the el-paso-usa pin across the border. Rejected Wikidata (Fraccionamiento Del Real, a southeastern subdivision 6.9 km out). |
| hangzhou | **move** to Wikidata P625 | Wikidata is Hubin, Shangcheng District, the West Lake shore core. Stored was a university campus 4.9 km north. Rejected OSM (Citizen Centre, Qianjiang New Town, 3.63 km east). |

### Check (i): reverse geocode of every moved pin

All 29 reverse-geocode into the same city [measured, Nominatim zoom 18, via `scripts/pin-audit.py --ids <the 29> --reverse`]:

```
  algiers: Algiers | L'Institut National de la Propriété Industrielle - INAPI, 24, Rue Larbi Ben M'Hidi, Ali Boumendjel, Emir Abdelkader, Alger-Centre, Algiers, Sidi M'Hamed District, Algiers, 16000, Algeria
  astana-kz: Astana | 34/2, Saraishyq Street, Esil district, Astana, 010000, Kazakhstan
  baku: Baku | Mərkəzi Univermaq, 6, Azerbaijan Avenue, Yasamal Raion, Baku, 1005, Azerbaijan
  brasilia-br: Brasília | Eixo Rodoviário, Setor Bancário Sul, Brasília, Plano Piloto, Federal District, Central-West Region, 70077-900, Brazil
  cartagena: Cartagena | India Catalina, Avenida Pedro de Heredia, La Matuna, Cartagena, Dique, Bolívar, RAP Caribe, 472000, Colombia
  ciudad-guayana-ve: Parroquia Dalla Costa | Puente Caroní, Avenida Guayana, Parroquia Dalla Costa, Municipio Caroní, Bolivar State, 8051, Venezuela
  dubai: Deira | Emirates NBD, Al Maktoum Hospital Road, Naif, Deira, Dubai Emirate, United Arab Emirates
  fatehpur-sikri: Fatehpur Sikri | Fatehpur Sikri, Kiraoli, Agra, Uttar Pradesh, 283110, India
  hangzhou: Shangcheng District | 中河高架路, 岳王路社区, Hubin, Shangcheng District, Hangzhou City, Zhejiang, 310009, China
  ho-chi-minh-city-vn: Ho Chi Minh City | Le Loi Street, Khu phố 5, Saigon, Ho Chi Minh City, 71016, Vietnam
  ibiza-es: Ibiza | 17, Passeig de Vara de Rey, s'Alamera, Ibiza, Balearic Islands, 07800, Spain
  khartoum: Khartoum | Al Baladia Street, Khartoum, Al Khartum State, 10934, Sudan
  kinshasa-dr-congo: Gare | Gare, Gombe, Kinshasa, Democratic Republic of the Congo
  majuro-marshall-islands: Majuro | Capitol Loop, Delap, Delap-Uliga-Darrit, Majuro, Ratak Chain, 96060, Marshall Islands
  manaus-br: Manaus | Rua Silva Ramos, Centro, Manaus, Amazonas, North Region, 69000-000, Brazil
  medina-saudi-arabia: Medina | Guiding the lost, Kind Fahd Road, Badaah, Medina, Al Madinah Al Munawwarah, Medina Province, 41419, Saudi Arabia
  muscat: Muscat | Block 182, Muscat, Muscat Province, Muscat Governorate, 940, Oman
  palembang-id: Palembang | 01, Ilir Timur I, Palembang, South Sumatra, 30124, Indonesia
  polonnaruwa-sri-lanka: Polonnaruwa | Polonnaruwa, Polonnaruwa District, North Central Province, 51000, Sri Lanka
  riyadh: Riyadh | Al Baraqeya, الفوطة, Al Futah, Riyadh, Riyadh governorate, Riyadh Region, 12643, Saudi Arabia
  san-juan: San Juan | La Perla, Viejo San Juan, San Juan, Puerto Rico, 00901, United States
  singapore: Singapore | North Bridge Road, City Hall, Civic District, Downtown Core, Central Region, Singapore, 179104, Singapore
  surrey-ca: Surrey | Central City Shopping Centre, 10153, King George Boulevard, City Centre, Surrey, Metro Vancouver Regional District, British Columbia, V3T 2W4, Canada
  tashkent: Kashgar mahalla | Square, Yunusabad district, Kashgar mahalla, 100000, Uzbekistan
  tokyo-japan: Chiyoda | Brooklyn Roasting Company Tokyo International Forum, 1, Marunouchi 3, Marunouchi, Chiyoda, Tokyo, 100-0005, Japan
  toronto: Toronto | Simon Apartments, 32, Grenville Street, Bay-Cloverhill, Toronto Centre, Toronto, Ontario, M5G 2J3, Canada
  visakhapatnam: Visakhapatnam | Old Head Post Office Road, Soldier Peta, Old Post Office Area, Visakhapatnam, Visakhapatnam Urban, Visakhapatnam District, Andhra Pradesh, 530001, India
  xian-china: Lianhu District | Bell Tower Roundabout, 社会路社区, Beiyuanmen, Lianhu District, Xi'an, Shaanxi, 710001, China
  bogota-colombia: Bogota | Carrera 19, UPZs de Bogotá, Localidad Los Mártires, Bogota, Bogota, Capital District, RAP (Especial) Central, 111411, Colombia
```
 Three answers name a district instead of the city in the `city` field but the address is in the city: tashkent (Yunusabad district, Kashgar mahalla, postcode 100000 Tashkent), xian-china (Lianhu District, Xi'an), ciudad-guayana-ve (Municipio Caroni, which is Ciudad Guayana).

### Check (ii): nearest other entry

Dataset spacing before the change [measured]: nearest-neighbour distance minimum 3.6 km, p5 27.2 km, median 156.4 km; 10 entries already had a neighbour under 10 km and 18 pairs were under 25 km (all twin cities or city-and-district pairs, e.g. ciudad-juarez-mx / el-paso-usa 4.9 km, brazzaville-cg / kinshasa-dr-congo 19.6 km).

Moved pins with a neighbour under 25 km after the move:

| id | nearest | distance after | before | ruling |
|---|---|---|---|---|
| kinshasa-dr-congo | brazzaville-cg | 8.9 km | 19.6 km | **FLAG under 10 km.** Twin capitals facing each other across the Congo River; Gombe is on the riverbank. Both are distinct capitals (allowed by the Step 3 twin-city rule). Accepted. |
| khartoum | omdurman-sd | 7.0 km | 11.9 km | **FLAG under 10 km.** Distinct twin cities at the Nile confluence; downtown Khartoum is on the Blue Nile bank. Accepted. |
| dubai | sharjah-ae | 12.6 km | 30.4 km | New pair under 25 km. Distinct emirates and cities; Deira borders Sharjah. Accepted. |
| surrey-ca | vancouver-canada | 22.4 km | 29.1 km | New pair under 25 km. Distinct cities. Accepted. |
| toronto | mississauga-ca | 23.8 km | 25.3 km | Distinct cities. Accepted. |
| singapore | johor-bahru | 22.1 km | 14.4 km | Distance increased. |

All other moved pins have their nearest neighbour 29 km or more away.

### Check (iii): audit re-run and distribution tables

`scripts/pin-audit.py` (the promoted analyze4 logic) on the pre-fix data reproduces the review exactly: the stored-vs-Wikidata and stored-vs-OSM rows match Section 3's table cell for cell and the classes are A 29, B 35, C 65, D 676, as in Section 4 [measured]. Then on the new data:

| comparison | data | n | < 0.5 km | 0.5-1 | 1-2 | 2-5 | 5-10 | 10-25 | >= 25 |
|---|---|---|---|---|---|---|---|---|---|
| stored vs Wikidata | before | 805 | 320 (320) | 137 (457) | 177 (634) | 130 (764) | 32 (796) | 8 (804) | 1 |
| stored vs Wikidata | after | 805 | 340 (340) | 141 (481) | 176 (657) | 127 (784) | 19 (803) | 1 (804) | 1 |
| stored vs OSM mapped centre | before | 685 | 254 (254) | 124 (378) | 144 (522) | 121 (643) | 28 (671) | 8 (679) | 6 |
| stored vs OSM mapped centre | after | 685 | 268 (268) | 126 (394) | 144 (538) | 124 (662) | 14 (676) | 3 (679) | 6 |
| stored vs nearest reference | before | 805 | 388 (388) | 135 (523) | 151 (674) | 102 (776) | 21 (797) | 8 (805) | 0 |
| stored vs nearest reference | after | 805 | 411 (411) | 138 (549) | 149 (698) | 97 (795) | 9 (804) | 1 (805) | 0 |

Cumulative counts in brackets. No cumulative cell went down in any row, and no tail cell went up: **no regression anywhere in the distribution** [measured]. The remaining >= 25 km cells are the review's known reference errors (Tianjin, Changsha and others), untouched.

Risk classes: before A 29, B 35, C 65, D 676; after **A 10, B 28, C 69, D 698**. Class transitions [measured]: 19 A to D, 3 B to D, 3 B to C (hangzhou, khartoum, manaus-br: the rejected OSM node is 3.6 to 4.6 km off), 1 A to C (kinshasa: rejected Wikidata 3.4 km off), 1 B to A (singapore, explained above). C rose by 4 only through those improvements; no D entry moved. Every other entry is unchanged (its pin did not move).

The 10 class A entries left: tarawa-kiribati, loch-ness, mexico-city-mexico, isle-of-skye-gb, kigali-rwanda (reference errors or area features per the review), busan, jeddah-sa, chongqing-cn (left by ruling), ibiza-es and singapore (deliberate, explained above).

### Diff scope

```
git diff --stat 4d3f4d1 d717071 -- assets/locations.json
 assets/locations.json | 116 +++++++++++++++++++++++++-------------------------
 1 file changed, 58 insertions(+), 58 deletions(-)
```
Programmatic check [measured]: same 805 ids in the same order, 29 entries differ, and for every entry the only differing keys are `lat` and `lng`. `assets/daily-pins.json` untouched by fix 1 (`git diff --quiet` clean before deploy).

## Fix 2: locations skill and the promoted gate script

### Skill changes (`~/workspace/custom-skills/local-where-on-earth-locations/SKILL.md`, not git-tracked)

Two surgical edits; no other section touched.

(a) New subsection after Step 1's prompt line, "Coordinate anchor rule (MANDATORY, Sean 2026-10-15)": a pin marks the historic or commercial core a well-informed player would tap (never a suburb, airport district, admin centroid or the middle of a sprawl); a GeoNames populated-place point is never accepted unchecked for a large city (1M+ or a known sprawl), with the Dubai and Visakhapatnam precedents; coordinates come from reference data, never model memory (Tokyo and Singapore precedents); pointer to this report.

(b) Step 6 replaced: "Coordinate audit (3 km gate)". A new or changed entry is flagged for manual review whenever it sits 3 km or more from EVERY independent reference (Wikidata P625 of its QID and the QID-matched OSM place node); flagging only, never auto-overwrite; on a flag, re-anchor or record why the stored point is the better anchor. (c) It names the command `python3 scripts/pin-audit.py --ids <ids> --reverse` and documents inputs (locations file, resolver QID files, cache), network use (Wikidata and Nominatim on cache misses only, 1.1 s Nominatim delay, `--offline`), outputs (tables, classes, flagged list, reverse geocodes, nearest neighbour, `--json`), exit codes, and the before/after no-regression rule for whole-dataset runs. The old 50 km Nominatim flag text is gone.

### Promoted script: `scripts/pin-audit.py`

- Adapted from `shots/pin-audit/analyze4.py`. Standard library only (json, urllib, math, argparse).
- References: Wikidata P625 (preferred rank, else first non-deprecated) of the entry's QID; QID from `scripts/difficulty/v2-data/resolved-v2.json` and `.batch1/.batch2/resolved-batch.json`, else the cached `qid:<id>`, else an en.wikipedia pageprops lookup. OSM centre: Nominatim search on the clue, used only when it is a place object or a boundary with `linked_place`, its `wikidata` tag equals the QID, and it lies within 50 km of the Wikidata point (the review's exact rules, including the unlinked-centroid exclusion).
- Gate: flags `dLo >= 3 km` (`--gate-km` to change). Exit 0 clean, 1 flagged, 2 missing reference.
- `--ids` gates only new or changed entries and prints each one's nearest other entry (under 10 km marked); `--reverse` reverse-geocodes each pin.
- Cache: `scripts/pin-audit-cache.json` (committed, about 450 KB). Compact answers only (no polygons). Seeded from the review's caches (`osm-cache.json`, `audit4.json`) so the whole-dataset run is offline; validated by reproducing the review's tables exactly.
- Difference from the review's "54 would flag" estimate: the review's 54 counted GeoNames as a third reference where it is not the stored point; the brief defines the gate on Wikidata and OSM only, which flags 68 on the pre-fix data and **44 after fix 1** (10 class A entries listed above, plus 34 entries 3 to 5 km from their nearest reference: the band the brief puts out of scope).

## Gates

### locations.json
- Valid JSON, 805 entries, diff limited to lat/lng of the 29 listed ids (diff stat and programmatic check in the Fix 1 section) [measured].
- `assets/daily-pins.json`: not touched by the fixes; `./deploy.sh`'s pin step reported "Pins unchanged" and committed nothing; md5 `22d8d5994d11db6b89cb37a31a8a7fee` before and after [measured].

### scripts/regression.sh (run on the fix 1 working tree, 2026-10-15)
```
PASS  Passport/Daily (passport/pp-shot.mjs)
PASS  Survival hub tap-through (passport/sh-verify.mjs)
PASS  PvP H2H 1: create (pvp/p1-home.mjs)
PASS  PvP H2H 2: join by link and code (pvp/p2-join.mjs)
PASS  PvP H2H 3a: invitee plays 5 rounds (pvp/p3-play.mjs invitee)
PASS  PvP H2H 3b: challenger plays, refresh + resume (pvp/p3-play.mjs challenger)
PASS  PvP H2H 4: result, share, rematch, open cap (pvp/p4-complete.mjs)
PASS  PvP H2H 5: worker offline (pvp/p5-offline.mjs)
PASS  PvP H2H 7: rename (pvp/p7-rename.mjs)
PASS  Open Challenge vs live worker (pvp/g-verify.mjs)
PASS  PvP layout measurements (pvp/layout-dump.mjs)
PASS  Baseline screenshots (baseline/baseline-shot.mjs)
ALL SUITES PASSED   (exit 0)
```
The baseline suite rewrote 6 PNGs under `shots/baseline/` (daily-round, group-lobby, home, passport, pvp-home, stats). They are left uncommitted for review, not part of these fixes.

### Deploy (`./deploy.sh` only)
```
Pinning in-play daily games from production...
In-play window at 2026-10-15T21:02:24.930Z: 2026-10-15, 2026-10-16, 2026-10-17
  (2026-10-12 .. 2026-10-17 all "already pinned")
Pins unchanged.
Deployment dpl_GyaF8gcDJn1x7bmcDsfZSnxisGSe: READY
Alias status: 200
Vendor (three.js): 200
Locations: 805 (expected 805)
Deploy successful
```

### Production checks [measured, after deploy]
- Vercel API `/v13/deployments/dpl_GyaF8gcDJn1x7bmcDsfZSnxisGSe`: readyState READY, aliases www.where-on.earth, where-on.earth.
- www.where-on.earth and where-on-earth-game.vercel.app both serve `main.js?v=8900627be3c5`.
- `https://www.where-on.earth/assets/locations.json`: 805 entries, byte-for-byte equal (parsed) to the repo file. Dubai 25.26972, 55.30944; Tokyo 35.67686, 139.76389; Singapore 1.28967, 103.85007; Kinshasa -4.3197, 15.34242; Cartagena 10.42656, -75.54417.
- `https://www.where-on.earth/assets/daily-pins.json`: md5 equal to the repo file; the deploy's pin step read every in-play date from production before shipping and found them all pinned and unchanged, so line-ups are the same.
- Note: cartagena is in the pinned daily line-ups for 2026-10-14 and 2026-10-17. The line-up is unchanged (ids only), but the 2026-10-17 round now scores against the new Cartagena pin (walled city), 6.4 km from the old one. Past results are not recomputed (the review noted history storage was not verified).

## Notes and loose ends
- Two pins are deliberately left flagged by the new gate because their only references are poor centres: singapore (arc-minute Wikidata point and island-middle OSM node) and ibiza-es (QID Q52631 is the island). A later fix could repoint ibiza-es's QID to Ibiza Town; out of scope here.
- Pre-existing untracked files in `assets/` (27 favicon PNGs, `locations-landmarks-backup.json`) are copied into every deploy by `deploy.sh`'s asset loop, as in previous deploys. Not touched.
- Pre-existing working-tree changes to `.gitignore` and `scripts/difficulty/v2-data/wd-cache.json` were not mine and were left uncommitted.

