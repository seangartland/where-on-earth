# Added cities, 2026-10-12

17 cities added to `assets/locations.json` (738 → 755). Lyon was restored from `assets/locations-landmarks-sol.json` and removed from that file. The other 16 are new entries.

**Difficulty:** v2 pipeline (`scripts/difficulty/v2-data/score_v2.py`, frozen CUTS `[4.7, 7.0, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7]`).
- **Views:** measured live from en.wikipedia (2025-10..2026-09) via `resolve.py`. Article titles were hand-mapped in `hand-titles.json`. Every one passed the settlement guard. Hyderabad = Q1361 (India), Barcelona = Q1492 (Spain).
- **Distances:** dFb and d1M come from GeoNames cities15000.
- **K:** from the 75-country list. None of these countries is on it, so K = 0.
- **US cities:** the 8 US clues name their state, so they were added to `UNIT` with their state as the fallback centre, the same rule already used for Albuquerque, Columbus and Tampa.
- **Existing entries:** the run was checked against all 738. None changed.

**Photos:** single Commons photographs, 500px thumbs on upload.wikimedia.org. All 17 returned HEAD 200. No placeholders were needed.

| ID | Difficulty | v2 why | Photo |
|---|---|---|---|
| barcelona-spain | 1 | p.99·fb472·K0·iso504 → 4.0 → 1 | Evening light over Barcelona: wide elevated view over the city grid and port |
| hyderabad-india | 1 | p.99·fb407·K0·iso253 → 4.0 → 1 | Aerial view of Durgam Cheruvu lake, its cable bridge and HITEC City |
| medellin-co | 3 | p.82·fb87·K0·iso245 → 7.6 → 3 | Panorama of the Aburrá valley from Cerro El Picacho |
| cusco-peru | 6 | p.77·fb550·K0·iso322 → 31.9 → 6 | Cusco skyline, Oct 2025: red-roofed city and surrounding hills |
| la-paz-bolivia | 5 | p.77·fb270·K0·iso361 → 17.3 → 5 | La Paz Skyline: city at dusk with Illimani behind |
| fortaleza-br | 9 | p.55·fb1733·K0·iso630 → 170.4 → 9 | Vista de Fortaleza, 2021: rooftops and high-rises |
| yogyakarta-id | 6 | p.57·fb346·K0·iso90 → 35.7 → 6 | Malioboro Street with a becak. Street level, not a wide view: Commons had no single-photo city panorama |
| gyeongju-kr | 5 | p.56·fb173·K0·iso35 → 19.6 → 5 | Gyeongju from Namsan Mountain: the city's plain seen from the ridge |
| boise-usa | 3 | p.82·fb76·K0·iso842 → 7.6 → 3 | Boise, Idaho: boulevard into downtown with the foothills behind |
| oklahoma-city-usa | 2 | p.86·fb51·K0·iso305 → 6.6 → 2 | Drone shot of the downtown skyline |
| des-moines-usa | 3 | p.82·fb72·K0·iso495 → 7.6 → 3 | Des Moines skyline |
| little-rock-usa | 3 | p.86·fb77·K0·iso471 → 8.8 → 3 | Little Rock skyline: elevated view over downtown |
| buffalo-usa | 4 | p.92·fb450·K0·iso100 → 10.8 → 4 | Buffalo, NY skyline: downtown and the ballpark |
| juneau-usa | 6 | p.85·fb850·K0·iso1401 → 32.2 → 6 | Juneau (cropped): elevated view of the harbour, a cruise ship and the mountains |
| spokane-usa | 4 | p.84·fb315·K0·iso448 → 14.3 → 4 | Spokane skyline over the river gorge |
| providence-usa | 2 | p.86·fb7·K0·iso232 → 6.6 → 2 | Providence skyline across the river |
| lyon-france | 4 | p.86·fb226·K0·iso340 → 10.1 → 4 | Restored: Part-Dieu skyline, same file as the preserved entry. v1 was "F1·A1·K0·C0·S0 → 3" |

**Notes:**
- Fortaleza scores 9 because few en.wikipedia readers visit its article (343 views/day) and it sits 1,733 km from Brazil's population centre. That matches its peers: Belém 9; Natal and São Luís 10.
- The landmarks-file `barcelona` entry is **Barcelona, Venezuela**, a different city, so it stays preserved. Barcelona, Spain is the new `barcelona-spain`.
- These preserved landmark entries were left untouched: `medellin-botero-plaza`, `cusco-plaza-de-armas`, `la-paz-plaza-murillo`.
