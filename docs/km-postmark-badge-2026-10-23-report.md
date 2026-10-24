# km postmark badge verification — 2026-10-23

## Implemented

- The passport grid's existing 24 px distance badge now has an outer outline and an absolutely positioned dashed inner ring. Bullseye and pinpoint badges use the requested gold border, outline, and reduced-opacity inner ring.
- The postcard detail's flag/tier stamp and dated postmark were removed from markup, styling, and fill/open/close logic.
- The detail photo now has one 54 px, two-ring distance badge in the former top-right stamp position. It uses the same `formatShareKm(entry.km)` result as the passport grid, displays that result on two centered lines, applies ordinary/bullseye/pinpoint tier data, and is hidden when `entry.km` is not finite.
- The visit history rows remain unchanged and continue to carry the visit/earned dates.

## Verification

- `node --check src/meta/postcard-card.js` — pass.
- `node --check src/meta/passport.js` — pass.
- `node --test test/*.test.mjs` — 7 tests passed, 0 failed, 0 skipped.
- `git diff --check` — clean.
- Removal grep across `src`, excluding `.bak` files, found no references to `ppdEls.postmark`, `ppdEls.postmarkDate`, `ppdEls.postmarkYear`, `ppdEls.stamp`, `ppdEls.stampFlag`, or `ppdEls.stampTier`, and no `.ppd-stamp*` or `.ppd-postmark*` classes.

### Code-trace proof

The verification trace checked these paths and assertions:

1. `passportSlot(entry)` and `fillPostcard(entry)` both call the single existing `formatShareKm(entry.km)` formatter. A 2,400 km value therefore becomes `2.4k km` in both places; each badge splits that shared string into `2.4k`, a `<br>`, and `km`.
2. For a detail entry with finite `entry.km`, `badgeDistance` is non-empty, `distanceBadge.hidden` is false, and the badge receives `data-tier="pinpoint"`, `"bullseye"`, or `"ordinary"` from the same earn thresholds used by the grid.
3. For an entry without finite `entry.km`, `badgeDistance` is empty, `distanceBadge.hidden` is true, and the dedicated `[hidden]` rule removes it from layout.
4. The grid rule contains the requested outer outline and its `::after` rule contains an inset dashed ring. The pseudo-element is `position: absolute`, so it is not a flex item and cannot shift the existing centered two-line text.
5. Both grid and detail tier selectors promote the border/outline/ring to gold for bullseye and pinpoint.

## Scope checks

- No reveal or collections consumer referenced the removed modal elements or `ppdEls` fields. Pack and reveal postcard cards remain separate and were not changed.
- Daily share text and mode share texts are untouched.
- No `localStorage` key or storage call changed.
- No commit, push, or deployment was performed.
