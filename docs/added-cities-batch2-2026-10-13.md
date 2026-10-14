# Added cities batch 2: 2026-10-13 (32 cities)

Result: active dataset 779 → **811**. Preserved landmarks file unchanged (903).

Method: generation, image sourcing, v2 scoring and audits by Opus (Claude Code)
following `~/workspace/skills/where-on-earth-locations/SKILL.md`. Two runs were
killed by VM replacements (2026-10-13 16:41 UTC and 2026-10-14 00:49 UTC); each
resume audited the surviving `.batch2/` staging and continued from it. Analysis
(coordinates, facts, v2 scores, regions, Nominatim) was finished in the first
run; images were finished across the second and third. Full per-city record:
`.batch2/log.md` (not committed, working data).

Final checks run before merge (`.batch2/final_checks.py`): dedupe by id and
short name against both asset files and within the batch, 25 km proximity
against all active entries, banned-phrase scan over the 32 facts (0 hits; all
32 also read in full), clue policy, image URL HEAD 200 + MIME, denylist and
uniqueness against both asset files (`.batch2/img_validate.py`, 0 problems),
and a visual check of every image as a center-square crop.

## The 32 cities (difficulty = v2 level from the frozen scorer)

| City | Country | Level | City | Country | Level |
|---|---|---|---|---|---|
| Verona | Italy | 5 | Kuantan | Malaysia | 5 |
| Pisa | Italy | 5 | Miri | Malaysia | 9 |
| Padua | Italy | 6 | Kota Kinabalu | Malaysia | 9 |
| Messina | Italy | 7 | Valdivia | Chile | 8 |
| Brighton | England | 4 | Concepción | Chile | 7 |
| Nottingham | England | 3 | Bremen | Germany | 5 |
| Southampton | England | 3 | Bonn | Germany | 4 |
| Bradford | England | 4 | Haifa | Israel | 3 |
| Reims | France | 5 | Split | Croatia | 4 |
| Grenoble | France | 6 | El Paso | Texas, US | 6 |
| Dijon | France | 5 | Green Bay | Wisconsin, US | 4 |
| Utrecht | Netherlands | 4 (see note) | Grand Rapids | Michigan, US | 4 |
| Leiden | Netherlands | 4 | Tulsa | Oklahoma, US | 3 |
| Gwalior | India | 7 | Santa Barbara | California, US | 3 |
| Kozhikode | India | 8 | New Haven | Connecticut, US | 3 |
| Jamnagar | India | 8 | Thiruvananthapuram | India | 7 |

Level spread: 3 ×6, 4 ×8, 5 ×6, 6 ×3, 7 ×4, 8 ×3, 9 ×2.

Notes:
- US clues show the state (`City, State 🇺🇸`) and were scored with the state
  population centre as the fallback, per the region policy. England clues are
  flagless `City, England`; all others `City, Country` + flag.
- Region stored on 24 of 32. Unstored under the standard classify gates: the 4
  England entries (UK nations never store a region), Utrecht, Leiden, Haifa,
  Split (country dispersion under the 200 km threshold).

## Wrocław: duplicate, not added

The batch request had 33 cities. Wrocław is already active as `wrocaw-pl`
(the id drops the "l"; short "Wrocław", coordinates identical to GeoNames
3081368, level 3), so it was excluded under the dedupe rule. That is why the
deliverable is 32. Side note, not touched: `wrocaw-pl` has no `region` field.

## Utrecht: scored on the median month (Durrës precedent)

Utrecht's 12-month mean is 4,473 pageviews/day, but that mean comes from one
anomalous month: the median month is 735.1/day (max/median 42.0). The mean
gives p.99 → loss 3.2 → level 1. Sean decided (2026-10-13) to apply the
Durrës precedent: scored with the scorer's own machinery on the median month,
`p.72·fb5·K0·iso148 → 10.0 → 4`. **Level 4.** Geography inputs unchanged; the
frozen pipeline is untouched. The Durrës correction itself (level 1 → 4, commit
60ce397) ships in this same deploy.

## Images (all Wikimedia Commons; all HEAD 200, unique, denylist-clean)

No-credit (PD/CC0), 15: Verona (PD, MM), Padua (CC0, Ricalvo10), Grenoble (PD,
Milky), Utrecht (PD, Ischa1), Leiden (CC0, Arch), Gwalior (CC0, Shivam992200),
Kuantan (CC0, Slleong), Bonn (CC0, ADwarf), Haifa (CC0, niros), Split (PD,
Lpuljak), El Paso (PD, Smguy101), Green Bay (PD, Milwaukee3181), Grand Rapids
(PD, Grguy2011), Tulsa (PD, Okiefromokla), New Haven (PD, Ragesoss).

Attribution required (CC BY / BY-SA), 17, recorded here per the skill:
- Pisa: CC BY-SA 3.0 de, Arne Müseler
- Messina: CC BY-SA 4.0, Ad Meskens
- Brighton: CC BY-SA 4.0, kallerna
- Nottingham: CC BY 2.0, Arran Bee
- Southampton: CC BY-SA 2.0, Peter Trimming
- Bradford: CC BY 4.0, Joedinator
- Reims: CC BY-SA 4.0, Mathieu Kappler
- Dijon: CC BY-SA 3.0, François de Dijon
- Kozhikode: CC BY 3.0, Choosetocount
- Jamnagar: CC BY-SA 4.0, Arunnimbel
- Thiruvananthapuram: CC BY-SA 4.0, Navaneethpp
- Miri: CC BY-SA 4.0, Pangalau
- Kota Kinabalu: CC BY 2.0, Jason Thien
- Valdivia: CC BY-SA 3.0, Kaworukoneru
- Concepción: CC BY-SA 4.0, Nicolas Sanhueza
- Bremen: CC BY-SA 4.0, JoachimKohler-HB
- Santa Barbara: CC BY 4.0, Quintin Soloviev

Each fallback was taken only after the no-credit options failed a rule (no
city view, historic print, single landmark, title not naming the city, or a
crop that is mostly sky); the reason per city is in `.batch2/images.json`
(`note`). credits.html lists no individual photos (same as prior batches); the
17 above join the batch-1 seven in that backlog if Sean wants photo credits.

## Exceptions and flags

- **25 km proximity, 4 hits, all kept as distinct cities (none is a district
  of an existing entry):** El Paso ↔ `ciudad-juarez-mx` 4.9 km (twin cities
  across the US–Mexico border, different countries), Bradford ↔
  `huddersfield` 16.2 km, Leiden ↔ `the-hague-nl` 16.4 km, Bonn ↔
  `cologne-de` 24.4 km.
- **Kozhikode:** two CC0 files titled "Kerala's Tallest Skyline" were rejected:
  they look processed or composited, and the skyline shown is not credible as a
  real photo of the city. A PD aerial was rejected because the aircraft window
  frame dominates it. Shipped a CC BY city view from atop a building instead.
- **El Paso:** a PD bird's-eye candidate was rejected because its backdrop is
  the Sierra de Juárez, so the city shown may be Juárez. Shipped "Central El
  Paso" (from Scenic Drive).
- Weaker but rule-compliant photos: Gwalior (Baija Taal lake in the city; the
  only no-credit option, chosen over CC BY-SA fort views), Green Bay
  (street-level downtown, Broadway District), Nottingham (aerial over the Trent
  with two sports grounds in frame), Jamnagar (Lakhota Lake at sunset, city
  skyline behind).
- No placeholder images, no historic photos, no montages.
