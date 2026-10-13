# Survival shareable results

## Implementation

The Daily and Survival result shares now use the same `formatGameShare`,
`closestGuessLines`, and `shareResult` path. That keeps the Web Share API,
AbortError handling, and clipboard fallback identical across result screens.

Classic Survival retains each run answer and rounded distance only for the life
of the run, then shares the closest three. Tap the Country uses its found count
and the target country retained when the run ends; it does not invent distance
results. No score, earning, or Passport logic changed.

## Literal share-text examples

Daily:

```text
Where on Earth? — Daily
October 12, 2026 · Final Score: 8,740
Day streak: 4

Kyoto: 12 km
Lima: 46 km
Accra: 103 km

5 places visited

https://where-on.earth #WhereOnEarth
```

Classic Survival:

```text
Where on Earth? — Survival
7 rounds survived
Best streak: 12

Reykjavik: 8 km
Nairobi: 31 km
Cusco: 74 km

8 places visited

https://where-on.earth #WhereOnEarth
```

The eight visited places include the final guess that ended this seven-round
run.

Survival: Tap the Country:

```text
Where on Earth? — Survival: Tap the Country
6 countries found
Best streak: 10
Missed: Brazil

https://where-on.earth #WhereOnEarth
```

## Verification

- `node --check --input-type=module < src/main.js`
- `git diff --check`

No deployment was performed.
