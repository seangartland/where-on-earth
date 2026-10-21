# Recs Home Polish Report

Polish pass on the `?home=recs` variant per BRIEF-recs-home-polish.md. Every number
below was measured with `getBoundingClientRect()` in the 390x844 harness
(`shots/recs-home-polish.mjs`, Playwright plus /opt/meta-chromium, CDP
screenshots). "Before" is the tree at 80cf3df, "after" is this change. Done by
Opus in session; changes left uncommitted.

## Files touched

- `src/styles/game.css`: the `.home-recs` block was rewritten. It is shorter
  than before (net -50 lines) because the variant now reuses the default
  `.mode-buttons` grid and button rules rather than its own copies.
- `src/meta/passport.js`: removed the variant-only count rendering, so the
  strip goes through the default `syncPassport()` path again (that function
  is now identical to its pre-variant form). The strip's CSS is new and
  scoped under `.home-recs`. The orphaned `passportEls.count` reference is
  removed.
- `src/main.js` (`setupRecsHome` only): the marker gets the labeled
  ticket-stub markup, and "More ways to play" is now a direct child of the
  `.mode-buttons` grid instead of a wrapper div.
- `src/modes/daily-game.js` and `src/modes/pack.js` are untouched.

## Mess items, changes, and proof

### 1. One grid width

| Surface | Before (x, width) | After (x, width) |
|---|---|---|
| Passport strip | 84, 222 | 28, 334 |
| Daily | 28, 334 | 28, 334 |
| Expeditions | 28, 163 | 28, 334 |
| More ways to play | 28, 334 | 28, 334 |

Change: the strip takes the `.mode-buttons` width rule (`min(100%, 354px)`,
`max-width: calc(100vw - 32px)`), so it tracks the grid at every viewport
width. Expeditions and More ways span `grid-column: 1 / -1`, as Daily does.
Proof: `shots/recs-home-polish/after/variant-pack-ready.png`, plus
`measures.json` in the same folder.

### 2. Passport strip: uncramped, one line, "/ 804 places" restored

| | Before | After | Default card |
|---|---|---|---|
| Text | `26 found · 22 earned` | `26 / 804 places found · 22 earned` | `26 / 804 places found · 22 earned · 6` |
| Count font / number font | 12px / 22px | 13px / 27px | 13px / 27px |
| Text top below band / bottom padding | 8px / 8px | 11px / 11px | 11px / 11px |
| Strip height | 52px | 65px | 120px (with stamps row) |
| Postmark | bbox bottom 394.1 vs strip bottom 379.6, so clipped; right inset 10px | 48px circle centered in the paper (center y 360.65, paper center 360.6); right inset 14px, matching the 14px left inset of the text | 60px circle |

- The streak (`· 6`) stays hidden, as it was in the original variant spec.
- The count text is left-aligned at the default 14px inset.
- One line holds even at the largest counts. With
  `804 / 804 places found · 804 earned`, the measured scrollWidth (248)
  equals the clientWidth (248) and the height is 37px, which is one line
  (capture: `strip-check/strip-overflow-804.png`).
- An ellipsis is kept as a guard only. It never triggers at these counts.

### 3. Pack marker integrated as "Pack ready"

- Before: a 36px circle with its own gradient fill and drop shadow, floating
  14px inside the right edge, showing only a ✦ glyph.
- After: an 88x62 ticket stub on the right end of the Daily pill.
  - It has a 1px dashed perforation in the Daily ink (`rgba(33,21,47,.35)`)
    and no fill of its own.
  - It shows ✦ on a `.mode-name` line and "Pack ready" on a `.mode-desc`
    line, so the stub uses the same type rules as the Daily label.
- Baselines match the Daily label exactly: both name lines sit at y 426.5,
  both desc lines at y 443.6.
- While the stub shows, the Daily label centers in the rest of the pill:
  name center x 155, which is the center of the 36 to 274 content area.
  Once today's pack is opened, the stub hides and Daily re-centers at
  x 177 to 213, the same as on the default home
  (`after/variant-pack-done.png`).
- The marker is still a separate tap target, now 88x62 instead of 36x36.
  The `aria-label` and the `hidden` sync in `syncPackButton()` are
  unchanged.

### 4. Vertical rhythm matches the default gap scale

| Gap or height | Before | After | Default |
|---|---|---|---|
| Title to strip | 0 | 0 | 0 |
| Strip to Daily | 20 | 20 | 20 |
| Daily to Expeditions | 8 | 8 | 8 (between rows) |
| Expeditions to More ways | 16 | 8 | 8 |
| Daily height | 68 | 62 | 62 |
| Expeditions height | 62 | 62 | 62 |
| More ways height | 56 | 62 | 62 |

Change: removed the variant's 68px Daily override, its desc font override,
and the wrapper div's extra 8px top margin. More ways now takes the shared
`.mode-buttons > button` rules.

### 5. Title and globe composition

- The title styling is unchanged (h1 330x105.3 on both homes), and the globe
  is WebGL, which this pass does not touch.
- The title position does differ: h1 top is y 219.9 on the variant (222.4
  before this pass) and y 164.4 on the default. `.start-screen` centers its
  content vertically, and the variant stack is shorter: 287px from strip top
  to the last button, against 398px on the default.
- I left this alone. Pinning the title would mean hand-placing an offset,
  which the brief rules out. If Sean wants the title locked to the default
  position, the fix is a variant-only `justify-content` change with a
  measured top inset. That is a decision for him, not done here.

## Behavior check (variant, measured)

| Tap | Result |
|---|---|
| Daily body (x 120, left of the stub) | mode `guess`, round screen: Daily starts |
| Pack marker | mode `pack`, `pack-screen sealed-on`; the tear swipe opens the pack (`after/variant-pack-sealed.png`, `after/variant-pack-opened.png`) |
| Expeditions | mode `expeditions`, expedition picker |
| More ways to play | mode `survival-hub` (the Practice hub reuses the picker element) |
| Passport strip | `passport-screen` visible |

Source: `taps/measures.json`.

## Default home unchanged

- **DOM rects.** The default home's rects are identical in three runs: the
  pre-edit "before" run, the "after" run, and a same-session A/B of a clean
  80cf3df worktree against this working tree (`default-head` against
  `default-work`, `a==b` true).
- **Pixels, HEAD against working tree.** 276 pixels differ by more than 24.
  None are in the title or the Daily pill. 258 are inside the first two
  stamp thumbnails and the rest are globe.
- **Pixels, HEAD against HEAD.** Running HEAD twice gives 15,568 differing
  pixels, 2,704 of them inside the card, so the residual is render noise.
- **Against tonight's `shots/recs-home-review/default-home.png`.** Every
  button, label, and text run matches. Differences are confined to:
  - the globe render
  - stamp thumbnails that had not loaded in tonight's capture
  - the postmark date, which reads OCT 21 because this run crossed midnight

  Side-by-side and diff mask: `after/default-home-diff.png`.

## Captures (all in demo/shots/recs-home-polish/, 390x844)

- `after/variant-fresh.png`: the variant for a brand-new player (no
  passport, pack available).
- `after/variant-pack-ready.png`: the variant for the seeded player with
  the pack ready.
- `after/variant-pack-done.png`: the variant after today's pack is opened
  (marker hidden).
- `after/variant-pack-sealed.png` and `after/variant-pack-opened.png`: the
  pack opened from the marker.
- `after/default-home.png` and `after/default-home-diff.png`: the default
  home and its comparison.
- `before/`: the same states at 80cf3df, for comparison.

## Checks

- `node --check` and `node --check --input-type=module` pass on
  `src/main.js`, `src/meta/passport.js`, `src/modes/pack.js`, and
  `src/modes/daily-game.js`.
- `git diff --check -- src` is clean.
- No em dashes in the diff, the harness, or this report.

## Notes

- The stub's label centering uses `:has()`, which needs Safari 15.4 or later
  (Chrome 105 or later). Without it, the Daily label would center across
  the full pill, and part of it could sit under the stub.
- Pre-existing and left as is: `initPassportHome` in `passport.js` declares
  `isRecsHome` but never uses it (from 80cf3df). This pass did not create it.
- Out of scope per the brief: Challenge reachability from the variant.
