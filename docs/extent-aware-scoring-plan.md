# Extent-aware scoring: one runtime distance, nine area landmarks, zero Daily change

Implement the approved radius model at the one local-round distance choke point, while leaving the separate PvP worker path unchanged: compute `max(0, pinDistanceKm - extentKm)` once for an extent-bearing target, then pass that exact adjusted value through every existing score, display, reward, and mode decision. Keep the generic great-circle function and the frozen v2 difficulty system unchanged. Admit exactly the nine already-banked `kind: "area"` entries with positive `extentKm` to Landmark Survival. Entries without `extentKm` take an explicit raw-distance branch, preserving today's numeric value and behavior.

## 1. Where distance lives now

### Shared local-round path

`src/game/round.js` `revealGuess(guess, restoring)` is the gameplay choke point for every pin-to-location local round. It gets the target from `currentItem()`, calls `src/core/math.js` `distanceKm(guess, answer)` once, and fans the result out as follows:

- Round score: `distanceScore(kmExact)` supplies the base score and `scoreGuess(kmExact, state.daily.round)` supplies the weighted Daily score (`src/game/scoring.js`).
- Reveal km: `Math.round(kmExact)` is shown through `formatKm`; the exact value is also saved as `distanceExact`. `beginBullseyeReveal` and `beginTravelReveal` receive the rounded km for the reveal and travel counter (`src/globe/reveal.js`).
- Postcard/Passport: `recordVisit(..., kmExact, ...)` maps the exact distance through `earnForKm` and `flyoverTier` (`src/meta/passport-store.js`, `src/core/config.js`). Full colour is strictly `< 150 km`.
- Bullseye and Pinpoint: `flyoverTier(kmExact)` selects Pinpoint at `< 5 km`, Bullseye at `< 25 km`, near at `< 150 km`, and the corresponding reveal treatment (`src/core/config.js`, `src/game/round.js`).
- Survival: `survivalRecordGuess(answer, km, kmExact)` ends the run only when the exact value is `> 150 km` (`src/modes/survival.js`). Thus the existing Survival rule treats exactly 150 km as safe, while the postcard rule does not award near at exactly 150 km.
- Weekly and classic Expeditions: both use the same `revealGuess`; they save the same rounded/exact result to the run haul and use the same postcard tier before `completeExpeditionRound()` (`src/modes/expeditions.js`).
- Trivia: it also uses `revealGuess`; `triviaRecordGuess(km, base)` receives the rounded distance and base score (`src/modes/trivia.js`). Its bank entries, not the landmark bank, are the targets.
- Endless: it uses this path but suppresses scoring. The mode is disabled; no behavior should be designed around it.

The reveal route geometry still joins the guessed pin to the stored answer pin (`buildAnswerPath`, `beginTravelReveal`, and `beginBullseyeReveal`). The radius model changes the gameplay distance, not the two coordinates or the drawn route. The displayed travel counter must count to adjusted km even though the route continues visually to the representative answer pin.

`src/core/math.js` `distanceKm` also has non-gameplay callers in `src/globe/outlines.js` for outline dimensions and nearest-border work. Those calls must remain pure great-circle measurements and must not become extent-aware.

### Paths outside the local choke point

- Survival: Tap the Country does **not** call `revealGuess`. `src/modes/tap-country.js` `revealBorders(tap)` consumes the polygon hit/nearest-border result from `bordersHit`; it has no location target or `extentKm`. It remains unchanged.
- PvP does call the client reveal path, but score and displayed km are authoritative server values. `pvp-worker/src/scoring.js` `scoreCoordinates(guess, answer)` computes center distance and score; `src/pvp/play.js` stores the returned `viewerResult`, and `revealGuess` prefers its `distanceKm` and `score`. The worker catalog is generated from `assets/locations.json` and currently contains city rounds only, not landmark rounds. Therefore PvP remains center-scored and unchanged in this scope. Adding landmark PvP later would require carrying `extentKm` into `pvp-worker/src/catalog.js` and applying the same helper semantics in worker scoring before any such rounds ship.
- The frozen v2 difficulty calculation lives under the difficulty scripts/data and is not a runtime consumer. It is explicitly out of scope.

So there are two gameplay distance systems today: one shared local-round computation in `revealGuess`, plus authoritative PvP worker scoring. Only the local-round computation needs the approved change because only it can receive the nine landmarks in this release.

## 2. The change

Add a small exported runtime helper beside runtime scoring in `src/game/scoring.js`, for example `scoringDistanceKm(guess, target)`:

1. Compute `pinDistanceKm = distanceKm(guess, target)` with the existing great-circle function.
2. If the target does not have its own valid, positive `extentKm`, return `pinDistanceKm` directly.
3. Otherwise return `Math.max(0, pinDistanceKm - target.extentKm)`.

Use an own-property/finite-positive check rather than coercing a missing value to zero. The missing-extent branch returns the original floating-point result without doing subtraction or `Math.max`; this is the structural bit-for-bit no-op guarantee. It also makes `null`, zero, negative, string, or non-finite extents ineligible for adjustment rather than silently changing live scoring. Data validation should reject those values for admitted area entries.

Replace only the `distanceKm(guess, answer)` call in `revealGuess` with that helper and continue calling the result `kmExact` (or rename it `scoringKmExact` for clarity). Do not repeat extent subtraction in UI or mode modules. The existing fan-out then gives the same adjusted exact value to:

- base and weighted scoring;
- rounded reveal and saved km;
- travel-counter endpoint;
- postcard, Pinpoint, and Bullseye tier selection;
- Survival's 150 km decision;
- Expedition/run-haul results; and
- Trivia if a future trivia-bank entry explicitly carries a valid extent.

Keep guess and answer coordinates untouched for pins, framing, and route drawing. Keep both rounded and exact stored result fields in their current shapes; they now mean adjusted gameplay distance for extent-bearing rounds.

Update `src/modes/landmarks.js` `isPoolLandmark(item)` with two explicit admission branches:

- preserve the current `kind: "landmark"`, playable-image, matching-v2-rating branch exactly; and
- admit `kind: "area"` only when it is playable and has a finite positive `extentKm`.

That second branch flips in the approved nine entries and no other kinds. It deliberately does not depend on the landmark-only v2 `difficultyWhy` regex, because all nine are approved and `bering-strait` uses an older explanation shape. Add/extend the landmark validator to assert that the area branch resolves to exactly this ID-to-extent map for this release: `amalfi-coast-d34-58: 30`, `bering-strait: 45`, `black-forest: 80`, `daintree-rainforest: 35`, `danube-delta: 50`, `dead-sea: 55`, `great-ocean-road: 122`, `napa-valley-ava: 30`, and `suez-canal: 97`. (`amalfi-coast-d34-58` is the repository ID for the brief's Amalfi Coast entry.)

## 3. Mode-by-mode effects

- **Daily / classic five-round game:** unchanged. `dailyIds`, `bandQueues`, and `resolvePinnedIds` in `src/daily.js` exclude any entry with a non-city `kind`, and the Daily source is the 805-city `assets/locations.json`, whose entries have no `extentKm`. The helper's direct raw branch therefore returns the exact same number. Do not change Daily selection, saved-game schema, scoring weights, or pins.
- **Classic Survival:** unchanged. Its pool explicitly filters playable locations to `!isLandmark(item)` in `src/modes/survival.js`; it draws cities, all without extent.
- **Landmark Survival:** gains exactly the nine approved area entries through the new `isPoolLandmark` area branch. They participate in the existing difficulty-band ramp using their stored difficulty and score/survive/postcard from adjusted distance. Existing point landmarks are unchanged.
- **Survival: Tap the Country:** unchanged. It measures to country/state polygon hit or nearest border and never consumes a location's `extentKm`.
- **PvP (head-to-head and group):** unchanged and city-only. There are no landmark rounds in the generated worker catalog. Server-authoritative center scoring and client display remain as-is. Landmark PvP is a separate future worker/catalog migration, not a partial client change.
- **Classic Expeditions:** an expedition can resolve cities or landmark-bank entries through `findLocation`. If an approved area is later authored into a route, the shared local helper will adjust it automatically; no route data change is required now.
- **Weekly Expeditions:** unchanged in this scope. No weekly route change is needed, and every weekly target without `extentKm` stays center-scored through the explicit raw branch. The three live island stops called out in the brief—Easter Island, Galapagos Islands, and Lord Howe Island—also have no `extentKm`, so they stay center-scored. In the current repository they are stops in the classic Island Hopping route in `assets/expeditions.json`, not in `assets/weekly-expeditions.json`; the scoring conclusion is the same, but verification should preserve that data distinction.
- **Trivia:** continues to calculate distance via `revealGuess`, but its independent `assets/trivia-bank.json` entries currently have no approved extent data. It remains center-scored. Do not infer extent by matching IDs to another asset.
- **Endless:** disabled and unscored; note only. Its shared reveal km would follow the helper if the mode is re-enabled, but no Endless work is part of this build.

## 4. Reveal copy and thresholds

Preserve the existing reveal layout and score formatting. For an extent-bearing target:

- When adjusted exact distance is zero, show `0 km` in the distance field/counter and add the short contextual line **“Inside the feature”** where the reveal hint currently announces accuracy. The score is the existing perfect base (`1000`, or the existing weighted total where applicable). The existing Pinpoint celebration may remain, but the copy must not imply that the guess hit the representative center pin.
- When adjusted distance is above zero, show the normally rounded adjusted km and the score derived from the exact adjusted km. No “distance to centre” value should appear.
- The pin-to-center route remains visible; copy and numeric UI consistently describe scoring distance to the modeled feature edge.

Apply thresholds to exact adjusted distance before rounding:

- exactly `150 km`: no postcard/near tier because postcard earning is strictly `< 150`; Classic/Landmark Survival survives because its existing elimination condition is `> 150`;
- exactly `25 km`: not Bullseye because Bullseye is strictly `< 25` (it remains in the near/postcard tier);
- exactly `5 km`: not Pinpoint, but it is Bullseye;
- zero: Pinpoint and Bullseye-qualified, with “Inside the feature” taking precedence as the explanatory copy.

Do not change threshold operators while doing this work.

## 5. Edge cases and data limits

- **Extent larger than pin distance:** clamp to zero. Never produce a negative distance, negative reveal counter, or score above 1000.
- **Guess on the modeled border:** mathematical equality produces zero. Tests should use a tolerance for coordinate construction/floating-point great-circle math, while separately unit-testing the pure subtraction boundary exactly.
- **Far side of a long/irregular feature:** the approved radius is intentionally an approximation around one representative pin. A guess may receive a discount even when a real boundary would be farther away, or be penalized while geographically inside an irregular feature. Do not add shape-specific logic in this release; better polygons/axes would be a different model and data pass.
- **Pin-noise floor:** the measured median pin error is 0.78 km, far smaller than the approved extents (minimum 30 km). The clamp absorbs that noise for area guesses. Do not subtract a global 0.78 km floor: that would violate the strict no-op for cities and point landmarks.
- **Malformed extent:** it must neither adjust scoring nor admit an area. Validation fails the data build for an intended playable area rather than coercing the value at runtime.
- **Gurudongmar Lake:** remains parked and unplayable. It is absent from the landmark bank and its trivia-bank record lacks the `photo: "verified"` gate required by `src/modes/trivia.js`, so it cannot enter either playable pool. The known record has a roughly 1,061 km wrong pin and garbled supporting data in the trivia promotion material. Do not add, repair, match, or infer an extent for it in this build.
- **Lakes follow-up:** before a lake can join, it needs a verified representative pin, corrected clue/fact/photo as necessary, a reviewed positive `extentKm` under the same radius semantics, a playable kind/pool decision, a difficulty value, and validation fixtures. After that data review, a lake represented as an approved `kind: "area"` with valid extent would join through the same admission branch and require no new runtime-scoring code. Gurudongmar must complete its pin/content repair first.

## 6. Verification plan

Add focused Node tests using the repository's existing `node:test` style. Keep geometry/helper tests DOM-free.

1. **Runtime helper matrix for all nine areas.** Load the landmark JSON, assert the exact approved ID/extent map, and for each target sample a guess inside the radius, on the radius, and outside it (for example at `0.5×`, `1×`, and `1.5×` extent along a constructed great-circle bearing). Assert adjusted results of approximately `0`, `0`, and `0.5× extent`, never negative. Separately test the pure boundary arithmetic with exact numeric inputs.
2. **Score propagation.** For representative inside, 24.999/25, 25, 149.999/150, and outside points, assert `distanceScore`, rounded display input, `flyoverTier`, postcard tier, and Survival miss behavior all consume the same adjusted exact value. A small exported pure result/threshold helper is acceptable only if needed to test existing logic without a DOM; do not create a new scoring abstraction solely for tests.
3. **No-extent regression.** Sample cities across difficulty bands plus point landmarks. Assert the helper result is strict-equal (`Object.is`/`===`, allowing ordinary positive values) to direct `distanceKm`, and assert base/weighted scores and rounded km match frozen pre-change fixtures. Include missing, `undefined`, and `null` extent cases so the no-op is structural.
4. **Pool gate.** Assert the existing landmark pool is preserved and the new pool delta is exactly the nine approved IDs. Assert settlements, extent-less areas/lakes, malformed extents, and Gurudongmar do not enter. Run `scripts/validate-landmarks.mjs` and `scripts/validate-weekly-expeditions.mjs`; update validator expectations only where the approved nine change the pool contract. Record the current baseline first: on this checkout `validate-landmarks.mjs` already fails on `isla-foca`'s legacy `difficultyWhy`. That unrelated failure must remain a separately tracked baseline issue, not be repaired or counted as an extent-scoring regression in this build.
5. **Fixed-date Daily regression.** Before implementation, capture `dailyIds`/`resolvePinnedIds` and per-round score+rounded-km fixtures for at least one pinned and one derived fixed date with fixed guesses. Afterward assert identical IDs, distances, base scores, weighted scores, and serialized result fields. This proves both selection and runtime outputs stay unchanged.
6. **Mode checks.** Headlessly assert Classic Survival remains city-only; Tap the Country's `revealBorders` path remains independent of the extent helper; Trivia targets without extent take the raw branch; and the Easter Island, Galapagos, and Lord Howe records have no extent and remain center-scored in the classic Island Hopping route. Verify no current weekly route uses those three IDs, the PvP catalog contains no approved area IDs, and the existing PvP scoring parity test remains unchanged and passing.
7. **Browser/phone smoke check.** With deterministic/dev-selected rounds, play one inside-area guess, one outside-area guess, an ordinary landmark, a city Daily, Landmark Survival around 150 km, one of the three center-scored Island Hopping stops, and a current Weekly stop. Confirm reveal km, score, copy, animation counter, postcard/Bullseye/Pinpoint treatment, run survival, result breakdown, and replay/restoration all agree.

Headless verification covers formulas, all nine data records, pool membership, thresholds, Daily identity, validators, and PvP non-involvement. Sean's phone check is needed for the “Inside the feature” copy, reveal-sheet fit, the adjusted travel counter against a center-pin flight, celebration choice, and touch-flow regressions.

## 7. Build sequence and estimated size

1. **Freeze regressions and add helper tests — 0.5 day.** Capture fixed city/point-landmark/Daily fixtures, the nine-entry matrix, and the existing `isla-foca` validator failure before changing runtime behavior. Verify the new fixtures headlessly without expanding scope to repair that baseline data issue.
2. **Add the extent-aware runtime helper and use it once in `revealGuess` — 0.25 day.** Keep `distanceKm` generic. Verify helper, score, tier, Survival, persistence, and no-extent tests headlessly.
3. **Open the Landmark pool gate for the nine areas and strengthen validation — 0.25 day.** Verify exact nine-entry pool delta and both landmark/weekly validators headlessly.
4. **Add zero-distance reveal copy without changing layout — 0.25 day.** Verify state selection headlessly; Sean checks the copy, sheet, counter, and animation on phone.
5. **Run full regressions and mode smoke tests — 0.5 day.** Run repository tests/validation and PvP worker tests/parity offline, then exercise Daily, Landmark Survival, Survival boundary behavior, Expeditions, Trivia, and restoration. Sean performs the final phone pass.

Estimated implementation effort: **1.75 engineer-days**, plus Sean's phone review. No source or data migration is part of this planning deliverable.

## Open questions for Sean

1. **Zero-distance reveal wording.** Recommendation: approve **“Inside the feature”** as a short reveal hint while retaining `0 km` and the existing perfect-score/Pinpoint presentation. This is the only decision needed before implementation; the alternative is to show only `0 km`, which is mechanically correct but does not explain why a pin away from the center earned a perfect result.

2. **Center-pin flight with edge-based counter.** Recommendation: keep the existing pin-to-center route and let the counter end at adjusted km for this radius-model release. Drawing a geometrically correct endpoint on the modeled circle would require choosing a synthetic edge point and revisiting camera/pin semantics; that is extra visual-model work, not required for correct scoring. Sean should confirm the phone experience during the implementation smoke check, but this need not block the headless build.
