# Passport pinpoint counts: design advice

Advice only. Nothing has been implemented. Written by Opus 5.5 on 2026-10-10 after reading `src/main.js` and measuring text widths in headless Chromium (`shots/passport/pin-measure.mjs`).

**Measurement caveat:** Chromium on this box has no SF Pro, so text rendered in Noto Sans plus Noto Color Emoji. iOS SF Pro Text is about the same width, maybe a few percent wider. Read the pixel numbers as ±5%, not exact.

## What the code does today

| Surface | Where | Bullseyes today |
|---|---|---|
| Passport page header | `renderPassportPage()`, `main.js:6630` | `<b>X</b> postcards earned · <b>Y</b> 🎯`, with the 🎯 part hidden when Y is 0 |
| Share card (on-screen DOM) | markup `main.js:6353`, CSS `.pps-stats` `main.js:6327` | a 3-tile grid: Places visited / Postcards / **Bullseyes** (gold tile) |
| Share image (canvas, 1200×700) | `passportShareImage()`, `main.js:6431` | 3 boxes: `places visited` / `POSTCARDS EARNED` / `BULLSEYES` |
| Share text | `passportShareText()`, `main.js:6384` | `🎯 N Bullseyes` / `🛂 N Postcards` / **`📍 N Visited`** / `🗺️ N New places to explore` |

Not in scope, but worth knowing: `.passport-earned` (`main.js:5916`, `5963`) is the passport box on the **home screen** (` · N earned`). It is not the passport page. The passport page uses `[data-pp="earned"]` inside `.pp-count`.

The counts are **nested**. `earned` counts every earned tier, and `bullseyes` is `earned >= EARN_BULLSEYE`, so it already includes pinpoints (`EARN_PINPOINT = 3` > `EARN_BULLSEYE = 2`).

## 1. Will it fit on a 390px phone?

At 390px the text has **334px** to work with: 390, minus 14px `.stats-screen` padding on each side, minus 14px `.pp-card` padding on each side. The earned text is not its own line. It sits inline after `X / 2,000 places · `, so the whole line has to fit:

| Full `.pp-count` line | Measured width | 390 (334 avail) | 360 (304) | 320 (264) |
|---|---|---|---|---|
| Today, new player: `12 / 2,000 places · 8 postcards earned · 3 🎯` | 274 | fits | fits | wraps |
| Today, heavy player: `1,999 / 2,000 places · 1,850 postcards earned · 1,200 🎯` | 384 | **wraps** | wraps | wraps |
| Proposed, new player: `… 8 postcards · 3 🎯 · 1 📍` | 268 | fits | fits | wraps |
| Proposed, mid player: `480 / 2,000 places · 320 postcards · 95 🎯 · 22 📍` | 326 | fits, 8px spare | wraps | wraps |
| Proposed, heavy player | 401 | **wraps** | wraps | wraps |

**Answer:** dropping "earned" saves about 50px, which roughly pays for `· Z 📍`. Small counts fit. Once counts reach three or four digits, the single line overflows at 390px. Note that **heavy players already wrap today.** The line has no wrap control, so it can break anywhere, for example leaving `1,200` on one line and `🎯` on the next.

## 2. Recommended layout

### Passport page: two lines, the stats on their own line

```
        480 / 2,000 places              ← line 1, sits above the progress bar
   320 postcards · 95 🎯 · 22 📍        ← line 2
```

Measured width of line 2 for a heavy player (`1,850 postcards · 1,200 🎯 · 400 📍`) is **257px**. It fits even at 320px (264 available). Line 1 for a heavy player is 136px. Neither line can overflow at realistic counts, and the layout looks the same for every player instead of switching to wrapping once their counts grow.

Changes (small):
- Markup, `main.js:6263`: remove the static ` · ` before `<span data-pp="earned">`.
- JS, `main.js:6630`: wrap each stat in a no-wrap atom, and add pinpoints with the same hide-when-zero rule bullseyes use:
  ```js
  const pins = ppAll.filter((e) => e.earned >= EARN_PINPOINT).length;
  const stat = (n, label) => `<span class="pp-stat"><b>${n.toLocaleString()}</b> ${label}</span>`;
  ppEls.earned.innerHTML = [stat(earned, 'postcards'), bulls && stat(bulls, '🎯'), pins && stat(pins, '📍')].filter(Boolean).join(' · ');
  ```
- CSS, in `passportPageStyle`:
  ```css
  .pp-count [data-pp="earned"] { display: block; margin-top: 2px; }
  .pp-stat { white-space: nowrap; }
  ```
  `.pp-stat` keeps each number next to its label or emoji, so on an absurdly narrow screen the line breaks only at a ` · `, never between `1,200` and `🎯`. `.pp-count b` is 20px. If two 20px lines look heavy, `.pp-count [data-pp="earned"] b { font-size: 17px; }` is the one optional tweak. Judge that on a phone, not from this doc.

If you'd rather keep everything on one line: the `.pp-stat` no-wrap atoms alone stop the ugly mid-stat breaks, but the line still wraps for mid and heavy players at 360 and below, and a ` · ` can end up hanging at the end of a line. I recommend the two-line version.

### Same format on both surfaces? Same order and glyphs, different form

- **Order (everywhere):** postcards → 🎯 bullseyes → 📍 pinpoints, from least to most accurate. That matches the nesting.
- **Passport page:** compact inline text with emoji, as above.
- **Share card and image:** labelled tiles. A share image is seen by people who don't know the game, so a bare `22 📍` means nothing to them. Spell out `PINPOINTS`, as the tiles already spell out `BULLSEYES`.

## 3. Share page: how bullseyes are included, and where pinpoints go

There are three outputs, and all three need the change. `passportShareStats()` (`main.js:6369`) feeds all of them, so first add `pinpoints: entries.filter((e) => e.earned >= EARN_PINPOINT).length`.

**a) On-screen share card, `.pps-stats`.** A 4th tile does not fit in the current 3-column row. The card's inner width is 318px (358 − 2×20), so `1.25fr 1fr 1fr 1fr` with 7px gaps leaves about 52px of content per small tile. Both `BULLSEYES`/`PINPOINTS` (10px uppercase) and a value like `1,200` (21px/900) would get ellipsis-truncated. Use a **2×2 grid** instead:
```css
.pps-stats { grid-template-columns: 1fr 1fr; }
```
Tile order: Places visited | Postcards / Bullseyes | Pinpoints. Give the pinpoint tile `class="pps-stat gold"` as well. Both are gold-tier achievements, and the in-game stamp uses gold for both. Each tile becomes about 155px wide, so nothing truncates. The card grows about 60px taller, which the `align-content: center` overlay absorbs.

**b) Canvas image, `boxes` array at `main.js:6431`.** The three boxes span x = 72 to 1052. Four boxes across the same 72px-margined width (72 to 1128, 1056px) with 20px gaps: **visited 300, then three boxes of 232** (x = 72, 392, 644, 896). Relabel `POSTCARDS EARNED` to `POSTCARDS`. That matches the passport-page change, and at 19px/800 the long label would be too tight in a 232px box. Add `{ value: stats.pinpoints…, label: 'PINPOINTS', color: '#ffd166' }`. The gold-stroke check (`box.color === '#ffd166'`) picks it up automatically. There's no collision with the bottom-right photo circle: the boxes end at y 385, and the circle's top is at y 464. The existing font-shrink rule (`value.length > 5`) still applies, and `1,999` at 54px is about 150px, which fits in 232.

**c) Share text. There is an emoji collision here.** 📍 is already used for **Visited** (`📍 ${stats.visited} Visited`). If pinpoints also get 📍, the text reads ambiguously. Move Visited to 🌍 (🗺️ is already taken by "New places"):
```
My Where on Earth Passport:
📍 3 Pinpoints
🎯 12 Bullseyes
🛂 45 Postcards
🌍 120 Visited
🗺️ 1,880 New places to explore
```
This keeps the existing rarest-first order of the text, with bullseyes on top today. Show the pinpoint line and tile even at 0, as bullseyes already do there. Only the passport page hides zeros.

## 4. Overflow risks and fixes

| Risk | Status | Fix |
|---|---|---|
| Passport line wraps for heavy players | Exists **today** (384px > 334) and gets worse with 📍 (401px) | Two-line layout above (max 257px) |
| Number split from its emoji when wrapping | Exists today | `.pp-stat { white-space: nowrap; }` |
| Share card tile truncation with 4 columns | Would happen with a naive 4th column | 2×2 grid |
| Canvas label `POSTCARDS EARNED` cramped in a narrower box | Would happen | Relabel to `POSTCARDS` |
| `@media (max-width: 360px)` share rules (`main.js:6341`) | Still fine with 2×2. Tiles are about 140px at 320px | none |

## 5. 📍 or something else?

**Use 📍.** It is already the game's pinpoint glyph: the landing stamp (`main.js:2871`, `<b>📍</b>PINPOINT`) and the postcard ink stamp (`main.js:6572`, `{ bullseye: '🎯', pinpoint: '📍' }`). Picking anything else would add a third convention. The only conflict is Visited in the share text (3c), and that's the thing to change.

Accessibility (minor, optional): screen readers announce the bare emoji as "direct hit" and "round pushpin". Adding `aria-label="95 bullseyes"` / `"22 pinpoints"` to each `.pp-stat` would fix that, but it's not required for this change.

## Decision for Sean

**Nested or exclusive counts?** I recommend **nested**, which is how the code already works: postcards include bullseyes, and bullseyes include pinpoints, so each number means "at least this close." With exclusive counts, a player's bullseye number would *drop* the day pinpoints appear, which looks like lost progress. The cost is that `95 🎯 · 22 📍` means 22 of the 95 bullseyes were pinpoints, not 117 total. The tile labels make that clear enough, but it's your call.
