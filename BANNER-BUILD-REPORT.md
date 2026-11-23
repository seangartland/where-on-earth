# Banner build report

## Inventory

The banner definitions are split between the client picker in `src/account/sheet.js`, shared card and swatch styles in `src/styles/game.css`, and account loadouts in the account worker's `profile_loadouts.card_id` field. The picker saves `cardId` through `POST /v1/progression/loadout`. Profile headers, friends rows, and the Daily results card consume that saved value.

| Classification | Designs before this build |
| --- | --- |
| Everyday selectable | Blue Horizon, Airmail |
| Achievement-gated | Return Ticket, Regular Route, Seasoned Traveler, Right on the Map, Five-Star Landing, High-Flyer, Worldly, Around the World |
| Seasonal | Harvest, Winter Post |
| Already minimal or flat | None |

Blue Horizon and Airmail were the only everyday designs. Both used patterned treatments, so neither was retained as an already-minimal design.

## Change

Removed everyday selections: Blue Horizon and Airmail.

Replacement everyday set: Open Field and Low Tide, both available immediately.

- Open Field is a solid `#1f4d3a` forest field with no image layer.
- Low Tide is a `#1e4e9c` navy field with a flat `#7a2230` burgundy band across the bottom 20 percent.

Achievement-gated and seasonal catalog entries and their CSS treatments were not changed. Seal, level, name, title, and dark account-surface styling were not restyled.

## Stored-selection fallback

`blue-horizon` and `airmail` now normalize to `open-field` in the account worker when it reads a progression profile, lists friends, or receives a loadout save. The client repeats that normalization immediately before profile-header, friends-row, and results-card rendering. This gives legacy records an Open Field card with no blank treatment even if an older API payload is received. The picker catalog contains only Open Field and Low Tide among everyday banners, so it never offers a removed selection.

The fallback has direct coverage in `test/banner-fallback.test.mjs` and `account-worker/test/friends.test.mjs`.

## Verification

Ran `node --test "test/*.mjs"`.

- 53 test files executed.
- 50 passed.
- 3 failed before assertions because the existing image-mirror tests cannot import the unavailable `sharp` package: transcode, upload, and verify-image.
- The new fallback and banner-treatment tests passed.

Ran `cd account-worker && npm test`.

- The removed-banner fallback test passed.
- One unrelated existing assertion failed because it expects `og-v3.png`, while the current invite page emits `og-v4.jpg`.

## Captures

Added `shots-banner-build/capture.mjs`, adapted from the supplied capture pattern. It mocks both account API hosts, `woe-account.gartland-79.workers.dev` and `api.where-on.earth`, and is set to create:

- `open-field-profile-header.png`
- `open-field-friends-row.png`
- `low-tide-profile-header.png`
- `low-tide-friends-row.png`
- `result.json`

The capture command could not complete in this sandbox. Chromium exits during launch with `setsockopt: Operation not permitted`, before a page is created, so no PNG captures or result JSON were produced here.

## Commit status

The requested phase commits could not be created because `.git` is mounted read-only in this workspace. `git commit` fails before staging can complete because Git cannot create `.git/index.lock`. No merge or deployment was attempted.
