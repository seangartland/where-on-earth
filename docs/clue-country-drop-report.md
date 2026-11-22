# Lane report: country removal from non-city clues

## Counts

- Suffix-stripped: 407
- Hand-stripped: 53
- Kept unchanged: 2, already bare names.
- Geography-kept: 17, defining regional or feature geography retained.
- Total bank entries accounted for: 479.

`assets/locations.json` and the trivia bank were not changed. No test expectation named a specific bank clue, so no test expectation was updated.

## Hand group: complete before and after table

| # | Before | After | Disposition and reason |
| ---: | --- | --- | --- |
| 1 | `Meteor Crater, Arizona, United States 🇺🇸` | `Meteor Crater` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 2 | `Battle of Hastings, England` | `Battle of Hastings` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 3 | `Ben Nevis, Scotland` | `Ben Nevis` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 4 | `Bering Strait` | `Bering Strait` | Kept unchanged: already bare name. |
| 5 | `Big Ben, England` | `Big Ben` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 6 | `Bird's Nest Stadium, Beijing, China 🇨🇳` | `Bird's Nest Stadium` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 7 | `Challenger Deep, Mariana Trench` | `Challenger Deep, Mariana Trench` | Geography kept: Mariana Trench is defining geography for the deep. |
| 8 | `Eilean Donan, Scotland` | `Eilean Donan` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 9 | `Little Bighorn Battlefield, Montana, United States 🇺🇸` | `Little Bighorn Battlefield` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 10 | `Museo del Prado, Madrid, Spain 🇪🇸` | `Museo del Prado` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 11 | `Snowdon, Wales` | `Snowdon` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 12 | `Stonehenge, England` | `Stonehenge` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 13 | `Strait of Gibraltar` | `Strait of Gibraltar` | Kept unchanged: already bare name. |
| 14 | `Trafalgar Square, England` | `Trafalgar Square` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 15 | `White Cliffs of Dover, England` | `White Cliffs of Dover` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 16 | `London Eye, England` | `London Eye` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 17 | `Roman Baths, Bath, England` | `Roman Baths` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 18 | `York Minster, England` | `York Minster` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 19 | `Lake Superior, Canada and United States 🇨🇦🇺🇸` | `Lake Superior` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 20 | `Lake Victoria, East Africa` | `Lake Victoria, East Africa` | Geography kept: East Africa is extent-defining regional geography. |
| 21 | `Lake Titicaca, Peru and Bolivia 🇵🇪🇧🇴` | `Lake Titicaca` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 22 | `Lake Malawi, Malawi, Mozambique, and Tanzania` | `Lake Malawi` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 23 | `Giant's Causeway, Northern Ireland` | `Giant's Causeway` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 24 | `Tower Bridge, England 🏴󐁧󐁢󐁥󐁮󐁧󐁿` | `Tower Bridge` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 25 | `Tower of London, England 🏴󐁧󐁢󐁥󐁮󐁧󐁿` | `Tower of London` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 26 | `Buckingham Palace, England 🏴󐁧󐁢󐁥󐁮󐁧󐁿` | `Buckingham Palace` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 27 | `Westminster Abbey, England 🏴󐁧󐁢󐁥󐁮󐁧󐁿` | `Westminster Abbey` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 28 | `Caspian Sea, Central Asia` | `Caspian Sea, Central Asia` | Geography kept: Central Asia is extent-defining regional geography. |
| 29 | `Mount Vinson, Antarctica` | `Mount Vinson` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 30 | `Sahara, North Africa` | `Sahara, North Africa` | Geography kept: North Africa is extent-defining regional geography. |
| 31 | `British Museum, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `British Museum` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 32 | `National Gallery, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `National Gallery` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 33 | `Tate Modern, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `Tate Modern` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 34 | `Natural History Museum, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `Natural History Museum` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 35 | `St Paul's Cathedral, England 🏴🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `St Paul's Cathedral` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 36 | `Edinburgh Castle, Scotland 🏴🏴󠁧󠁢󠁳󠁣󠁴󠁿` | `Edinburgh Castle` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 37 | `Amazon Rainforest, South America` | `Amazon Rainforest, South America` | Geography kept: South America is extent-defining regional geography. |
| 38 | `Aral Sea, Central Asia` | `Aral Sea, Central Asia` | Geography kept: Central Asia is extent-defining regional geography. |
| 39 | `Lake Huron, Canada and United States 🇨🇦🇺🇸` | `Lake Huron` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 40 | `Lake Erie, Canada and United States 🇨🇦🇺🇸` | `Lake Erie` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 41 | `Lake Ontario, Canada and United States 🇨🇦🇺🇸` | `Lake Ontario` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 42 | `Isle of Wight, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `Isle of Wight` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 43 | `Shetland, Scotland 🏴󠁧󠁢󠁳󠁣󠁴󠁿` | `Shetland` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 44 | `Mediterranean Sea, Europe and Africa` | `Mediterranean Sea, Europe and Africa` | Geography kept: Europe and Africa define the sea extent. |
| 45 | `Black Sea, Europe and Asia` | `Black Sea, Europe and Asia` | Geography kept: Europe and Asia define the sea extent. |
| 46 | `Red Sea, Middle East` | `Red Sea, Middle East` | Geography kept: Middle East is extent-defining regional geography. |
| 47 | `Gulf of Mexico, North America` | `Gulf of Mexico, North America` | Geography kept: North America is extent-defining regional geography. |
| 48 | `Strait of Hormuz, Iran and Oman 🇮🇷🇴🇲` | `Strait of Hormuz` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 49 | `Drake Passage, South America and Antarctica` | `Drake Passage, South America and Antarctica` | Geography kept: South America and Antarctica define the passage. |
| 50 | `Hadrian's Wall, England 🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `Hadrian's Wall` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 51 | `Baltic Sea, Northern Europe` | `Baltic Sea, Northern Europe` | Geography kept: Northern Europe is extent-defining regional geography. |
| 52 | `Himalayas, Asia` | `Himalayas, Asia` | Geography kept: Asia is extent-defining regional geography. |
| 53 | `Andes, South America` | `Andes, South America` | Geography kept: South America is extent-defining regional geography. |
| 54 | `Alps, Central Europe` | `Alps, Central Europe` | Geography kept: Central Europe is extent-defining regional geography. |
| 55 | `Rocky Mountains, United States and Canada 🇺🇸🇨🇦` | `Rocky Mountains` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 56 | `Appalachian Mountains, United States and Canada 🇺🇸🇨🇦` | `Appalachian Mountains` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 57 | `Hindu Kush, Afghanistan and Pakistan 🇦🇫🇵🇰` | `Hindu Kush` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 58 | `Karakoram, Pakistan, India, and China` | `Karakoram` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 59 | `Carpathian Mountains, Central and Eastern Europe` | `Carpathian Mountains, Central and Eastern Europe` | Geography kept: Central and Eastern Europe define the range extent. |
| 60 | `Pyrenees, France and Spain 🇫🇷🇪🇸` | `Pyrenees` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 61 | `Atlas Mountains, Algeria and Morocco 🇩🇿🇲🇦` | `Atlas Mountains` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 62 | `Caucasus Mountains, Russia and Georgia 🇷🇺🇬🇪` | `Caucasus Mountains` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 63 | `Zagros Mountains, Iran and Iraq 🇮🇷🇮🇶` | `Zagros Mountains` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 64 | `Tian Shan, Central Asia` | `Tian Shan, Central Asia` | Geography kept: Central Asia is extent-defining regional geography. |
| 65 | `Altai Mountains, Mongolia and Russia 🇲🇳🇷🇺` | `Altai Mountains` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 66 | `Drakensberg, Lesotho and South Africa 🇱🇸🇿🇦` | `Drakensberg` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 67 | `Strait of Malacca, Indonesia and Malaysia 🇮🇩🇲🇾` | `Strait of Malacca` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 68 | `English Channel, France and England 🇫🇷🏴󠁧󠁢󠁥󠁮󠁧󠁿` | `English Channel` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 69 | `Bab-el-Mandeb, Djibouti and Yemen 🇩🇯🇾🇪` | `Bab-el-Mandeb` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 70 | `Taiwan Strait, China and Taiwan 🇨🇳🇹🇼` | `Taiwan Strait` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 71 | `Øresund, Denmark and Sweden 🇩🇰🇸🇪` | `Øresund` | Hand-stripped: removed country, state, city, or constituent-country locator. |
| 72 | `Straits of Florida, Cuba, United States, and Bahamas` | `Straits of Florida` | Hand-stripped: removed country, state, city, or constituent-country locator. |

## Orchestrator corrections at banking (Muse, 2026-11-21)

Eight hand-group treatments were restored to their original clues before banking. Seven are straits or channels whose bordering countries define the feature, which the approved scoping and the brief both said to keep (Straits of Florida, named explicitly in the approval; Strait of Hormuz; Strait of Malacca; English Channel; Bab-el-Mandeb; Taiwan Strait; Oresund). The eighth is Mount Vinson, Antarctica: a continent descriptor, kept for consistency with the other geography-kept regional descriptors. Net effect: 452 clues changed, 27 unchanged (2 bare names, 17 geography-kept, 8 restored).
