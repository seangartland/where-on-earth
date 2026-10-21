# Daily multiplier removal report

## Change made

`src/core/config.js` now exports `WEIGHTS = [1, 1, 1, 1, 1]`. New Daily
round scores are therefore the rounded base score. The five-round maximum is
5,000. No storage key, storage shape, distance formula, earn tier, or share
builder was changed.

Existing saved result objects are not migrated or rewritten. Their recorded
`score` values remain the values used for totals. New result objects already
include `base`, so the shipped Daily summary continues to print that field and
now has `base === score` for every new round.

## WEIGHTS consumers found

| Consumer | Measured disposition |
| --- | --- |
| `src/core/config.js` | Changed the live Daily array from `1,1,2,3,3` to five ones. |
| `src/game/scoring.js` | Unchanged. `scoreGuess` reads the flat live array. Its production caller is the Daily branch in `src/game/round.js`; one-off modes bypass it. |
| `src/game/round.js` | Unchanged. Its Daily header and reveal multiplier elements read the flat array and remain hidden because no value exceeds one. |
| `src/modes/daily-game.js` | Unchanged. Results, review, and the existing share builder read the flat array. No share text format code changed. |
| `src/main.js` | Unchanged. It passes the same flat array to stats. |
| `src/meta/stats.js` | Unchanged. It reads the flat array through the main host for new Daily records. |
| `test/extent-aware-scoring.test.mjs` | Updated frozen weighted-score expectations to the matching base scores. |
| `build/verify-stats.mjs` | Unchanged. It is a standalone legacy verifier with its own old formula and literal weights, not an app import or runtime Daily consumer. |
| `.main.js.bak-flags`, `.main.js.pre-challenge-simplify` | Unchanged archived snapshots, not loaded by the app. |

No Survival mode reads `WEIGHTS`: `round.js` treats Survival and all other
one-off modes as unscored and bypasses `scoreGuess`. No constant split was
needed.

## Exact diff

```diff
diff --git a/src/core/config.js b/src/core/config.js
index 2973d79..05e56fc 100644
--- a/src/core/config.js
+++ b/src/core/config.js
@@ -37,7 +37,7 @@ export const ACCOUNT_OFFER_KEY = 'where-on-earth-account-offer';
-export const WEIGHTS = [1, 1, 2, 3, 3];
+export const WEIGHTS = [1, 1, 1, 1, 1];
diff --git a/test/extent-aware-scoring.test.mjs b/test/extent-aware-scoring.test.mjs
index fd3e204..3dbf548 100644
--- a/test/extent-aware-scoring.test.mjs
+++ b/test/extent-aware-scoring.test.mjs
@@ -125,8 +125,8 @@ test('adjusted exact distance drives score, display rounding, tiers, postcard an
-    ['enugu-ng', 2, { lat: 7.67582, lng: 5.15323 }, 292.9841319554443, 293, 941, 1882],
-    ['krasnoyarsk-ru', 4, { lat: 57.27192, lng: 90.58576 }, 198.46724682154738, 198, 962, 2886],
+    ['enugu-ng', 2, { lat: 7.67582, lng: 5.15323 }, 292.9841319554443, 293, 941, 941],
+    ['krasnoyarsk-ru', 4, { lat: 57.27192, lng: 90.58576 }, 198.46724682154738, 198, 962, 962],
@@ -146,8 +146,8 @@ test('cities and point landmarks preserve the raw number and frozen score fixtur
-    ['2026-10-18', ['tokyo-japan', 'boise-usa', 'enugu-ng', 'ciudad-juarez-mx', 'krasnoyarsk-ru'], [251.05352006657486, 231.86657960125547, 292.9841319554443, 259.6144718086858, 198.46724682154738], [[251, 950, 950], [232, 955, 955], [293, 941, 1882], [260, 948, 2844], [198, 962, 2886]]],
-    ['2026-11-03', ['nashville-usa', 'osaka-japan', 'durban-south-africa', 'malabo-equatorial-guinea', 'oymyakon-russia'], [249.95192791543136, 253.25007566156745, 265.76571920044677, 294.0622469008112, 178.4221670484311], [[250, 951, 951], [253, 950, 950], [266, 947, 1894], [294, 941, 2823], [178, 966, 2898]]],
+    ['2026-10-18', ['tokyo-japan', 'boise-usa', 'enugu-ng', 'ciudad-juarez-mx', 'krasnoyarsk-ru'], [251.05352006657486, 231.86657960125547, 292.9841319554443, 259.6144718086858, 198.46724682154738], [[251, 950, 950], [232, 955, 955], [293, 941, 941], [260, 948, 948], [198, 962, 962]]],
+    ['2026-11-03', ['nashville-usa', 'osaka-japan', 'durban-south-africa', 'malabo-equatorial-guinea', 'oymyakon-russia'], [249.95192791543136, 253.25007566156745, 265.76571920044677, 294.0622469008112, 178.4221670484311], [[250, 951, 951], [253, 950, 950], [266, 947, 947], [294, 941, 941], [178, 966, 966]]],
```

## Verification

Syntax checks passed with Node 24 by providing each ESM source through stdin:

```text
node --check --input-type=module < src/core/config.js
node --check --input-type=module < test/extent-aware-scoring.test.mjs
```

`node --test test/extent-aware-scoring.test.mjs` passed: 1 test file, 1 pass,
0 failures. `git diff --check` passed with no output.

The scripted five-round Daily probe used the same zero-distance guess quality
for each round and summed the persisted result scores with the same reduction
used by both the Daily summary and results screen:

```text
round scores: 1000, 1000, 1000, 1000, 1000
results total: 5000
summary total: 5000
```

The requested Daily harness command was launched against this checkout through
a temporary read-only source-path overlay because the supplied harness is
hardcoded to `review-work`. Chromium terminated before page creation in this
environment, so no Daily harness result was produced. Its measured failure was
`setsockopt: Operation not permitted`, followed by `signal=SIGTRAP` from
`chromium.launch`. This did not modify the harness, the checkout, or its
screenshots.
