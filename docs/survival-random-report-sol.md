# Survival random-band change report

## Implementation

- Classic Survival now draws difficulty band 1-10 uniformly and independently for every round, stores that draw on `survival.band`, and displays the stored band in the round header.
- Classic Survival still draws uniformly from playable, non-landmark locations in the selected band. If that band has no playable locations, it draws uniformly from the full playable, non-landmark pool.
- Survival: Tap the Country now draws difficulty band 1-10 uniformly and independently for every round. It retains one without-replacement bag per band. If the drawn band is empty, it chooses uniformly from the bands whose bags still contain countries and stores/displays that effective band.
- Tap the Country ends after a miss or after all ten bags are empty. No country is returned to a bag, so a country cannot repeat within a run.
- Scoring, the 150 km threshold, best-streak keys and values, and Passport behavior were not changed. Existing saved best streaks remain in place; those old bests were set under the ordered 1-10 difficulty climb.
- `assets/locations.json` was not edited as part of this change.

## Verification

Syntax check:

```text
$ node --check --input-type=module < src/main.js
(exit 0, no output)
```

A Node simulation extracted the production random-band and Tap the Country bag-selection logic, used the repository's `assets/country-bands.json` and `assets/country-outlines.topo.json`, and used a seeded LCG (`0x5eed1234`) for reproducibility.

```text
500 band draws: 1:50 2:51 3:47 4:52 5:45 6:53 7:43 8:54 9:55 10:50
Tap run draws: 202
Unique countries: 202
Null draws: 0
Next draw after exhaustion: null
Effective band range: 1 - 10
```

The 500 draws are roughly uniform around the expected 50 per band. The complete Tap the Country simulation drew all 202 countries exactly once, then returned no next country after every bag was exhausted.

`git diff --check -- src/main.js` also passed with no output.
