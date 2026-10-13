# Regions Step A verdict application report

## Outcome

Applied the adopted policy verdict to `assets/locations.json`, rebuilding the file from the committed `HEAD` version rather than editing the superseded broad-pilot output.

The resulting dataset retains structured region identity wherever the Step A artifact provides it, displays states for the artifact's 62 state-bearing US entries, and applies the artifact's tentative difficulty only to the 45 US entries that newly gain a displayed state. No broad-pilot clue or difficulty changes remain outside that policy.

## Applied changes

- Added `region` to 479 entries. The production shape is unchanged from the pilot application:

  ```json
  {
    "id": "US.CA",
    "name": "California",
    "outline": "US.CA"
  }
  ```

- Changed 62 US clues to the substitution form `City, State 🇺🇸`:
  - 45 `gains-clue` entries take their state from the artifact's pilot region.
  - 17 `already-region` entries retain their existing city/state wording and drop `, United States`.
- Applied `rescore.newLevel` to the 45 newly state-bearing US entries. Five already had that numeric level (`chicago`, `kansas-city`, `minneapolis-usa`, `nashville-usa`, and `st-louis-usa`), so this produces 40 actual difficulty diffs against `HEAD`.
- Preserved every other field and entry order from `HEAD`, including all `short` values.

The four held entries remain byte-for-byte equivalent as parsed entries to `HEAD`. Non-US clues and difficulties remain at `HEAD`, including the four pilot normalizations and all discarded non-US re-scores. US entries with no artifact region assignment also remain at `HEAD`.

## Verification

`scripts/regions-analysis/apply_step_a.py --verify-only` compares the output field-by-field with both `HEAD:assets/locations.json` and `step-a-changes.json`. It reports:

| Check | Result |
|---|---:|
| Entries | 754 |
| Clue diffs from `HEAD` | 62 |
| Clue diffs that are US entries | 62 |
| Clues matching the artifact-derived `City, State 🇺🇸` value | 62 |
| Newly state-bearing US rescores assigned | 45 |
| Actual difficulty diffs from `HEAD` | 40 |
| Region fields | 479 |
| Held entries changed | 0 |
| Other field diffs | 0 |
| Entries differing from the exact verdict output | 0 |

The verifier also checks unchanged entry order and IDs, exact region object values, exact artifact `newLevel` values across all 45 selected entries, and difficulty bounds.

## Game-code compatibility audit

Searched `src/main.js` for clue consumers and for parsing involving `country`, `United States`, splitting, replacement, suffix checks, and inclusion checks. The substitution format does **not** break a game-code dependency.

- Normal gameplay assigns `item.clue` directly as display text.
- Flag handling extracts the regional-indicator emoji independently or falls back to the structured `item.country` value.
- Country grouping, outlines, and country-mode behavior use structured `item.country`, not a country parsed from `clue`.
- Postcard detail removes only the flag from clue display; it does not expect a country suffix.
- The results breakdown builds its fuller label from `item.short` and structured `item.country`, so it does not depend on `, United States` remaining in the clue.

No game-code change is needed or included.

## Reproduction

From the repository root:

```sh
python3 scripts/regions-analysis/apply_step_a.py
python3 scripts/regions-analysis/apply_step_a.py --verify-only
```

The first command deterministically rebuilds the dataset from committed `HEAD`; the second verifies the checked-out result without rewriting it.
