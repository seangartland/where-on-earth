# Flat Scoring Display Report

## Changes Made

### src/meta/stats.js
- **Line 18**: `BAND_EDGES` rescaled from `[2000, 4000, 6000, 8000]` to `[1000, 2000, 3000, 4000]` with updated comment `/5000 total, five rounds at flat weight 1`
- **Line 88**: `bandLabel` function end value changed from `10000` to `5000` for the top band

### src/game/round.js
- **Lines 179-180**: Removed weight display for Daily game; `gameEls.weight.style.display = 'none'` hides the "1× points" element since all weights are now 1

### Prior Changes (Already Committed in Working Tree)
- **index.html:163**: `max-score` shows `/5,000` (was `/10,000`)
- **src/modes/daily-game.js:204**: `showResults` sets `maxScore` from `WEIGHTS.reduce((sum, w) => sum + w, 0) * 1000` = 5,000
- **src/modes/daily-game.js:403-406**: Removed `reviewEls.mult` text update and display logic from `openRecap`
- **src/modes/daily-game.js:592-593**: Removed `.recap-mult` element from recap HTML and `reviewEls.mult` reference
- **src/game/round.js:98-106**: Removed `gameEls.mult`, added `gameEls.maxScore`
- **src/game/round.js:283-290**: Removed multiplier display in `revealGuess`
- **src/game/round.js:446**: Removed `gameEls.mult.style.display` in `pvpRevealTimeout`
- **src/styles/game.css**: Removed dead `.score-math .mult` and `.peek-text .score-math .mult` rules
- **src/meta/stats.js:156-158**: Histogram buckets changed from 10 to 6 (0k–5k range)
- **src/meta/stats.js:259-260**: Average/Best score labels changed from `/10000` to `/5000`

## Stats Banding Outcome

The `BAND_EDGES` rescaling is a straightforward linear rescale from the 10,000 scale to the 5,000 scale:
- Old bands (10k max): 0–1999, 2000–3999, 4000–5999, 6000–7999, 8000–10000
- New bands (5k max): 0–999, 1000–1999, 2000–2999, 3000–3999, 4000–5000

The four edges now split the 0–5000 range into five equal 1000-point bands, matching the flat scoring where each round contributes 0–1000. The histogram bucketing (6 buckets, 0k–5k) and the band labels in the streak/band UI now align with the 5,000 maximum. No design judgment was required; the rescale is mechanical and preserves the original intent of five equal bands.

## Report-Only List (Stale Multiplier / 10000 References)

Per the brief, these are not changed but documented:

### Share Text with Totals/Denominators
- **src/modes/daily-game.js:125-133** `shareText()` — constructs share string with total score and per-round base scores. Still references `WEIGHTS[index]` for base calculation (line 129) and has conditional multiplier display `(x${WEIGHTS[index]})` (line 130). Since `WEIGHTS = [1,1,1,1,1]`, the multiplier clause never triggers, but the logic remains.

### Other Stale Multiplier References
- **src/modes/daily-game.js:218** `showResults` breakdown — `rawScore = result.base ?? Math.round(result.score / WEIGHTS[i])` uses `WEIGHTS[i]` for per-round base display.
- **src/modes/daily-game.js:405** `openRecap` — `reviewEls.base.textContent = result.base ?? Math.round((result.score * 10) / WEIGHTS[i])` uses `WEIGHTS[i]` for base calculation.
- **src/meta/stats.js:48** `recordHistory` — `base: result.base ?? Math.round((result.score * 10) / host.WEIGHTS[i])` uses `WEIGHTS` for historical base score recording (legitimate; preserves accuracy for past games played under weighted scoring).
- **src/game/scoring.js:26** `scoreGuess` — `return Math.round(base * WEIGHTS[round])` core scoring math (out of scope per brief).

### No Remaining 10000 Scale Displays
All user-facing denominators now show 5,000. The only `10000` references remaining are in PvP poll timers (`src/pvp/group.js`, `src/pvp/h2h.js`), which are unrelated to scoring.