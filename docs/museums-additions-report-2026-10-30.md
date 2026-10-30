# Museums additions report, 2026-10-30

Chunk 5 of the pack additions program: the 15 approved "glaring" museums
(Sean, 2026-10-30; the strong tier was NOT approved and nothing beyond the 15
was added). Executed per `.build-tmp/museums-brief.md` in the
`woe-adds-museums` worktree at db6a4dc. Not committed, not pushed, not
deployed.

## Outcome

- **15 museums added** to `assets/locations-landmarks-sol.json` as kind
  `landmark` point entries (the bank's point-entry kind, as in chunks 1-4),
  appended in target order; the git diff on the bank is additions only
  (240 insertions, 0 deletions).
- Bank 455 → **470**. Pools measured with the game's own helpers
  (`landmarkPackPool` / `landformPackPool` from `src/meta/pack-store.js`):
  **Capitals 207 (unchanged), Landmarks 208 → 223, Landforms 206
  (unchanged), combined 621 → 636.**
- Suite: **83/83** (`node --test test/*.test.mjs`). Three test files changed,
  hardcoded counts/pins only; listed in the test-changes section below.
- All 15 photo URLs re-verified live at build time: HTTP 200, image/jpeg,
  and unique across cities + bank + quarantine both as full URLs and as
  underlying Commons file names.

## Method notes

- Coordinates: Wikidata P625 for each museum's own entity. Every QID was
  resolved by entity search (never recalled): the first Louvre query
  returned no hits and was retried with a shorter form (Q19675); the Uffizi
  has two candidate entities and Q51252, the palace-and-museum entity, was
  used; the NASM institution Q752669 and its separate building entity agree
  to 2e-6 degrees. Pins rounded to 4 dp, bank style.
- Pin audit: `python3 scripts/pin-audit.py --locations
  assets/locations-landmarks-sol.json --ids <15 ids> --reverse`. **GATE:
  0 flagged at ≥ 3 km.** The audit independently resolved the same QID for
  12 of 15 and measured stored-vs-Wikidata deltas of 0.002 to 0.006 km
  (rounding only); all 12 are risk class D. Its name-based lookup found no
  QID for 3 (natural-history-museum-london, uffizi-galleries,
  guggenheim-new-york); those pins rest on the entity-search QIDs in their
  sections, and their reverse geocodes land on the exact museum addresses.
  All 15 reverse geocodes resolve to the museum itself or its street.
- Difficulty: the adapted v2, a faithful reimplementation of the frozen
  `score_v2.py` math (same GeoNames cities15000 population centres, same
  cuts [4.7, 7.0, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7], K = 0 for all
  seven countries, none in the approved K table). The frozen
  `cities15000.txt` exists only in the demo tree, so the loader read it
  from there; everything else ran in this worktree. Cross-check that the
  reimplementation matches the bank's stored scorer runs: the Statue of
  Liberty stores fb1676/iso18 and the Lincoln Memorial fb1425/iso201; the
  new pins beside them compute fb1681-1683/iso15-16 (New York) and
  fb1428/iso199 (Washington). Pageviews: Wikimedia REST, article level,
  trailing 12 complete months (2025-10 to 2026-09); mean = total/365,
  median = median of the 12 monthly daily rates. On a mean/median band
  disagreement the median band is adopted and recorded (3 spike rescores,
  below). Vatican City has no GeoNames fallback centre; the fallback is
  the pin itself (fb0), the stored St Peter's Basilica precedent.
- Photos: Commons candidates surveyed per museum with license and author
  from file-page extmetadata. Every finalist was downloaded, viewed on
  labeled contact sheets, and its center square crop viewed on a combined
  crop sheet; all 15 survive the crop. None of the 15 is its Wikipedia
  article's page image (the page image is named in each section). Local
  copies of the 15 used photos are in `.batch-museums/` as
  `<id>-final.jpg`. Stored URLs are the clean 500px `thumb.wikimedia.org`
  form (utm tracking params stripped).
- Sets: none assigned. There is no Museums set in the bank, and the two
  museum cards already in the pool (Museo del Prado, Guggenheim Bilbao)
  both carry `sets: []`.
- Clues follow the brief's "Name, Country" convention, with the bank's
  existing London convention for the four London entries (country England,
  England flag, as on Tower Bridge and Westminster Abbey). US clues name
  no state, per the landmarks rule.
- Dedupe: by id AND diacritics-stripped normalized short name across
  cities (804), bank (455), and quarantine (116): **zero hits**, and no
  near matches. The Vatican Museums are a distinct entry from the existing
  `st-peters-basilica` card (0.5 km away), as the brief intends.

## Per-museum entries

### louvre-museum — Louvre Museum, France 🇫🇷
- QID Q19675, pin 48.8611, 2.3358. Pin audit Δ 0.003 km, risk class D. Reverse: Place du Musée du Louvre, Paris.
- fact: The world's most visited museum began as a 12th-century fortress; I. M. Pei's glass pyramid, opened in 1989 as its main entrance, stands about 21 metres tall in the Cour Napoléon.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Courtyard_%40_Louvre_%40_Paris_%2828897294980%29.jpg/500px-Courtyard_%40_Louvre_%40_Paris_%2828897294980%29.jpg — CC BY 2.0, Guilhem Vellut from Paris, France. Viewed: the Pyramid and palace across the Cour Napoléon in daylight; the square crop keeps both. Article page image is `Louvre_Museum_Wikimedia_Commons.jpg`; this is not it.
- views: mean 1979.9/day, median 1534.8/day. **Difficulty 3.** **Spike rescore: mean-input loss 5.6 → band 2; median-input 8.1 → band 3, adopted.**
  difficultyWhy: `p.94·fb179·K0·iso264 → 5.6 → 2 · median rescore 8.1 → 3 (spike check)`

### metropolitan-museum-of-art — Metropolitan Museum of Art, United States 🇺🇸
- QID Q160236, pin 40.7794, -73.9633. Pin audit Δ 0.006 km, risk class D. Reverse: The Metropolitan Museum of Art, 1000 5th Avenue, New York.
- fact: The largest art museum in the Americas holds some 1.5 million objects; its glass-walled Sackler Wing houses the Temple of Dendur, a complete Egyptian temple of about 15 BC that Egypt gave to the United States.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Metropolitan_Museum_of_Art_entrance_NYC.JPG/500px-Metropolitan_Museum_of_Art_entrance_NYC.JPG — CC BY-SA 3.0, Arad. Viewed: the Fifth Avenue facade and entrance steps under a US flag. Article page image is `Metropolitan_Museum_of_Art_(The_Met)_-_Central_Park,_NYC.jpg`; this is not it.
- views: mean 1085.4/day, median 998.4/day. **Difficulty 8.** **Spike rescore: mean-input loss 74.2 → band 7; median-input 80.9 → band 8, adopted.**
  difficultyWhy: `p.80·fb1683·K0·iso15 → 74.2 → 7 · median rescore 80.9 → 8 (spike check)`

### british-museum — British Museum, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿
- QID Q6373, pin 51.5194, -0.1269. Pin audit Δ 0.006 km, risk class D. Reverse: Great Court, Bloomsbury, London.
- fact: Free to all since it opened in 1759, it holds about eight million objects, among them the Rosetta Stone, on display here since 1802. Its Great Court, roofed in glass in 2000, is the largest covered public square in Europe.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/British_Museum_Great_Court%2C_London%2C_UK_-_Diliff.jpg/500px-British_Museum_Great_Court%2C_London%2C_UK_-_Diliff.jpg — CC BY-SA 3.0, Diliff. Viewed: the Great Court and Reading Room drum under Foster's glass roof, the brief's allowed defining interior. Article page image is `British_Museum_from_NE_2.JPG`; this is not it.
- views: mean 1163.4/day, median 1144.7/day. **Difficulty 3.**
  difficultyWhy: `p.82·fb102·K0·iso162 → 7.7 → 3`

### vatican-museums — Vatican Museums, Vatican City 🇻🇦
- QID Q182955, pin 41.9064, 12.4544. Pin audit Δ 0.004 km, risk class D. Reverse: Apostolic Palace, Vatican City.
- fact: Founded by Pope Julius II in 1506, the museums run through some 7 km of galleries and end at the Sistine Chapel, whose ceiling Michelangelo painted between 1508 and 1512 on a scaffold he designed himself.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/Circular_staircase_of_the_Vatican_Museums_02.jpg/500px-Circular_staircase_of_the_Vatican_Museums_02.jpg — CC0, Wilfredor. Viewed: the Momo double-helix staircase from above, the museums' defining interior (their exterior is not an icon). The article's page image is `Musei_vaticani_Coat_of_Arms.svg` (not a photograph); this is not it.
- views: mean 303.2/day, median 299.6/day. **Difficulty 4.**
  difficultyWhy: `p.52·fb0·K0·iso475 → 13.7 → 4`

### hermitage-museum — Hermitage Museum, Russia 🇷🇺
- QID Q132783, pin 59.9406, 30.3136. Pin audit Δ 0.005 km, risk class D. Reverse: Hermitage Museum, Palace Embankment, Saint Petersburg.
- fact: Catherine the Great founded it in 1764 with a purchase of 225 paintings; it now holds around three million items, and a team of cats, on staff since an imperial decree of 1745, guards the Winter Palace cellars against rats.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/00_2038_Winter_Palace_-_Hermitage_Museum_%28St._Petersburg%29.jpg/500px-00_2038_Winter_Palace_-_Hermitage_Museum_%28St._Petersburg%29.jpg — CC BY-SA 4.0, W. Bulach. Viewed: the Winter Palace facade across Palace Square with the Alexander Column. Article page image is `5174-3._St._Petersburg._Greater_Hermitage.jpg`; this is not it.
- views: mean 451.9/day, median 439.9/day. **Difficulty 8.**
  difficultyWhy: `p.61·fb1236·K0·iso635 → 109.4 → 8`

### musee-dorsay — Musée d'Orsay, France 🇫🇷
- QID Q23402, pin 48.86, 2.3265. Pin audit Δ 0.004 km, risk class D. Reverse: Musée d'Orsay, 1 Rue de la Légion d'Honneur, Paris.
- fact: Built as a railway station for the 1900 World's Fair and nearly demolished in the 1970s, it reopened as a museum in 1986; trains called here for only 39 years, and its great station clock still looks over the main hall.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Mus%C3%A9e_d%27Orsay_%2822284728710%29.jpg/500px-Mus%C3%A9e_d%27Orsay_%2822284728710%29.jpg — CC BY 2.0, Jorge Láscar from Melbourne, Australia. Viewed: the Seine-side facade and its great clock at dusk. The article has no page image; this cannot be it.
- views: mean 555.1/day, median 551.6/day. **Difficulty 5.**
  difficultyWhy: `p.65·fb179·K0·iso265 → 16.9 → 5`

### national-gallery-london — National Gallery, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿
- QID Q180788, pin 51.5089, -0.1283. Pin audit Δ 0.003 km, risk class D. Reverse: National Gallery, Trafalgar Square, London.
- fact: It began in 1824 when the British government bought 38 paintings from banker John Julius Angerstein's collection for £57,000; it now holds Van Gogh's Sunflowers and Turner's The Fighting Temeraire, and admission has always been free.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/The_National_Gallery%2C_Trafalgar_Square%2C_London_%2853158780828%29.jpg/500px-The_National_Gallery%2C_Trafalgar_Square%2C_London_%2853158780828%29.jpg — CC BY 2.0, . Ray in Manila. Viewed: the dome and portico from Trafalgar Square over the fountains. Article page image is `Galería_Nacional,_Londres,_Inglaterra,_2014-08-07,_DD_036.JPG`; this is not it.
- views: mean 334.3/day, median 333.5/day. **Difficulty 4.**
  difficultyWhy: `p.54·fb103·K0·iso162 → 13.6 → 4`

### tate-modern — Tate Modern, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿
- QID Q193375, pin 51.5078, -0.0994. Pin audit Δ 0.004 km, risk class D. Reverse: 53 Bankside, Southwark, London (the museum address).
- fact: The gallery fills the former Bankside Power Station; its 99-metre chimney was kept just below the height of St Paul's dome across the river, and the old turbine hall below it runs 155 metres long.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Tate_Modern_and_Millennium_Bridge_2025-09-20.jpg/500px-Tate_Modern_and_Millennium_Bridge_2025-09-20.jpg — CC BY-SA 4.0, The wub. Viewed: the Bankside chimney and building from across the Thames with the Millennium Bridge. Article page image is `Tate_Modern_-_Bankside_Power_Station.jpg`; this is not it.
- views: mean 384.0/day, median 378.9/day. **Difficulty 4.**
  difficultyWhy: `p.57·fb104·K0·iso164 → 13.1 → 4`

### natural-history-museum-london — Natural History Museum, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿
- QID Q309388, pin 51.4961, -0.1761. Pin audit: the audit's name lookup found no QID; the pin is the P625 of entity-search Q309388, and the reverse geocode lands on the museum's Cromwell Road address. Reverse: Cromwell Road, Kensington, London SW7 5BD (the museum address).
- fact: Alfred Waterhouse clad the 1881 building in terracotta because it withstood London's soot; in the central hall a 25-metre blue whale skeleton named Hope has hung from the ceiling since 2017, in the spot long held by Dippy the Diplodocus cast.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/3/30/Natural_History_Museum_London_front_facade_2025_dllu.jpg/500px-Natural_History_Museum_London_front_facade_2025_dllu.jpg — CC BY-SA 4.0, Daniel Lu (User:dllu). Viewed: the full Cromwell Road terracotta facade, straight on, 2025. The article's page image is `Natural_History_Museum_London_logo_(large).svg` (not a photograph); this is not it.
- views: mean 380.3/day, median 392.1/day. **Difficulty 4.**
  difficultyWhy: `p.57·fb102·K0·iso161 → 13.0 → 4`

### uffizi-galleries — Uffizi Galleries, Italy 🇮🇹
- QID Q51252, pin 43.7683, 11.2553. Pin audit: the audit's name lookup found no QID; the pin is the P625 of entity-search Q51252, and the reverse geocode lands on 3, Piazzale degli Uffizi. Reverse: 3, Piazzale degli Uffizi, Florence.
- fact: Vasari built it from 1560 as offices, 'uffizi', for Cosimo I's magistrates, and the Medici soon filled the top floor with their collections; it holds Botticelli's The Birth of Venus and Primavera.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5b/Piazzale_degli_Uffizi_perspective_view%2C_Florence%2C_Italy%2C_August_2025.jpg/500px-Piazzale_degli_Uffizi_perspective_view%2C_Florence%2C_Italy%2C_August_2025.jpg — CC BY 4.0, Verum3414. Viewed: the Piazzale courtyard running toward Palazzo Vecchio and its tower. Article page image is `Florence,_Italy_-_panoramio_(125).jpg`; this is not it.
- views: mean 463.3/day, median 466.1/day. **Difficulty 4.**
  difficultyWhy: `p.61·fb131·K0·iso232 → 14.5 → 4`

### rijksmuseum — Rijksmuseum, Netherlands 🇳🇱
- QID Q190804, pin 52.36, 4.8853. Pin audit Δ 0.002 km, risk class D. Reverse: 19 Hobbemastraat, Museumkwartier, Amsterdam.
- fact: Its centrepiece, Rembrandt's The Night Watch, measures about 3.6 by 4.4 metres and closes the Gallery of Honour; a public passageway still runs straight through the 1885 Cuypers building, open to cyclists.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0a/Rijksmuseum%2C_Amsterdam.jpg/500px-Rijksmuseum%2C_Amsterdam.jpg — CC BY-SA 2.5, Voytikof. Viewed: the Museumplein facade doubled in the reflecting pool. Article page image is `South_facade_of_the_Rijksmuseum_Amsterdam_(DSCF0528).jpg`; this is not it.
- views: mean 376.0/day, median 365.7/day. **Difficulty 4.**
  difficultyWhy: `p.57·fb35·K0·iso172 → 12.9 → 4`

### museum-of-modern-art — Museum of Modern Art, United States 🇺🇸
- QID Q188740, pin 40.7617, -73.9775. Pin audit Δ 0.004 km, risk class D. Reverse: Museum of Modern Art, 11 West 53rd Street, New York.
- fact: The first museum devoted to modern art opened in 1929, nine days after the Wall Street Crash; among its roughly 200,000 works is Van Gogh's The Starry Night, acquired in 1941.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/WLA_filmlinc_MOMA_4.jpg/500px-WLA_filmlinc_MOMA_4.jpg — CC BY-SA 2.5, Wikipedia Loves Art participant "The_Grotto". Viewed: the West 53rd Street glass facade and entrance canopy, the museum building's street face. Article page image is `MoMa_NY_USA_1.jpg`; this is not it.
- views: mean 594.5/day, median 598.0/day. **Difficulty 9.**
  difficultyWhy: `p.67·fb1681·K0·iso135 → 122.3 → 9`

### guggenheim-new-york — Guggenheim New York, United States 🇺🇸
- QID Q201469, pin 40.7831, -73.9589. Pin audit: the audit's name lookup found no QID; the pin is the P625 of entity-search Q201469, and the reverse geocode lands on 1071, 5th Avenue, the museum's address. Reverse: 1071, 5th Avenue, New York (the museum address).
- fact: Frank Lloyd Wright's museum took 16 years from commission to opening in October 1959, six months after his death; visitors ride the lift to the top and walk down one continuous spiral ramp about a quarter of a mile long.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/1/17/Frank_Lloyd_Wright_-_New_York%2C_NY_-_Solomon_R._Guggenheim_Museum_%28A%29.jpg/500px-Frank_Lloyd_Wright_-_New_York%2C_NY_-_Solomon_R._Guggenheim_Museum_%28A%29.jpg — CC BY 4.0, Bmzuckerman. Viewed: Wright's rotunda from across Fifth Avenue, filling the frame. Article page image is `Solomon_R._Guggenheim_Museum_(48059131351).jpg`; this is not it.
- views: mean 672.0/day, median 557.6/day. **Difficulty 9.** **Spike rescore: mean-input loss 112.7 → band 8; median-input 127.6 → band 9, adopted.**
  difficultyWhy: `p.70·fb1683·K0·iso15 → 112.7 → 8 · median rescore 127.6 → 9 (spike check)`

### national-air-and-space-museum — National Air and Space Museum, United States 🇺🇸
- QID Q752669, pin 38.8883, -77.02. Pin audit Δ 0.004 km, risk class D. Reverse: 655 Jefferson Drive Southwest, Washington DC (the museum address).
- fact: Its entrance hall displays the original 1903 Wright Flyer and the Apollo 11 command module Columbia; the museum opened on the National Mall for the Bicentennial in 1976 and holds the largest collection of historic aircraft and spacecraft in the world.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/National_Air_and_Space_Museum_Entrance.JPG/500px-National_Air_and_Space_Museum_Entrance.JPG — CC BY-SA 3.0, Jawed Karim. Viewed: the entrance hall with SpaceShipOne and a Mercury capsule, the defining interior (the exterior is a plain stone-and-glass block). Article page image is `National_Air_and_Space_Museum_(55256212753).jpg`; this is not it.
- views: mean 357.9/day, median 331.4/day. **Difficulty 9.**
  difficultyWhy: `p.55·fb1428·K0·iso199 → 140.7 → 9`

### american-museum-of-natural-history — American Museum of Natural History, United States 🇺🇸
- QID Q217717, pin 40.7808, -73.9744. Pin audit Δ 0.005 km, risk class D. Reverse: American Museum of Natural History, 200 Central Park West, New York.
- fact: Its halls hold tens of millions of specimens; the 29-metre blue whale model in the Hall of Ocean Life was modelled on a female whale caught off South America in 1925 and has hung there, in changing paint, since 1969.
- photo: https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/Facade_of_the_American_museum_of_natural_history_NYC_%281%29.jpg/500px-Facade_of_the_American_museum_of_natural_history_NYC_%281%29.jpg — CC BY 4.0, Ferfive. Viewed: the Central Park West facade, its columns and entrance steps. Article page image is `USA-NYC-American_Museum_of_Natural_History.JPG`; this is not it.
- views: mean 479.0/day, median 468.7/day. **Difficulty 9.**
  difficultyWhy: `p.62·fb1682·K0·iso16 → 139.6 → 9`

## Spike rescores (mean vs median band disagreement)

- **louvre-museum: adopted 3.** Mean-input loss 5.6 → band 2; median-input
  8.1 → band 3. The mean/median views ratio is 1.29, the widest in this
  chunk (one heavy month pulls the mean up); the median is the stabler
  read, per the Golden Gate / Persepolis precedent.
- **metropolitan-museum-of-art: adopted 8.** Mean-input 74.2 → band 7;
  median-input 80.9 → band 8.
- **guggenheim-new-york: adopted 9.** Mean-input 112.7 → band 8;
  median-input 127.6 → band 9 (views ratio 1.21).
- All other twelve: mean and median bands agreed.

## Proximity report (pairs under 25 km; report-only, none blocked)

Distinct famous neighbours, as expected in museum-dense cities:
vatican-museums ↔ st-peters-basilica 0.5 km (intended by the brief);
metropolitan-museum-of-art ↔ guggenheim-new-york 0.6 km, ↔
american-museum-of-natural-history 0.9 km; louvre-museum ↔ musee-dorsay
0.7 km; national-gallery-london ↔ trafalgar-square-london 0.1 km (the
gallery stands on the square), ↔ british-museum 1.2 km; tate-modern ↔
london-eye-gb 1.5 km; natural-history-museum-london ↔ buckingham-palace
2.4 km; rijksmuseum ↔ amsterdam-canals 1.5 km; museum-of-modern-art ↔
lunch-atop-skyscraper-rockefeller 0.3 km; national-air-and-space-museum
↔ capitol-building-washington 1.0 km. hermitage-museum and
uffizi-galleries have no entry within 25 km (37.5 km for the Uffizi).

## Test changes (3 files, counts/pins only)

1. `test/pack-pools.test.mjs`: landmark pool assertion 208 → 223.
2. `test/passport-packs.test.mjs`: section totals [207, 208, 206] →
   [207, 223, 206]; combined total 621 → 636.
3. `test/passport-dex-numbering.test.mjs`: the pinned Angkor Wat
   Landmarks number 10 → 11. The failure proved it moved: "American
   Museum of Natural History" sorts ahead of "Angkor Wat" in the derived
   (rendered-order) numbering, which is the pre-lock derived model
   working as designed.

Suite after changes: **83/83 green.** Nothing committed, pushed, or
deployed.
