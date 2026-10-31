# Fact rewrites report, 2026-10-30

Scope executed exactly per `.build-tmp/fact-rewrites-brief.md`: the 46 facts
flagged by `docs/scan2-fact-quality-report-2026-10-30.md` (stub fragments,
dictionary definitions, missing-article breakage, garbled text, one
wrong-subject) plus the two verify-and-repair extras (badwater-basin,
copper-canyon). Only the `fact` field changed on any entry. Nothing was
committed, pushed, or deployed.

## Method

Every current fact was read from the data files (they match scan 2's verbatim
quotes). Each replacement was drafted from the subject's live English
Wikipedia article (lead plus full text where a specific number had to be
pinned down), read during this run; no specific claim rests on model memory.
Each new fact is 1-2 complete sentences carrying at least one concrete,
non-transferable detail (a measurement, a date, a named person, event, or
mechanism). Edits were applied by exact-string replacement of the stored
fact value in the raw JSON, so no other byte of any entry moved.

## The 46 rewrites: before / after

| id | before | after |
|---|---|---|
| harare-zimbabwe | Zimbabwe's capital, known for its wide streets lined with jacaranda trees. | Founded in 1890 as Fort Salisbury by the British South Africa Company's Pioneer Column, the city was renamed Harare in 1982, on the second anniversary of Zimbabwean independence. |
| kigali-rwanda | Rwanda's capital, known for its cleanliness and well-organized urban layout. | Kigali became Rwanda's capital at independence in 1962, and on the last Saturday of every month the city shuts down for umuganda, a mandatory morning of community cleaning and building work. |
| lilongwe-mw | Lilongwe became Malawi's capital in 1975 and is a spread-out garden city. | Named after the Lilongwe River, the city was picked as Malawi's new capital in 1965 and took over from Zomba in 1975, growing into the country's largest city. |
| ben-nevis | Ben Nevis is the highest mountain in the British Isles. | Its summit, 1,345 metres (4,413 ft) above sea level, is the highest ground in the British Isles, and it was home to a permanently staffed weather observatory from 1883 to 1904. |
| black-forest | Black Forest is a mountain range in Germany. | The Danube and the Neckar both rise in this 160 km-long range in Baden-Württemberg, whose highest peak, the Feldberg, reaches 1,493 metres (4,898 ft). |
| cliffs-of-moher | Cliffs of Moher is a line of sea cliffs in County Clare, Ireland. | The cliffs run for 14 kilometres along the County Clare coast and rise 214 metres (702 ft) above the Atlantic at their highest point, just north of O'Brien's Tower, built in 1835. |
| daintree-rainforest | Daintree Rainforest is a rainforest in Australia. | Part of the Wet Tropics of Queensland, the Daintree's rainforest lineage stretches back some 180 million years, making it roughly 100 million years older than the Amazon. |
| danube-delta | Danube Delta is a river delta in Europe. | Where the Danube empties into the Black Sea, this 4,152 km² maze of channels, lakes and reed beds is Europe's second-largest river delta and its best preserved. |
| denali | Denali is the highest mountain in North America. | At 6,190 metres (20,310 ft) it rises some 5,500 metres from the plateau at its base, one of the greatest vertical reliefs of any mountain on Earth, and it was first verifiably climbed on 7 June 1913. |
| geysir-d34-42 | Famous geothermal area. | Every geyser in the world is named after this one: the word comes from Geysir, whose eruptions have hurled boiling water as high as 60 metres (200 ft), though it now stirs only rarely. |
| ha-long-bay | Marine paleontologists once proposed pouring fossil fuel into these caves to date the world's oldest tropical limestone, and no one has found a better explanation for the karsts' odd chemistry. | Its name means 'descending dragon', and the bay is scattered with 1,969 limestone islets whose karst has been shaped by a tropical climate over some 20 million years. |
| horseshoe-bend | Its water carved immense canyons and now supports tens of millions of people across an arid region. | From the clifftop overlook, the Colorado River curves in a near-perfect horseshoe 300 metres (1,000 ft) below, 8 km downstream from the Glen Canyon Dam near Page, Arizona. |
| mont-blanc | Mont Blanc is the highest mountain in the Alps (4,806.m). | The highest summit in the Alps at 4,807 metres (15,772 ft), it is pierced far below by the 11.6 km Mont Blanc Tunnel between France and Italy, built between 1957 and 1965. |
| mount-kilimanjaro-summit | Africa's highest peak at 5,895 meters, located in Tanzania. | Kilimanjaro is the world's highest free-standing mountain, rising 5,895 metres (19,341 ft) above sea level, and its summit ice cap lost more than 80% of its area during the 20th century. |
| ngorongoro-crater-rim | The world's largest inactive, intact volcanic caldera, located in Tanzania. | The crater is the world's largest inactive, intact and unfilled volcanic caldera: 610 metres deep, with a 260 km² floor that holds about 25,000 large animals. |
| redwood-national-and-state-parks | Redwood National and State Parks is group of national and state parks in California, United States. | These four jointly run parks in northern California protect 45 percent of Earth's remaining old-growth coast redwood forest, home to the tallest trees alive today. |
| sea-of-galilee | Sea of Galilee is a freshwater lake in Israel. | The lowest freshwater lake on Earth, it lies some 210 metres below sea level and is fed mainly by the Jordan River, which flows through it from north to south. |
| snowdon | Snowdon is a mountain in Snowdonia, Wales. | At 1,085 metres (3,560 ft) it is the highest peak in Wales; the Snowdon Mountain Railway has carried climbers to its summit since 1896, and Edmund Hillary trained here before Everest. |
| vatnajökull-d34-44 | Europe's largest glacier. | Covering some 8% of Iceland, this 7,700 km² ice cap averages 380 metres in thickness and caps active volcanoes, among them Grímsvötn beneath the ice. |
| white-cliffs-of-dover | White Cliffs of Dover is an English cliff shore. | The chalk face reaches 110 metres (350 ft) and runs for 13 kilometres along the Kent coast; on a clear day the cliffs are visible from France, some 32 km across the strait. |
| amsterdam-canals-d34-7 | UNESCO-listed canal ring from the Golden Age. | Amsterdam holds more than 100 km of canals and about 1,500 bridges; its concentric 17th-century canal ring, dug in the Dutch Golden Age, became a UNESCO World Heritage Site in 2010. |
| burj-al-arab | Burj Al Arab is a luxury hotel in Dubai, United Arab Emirates. | Shaped like a dhow's sail, it stands on its own artificial island 280 metres off the Dubai coast, and its helipad, 210 metres up, once hosted a tennis match between Roger Federer and Andre Agassi. |
| burj-khalifa-dubai | At 828 meters, the Burj Khalifa is the world's tallest building. | At 829.8 metres it is the world's tallest structure, renamed at its inauguration from Burj Dubai for Sheikh Khalifa bin Zayed, who had organised federal support for its struggling developer. |
| capitol-building-washington | The U.S. Capitol is the home of the United States Congress in Washington, D.C. | Burned by British troops in 1814 and rebuilt within five years, the Capitol gained its massive present dome in the 1860s, completed around 1866, just after the Civil War. |
| cesky-krumlov-d34-18 | UNESCO medieval town with castle. | A UNESCO World Heritage Site since 1992, its castle spreads forty buildings around five courtyards, and the castle moat is kept filled not with water but with bears. |
| champs-elysees-paris | The Champs-Élysées is one of the world's most famous avenues in Paris. | It runs 1.9 kilometres from the Place de la Concorde to the Arc de Triomphe, and each July it hosts both the finish of the Tour de France and the Bastille Day military parade. |
| chateau-de-chambord | Château de Chambord is castle in Chambord, France. | Built for Francis I between 1519 and 1547 as a hunting lodge, it holds 440 rooms and a double-spiral staircase whose two flights wind around each other without ever meeting. |
| delphi | Delphi is sacred site and oracle of Ancient Greece. | The ancient Greeks treated Delphi as the centre of the world, marked by the Omphalos stone, and city-states sent embassies here to hear the prophecies of the Pythia, Apollo's oracle. |
| disneyland | Disneyland is theme park in Anaheim, California, US. | Opened on 17 July 1955, it is the only Disney theme park built under Walt Disney's direct supervision, and it has drawn a larger cumulative attendance than any other theme park in the world. |
| gateway-of-india | Gateway of India is landmark monument in Mumbai, India. | The 26-metre basalt arch was completed in 1924 to mark George V's landing in Bombay in 1911, the first visit to India by a British monarch; the last British troops marched out through it in 1948. |
| graceland | Graceland is the home of Elvis Presley in Memphis, Tennessee, US. | Elvis Presley's home from 1957 until his death in 1977, he is buried on the estate alongside his parents; opened to the public in 1982, it is the second most visited home in the United States, after the White House. |
| hallgrímskirkja-d34-40 | Iceland's largest church. | At 74.5 metres, the largest church in Iceland, it took 41 years to build (1945-1986), its stepped concrete wings modelled on the columnar basalt 'organ pipe' formations of Iceland's landscape. |
| hollywood-sign-la | The Hollywood Sign overlooks Los Angeles from Mount Lee in Griffith Park. | It began in 1923 as a temporary real-estate advertisement spelling 'HOLLYWOODLAND' in 15-metre letters on Mount Lee; the last four letters were removed in 1949. |
| lascaux | Lascaux is a cave complex in France containing Paleolithic paintings. | Rediscovered in 1940 by teenager Marcel Ravidat after his dog Robot nosed into a hole left by an uprooted tree, the caves hold over 600 animal paintings 17,000 to 22,000 years old, and have been closed to the public since 1963. |
| mecca-kaaba-saudi | The Kaaba in Mecca is Islam's holiest site and the direction of Muslim prayer. | Muslims worldwide face this cube-shaped shrine to pray, and pilgrims circle it seven times in the rite of tawaf; its black Kiswah cloth is replaced each year on the Day of Arafah. |
| mole-antonelliana-d34-56 | Iconic dome building. | Begun in 1863 as a synagogue, Antonelli's Mole climbs to 167.5 metres, making it the tallest brick building in Europe when it was finished in 1889; it now houses Italy's National Museum of Cinema. |
| palm-jumeirah | Palm Jumeirah is a human-made archipelago in Dubai, UAE. | Built by the Dutch dredging firm Van Oord, the palm-shaped island divides into a trunk, villa-lined fronds and a resort crescent, part of a series planned to add 520 km to Dubai's shoreline. |
| pantheon-rome | The Panthe's oculus is one 43-metre hole cut in the dome and the only light the interior gets, so rain falls straight onto the marble floor. | Rebuilt under Hadrian and dedicated around AD 126, its dome is still the world's largest unreinforced concrete dome, open to the sky through a 9.1-metre-wide oculus that lets the rain fall straight onto the floor. |
| puente-nuevo-d34-66 | Dramatic bridge over gorge. | Finished in 1793 after 34 years of work, the bridge spans Ronda's 120-metre-deep El Tajo gorge; its hastily built predecessor collapsed in 1741, killing 50 people. |
| real-alcázar-of-seville-d34-64 | Moorish royal palace. | Its richly decorated Mudéjar palace was built for Pedro I of Castile in the 1360s, and the upper floors are still used by Spain's royal family when they stay in Seville. |
| san-gimignano-d34-52 | Town of medieval towers. | Rival families raised 72 tower houses here in the Middle Ages, some up to 70 metres tall; 14 survive, giving the walled Tuscan town its famous skyline. |
| sanctuary-of-fátima-d34-77 | Major Catholic pilgrimage site. | The shrine stands at Cova da Iria, where three shepherd children reported apparitions of the Virgin Mary from 13 May 1917, culminating in the 'Miracle of the Sun' that October. |
| santa-monica-pier | Santa Monica Pier is pier in Santa Monica, California, United States. | The first pier here opened in 1909 to carry sewer pipes out beyond the breakers; today's pier holds Pacific Park's solar-powered Ferris wheel and a 1922 carousel inside the Looff Hippodrome. |
| st-marks-square-venice | Piazza San Marco is Venice's main public square, known for St. Mark's Basilica. | Napoleon is said to have called the square 'the drawing room of Europe'; its Campanile collapsed in 1902 and was rebuilt exactly as it was, where it was, by 1912. |
| western-wall-jerusalem | The Western Wall is the last remaining wall of the Second Temple in Jerusalem. | The prayer plaza is a 57-metre exposed stretch of a 488-metre retaining wall begun by Herod the Great to hold up the expanded Temple Mount platform. |
| york-minster-d34-3 | Largest medieval Gothic cathedral in Northern Europe. | Built between 1220 and 1472, the minster holds the Great East Window, the largest expanse of medieval stained glass in the world, depicting the Last Judgment. |

## Priority defects, as handled

- **horseshoe-bend** (WRONG-SUBJECT): the old fact described the Colorado
  River system and never mentioned the bend. The new fact is about the
  meander and its overlook: the 300 m (1,000 ft) drop from the clifftop to
  the river, 8 km below Glen Canyon Dam near Page, Arizona (Wikipedia,
  "Horseshoe Bend (Arizona)").
- **ha-long-bay** (BROKEN-text): the garbled fossil-fuel/limestone clause was
  discarded in full; no chemistry claim was carried over. The new fact uses
  the bay's verified basics: the name means "descending dragon", 1,969
  limestone islets, karst shaped over some 20 million years (Wikipedia,
  "Hạ Long Bay").
- **pantheon-rome** (BROKEN-text): the truncated "The Panthe's oculus is one
  43-metre hole" is replaced. One correction to the brief: it gives the
  oculus as 8.8 m across, but the live Wikipedia article ("Pantheon, Rome",
  Rotunda section) puts the oculus ring at 9.1 metres (30 ft) in diameter
  (30 Roman feet), with 43.3 m being the dome's interior diameter and height
  to the oculus. The rewrite uses the article's 9.1 m.
- **mont-blanc** (BROKEN-text): the stray "(4,806.m)" is gone. The article's
  current surveyed height, 4,807.3 m, is used (written as 4,807 metres),
  paired with the 11.6 km Mont Blanc Tunnel, built 1957-1965.

## Verify-and-repair extras: before / after

| id | before | after |
|---|---|---|
| badwater-basin | At 120 m long and 1.6 km wide, it holds temporary lakes and salt flats after rare rains, and salt polygons form as the water evaporates. | At 86 metres (282 ft) below sea level, it is the lowest point in North America; after rare storms its salt pan floods into a temporary Lake Manly, while freeze and evaporation sculpt the crust into salt polygons. |
| copper-canyon | Cheyenne and Tarahumara Indians live in the canyons, and the ridged terrain comes from copper-impregnated rock staining blue-green. | Six canyons covering 65,000 km², named for the copper-green colour of their walls. The Tarahumara, or Rarámuri, are their traditional inhabitants, and the ChePe railway threads through them between Chihuahua and Los Mochis. |

### badwater-basin verdict: scan 2 was right, the stored dimensions are wrong

The full text of Wikipedia's "Badwater Basin" was read. It gives no
dimensions for the basin at all, and none for Badwater Pool either; the
"120 m long and 1.6 km wide" figure appears nowhere in the article. The
basin is the floor of Death Valley (the lowest point itself sits several
miles west of the pool and shifts with rainfall), so a 120 m x 1.6 km
measure cannot describe it. The dimensions were dropped rather than
replaced with another unverified figure. The new fact rests on claims the
article does make: 86 m (282 ft) below sea level, the lowest point in North
America; storm flooding of the salt pan forms the temporary Lake Manly;
freeze-thaw and evaporation push the salt crust into hexagonal polygons.

### copper-canyon verdict: scan 2 was right, "Cheyenne" is an error

Note on naming: the brief calls this entry "copper-canyon (id
barrancas-del-cobre)"; in the live bank the entry's id is `copper-canyon`
and "Barrancas del Cobre" is its short name. It is the only entry the scan's
quote can refer to, and it is the one edited.

Wikipedia's "Copper Canyon" states that the canyon system's traditional
inhabitants are the Tarahumara or Rarámuri, and that the railway crossing
the canyons is the Ferrocarril Chihuahua al Pacífico, "ChePe". "Cheyenne"
(a Plains people) appears nowhere in the article as an inhabitant; the
stored word is a corruption of "Chepe", as scan 2 suspected. (The game's own
trivia-bank copy of this entry already had it right: "The Tarahumara, or
Rarámuri, are its traditional inhabitants".) The rewrite also drops the old
fact's second clause's awkward phrasing and keeps its one sound element,
the copper-green wall colour that names the canyons, alongside the verified
65,000 km² system size and the ChePe route, Chihuahua to Los Mochis.

## Re-screen (scan 2's screens, re-run over the 48 new facts)

Screens replicated from scan 2: stub length (<80 chars), verbless fragment
(no finite verb), definition frame (single-sentence "X is a Y in Z" with no
specific detail), missing-article defect shapes, and the broken-text
patterns found in the originals. Result: **zero flags on all 48**. New fact
lengths run 148-227 chars (the scan's stub line is 80). Each fact was also
read by hand after the automated pass; every one names its own subject, the
defect scan 2 flagged for it is gone, and scan 2's cleared-on-read false
positives do not recur here.

## Field-level diff audit

Semantic comparison of the two touched files against git HEAD, entry by
entry: **exactly 48 entries changed, and in every one the only differing
field is `fact`**. The changed id set equals the in-scope set (46 + 2), no
entry outside scope moved, entry counts per file are unchanged
(locations.json 804, locations-landmarks-sol.json 432), and
`git diff --stat` shows 48 insertions and 48 deletions across the two files,
one line per rewritten fact. assets/locations-landmarks-quarantine.json is
untouched.

## Tests

`node --test test/*.test.mjs`: **83 pass, 0 fail**. No count or membership
changes were expected and none occurred; no test was edited.
