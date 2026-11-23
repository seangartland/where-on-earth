# Brief: flatten the remaining busy banners (Where on Earth)

## Context
Sean picked Open Field (solid forest #1f4d3a) and Low Tide (navy #1e4e9c + flat burgundy #7a2230 band, bottom 20%) as the new everyday banners; they shipped 2026-11-22 replacing Blue Horizon and Airmail. Sean's ruling now: "replace the rest of the banners that are too busy." Every remaining banner is patterned. Register to match: FLAT FIELDS ONLY. A solid field, or a field plus ONE flat band along the bottom (max bottom 20%). No radial gradients, no repeating patterns, no dot grids, no SVG strips, no diagonal stripes, no crosshairs.

## Scope (CSS only, plus the one overlay rule)
File: src/styles/game.css. The 10 treatments to replace (ids, names, earn conditions DO NOT change; earned banners stay valid):
- return-ticket (Return Ticket, achievement)
- regular-route (Regular Route, achievement)
- seasoned-traveler (Seasoned Traveler, achievement)
- right-on-the-map (Right on the Map, achievement)
- five-star-landing (Five-Star Landing, achievement)
- high-flyer (High Flyer, achievement)
- worldly (Worldly, achievement)
- around-the-world (Around the World, achievement)
- harvest (Harvest, Thanksgiving seasonal)
- winter-post (Winter Post, Christmas seasonal)

Also: the results-card rule `.results-card[data-calling-card]:not([data-calling-card="open-field"]):not([data-calling-card="low-tide"])` applies a dot + diagonal-wash pattern to every other calling card. Remove that pattern so calling cards are flat too (delete the rule or empty its background-image; keep the open-field/low-tide exclusions consistent with whatever remains).

Do NOT touch: open-field / low-tide rules, the seal system, sheet.js catalog text, progression data, the account worker. No id changes, so no fallback work is needed.

## Flat assignments (starting spec; refine only within the rules)
Palette: navy #1e4e9c, deep navy #173e68, darkest navy #172b55, burgundy #7a2230, forest #1f4d3a, charcoal #2b2f36, gold #ffc76a, cream #f6edd8, rust #9a4d18, ice #d6e9ff.
- return-ticket: deep navy #173e68 solid
- regular-route: navy #1e4e9c + gold band (bottom 16%)
- seasoned-traveler: forest #1f4d3a + cream band (bottom 14%)
- right-on-the-map: deep navy #173e68 + gold band (bottom 16%)
- five-star-landing: navy #1e4e9c solid... no: five-star wants gold presence: deep navy #173e68 + gold band (bottom 20%)
- high-flyer: navy #1e4e9c + cream band (bottom 14%)
- worldly: burgundy #7a2230 solid
- around-the-world: charcoal #2b2f36 + gold band (bottom 16%)
- harvest: rust #9a4d18 + deep brown #5d2c12 band (bottom 18%)
- winter-post: darkest navy #172b55 + ice #d6e9ff band (bottom 16%)
Avoid duplicating Low Tide's exact combo (navy + burgundy band) and Open Field (forest solid). Every banner must stay distinguishable from its neighbors in the customizer grid.

## Hard rules
- Quiet zone: nothing behind the seal, name, or title at profile-header height OR friends-row height. Bands live only in the bottom 20% and must read as a clean base stripe at both heights (see Low Tide's shipped captures).
- Text stays cream #f6edd8 on every field; check contrast on burgundy and rust (both are dark enough; verify visually in captures).
- Zero em dashes anywhere, including comments.
- test/banner-treatments.test.mjs may assert treatment specifics; update assertions only where the flattening legitimately changes them, and say so in the report.

## Captures (required deliverable)
Adapt shots-banner-build/capture.mjs (already in this repo) into shots-banner-flat/capture.mjs rendering EVERY banner id at profile-header height, plus friends-row height for the 10 changed ones. Output PNGs + result.json into shots-banner-flat/. NOTE: Chromium may not start inside your sandbox (known environment limit). If captures fail, still finish the CSS + tests and say so plainly in the report; the orchestrator will render captures from its own shell.

## Tests and report
Run the full suite (node --test "test/*.mjs") and report the exact pass/fail counts. Write BANNER-FLAT-REPORT.md at the repo root: per-banner old treatment -> new treatment (field, band, hex), files changed, suite counts, capture status. Leave all work UNCOMMITTED in the working tree (your sandbox git is read-only; the orchestrator commits).

## Added scope: the default banner color (Sean, 2026-11-22 22:43 PT)
Sean: "Default color shouldn't be green, something more basic." Open Field (solid forest) is currently the default and the fallback for removed designs. Change:
- Add ONE new everyday banner: solid navy #1e4e9c, no band, no pattern. Id: true-navy. Name: "True Navy". Catalog text: "Available now". It becomes THE default: listed first in the customizer Banners catalog, the fallback target, and the new-profile default.
- Open Field and Low Tide stay available as everyday banners ("Available now"); Open Field is simply no longer the default.
- Re-point every default/fallback: grep the whole repo (client src/, account-worker/src/, tests) for 'open-field' and 'blue-horizon' used as a default or fallback (src/account/banners.js bannerId(), account-worker progression.js normalizeBannerId() and any DEFAULT card id, sheet.js defaults) and point them at true-navy. Explicit user selections of open-field stay valid and untouched; normalizeBannerId/bannerId must still map blue-horizon and airmail to the fallback (now true-navy) and pass open-field through as a valid selection.
- CSS: add the true-navy treatment (solid #1e4e9c) alongside open-field/low-tide in game.css, and include true-navy in the results-card flat exclusions consistently with whatever remains of that rule.
- Captures: add true-navy at profile-header and friends-row heights.
- Tests: update banner fallback tests to expect true-navy; keep a test that open-field remains selectable.
