# Mobile home-screen truncation review

Review only; no game code was changed. Reviewed 12 October 2026 at viewport widths 390, 375, and 360 CSS px.

## Method and scope

I traced the static home markup in `index.html`, base home styles in `src/style.css`, and the runtime-created Stats, passport summary, Passport, and Collections UI in `src/main.js`. I also checked the runtime Daily label used after the daily has been played.

I attempted to render all three widths with the repository's Playwright harness pattern and `~/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell`. Chromium could not start in this sandbox; it exited before opening a page with `sandbox_host_linux.cc:41 ... Operation not permitted`, including with `--no-sandbox`. Therefore the findings below are **calculated**, not screenshot observations. Box widths are exact consequences of the CSS. Text widths are estimates made with the locally available Noto Sans metrics at the declared sizes; iOS SF Pro can vary by a few pixels. The clipping conclusions are also supported by the explicit `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` rules.

There is no separate home “Play” control in the current DOM. `#play-button` is the **Daily** mode button, so this review treats “Play button” as that control.

## Exact sizing model

The mode row is `repeat(3, minmax(0, 1fr))`, capped at 354px and `100vw - 32px`, with 8px gaps. Each button is 54px high, has 10px horizontal padding and a 1px border. Both text lines are single-line, hidden-overflow ellipsis containers. At 360px only, gaps become 6px, button padding 7px, the name 13px, and the subtitle 10px.

| Viewport | Row width | Gap total | Button border-box | Subtitle space inside button |
|---:|---:|---:|---:|---:|
| 390 | 354px | 16px | 112.67px | 90.67px |
| 375 | 343px | 16px | 109.00px | 87.00px |
| 360 | 328px | 12px | 105.33px | 89.33px |

The lower home-links row uses the same 354px / `100vw - 32px` cap, three equal flex children, and two 6px gaps. Its button border-box widths are 114px, 110.33px, and 105.33px respectively. Horizontal padding leaves approximately 100px, 96.33px, and 95.33px of content space (the 360px rule reduces padding from 6px to 4px). These buttons are also `nowrap + hidden + ellipsis`.

## Truncating and at-risk inventory

### Mode row

| Element and current copy | Est. text width | 390px | 375px | 360px | Finding / cause |
|---|---:|---:|---:|---:|---|
| Daily name | ~33px at 14px | 90.67px available | 87px | ~83px at 13px | Safe. |
| Daily subtitle: “5 places, once a day” | ~103px at 11px; ~94px at 10px | **Clips by ~12px** | **clips by ~16px** | **clips by ~5px** | Confirmed by arithmetic; forced onto one line. |
| Played Daily subtitle: “✓ Played · see results” | ~108px at 11px; ~98px at 10px | **Clips by ~17px** | **clips by ~21px** | **clips by ~9px** | Worst current mode subtitle. Set by `syncDailyButton()`, not visible in HTML alone. |
| Survival name | ~55px / ~51px | safe | safe | safe | No issue. |
| Survival subtitle: “Stay within 150 km” | ~97px at 11px; ~88px at 10px | **clips by ~7px** | **clips by ~10px** | **borderline: ~1px spare in Noto, likely font-dependent** | At 360 the smaller type nearly cancels the narrower button; SF Pro/weight 650 may still clip. |
| Borders name | ~51px / ~47px | safe | safe | safe | No issue. |
| Borders subtitle: “Tap the country” | ~81px at 11px; ~73px at 10px | safe by ~10px | safe by ~6px | safe by ~16px | Fits, but 375px has little font/platform tolerance. |

Hidden controls are not current home content, but their existing labels are worth guarding if re-enabled: **Endless / “Play nonstop”** should fit; **Expeditions / “Themed journeys”** is at risk in the same one-row geometry, and the long mode name itself has little room.

The ellipsis is applied to the inner `.mode-desc`, so users will see visibly chopped phrases such as “5 places, once…” and “Stay within…”. Applying `text-overflow` to the flex-column button itself does not rescue the meaning.

### Home-links row

| Element | Available content width (390 / 375 / 360) | Finding |
|---|---:|---|
| “📊 Stats” | 100 / 96.33 / 95.33px; estimated label ~41 / 38px | Safe. |
| “🛂 Passport” | same; estimated label ~65 / 60px | Safe. |
| “🛡 Collections” | same; estimated label ~78 / 72px | Safe in the measured fallback font, but **at risk** because native color emoji glyph widths vary. The smallest reserve is roughly 17–23px. |

These controls should not currently truncate on normal iOS fonts, but the row repeats the fragile “three text pills in one line” pattern and explicitly opts into ellipsis. Collections is the first likely casualty under larger text, localization, or a wider emoji glyph.

### Other home text

| Element | Exact relevant CSS | Finding |
|---|---|---|
| Title, “Where on Earth?” | `max-width:330px; font-size:clamp(46px,15vw,68px); line-height:.9; letter-spacing:-.065em`; normal wrapping, no hidden overflow | Not truncated. It wraps as a title block. Available section content width is 334 / 319 / 304px. Tight `.9` line-height is visually dense but intentional and native to the current design. |
| How-to sentence | `max-width:310px; margin:24px 0 28px; font-size:15px; line-height:1.5`; normal wrapping | Not truncated; it wraps to multiple lines. Returning players do not see it because `.has-passport .how-to { display:none; }`. |
| Start streak, e.g. “🔥 365 day streak” | `font-size:13px; min-height:20px; margin-top:18px`; normal wrapping | Safe and not truncated. It is hidden for returning players; their streak moves into the passport summary. |
| Passport summary count | 13px, normal wrapping; leading count is 27px; no overflow rule | Does not ellipsize, but long combinations can wrap awkwardly: `986 / 986 places found · 986 earned · 🔥 365`. Estimated one-line width is ~261px before accounting for the 27px leading count, within the card's 330px content cap but closer than it first appears. Large four-digit totals or system text scaling can force a poor break. |
| Passport stamps | Five 40px circles + four 7px gaps = 228px | Safe at all three widths. At viewport heights ≤700px they become 34px (198px total). |
| Passport continent chips | 10px, `white-space:nowrap`, but the parent has `flex-wrap:wrap` | Individual labels do not truncate; the set creates additional rows. This is safe horizontally but increases home height. |
| Mute/settings control | Icon-only 44×44 button; no visible text | No truncation issue. |

## Proposed fixes

### 1. Recommended: keep the one-row-of-three mode layout, make subtitles two lines

This is the least disruptive fix and preserves the newly requested mode arrangement and existing pill styling.

- Keep `.mode-buttons`, the three equal columns, the mode names, colors, and 54px touch-target minimum.
- Change `.mode-desc` to allow two lines: `white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.1;`.
- Give the buttons enough predictable height for two subtitle lines: `min-height: 62px` (64px if visual testing shows SF Pro descenders feel tight).
- Keep `padding-inline: 8px` at 390/375 and the existing 7px at 360. Ten pixels is expensive in a 109–113px pill; reducing it gains 4px of text width without changing the outer layout.
- Use balanced, shorter native copy:
  - Daily: **“5 places daily”** (or two lines as “5 places” / “once a day” if the cadence is important).
  - Played Daily: **“✓ See results”**. The check already conveys completion; “Played” is redundant.
  - Survival: **“Within 150 km”**.
  - Borders: keep **“Tap the country”**.
- Limit subtitles to two lines (`display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical`) only as a defensive guard, not as the primary fit mechanism. With the proposed copy, all fit without clipping.

This retains descriptive copy rather than shrinking it below the current 10–11px, and it does not turn three distinct game modes into ambiguous icons.

### 2. Also recommended: harden the lower links without redesigning them

- Keep the current `.passport-entry` / `.stats-entry` classes, colors, and 44px height.
- At 360px, use icon plus short labels **“Stats”**, **“Passport”**, **“Cards”** (replace “Collections” only at all widths, rather than responsive text that changes unexpectedly). “Cards” matches the postcard collection concept and buys substantial space.
- Alternatively, keep “Collections” but make the icon `aria-hidden` and hide only the visible icon at `max-width:375px`; text then has ample room. Accessible names should remain “Stats”, “Passport”, and “Collections”.
- Do not reduce these below 12px. The current 360px rule is already at 12px and is readable but compact.

### 3. Make the passport summary's box model explicit

Add `box-sizing:border-box` to `.passport`. It currently declares `width:100%`, `max-width:330px`, and 14px horizontal padding under the default content-box model, so its outer width can be as large as **360px**. That is wider than the start screen's 334 / 319 / 304px content boxes and leaves only about 15 / 7.5 / 0px relative to those padded bounds (although it remains approximately inside the viewport). This is not text truncation, but it is a real cramped-layout inconsistency.

After border-box sizing, preserve its intended visual width with `width:min(100%,330px)`. Let `.passport-count` wrap normally, but group logical phrases in spans so breaks occur before “earned” and the streak, not inside “places found”. On 360px, a clean two-row treatment—progress on row one, earned/streak on row two—would be more stable than font shrinking.

## Ranked alternatives and trade-offs

1. **Two-line subtitles plus shorter copy (recommended).** Best information retention and readability, preserves the mandated three-across layout and native pill design. Cost: adds 8–10px of height and makes the pills slightly less sleek.
2. **Names only in the three mode pills; move descriptions below/into an info affordance.** Guaranteed fit and cleanest row. Cost: Survival and Borders become less self-explanatory, especially for first-time players; extra help interaction is undesirable on a landing screen.
3. **Responsive two-row mode grid below 375px.** Most room and best accessibility scaling. Cost: directly breaks the recently chosen one-row-of-three requirement, changes hierarchy, and lengthens the returning-player home screen. Use only if the one-row requirement can be relaxed.
4. **Shrink subtitles further or keep ellipses.** Smallest code change, but not recommended. Ten pixels is already the 360px floor; ellipsis hides the differentiating rules of the modes, and further shrinking makes the most important explanatory text harder to read.

## Other cramped or broken-looking risks

- The home uses two consecutive three-across pill rows. Even after fixing literal truncation, six pills make the lower half visually dense. Keep the 10px inter-row gap, but avoid adding more home links to either row.
- Returning players replace the how-to with a passport card containing count text, five stamps, and up to six continent chips. The flex-wrapped chips can add two or three rows, then the two button rows follow. Width is safe, but short phones can become vertically crowded. Existing `overflow-y:auto` prevents loss of access; a compact returning-player passport treatment at `max-height:700px` should also reduce chip padding or show only the top three chips plus “All in Passport”.
- The `@media (max-height:700px)` passport rules shrink stamps and the large count, but do not reduce the title, mode-row top margin, home-links gap, or continent count. A 360×640-class device is therefore more likely to feel crowded vertically even though this review's requested widths fit horizontally.
- The home screen has 28px section padding, while both button rows independently allow `100vw - 32px`. This deliberately lets the rows extend into the section padding and yields 16px viewport gutters. It works, but it makes the layout harder to reason about and contributed to the passport box-model inconsistency. A shared home-control width custom property would make these elements agree without changing their appearance.

## Implementation acceptance checks

When implementing, render first-run, played-daily, and populated-passport states at 390×844, 375×812, and 360×800 (plus one short 360×640 pass). Assert for every visible label that `scrollWidth <= clientWidth`, inspect that mode subtitles use no more than two lines, and confirm the start screen remains vertically scrollable with every control reachable.
