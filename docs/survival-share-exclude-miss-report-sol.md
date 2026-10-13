# Survival share: exclude the run-ending miss

## Change

Updated the classic Survival branch of `survivalShareText()` to build its closest-guess lines from `survival.results.slice(0, survival.survived)`. This includes only survived rounds and excludes the final miss that ended the run.

The shared `closestGuessLines()` helper was not changed, so its other callers retain their existing behavior. The Survival: Tap the Country branch was also left unchanged.

## Verification

- `node --check --input-type=module < src/main.js`
- A focused Node fixture with distances 120 km, 40 km, 90 km, and an 800 km run-ending miss produced closest lines for 40 km, 90 km, and 120 km, with no 800 km line.
- A focused Node fixture for a first-round miss produced no guesses section.
- Inspected the Git diff to confirm the source change is limited to the classic Survival share call site, plus this report.
