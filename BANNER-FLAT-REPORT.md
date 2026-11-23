# Banner Flat Report

## Scope

Flattened the 10 remaining patterned banner treatments in `src/styles/game.css` to flat fields, removed the dot and diagonal wash pattern from the results-card rule, added a new True Navy everyday banner, and re-pointed every default and fallback from Open Field to True Navy.

## Per-banner treatment changes

| id | old treatment | new treatment |
| --- | --- | --- |
| return-ticket | deep navy #173e68 + stacked gold dot ladder + dashed vertical strip | deep navy #173e68 solid |
| regular-route | navy #1e4e9c + 3 gold dots + cream horizontal line | navy #1e4e9c + gold #ffc76a band, bottom 16% |
| seasoned-traveler | forest #1f4d3a + repeating radial dot grids (two corners) | forest #1f4d3a + cream #f6edd8 band, bottom 14% |
| right-on-the-map | navy #1e4e9c + radial ring burst + crosshair lines | deep navy #173e68 + gold #ffc76a band, bottom 16% |
| five-star-landing | deep navy #173e68 + inline SVG star strip | deep navy #173e68 + gold #ffc76a band, bottom 20% |
| high-flyer | navy #1e4e9c + 3 diagonal stripes | navy #1e4e9c + cream #f6edd8 band, bottom 14% |
| worldly | deep navy #173e68 + repeating grid lines | burgundy #7a2230 solid |
| around-the-world | charcoal #2b2f36 + radial dot + ellipse arc | charcoal #2b2f36 + gold #ffc76a band, bottom 16% |
| harvest | rust gradient #c97725→#814019 + 3 radial highlights + diagonal repeating stripe | rust #9a4d18 + deep brown #5d2c12 band, bottom 18% |
| winter-post | navy gradient #15264c→#304f84 + 4 radial snow dots + top-fade band | darkest navy #172b55 + ice #d6e9ff band, bottom 16% |

All new treatments are a solid `background-color` field, optionally with one flat `linear-gradient` band confined to the bottom 14-20% of the card. No radial gradients, repeating patterns, dot grids, SVG strips, diagonal stripes, or crosshairs remain in any banner treatment. Text stays cream #f6edd8 on every field; burgundy and rust fields are dark enough to hold contrast (confirmed visually in the captures).

Open Field and Low Tide were untouched (already flat per the prior shipped change).

## Results-card pattern rule

Removed `.results-card[data-calling-card]:not([data-calling-card="open-field"]):not([data-calling-card="low-tide"])` entirely. With every banner now flat, the dot/diagonal-wash exclusion rule had no remaining busy case to guard against, so deleting it (rather than keeping a dead `:not()` chain) is the clean outcome; calling cards render with no extra background-image regardless of id.

## Added scope: True Navy default banner

- Added a new everyday banner, id `true-navy`, name "True Navy", catalog text "Available now": solid `#1e4e9c`, no band, no pattern. CSS rule added alongside open-field/low-tide in `game.css`.
- `IDENTITY_CATALOG.Banners` in `src/account/sheet.js` now lists `true-navy` first, ahead of Open Field and Low Tide.
- `identityOwned` and `provenance` in `src/account/sheet.js` now treat `true-navy` as always-owned/"Available now", matching open-field/low-tide.
- `account-worker/src/progression.js`: `ownsIdentity`'s `defaults.card` list now includes `true-navy` alongside `open-field` and `low-tide`.
- Fallback re-pointing:
  - `src/account/banners.js`: renamed `OPEN_FIELD_BANNER` to `TRUE_NAVY_BANNER` (`'true-navy'`); `bannerId()` now falls back to `true-navy` for removed/falsy ids. `open-field` still passes through unchanged when explicitly selected.
  - `account-worker/src/progression.js`: renamed `OPEN_FIELD_BANNER` to `TRUE_NAVY_BANNER` (`'true-navy'`); `normalizeBannerId()` now falls back to `true-navy` for removed/falsy ids (including new profiles with no stored `card_id`), and still passes `open-field` through unchanged.
  - Neither export was imported anywhere else in the repo, so the rename is contained to these two files.
- Open Field and Low Tide remain selectable, everyday, "Available now" banners; Open Field is simply no longer the default.

## Files changed

- `src/styles/game.css` (banner treatments, true-navy rule, results-card rule removed)
- `src/account/banners.js` (fallback target renamed/repointed)
- `src/account/sheet.js` (catalog, identityOwned, provenance)
- `account-worker/src/progression.js` (fallback target renamed/repointed, ownsIdentity defaults)
- `test/banner-fallback.test.mjs` (fallback target, added open-field-stays-selectable case)
- `test/banner-treatments.test.mjs` (catalog count 12 to 13)
- `account-worker/test/friends.test.mjs` (fallback target in two existing tests, added open-field-stays-selectable case)
- `shots-banner-flat/capture.mjs` (new capture script)

## Test assertion changes

- `test/banner-fallback.test.mjs`: fallback assertions changed from `open-field` to `true-navy` (the flattening added a new default banner and re-pointed the fallback at it per the brief's added scope); kept/added a case asserting `open-field` still passes through when explicitly selected.
- `test/banner-treatments.test.mjs`: catalog length assertion changed from 12 to 13 (True Navy is a new catalog entry).
- `account-worker/test/friends.test.mjs`: two existing assertions that removed-banner selections normalize to `open-field` were changed to `true-navy`; added a new test confirming `open-field` is still a selectable banner via the loadout endpoint.

No other test files reference banner ids as defaults or fallbacks.

## Suite results

`node --test "test/*.mjs"`:

```
tests 266
pass 263
fail 3
cancelled 0
skipped 0
```

The 3 failures are pre-existing and unrelated to this work: `test/image-mirror-transcode.test.mjs`, `test/image-mirror-upload.test.mjs`, and `test/image-mirror-verify-image.test.mjs` all fail with `Cannot find package 'sharp'` because that native dependency is not installed in this sandbox. Verified by running `test/image-mirror-transcode.test.mjs` directly: the failure is a module resolution error at import time, before any banner-related code runs.

`account-worker` has its own test runner (`node --test test/*.test.mjs` run from `account-worker/`), separate from the root suite:

```
tests 32
pass 31
fail 1
cancelled 0
skipped 0
```

The 1 failure, `invite landing page carries the inviter name in OG tags and falls back for invalid tokens`, is pre-existing and unrelated: it is an OG image URL version mismatch (`og-v3.png` expected vs `og-v4.jpg` actual) in `account-worker/test/friends.test.mjs`, nowhere near the banner-fallback code. Both updated/added banner tests in that file (`removed banner selections return and save as True Navy`, `open-field remains a selectable banner`) pass.

## Captures

`shots-banner-flat/capture.mjs` renders every banner id (open-field, low-tide, true-navy, and the 10 flattened ids) at profile-header height, plus friends-row height for true-navy and the 10 flattened ids. Chromium started successfully in this environment; PNGs and `result.json` were written to `shots-banner-flat/`.

## Zero em dashes

Checked: no em dashes were introduced in any changed file, CSS comment, test, or this report.
