# Passport rarity tags: review

**Sean's feedback:** "the rarity tags look a bit messy, and common is barely visible"

**Method:** I read the code in `src/style.css:174-183` (shared `.rarity-*` tokens and `.rarity-tab`) and `src/main.js` (passport grid at 4954/5342, collections at 5493/5655, detail view at 5730/5813). I also took a fresh 390px headless capture of the current code with a seeded passport that mixes all 4 rarities with seen, near, bullseye and pinpoint cards. The capture is at `shots/passport/rr-grid.png`, with crops in `rr-tabs-row2.png` and `rr-tabs-row3.png`. I computed contrast ratios with the WCAG formula; they are measured, not estimated. Photos show the 🌍 placeholder because the headless run blocks Wikimedia. That doesn't affect the tabs.

---

## What's actually wrong

### 1. The tab is see-through, so the card edge cuts through it (main cause of "messy")
`.rarity-tab` uses a 14–16% alpha fill (`--rarity-bg`) and a 45–50% alpha border. It sits at `top: -7px` and is 21px tall, so it covers 4 different backgrounds: the dark page, the card's ring/border line, the card's padding and the top 9px of the photo. Because the fill is translucent:
- the card's top border/ring shows through the middle of every pill as a horizontal line (clearly visible in `rr-tabs-row3.png`: the green ring runs straight through "UNCOMMON")
- the pill's top half and bottom half are different colours
- the pill's own faint border fights the card's border

It looks like a sticker that didn't fully stick.

### 2. Common's grey is the same grey as "not earned"
- Common text is `#8b96a8`. Seen (unearned) cards set the name to `#8992a8`, which is effectively the same colour. Common therefore reads as "disabled/locked", not as a tier.
- It's grey text on a grey-tinted fill on a grey-blue card, with zero chroma. Every other tier gets a saturated hue to pop. Common gets nothing.
- Measured contrast: **common 4.41:1**, below WCAG AA (4.5) for text this small. Rare is 4.21:1 too, but its saturated blue carries it; common has no hue to fall back on.
- On a seen card (greyscale photo, grey name, grey tab) the whole card is grey and the tab disappears. Most commons in a real passport will look like this.

### 3. Ragged widths, left-aligned, on tilted cards
Measured tab widths at 390px: rare 48px, common 72px, legendary 84px, uncommon 88px. All are pinned at `left: 7px` on cards tilted ±0.6°. Down the grid you get a jagged column of different-length pills at slightly different angles. Collections centres its tab (`left: 50%`) and the detail view uses `left: 16px; top: -8px`, so the same element sits in 3 different positions across screens. That breaks the "centralize shared UI" rule.

### 4. No hierarchy, only hue
All 4 tiers have the same shape, weight, fill strength and border, so the only difference is colour. Nothing says legendary > rare > uncommon > common at a glance; the player has to decode the colour. Also, a 9.5px font at weight 800 with 0.08em tracking renders fuzzy on a phone.

### 5. Seen cards: colourful tab on a grey card
A seen legendary has a vivid purple tab on a greyscale card, so the tab is the brightest thing on a card you haven't earned. Meanwhile a seen common disappears completely (see #2). Tier visibility should not depend on earn state in opposite directions.

---

## Recommendations (in priority order)

### R1. Make the tab opaque and cut it cleanly off the card edge
Replace the translucent fill with a **solid** tinted fill, a solid border, and a 2px halo in the page colour so the pill looks notched into the card edge instead of overlapping it. Centre it on the edge so it only crosses the border line, not the photo.

```css
/* style.css: replaces the .rarity-tab rule */
.rarity-tab {
  display: inline-flex; align-items: center; box-sizing: border-box;
  height: 18px; padding: 0 8px;
  border: 1px solid var(--rarity);
  border-radius: 999px;
  background: var(--rarity-bg);            /* now SOLID, see R2 */
  color: var(--rarity-ink);
  box-shadow: 0 0 0 2px #0b1020;           /* page-colour halo: hides the card edge behind the pill */
  font-size: 10px; font-weight: 800; line-height: 1;
  letter-spacing: .06em; text-transform: uppercase; white-space: nowrap;
}
```
Check the halo colour against the passport sheet's real computed background at 390px. `.stats-screen` is `rgba(2,4,9,.68)` over the globe, so sample the pixel and don't guess.

### R2. New tier tokens: solid fills, separate ink colour, and a real common
Split the frame colour (`--rarity`, still used by the `--ring`) from the text colour (`--rarity-ink`), and make `--rarity-bg` solid. Common moves to a **light** neutral, so it can no longer be confused with the seen-state grey.

```css
.rarity-common    { --rarity: #9aa6bb; --rarity-ink: #dfe5ef; --rarity-bg: #2e3647; }
.rarity-uncommon  { --rarity: #4fcf8a; --rarity-ink: #7ff0b0; --rarity-bg: #173b2c; }
.rarity-rare      { --rarity: #6c8cff; --rarity-ink: #a9bcff; --rarity-bg: #1f2a5c; }
.rarity-legendary { --rarity: #c77dff; --rarity-ink: #f3dcff; --rarity-bg: #5a2d86; }
```
Measured contrast of ink on fill: **common 9.56**, uncommon 8.83, rare 7.33, legendary 7.66. All tiers clear AA with margin, so no tier is "barely visible" any more. Common stays neutral (no hue) but is now bright neutral, not dim neutral.

Also bump the common frame (`--rarity`) from `#8b96a8` to `#9aa6bb` so the 1.5px ring on earned commons is visible against `#1a1f2e`.

### R3. Build hierarchy into the fill strength, not just the hue
Let the tiers get louder as they go up, so rank reads without decoding colour:
- **Common:** solid neutral pill (R2). Quiet but clearly present.
- **Uncommon / Rare:** solid tinted pill (R2), with the fill getting deeper as the tier rises.
- **Legendary:** the only tier with a gradient fill and a soft glow:
  ```css
  .rarity-legendary .rarity-tab, .rarity-tab.rarity-legendary {
    background: linear-gradient(135deg, #7a3fc0, #b04fd8);
    border-color: #e0b3ff; color: #fff;
    box-shadow: 0 0 0 2px #0b1020, 0 0 8px rgba(199,125,255,.45);
  }
  ```
Keep gold out of rarity entirely, as the existing comment says. Gold belongs to Bullseye/Pinpoint.

### R4. One position everywhere: centred on the top edge
Use one shared positioning rule for passport, collections and the detail view, and delete the 3 per-screen variants (`.pp-post .rarity-tab`, `.collection-card .rarity-tab`, `.ppd-rarity` position):

```css
/* style.css, shared */
.rarity-tab.on-card { position: absolute; z-index: 3; top: -9px; left: 50%; transform: translateX(-50%); }
```
Centring makes the different label widths look intentional (each pill is symmetric about the card's axis) instead of a ragged left column. With `height: 18px; top: -9px` the pill straddles exactly the border line and stops touching the photo. Add the `on-card` class in the 3 places the tab is created (`main.js` 5345, 5656, 5774).

### R5. Seen cards: keep the tab, mute it consistently
Rarity is a fact about the place, so seen cards keep the tab. Mute every tier by the same amount so legendary doesn't shout and common doesn't vanish:
```css
.pp-post[data-earn="seen"] .rarity-tab { filter: saturate(.35); opacity: .85; }
```
With R2's light common ink, a muted common still reads (about 7:1 after the opacity drop). Check this on a real seen-common card at 390px before signing off.

### R6. Minor cleanups
- `main.js:5813` uppercases the text in JS (`rarity.toUpperCase()`) while CSS already does `text-transform: uppercase`. Drop the JS one so all 3 call sites set the text the same way.
- The detail view (`.ppd-card.prox-postcard`) borders with `--rarity`, so R2's common frame bump also fixes the near-invisible grey border on common detail cards.

---

## Optional alternative (if the edge tab still feels busy after R1–R4)
Move rarity off the card edge and into the caption line: a 6px coloured dot + the word in `--rarity-ink` at 10px, placed before the tier/date in `.pp-meta`. Nothing overlaps the card edge or photo, so it's the cleanest option, but it is less glanceable when scanning the grid. I'd try R1–R4 first; they fix both complaints without changing the design Sean already approved.

## Verification checklist for whoever implements this
1. Capture at **390px** (`shots/passport/rr-shot.mjs` seeds all 4 rarities × all earn states): grid, collections, and the detail view for one common and one legendary.
2. Zoom-crop the tab rows: no card border line should be visible through any pill.
3. Seen common: the tab must be clearly readable.
4. Bullseye/Pinpoint legendary: purple tab and gold ring must not blur together (the halo separates them).
5. Run `node --check --input-type=module < src/main.js`. A plain `--check` misses module-only errors.
