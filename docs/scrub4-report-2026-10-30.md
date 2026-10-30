# Scrub 4 report, 2026-10-30

Executed per `.build-tmp/scrub4-brief.md` in the `woe-scrub4` worktree at
d47e336, on Sean's 2026-10-30 threshold ruling (cut everything under 100
median daily English Wikipedia pageviews in both pools, per
docs/threshold-review-2026-10-30.md) plus the south-beach judgment drop.
Not committed, not pushed, not deployed. (The brief's report spec says
"65 ids"; the set is 66: 28 landmarks fame drops + south-beach + 37
landforms fame drops, matching the brief's own list and arithmetic.)

## Outcome

- **66 entries moved** from the landmarks bank
  (`assets/locations-landmarks-sol.json`) to the quarantine file
  (`assets/locations-landmarks-quarantine.json`), each entry object
  preserved exactly (verified object-identical after the move by
  canonical-JSON comparison; the two files' diffs are a symmetric
  1,136 lines out / 1,136 lines in, same indent-1 serialization).
- **Bank 488 → 422; quarantine 136 → 202.**
- **Pools, measured with the game's own helpers** (`packPool`,
  `landmarkPackPool`, `landformPackPool` from `src/meta/pack-store.js`):

  | Pool | Before | After |
  |---|---|---|
  | Capitals | 207 | 207 |
  | Landmarks | 243 | 214 |
  | Landforms | 204 | 167 |
  | Combined | 654 | 588 |

  All match the brief's expected results.
- Suite: **83/83** (`node --test test/*.test.mjs`), same as the pre-change
  baseline run.

## The 66 ids, destination confirmed

All 66 verified absent from the bank and present in quarantine after the
move.

Judgment drop (1): south-beach.

Landmarks fame drops (28): whalers-bay-deception,
potosi-casa-de-la-moneda, miraflores-locks, mcmurdo-hut-point,
shackleton-hut-cape-royds, port-lockroy, housesteads-hadrians-wall,
katskhi-pillar-hermitage, lucca-walls-d34-50, punakha-dzong-confluence,
kasubi-royal-tombs, kizhi-pogost, brasilia-national-congress,
scott-hut-cape-evans, moai-rapa-nui-ahu-tongariki,
sarajevo-baščaršija-d34-26, bryggen-wharf-d34-36,
chaco-canyon-pueblo-bonito, chavin-de-huantar, moai-quarry-rano-raraku,
valley-of-queens-luxor, equator-mitad-del-mundo, champasak-laos,
piazza-del-campo-d34-51, ben-youssef-madrasa-marrakech,
elvis-sun-studio-first-single, french-quarter-nola,
ouro-preto-tiradentes-square.

Landforms fame drops (37): phong-nha-ke-bang, tsingy-de-bemaraha,
laguna-colorada-viewpoint, flaming-cliffs-bayanzag, lifou-cliffs,
ilulissat-icefjord, el-tatio-geysers, valle-de-la-luna-chile, spitzkoppe,
pico-do-fogo-cape-verde, mt-orohena, mt-yasur, fiordland-national-park,
sagarmatha-national-park, thabana-ntlenyana-summit, fish-river-canyon,
seljalandsfoss, emi-koussi-chad, jokulsarlon-glacier-lagoon,
kirkjufell-iceland, sossusvlei, aletsch-glacier, belize-barrier-reef,
kjeragbolten, yosemite-falls, piton-de-la-fournaise,
waitomo-glowworm-caves, moeraki-boulders, franz-josef-glacier,
colca-canyon, dettifoss, etosha-national-park, geirangerfjord-no,
pitons-of-saint-lucia, skógafoss-d34-43, mt-ngauruhoe,
sossusvlei-dead-vlei.

Note: unlike scrub 3, this cut did take the Antarctic hut cluster
(whalers-bay-deception, mcmurdo-hut-point, scott-hut-cape-evans,
shackleton-hut-cape-royds, port-lockroy all measured under the line).
amundsen-scott-south is not in the set and remains in the bank; it
measured above the threshold.

## Landforms wiring: derive mechanism per id

`src/meta/pack-landforms.js` was regenerated with
`scripts/pack-landforms/derive.py`, never hand-edited. The regenerated
diff is exactly the 37 dropped ids removed and nothing added
(`PACK_LANDFORM_IDS` 204 → 167); a second run is idempotent.

- **Removed from `CURATED_ADDITION_IDS` in derive.py (22):**
  aletsch-glacier, belize-barrier-reef, colca-canyon, emi-koussi-chad,
  fish-river-canyon, franz-josef-glacier, ilulissat-icefjord,
  kirkjufell-iceland, laguna-colorada-viewpoint, moeraki-boulders,
  phong-nha-ke-bang, pico-do-fogo-cape-verde, piton-de-la-fournaise,
  pitons-of-saint-lucia, seljalandsfoss, sossusvlei, sossusvlei-dead-vlei,
  spitzkoppe, tsingy-de-bemaraha, valle-de-la-luna-chile,
  waitomo-glowworm-caves, yosemite-falls. These had to leave the curation
  list explicitly: derive.py raises if a curated id is missing from the
  bank. A provenance comment in derive.py records the scrub-4 removal in
  the scrub-3 style.
- **Left through classification on their own (15):** dettifoss,
  el-tatio-geysers, etosha-national-park, fiordland-national-park,
  flaming-cliffs-bayanzag, geirangerfjord-no, jokulsarlon-glacier-lagoon,
  kjeragbolten, lifou-cliffs, mt-ngauruhoe, mt-orohena, mt-yasur,
  sagarmatha-national-park, skógafoss-d34-43, thabana-ntlenyana-summit.
  These entered only through the name pattern (or, for
  jokulsarlon-glacier-lagoon and kjeragbolten, the ADDITIONS display
  names); classification iterates bank entries only, so quarantining the
  entries removed them with no further derive.py change.

## Registry cleanups

- **APPROVED_AREAS: 4 ids cleaned.** Four dropped entries carry kind
  `area` with an admitted radius: fiordland-national-park (128.5),
  etosha-national-park (203.3), sagarmatha-national-park (29.3),
  belize-barrier-reef (120, the chunk-3 area with the deliberate Blue
  Hole anchor). All four were removed from the manifest copy in
  `test/extent-aware-scoring.test.mjs` (whose deep-equal test derives the
  actual map from the bank, so the manifest must shrink with it). The
  first three were also removed from the second manifest copy in
  `scripts/validate-landmarks.mjs`; belize-barrier-reef was never in the
  validator's shorter manifest (a pre-existing gap: the validator had
  been flagging it as an "unexpected admitted area"). Six further
  dropped entries have kind `area` with no `extentKm`
  (phong-nha-ke-bang, tsingy-de-bemaraha, laguna-colorada-viewpoint,
  valle-de-la-luna-chile, jokulsarlon-glacier-lagoon,
  geirangerfjord-no) and were never admitted areas; no manifest change
  for them.
- **assets/extents.json: no cleanup needed.** None of the 66 ids is a
  key in extents.json and none of the 66 entries has kind `extent`; the
  file is untouched (sha256 `9474f2c8…`, unchanged), so generator
  byte-consistency is preserved trivially.
- **scripts/validate-landmarks.mjs:** 21 problems after the move vs 22
  on the pristine baseline. The one removed problem is the pre-existing
  belize-barrier-reef "unexpected admitted area" flag, which disappears
  with the entry; the scrub adds no new problems. (Header counts move
  with the bank: 488 → 422 entries, approved playable areas 42 → 38.)
- **Left as-is, per scrub precedent (reported, not cleaned):** dropped
  ids still appear by reference in `assets/expeditions.json` (1 of the
  66: mt-yasur), `assets/weekly-expeditions.json` (11 of the 66), and
  `assets/trivia-bank.json` (21 of the 66). The same files already
  carried references to earlier-quarantined ids before this scrub
  (6, 24, and 56 distinct ids respectively), so dangling references of
  this kind predate scrub 4; a cleanup remains a separate pass if Sean
  asks.

## Daily impact

None. None of the 66 are cities; `assets/daily-pins.json` contains none
of the 66 ids (verified by exact-id search) and is untouched, as is
Daily selection.

## Test changes (4 files)

1. `test/pack-pools.test.mjs` (counts): `PACK_LANDFORM_IDS` size
   204 → 167 (test title updated to match); landmark pool count
   243 → 214.
2. `test/passport-packs.test.mjs` (counts): section totals
   [207, 243, 204] → [207, 214, 167]; combined total 654 → 588.
3. `test/passport-dex-numbering.test.mjs` (derived pin): Angkor Wat's
   pinned Landmarks number 11 → 10; the removal of Ahu Tongariki, which
   sorted ahead of it, shifted the derived numbering. This is the
   pre-lock derived model working as designed.
4. `test/extent-aware-scoring.test.mjs` (registry sync, not a count):
   the four admitted areas above removed from the APPROVED_AREAS
   manifest, mirroring the bank change and the validator cleanup.

No other test changed.
