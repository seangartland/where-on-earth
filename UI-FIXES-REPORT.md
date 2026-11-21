# UI fixes report

Branch: `ui-fixes-nov20`

Browser captures were not produced. The supplied Playwright harness could not
launch Chromium in this sandbox because Chrome exits on a restricted socket
operation (`setsockopt: Operation not permitted`). The code was instead checked
with nine source-level DOM contracts and the full test suite.

## Item A: postcard back

Changed `src/meta/passport.js`.

- Removed the duplicate address rule.
- Changed history labels to Saw, Earned, Bullseye, and Pinpoint.
- Shows Closest guess and the formatted distance for seen-only entries with a
  finite recorded distance.
- Moved the stamp and overlapping postmark into the address block above the
  location name.

Requested capture paths, unavailable in this environment:

- `~/workspace/map-game/woe-postcard-shots/before-dex.png`
- `~/workspace/map-game/woe-postcard-shots/before-front.png`
- `~/workspace/map-game/woe-postcard-shots/before-back.png`
- `~/workspace/map-game/woe-postcard-shots/before-seenonly.png`
- `~/workspace/map-game/woe-postcard-shots/after-dex.png`
- `~/workspace/map-game/woe-postcard-shots/after-front.png`
- `~/workspace/map-game/woe-postcard-shots/after-back.png`
- `~/workspace/map-game/woe-postcard-shots/after-seenonly.png`

The DOM contracts verify one address rule, stamp-before-name markup, the new
history strings, and the finite-distance fallback.

## Item B: pack results km pill

Changed `src/meta/postcard-card.js` and `src/styles/game.css`.

The score badge now has a single text node such as `1,234 km`, has `nowrap`
inside pack results, and retains the existing pill position and tier-color
rules.

Requested capture paths, unavailable in this environment:

- `~/workspace/map-game/woe-ui-fixes-shots/item-b-before.png`
- `~/workspace/map-game/woe-ui-fixes-shots/item-b-after.png`

The DOM contract verifies that no line-break node is generated for the badge.

## Item C: Customize Seal scroll

Changed `src/account/sheet.js` and `src/styles/game.css`.

The preview is now a sibling above `.seal-builder`, and it no longer has sticky
positioning. The builder remains the only scrollable Seal content and the Save
button remains outside it.

Requested capture paths, unavailable in this environment:

- `~/workspace/map-game/woe-ui-fixes-shots/item-c-before.png`
- `~/workspace/map-game/woe-ui-fixes-shots/item-c-after.png`
- `~/workspace/map-game/woe-ui-fixes-shots/item-c-bottom-before.png`
- `~/workspace/map-game/woe-ui-fixes-shots/item-c-bottom-after.png`

The DOM contracts verify preview-before-builder markup and removal of the
preview sticky rule.

## Item D: Other Postcards head

Changed `src/meta/passport.js` and `src/styles/game.css`.

Removed the envelope glyph. The mail head now inherits the main head's
min-height and padding, with only its column layout specialized. Its computed
base box is 65px: 48px minimum content height plus 7px top and 10px bottom
padding, matching the other two heads. Runtime measurements could not be made
without Chromium.

Requested capture paths, unavailable in this environment:

- `~/workspace/map-game/woe-ui-fixes-shots/item-d-before.png`
- `~/workspace/map-game/woe-ui-fixes-shots/item-d-after.png`

The DOM contracts verify that the glyph markup is absent and the mail head no
longer has a distinct height rule.

## Verification

Baseline suite: 29 passed, 0 failed.

Final suite: `node --test "test/*.mjs"` completed with 29 passed, 0 failed.
The source-level DOM contract check completed with 9 passed.

Git commits could not be created because `.git` is mounted read-only in this
environment. `git commit` failed before writing with
`Unable to create .git/index.lock: Read-only file system`.
