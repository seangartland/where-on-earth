# Meteora move report, 2026-10-30

Ruling executed: Meteora (id `meteora-greece`) moved from the cities file to
the landmarks bank, following the Persepolis precedent exactly. Worktree only;
nothing committed, pushed, or deployed.

## The move

- `assets/locations.json`: the meteora-greece block removed verbatim (15 lines,
  no other change). Cities 804 → 803.
- `assets/locations-landmarks-sol.json`: the entry appended in the bank's
  Persepolis field order (18 lines added, no other change). Bank 432 → 433.
- Same coordinates (39.7217, 21.6306), same photograph, same clue
  ("Meteora, Greece 🇬🇷"). No image credit fields exist on the cities entry,
  so none were carried.
- `kind`: "landmark" (built religious complex). `category`: "city", matching
  the Persepolis bank entry and comparable monastery entries (Lalibela,
  Nalanda), whose bank shape keeps category "city".
- `sets`: ["Sacred Sites"], the bank's set for active religious complexes
  (Lalibela carries it; 29 members). The cities entry had sets [].

## The entry as moved (full object)

```json
{
 "id": "meteora-greece",
 "short": "Meteora",
 "clue": "Meteora, Greece 🇬🇷",
 "fact": "Of the 24 monasteries built atop Meteora's giant rock pillars from the late 14th century on, six still function today; monks once reached them by removable ladders and hoisting ropes before steps were carved into the rock in the 1920s.",
 "lat": 39.7217,
 "lng": 21.6306,
 "difficulty": 5,
 "image": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Meteora_Panoramic_View.jpg/1280px-Meteora_Panoramic_View.jpg",
 "country": "Greece",
 "continent": "Europe",
 "sets": [
  "Sacred Sites"
 ],
 "difficultyWhy": "p.65·fb196·K0·iso360 → 18.4 → 5",
 "category": "city",
 "kind": "landmark"
}
```

## Fact: enriched, both versions

The stored fact was accurate but thin: it never said the monasteries sit on
rock pillars, the place's defining and non-transferable feature, and
"dramatically situated" is filler. Enriched per the locations skill and
verified live against the en.wikipedia "Meteora" article (24 monasteries
established atop the pillars mainly from the second half of the 14th century;
six still functioning; access was by removable ladders or hoisting ropes;
steps carved into the rock in the 1920s).

- Before: "Meteora's monastic community began forming in the 14th century;
  six of its dramatically situated monasteries remain active today."
- After: "Of the 24 monasteries built atop Meteora's giant rock pillars from
  the late 14th century on, six still function today; monks once reached them
  by removable ladders and hoisting ropes before steps were carved into the
  rock in the 1920s."

## Difficulty: rescored from scratch, both ways recorded

Frozen adapted v2 landmark scorer (scripts/landmark-pass/resolve.py then
score.py, which execs scripts/difficulty/v2-data/score_v2.py's own frozen
definitions and cuts; score_v2.py unmodified). The cities difficulty was not
carried; it was recomputed from the entry's own pin, country and article.

- Resolution: article "Meteora" (stored v2 title), Q3125051, article
  coordinates 1 km from the pin, no flags. 12-month window 2025-10..2026-09:
  mean 538.6 views/day, median month 525.6/day, max/median 1.28.
- Mean basis: p.65, fb 196 km, K0, iso 360 km → loss 18.4 → difficulty 5.
- Median basis: p.64, fb 196, K0, iso 360 → loss 18.7 → difficulty 5.
- Spike check: not contaminated (mean/median ratio 1.02; same level and same
  rarity band both ways). Adopted: mean basis, difficulty 5, difficultyWhy
  "p.65·fb196·K0·iso360 → 18.4 → 5" (the scorer's own string, verbatim).

Note: the numeric result equals the old cities score because the inputs are
the same pin, country fallback and article; it is a fresh computation, not a
carry-over.

## Pool counts (measured with the game's own pool code)

| Pool | Before | After |
|---|---|---|
| World Capitals | 207 | 207 |
| Landmarks | 218 | 219 |
| Landforms | 173 | 173 |
| Combined packs | 598 | 599 |
| Cities file | 804 | 803 |
| Bank | 432 | 433 |
| Passport grand total (cities + bank) | 1236 | 1236 |

Meteora enters the Landmarks pool by the normal rules (kind "landmark",
playable image, in neither the ancient-cities nor the battle-sites held set;
verified absent from both files). It remains playable in Survival and Trivia
through the bank, as with Persepolis; the merged Survival pool count test
confirms no duplicates.

## Checkpoints

- Photo URL: HTTP 200, image/jpeg, 189,327 bytes (live fetch).
- Uniqueness: id `meteora-greece` and normalized shortName "meteora" occur
  only in the bank after the move; absent from cities and from quarantine
  (202 entries).
- Daily pins: `meteora` absent from assets/daily-pins.json (checked before
  the move and re-checked in this worktree after it). Pins cover
  2026-10-12..2026-10-31; the removal re-derives unpinned future days only.
- Pin audit (`scripts/pin-audit.py --locations
  assets/locations-landmarks-sol.json --ids meteora-greece --reverse`):
  stored pin <0.5 km from the OSM mapped centre, 1-2 km from Wikidata, gate
  result 0 flagged at >= 3 km. Reverse geocode: "Μετέωρα - Καστράκι,
  Kalambaka, Meteora Municipality, Trikala Regional Unit, Thessaly, Greece".
  Nearest other entry: Mount Olympus, 73.4 km.

## Test changes (suite 83/83 green on the final tree)

- test/pack-pools.test.mjs: Landmarks pool 218 → 219.
- test/passport-packs.test.mjs: section totals [207, 218, 173] →
  [207, 219, 173]; combined total 598 → 599.
- test/survival-merge.test.mjs: cities in merged pool 804 → 803 (both
  assertions).
- test/extent-aware-scoring.test.mjs: the unpinned 2026-11-03 Daily fixture
  re-derived with 803 cities, per the Persepolis precedent:
  ids ['kota-kinabalu-my', 'brisbane-australia', 'port-vila-vanuatu',
  'dili-timor-leste', 'limassol-cy'], exact distances [293.2071286729357,
  270.15756704413525, 284.5587253227626, 292.5216854592254,
  253.27139316113895], scores [[293, 941, 941], [270, 946, 946],
  [285, 943, 943], [293, 941, 941], [253, 950, 950]]. The pinned 2026-10-18
  fixture is untouched and still passes; no played or in-play day changes.

## Pipeline notes for banking

- scripts/landmark-pass/resolved.json and scores.json were regenerated by
  the scoring run (433 rows) and then reverted to HEAD in this worktree, per
  the standing precedent (the Persepolis move did not bank them either; the
  committed resolved.json predates the current bank). Meteora's resolution
  and score rows are recorded in full above.
- A fresh full-pipeline rerun does not reproduce about twenty stored bank
  difficulties (score.py's REPRO list: e.g. lake-bled, crater-lake,
  moraine-lake, yellowstone-national-park), because border-conversion-era
  anchor and geometry changes postdate those entries' stored scores. This
  drift predates this move and is flagged, not fixed: no bank difficulty
  other than Meteora's was written. A bank-wide rescore is a separate,
  unapproved job.
- Final diff: 6 files, +24/-21 (two data files, four test files).
