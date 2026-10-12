# Image pass, 2026-10-12

Scope: the `image` field of 45 targeted entries in `assets/locations.json`. Nothing else changed.

## Method

- Done directly by Muse (Opus 5.5), not delegated, as Sean asked.
- Candidates came from the Wikimedia Commons API (file search plus category listings), JPEG only, at least 800px wide.
- Each candidate was center-cropped to a square and laid out on a numbered contact sheet. I looked at every sheet and picked by eye, so each choice was judged as it will look on the square passport card.
- The stored URL is the Commons 500px thumbnail, the same format the dataset already uses. All 45 new URLs returned HEAD 200.
- Before writing, I checked that no new URL was already used by another entry.

## Verification (after the pass)

- Valid JSON, 755 entries, 755 unique IDs, same ID order as git HEAD.
- Field diff against HEAD: 45 entries changed, and the only field that changed is `image`.
- Montage/collage filenames in the dataset: **0**
- Duplicate image URLs: **0**
- `No_image_available` placeholders: **1** (abala). It was 30.

## 1. Collages/montages (5 of 5 replaced)

| id | new image | why |
|---|---|---|
| bangui-cf | Bangui City Centre.jpg | Wide aerial over the central roundabout with the Ubangi river behind; the square crop stays on the city |
| bouake-ci | Bouaké - panoramio.jpg | Busy main street scene. Commons has little else for Bouaké besides food photos, signs and the old collage |
| burnley | Burnley town centre from the railway viaduct (geograph 7264530) | Elevated wide view across the town centre to the hills |
| jyvaskyla | Jyväskylä - view 3.jpg | High view over central blocks with the lake behind |
| rimini | Rimini from the ferris wheel (14-07-2012).jpg | Elevated wide view over the seafront city |

## 2. Placeholders (29 of 30 fixed)

| id | new image | why |
|---|---|---|
| arar | 20210128 153213Arar Tower.jpg | Category:Arar has only 3 JPEGs; the tower is the city landmark and the best of them. **Not a wide view**, worth a look from Sean |
| avarua-cook-islands | Avarua Harbour.jpg | Harbour with the town and green hills behind |
| banff | Banff Town.jpg | Banff Avenue running toward Cascade Mountain, the classic town view |
| barquisimeto-ve | Digitaliza Tu Ciudad Barquisimeto 2025-8.jpg | Skyline of high-rises with mountains behind |
| bhuj | View of Bhuj City From Palace Tower - panoramio.jpg | Rooftop panorama over the city toward the hill |
| davao-ph | Davao City skyline 01.jpg | Wide elevated view across the city to the gulf |
| ensenada-mx | Entrada a la ciudad de Ensenada.jpg | Aerial over the city grid |
| fez-morocco | Medina of Fes, Marocco.jpg | Dense medina rooftops with minarets; fills the square well |
| halifax-canada | Halifax skyline.jpg | Elevated harbour-front view of downtown |
| merida-mx | Merida, Yucatan, Mexico - Plaza Grande, 6 Marzo 2021 - 02.jpg | Plaza Grande with the clock tower |
| nara | Skyline of Nara City02.jpg | Over the city with a five-storey pagoda (likely Kōfuku-ji) |
| niigata | Niigata City 2022-01.jpg | River, bridges and the downtown skyline |
| oita | Aerial view of Oita city.jpg | Aerial of the whole city along the river and bay (the file is already square) |
| pereira-co | Pereira desde La Alquería (15006935270) | Wide view of the city in its valley |
| puebla-mexico | Puebla vista desde Los Fuertes..jpg | Cathedral towers with the skyline and mountains behind |
| saguenay | Chicoutimi - Centre-ville Est.jpg | Downtown Chicoutimi (Saguenay's main borough) with the cathedral, seen from the river |
| san-antonio-usa | Gfp-texas-san-antonio-skyscrapers-of-san-antonio.jpg | Elevated wide view over downtown |
| san-jose | San Jose California (128805221).jpeg | Downtown towers with the Cathedral Basilica of St. Joseph |
| san-luis-potosi-mx | Templo de Loreto - Plaza Fundadores San Luis Potosí.jpg | Plaza Fundadores with the colonial church facades |
| san-pedro-sula-hn | San Pedro Sula, Honduras.jpg | Elevated city view toward the mountains |
| santo-domingo-de-los-colorados-ec | Santo Domingo, Ecuador 12 de septiembre de 2026.jpg | Wide view over the city with mountains behind |
| silkeborg | 970 Silkeborg station og langsø.jpg | Aerial of the town and Langsø lake |
| suzhou-cn | Suzhou from Beisi Pagoda.jpg | Old-town rooftops from the pagoda with the modern skyline beyond |
| trujillo-pe | Trujillo-Peru2.jpg | Plaza de Armas: Freedom Monument and the yellow cathedral |
| tucson-usa | Tucson asr.JPG | Downtown towers with the mountains behind |
| volgograd-ru | View of Volgograd from the 15th floor of an apartment building.jpg | Wide city view (portrait original, so the square crop keeps the city) |
| xiamen-cn | Xiamen night cityscape 2018 - Flickr - Jaykhuang.jpg | Twin towers and the bay at dusk |
| yaroslavl-ru | Yaroslavl. Volga River. Cathedral of the Dormition P5212724 2200.jpg | Volga embankment with the Dormition Cathedral |
| yekaterinburg-ru | E-burg asv2019-05 img46 view from VysotSky.jpg | Sunset panorama over the city and the river from Vysotsky tower |

### Placeholder left for Sean

- **abala** (Abala, Niger): Category:Abala, Niger contains only "Paysage Abala I/II/III" (open savanna) and "N25 Abala" (a highway through the bush). None of them shows the town, so I left the placeholder. If a landscape near Abala is acceptable to you, `N25 Abala.jpg` is the best of them.

## 3. Duplicate image groups (8 groups)

| group | shared image actually shows | kept by | replaced |
|---|---|---|---|
| can-tho-vn, ho-chi-minh-city-vn, phnom-penh-cambodia | Phnom Penh skyline (TK district, Dec 2024) | phnom-penh-cambodia | can-tho-vn → Can-tho-tuonglamphotos.jpg (aerial over the river and the city); ho-chi-minh-city-vn → Ho Chi Minh City Skyline at Night.jpg (towers reflected in the river) |
| florianopolis-br, paraty-historic-center | Paraty | paraty-historic-center | florianopolis-br → Florianópolis .jpg (central high-rises over older rooftops) |
| joao-pessoa-br, port-sudan | **Neither**: it's Antônio Vaz island, Recife | nobody | joao-pessoa-br → João Pessoa (Paraíba).jpg (aerial with the beachfront towers); port-sudan → PortSudan center harbour.jpg (city centre with the port cranes) |
| kigali-rwanda, mbuji-mayi-cd | Kigali (high-angle street view, 2018) | kigali-rwanda | mbuji-mayi-cd → Mbuji-Mayi, DR Congo.jpg (aerial along a main road) |
| kolwezi-cd, lubumbashi-cd | **Neither**: it's downtown Lusaka, Zambia | nobody | lubumbashi-cd → Downtown Lubumbashi … 20061130.jpg (city-centre street); kolwezi-cd → Kamoto Mine - panoramio.jpg (see note) |
| konya, new-orleans-usa | New Orleans CBD from the air | new-orleans-usa | konya → Konya 21 (cropped).JPG (wide view over the city) |
| mexico-city-mexico, santiago-de-queretaro-mx | Mexico City (CDMX overflight) | mexico-city-mexico | santiago-de-queretaro-mx → Querétaro panorámica centro, jardín Zenea.jpg (historic-centre panorama; the square crop lands on the church and plaza) |
| minsk-by, vilnius-old-town-d34-15 | Vilnius old town | vilnius-old-town-d34-15 | minsk-by → Minsk skyline near Niamiha (evening).jpg (river and the skyline near Niamiha) |

Three groups were cross-country errors: João Pessoa and Port Sudan were both showing Recife, Kolwezi and Lubumbashi were both showing Lusaka, and Konya was showing New Orleans. All of them now show their own city.

**Kolwezi note:** Commons has almost nothing for the town itself, mostly mine pits, minerals and 1970s mine photos. Kamoto Mine (the headframe at the end of a street with mine buildings) is the copper-mining industry Kolwezi exists for, but it is not a city-centre view. Flagged for Sean's review.

## Weak picks worth a look

- **arar**: a landmark close-up, not a wide view. Commons has nothing wider.
- **kolwezi-cd**: a mine-site street, not the city centre. Commons has nothing better.
- **abala**: still a placeholder (see above).
