# Landmark quarantine report — 2026-10-29

## Result

The quarantine ruling is reflected for these four exact IDs:

- `great-wall-of-china`
- `georgetown-st-georges-cathedral`
- `paramaribo-presidential-palace`
- `punta-arenas-magellan-monument`

At baseline `c32c3da`, the three mislabeled scrub-review entries were already absent from the live bank and present once each in the quarantine file as a result of the earlier scrub split. This change moved the remaining live entry, `great-wall-of-china`, to quarantine with its complete record unchanged. All four IDs now occur exactly once in quarantine and zero times in the live bank.

| File | Before | After | Change |
|---|---:|---:|---:|
| `assets/locations-landmarks-sol.json` | 333 | 332 | -1 |
| `assets/locations-landmarks-quarantine.json` | 115 | 116 | +1 |

The Wall was also removed from the curated Landforms derivation and from the extent sidecar generator. Regeneration produced 133 Landform IDs and `assets/extents.json` now contains only `great-barrier-reef` and `grand-canyon`. The Reef and Canyon record hashes stayed byte-identical across regeneration:

- `great-barrier-reef`: `2aa40b83bce60432159b1c969099b9d0f5164b028213619ba8f602809b317219`
- `grand-canyon`: `0a19e0b247411a732c39a5509da20aa8008a9a41776283eb22b83a1778dfc977`

Wall-specific extent scoring assertions were removed. The polygon scoring coverage remains on the Reef and the line scoring coverage remains on the Canyon.

## Reference sweep

A literal-ID sweep of `src/` and `test/` found no remaining references to any of the four quarantined IDs after the Wall fixture assertions and generated Landforms membership were updated. There were therefore no live routes, dex entries, or other hardcoded fixtures to resolve or skip. Historical/review and data-processing references outside those runtime and test trees were left intact. `credits.html` was not changed.

## Final pool counts

| Pool | Count |
|---|---:|
| Live landmarks bank | 332 |
| Landmark quarantine | 116 |
| Landmarks pack pool | 199 |
| Landforms set / pack pool | 133 |
| Combined pack total (207 Capitals + 199 Landmarks + 133 Landforms) | 539 |
| Survival city derivation | 805 |
| Survival landmark derivation | 300 |
| Combined Survival pool | 1,105 |

## Verification

- `python3 scripts/pack-landforms/derive.py` — passed; generated 133 IDs without the Wall.
- `node build/make-extents.mjs` — passed; regenerated only the Reef and Canyon records.
- `node --test test/*.test.mjs` — passed: 13 tests, 0 failures, 0 skipped.
- `git diff --check` — passed.

