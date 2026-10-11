# Postcard thumbnail format review: postgame vs passport

Opus 5.5, 2026-10-10. Review only, nothing implemented.

**Method.** Measured, not estimated. I played a daily game headless in Chromium at 390×844, DPR 2 (`shots/postcard-review/shot.mjs`, using the same harness as `shots/passport/pp-shot.mjs` but with real Wikimedia photos). I used `window.__game` guesses to land 2 pinpoints, 2 bullseyes and 1 near-miss, which produced the postgame summary. The script then reloaded and opened the passport with those same 5 cards. I read box sizes with `getBoundingClientRect` and checked styles against `src/style.css` and the `passportPageStyle` / `collectionsStyle` / `.ppd` blocks in `src/main.js`.

Screenshots:
- `shots/postcard-review/postgame-390.png`
- `shots/postcard-review/passport-390.png`

## 1. Side by side (measured at 390px)

| | Postgame `.postcard-summary-card` | Passport `.pp-post` |
|---|---|---|
| Grid | 2 cols, `gap: 14px 12px` | 2 cols, `gap: 14px 12px`, `padding: 4px 3px` (same) |
| Card box | 160 × **210** px | 159 × **166** px |
| Card surface | `rgba(5,12,29,.82)`, the same value as `.glass`, so it sits on the glass panel almost invisibly | `#1a1f2e` opaque "card stock" |
| Border / radius | 2px `var(--rarity)` / **12px** | 2px `var(--rarity)` / **4px**, tilted ±0.6–0.7° |
| Photo | Full-bleed, 156 × 117, 4:3, square corners | Matted (5px inset), 144 × 109, 4:3, 2px radius |
| Top-left of photo | `.prox-badge` (shared) | `.prox-badge` (shared) |
| Top-right of photo | nothing | `.pp-stamp`: 42px dashed ring, best score, rotated 12° |
| Topline | `.postcard-summary-badge` pill ("✦ NEW") + `.postcard-summary-distance` text, 22px row + 6px margin | none |
| Name | `.postcard-summary-place`: 16px / 800 / `item.short` | `.pp-name`: 13px / 800 / `item.clue` (includes country and flag) |
| Second line | `.postcard-summary-country`: 12px flag + country (+ gold " · Bullseye" on upgrades) | `.pp-meta`: 10px "Pinpoint • Oct 10" |
| Distance | Shown **twice**: once in the topline and again as `.postcard-summary-distance-badge` | Not shown (it lives in the detail view) |

## 2. Problems found

### Postgame
1. **The distance badge is in the wrong place.** `.postcard-summary-distance-badge` is `position:absolute; right:8px; bottom:8px` on the *card*, not on the photo. So it lands in the copy block next to the country, as a boxed chip that repeats the `.postcard-summary-distance` text in the topline. In the screenshot each card says "17 km" twice, 40px apart. It reads as a bug.
2. **The "✦ NEW" pill tells the player nothing on most cards.** The header already says "New Postcards" and every card in a typical haul is new. The pill only means something when the haul mixes new and upgraded cards, yet it costs a 28px row on every card. That row is most of the 44px height difference from the passport.
3. **The name is too big for the column.** 16px in a 134px text column truncates "Isla de la Foca, …". 76 of the 1,306 `short` names are longer than 16 characters (the longest is 32), so this will happen regularly.
4. **The card has no visible surface.** Its background is the same rgba as the `.glass` panel behind it, so the only thing defining the card is the rarity border. It reads as a framed photo with loose text under it.
5. **The `max-height: 700px` override** (`style.css:270-273`) sets `.postcard-summary-photo { height: 100px }`, which breaks the 4:3 ratio (156×100 ≈ 1.56:1). It also sets `.postcard-summary-card { min-height: 100px }`, which does nothing. These are leftovers from the old one-column row layout.

### Passport
1. **The photo's top corners are crowded.** On a 144px-wide photo, the `.prox-badge` "🎯 BULLSEYE" pill (~80px) and the 42px `.pp-stamp` (plus its 3px ring and 12° rotation) leave about 10–15px between them. On Dakar and Pangai they nearly touch. Both badges also say the same thing (🎯/📍 appears in both the pill and the stamp's `<small>`).
2. **The name uses `item.clue`, which repeats the country.** "Sagrada Familia, Sp…" truncates because the clue carries ", Spain 🇪🇸". It's also why the meta line has no room for the country.
3. **Data bug (not CSS):** the clue for `Isla de la Foca` is "Isla de la Foca, Peru, Peru 🇵🇪" in `assets/locations.json`. Its `short` is "Isla de la Foca, Peru". It's the only true duplicate I found; the other 15 hits, like "Guatemala City, Guatemala", are legitimate.

## 3. Which is more aligned with the rest of the site?

**The passport.** Everywhere else the game shows a postcard *as an object*, it uses the same recipe: an opaque `#1a1f2e` card, a matted photo, a 2px `--rarity` border and small radii.

- `.collection-card` (collection detail grid): `padding: 5px 5px 7px; border: 2px solid var(--rarity); border-radius: 9px; background: #1a1f2e;` with an inset `.photo` at radius 5px.
- `.ppd-card` (opened postcard): `border: 2px solid var(--rarity); background: #1a1f2e;` with the photo inset inside 13px padding.
- `.pp-post`: the same recipe, plus tilt.

Postgame is the only place a postcard is drawn as a glass tile with a full-bleed photo. That style belongs to the in-round thumbnails (`#place-thumb`, `#peek-thumb`: 10px radius, 2px rarity border, no card stock). Those are *photos of a place*, not *postcards*. The summary screen's whole message is "these went into your passport", so the player should see the same object they'll later find in the book.

The one thing postgame does better is the **name hierarchy**: a short place name, then flag + country on its own line. That beats the passport's clue-as-name, which wastes width and truncates.

## 4. Recommendation: align postgame to the passport card, and borrow postgame's name line back

This means mixing, weighted toward the passport. It isn't a new direction: the passport/collection/detail family is already consistent, and postgame is the one outlier.

Per the "Centralize shared UI" rule in AGENTS.md, **don't restyle `.postcard-summary-*` to look like `.pp-post`**. Instead, render the summary card from the same markup and classes, so later passport tweaks carry over automatically.

### 4a. Postgame changes (`postcardSummaryCard()` in `src/main.js`, `.postcard-summary-*` in `src/style.css`)

1. **Build the card from the passport classes.** Use an `<article class="pp-post pp-post--haul">` wrapping `.pp-photo > img`, then `.pp-name`, then `.pp-meta`. Apply the border with `applyCardTier(card, item, outcome.tier)` instead of setting `rarity-${rarity}` by hand. Keep `setProxBadge(photo, outcome.tier)` on the **photo**, not the card, so it matches the passport.
   - Tilt: keep it. It's cheap continuity with the book. If the haul grid should feel "fresh off the press", `.pp-post--haul { --tilt: 0deg; }` turns it off; that's a taste call either way.
   - Hover/press: `.pp-post` has `cursor:pointer` and `:active` scale. The summary cards aren't tappable, so add `.pp-post--haul { cursor: default; } .pp-post--haul:active { transform: rotate(var(--tilt)); filter: none; }`. Or make them open `openPostcard()`, which would be a feature decision for Sean.
2. **Drop the topline row.** Delete `.postcard-summary-topline`, `.postcard-summary-badge` and `.postcard-summary-distance`. Put the round outcome in `.pp-meta` instead, in the passport's format:
   - New: `New • 17 km`
   - Upgraded: `↑ Bullseye • 0.0 km`, with the tier word in gold `#ffd477`, reusing the `.postcard-summary-tier` colour (or `.pp-tier-date`'s slot).
   - That keeps both pieces of information and removes the duplicate distance and the 28px row. The card goes from 210px to ~166px, matching the passport.
3. **Delete `.postcard-summary-distance-badge` entirely.** If Sean wants the distance *on the photo* (which was probably the intent of the recent change), put it in the stamp position as a `.pp-stamp`. In the passport the stamp shows the best score, and the postgame equivalent is this round's score (`result.base`), which is the same meaning. I'd recommend score in the stamp and distance in the meta line, rather than a third badge style.
4. **Name line:** use `item.short` at the passport's 13px (`.pp-name`), with the flag appended ("Dakar 🇸🇳"). Drop the separate `.postcard-summary-country` line. Country names are long, and 13px short + flag fits 144px for most names; the two-line version is what pushed the card to 210px.
5. **Remove the stale short-screen overrides** at `style.css:270-273` (`.postcard-summary-card` min-height, `.postcard-summary-photo` fixed 100px height, `.postcard-summary-copy` padding). On ≤700px-tall screens, if 5 cards plus the button don't fit, shrink the gap (`.pp-grid`-style `12px 9px`) instead of squashing the photo ratio.
6. Keep `.postcard-summary-list` as the grid container, or switch it to `.pp-grid`. They're already identical (`repeat(2, minmax(0,1fr)); gap: 14px 12px`). Switching also picks up the 4px/3px padding that stops the tilt from clipping, which the summary needs if tilt is kept.

### 4b. Passport changes (`passportCard()` / `passportPageStyle`)

1. **Name:** use `item.short` plus the flag instead of `item.clue`. This is the one thing to borrow from postgame. It fixes "Sagrada Familia, Sp…" and makes both surfaces read the same. (The detail view `.ppd` can keep the full clue.)
2. **Stamp vs prox badge:** pick one carrier for the tier icon. The `.pp-stamp small` currently repeats 🎯/📍 from the `.prox-badge` right next to it. Make the stamp's `<small>` always say `BEST`, and let `.prox-badge` (the shared accuracy badge, per its comment at `main.js:5699`) own the tier. Also shrink the stamp to the `≤360px` size (36px / 13px) at all widths, or switch the prox badge to `compact` on grid cards. Either one gives the two badges real breathing room on a 144px photo.
3. **Data:** fix the `Isla de la Foca` clue in `assets/locations.json` to "Isla de la Foca, Peru 🇵🇪".

### 4c. Result

Both surfaces render one shared `.pp-post` object:
- 4:3 matted photo
- prox badge top-left, score stamp top-right
- 13px short name + flag
- one 10px meta line: "Pinpoint • Oct 10" in the passport, "New • 17 km" / "↑ Bullseye • 0.0 km" postgame

The postgame card loses ~44px of height and its duplicate distance. The passport stops truncating on country suffixes. A future style change to the postcard thumbnail happens in one place.

## 5. Out of scope, noticed in passing

At 390px, the passport filter selects truncate their labels ("All continent", "All difficultie"). I didn't investigate further.
