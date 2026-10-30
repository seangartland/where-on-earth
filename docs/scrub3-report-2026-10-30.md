# Scrub 3 report, 2026-10-30

Executed per `.build-tmp/scrub3-brief.md` in the `woe-scrub3` worktree at
84f45ee, on Sean's 2026-10-30 ruling (drop all the obscure entries flagged by
the two audit-2 reports). Not committed, not pushed, not deployed.

## Outcome

- **20 entries moved** from the landmarks bank
  (`assets/locations-landmarks-sol.json`) to the quarantine file
  (`assets/locations-landmarks-quarantine.json`), each entry object preserved
  exactly (verified object-identical after the move by canonical-JSON
  comparison; the two files' diffs are a symmetric 332 lines out / 332 lines
  in, same indent-1 serialization).
- **Bank 470 → 450; quarantine 116 → 136.**
- **Pools, measured with the game's own helpers** (`packPool`,
  `landmarkPackPool`, `landformPackPool` from `src/meta/pack-store.js`):

  | Pool | Before | After |
  |---|---|---|
  | Capitals | 207 | 207 |
  | Landmarks | 223 | 215 |
  | Landforms | 206 | 194 |
  | Combined | 636 | 616 |

  All match the brief's expected results.
- Suite: **83/83** (`node --test test/*.test.mjs`), same as the pre-change
  baseline run.

## The 20 ids, destination confirmed

All 20 verified absent from the bank and present in quarantine after the
move. Landmarks drops (8): pucara-de-tilcara, sewell-mining-stairways,
mandela-rivonia-arrest-liliesleaf, humberstone-saltpeter-works,
salvador-pelourinho, yapahuwa-rock-citadel,
plaza-mayor-of-salamanca-d34-70, tsodilo-hills-bw.
Landforms drops (12): piedra-del-cocuy, great-sea-reef, ak-baital-pass,
nourlangie-rock, yolyn-am-mongolia, champagne-pool, balanced-rock-utah,
monkey-gorge-zimbabwe, pohutu-geyser, blyde-river-canyon,
serra-da-capivara-boqueirao, halemaumau-crater.

The Antarctic hut cluster was not touched: amundsen-scott-south,
mcmurdo-hut-point, scott-hut-cape-evans, shackleton-hut-cape-royds,
whalers-bay-deception, and port-lockroy all remain in the bank.

## Landforms wiring: derive mechanism per id

`src/meta/pack-landforms.js` was regenerated with
`scripts/pack-landforms/derive.py`, never hand-edited. The regenerated diff
is exactly the 12 dropped ids removed and nothing added; a second run is
idempotent; `PACK_LANDFORM_IDS` is 194.

- **Removed from `CURATED_ADDITION_IDS` in derive.py (8):** ak-baital-pass,
  balanced-rock-utah, champagne-pool, great-sea-reef, nourlangie-rock,
  piedra-del-cocuy, serra-da-capivara-boqueirao, yolyn-am-mongolia. These
  had to leave the curation list explicitly: derive.py raises if a curated
  id is missing from the bank. A provenance comment in derive.py records
  the scrub-3 removal.
- **Left through classification on their own (4):** blyde-river-canyon,
  halemaumau-crater, monkey-gorge-zimbabwe, pohutu-geyser. These entered
  the set only because the name pattern matches a formation word in the
  entry's name+id ("canyon", "crater", "gorge", "geyser"); classification
  iterates bank entries only, so quarantining the entries removed them
  with no derive.py change.

## Registry checks

- **assets/extents.json: no cleanup needed.** None of the 20 ids is a key
  in extents.json and none of the 20 entries has kind `extent`; the file
  is untouched (sha256 `8be73c99…`, unchanged). The generator
  (`build/make-extents.mjs`) could not be re-run in this worktree because
  its source files under `build/extent-sources/` are gitignored and
  absent; with no extents record affected, byte-consistency is preserved
  trivially.
- **APPROVED_AREAS: no cleanup needed.** The manifest
  (`scripts/validate-landmarks.mjs`, mirrored in
  `test/extent-aware-scoring.test.mjs`) holds 26 ids; none is a dropped
  id. The two dropped entries with kind `area` (great-sea-reef,
  yolyn-am-mongolia) carry no `extentKm` and were never admitted areas.
- **scripts/validate-landmarks.mjs:** reports 20 problems after the move
  and the identical 20 on the pristine HEAD baseline (median-rescore
  `difficultyWhy` annotations the script's regex predates, and chunk-3
  admitted areas its manifest predates). The scrub adds and removes no
  validator problems.
- **Left as-is, per scrub precedent:** dropped ids still appear by
  reference in `assets/expeditions.json` (halemaumau-crater, 1),
  `assets/weekly-expeditions.json` (8 of the 20), and
  `assets/trivia-bank.json` (6 of the 20), plus historical scratch
  (difficulty data, image-audit records, review CSVs, archive daily
  freezes). Previous scrubs (a7d12c6, bbce71b) touched only bank,
  quarantine, derive inputs, and tests, and these files already carried
  dangling references to quarantined ids before this scrub
  (expeditions.json 5, weekly-expeditions.json 16, measured at HEAD), so
  no cleanup was made there. Flagged here in case Sean wants a separate
  expedition/trivia reference pass.

## Daily impact

None. None of the 20 are cities; `assets/daily-pins.json` contains none of
the 20 ids (verified by exact-id search) and is untouched, as is Daily
selection.

## Test changes (2 files, counts only)

1. `test/pack-pools.test.mjs`: `PACK_LANDFORM_IDS` size 206 → 194 (test
   title updated to match); landmark pool count 223 → 215.
2. `test/passport-packs.test.mjs`: section totals [207, 223, 206] →
   [207, 215, 194]; combined total 636 → 616.

No other test changed; no dex pin moved (the passport dex numbering suite
passes unmodified).
