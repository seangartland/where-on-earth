# Post-game postcard summary: UX review

Reviewed 2026-10-07 by Claude Opus 5.5. I read the code (`src/main.js` `postcardSummaryCard` / `showResults` / `postcardRoundOutcome` / `recordVisit`, `src/style.css` lines 218–268, `index.html` results markup) and the mockup `preview-postcard-summary.html`. I didn't take screenshots, so the layout claims below come from reading the CSS, not from looking at the screen. Items marked **verify** should be checked with a 390px capture before you act on them.

The direction is right. Putting the postcards first and the score second suits a collection game. The card anatomy (photo, badge, distance, place, country) reads well. Most of the problems are in edge-case states and in tier signaling, not in the core layout.

---

## P0: bugs and misleading states

### 1. Lede copy breaks when there are upgrades but no new cards
`showResults()` line 3321–3323. When `newCount === 0 && upgradeCount > 0`, the output is:

> No new postcards2 upgraded.

There's no separator, because the `' — and '` joiner only appears when both counts are non-zero. Fix: build the lede from parts.

```js
const parts = [];
if (newCount) parts.push(`${newCount} new postcard${newCount === 1 ? '' : 's'}`);
if (upgradeCount) parts.push(`${upgradeCount} upgraded`);
lede = parts.length ? `${parts.join(' and ')}.` : 'No postcards this time. Get within 150 km to earn one.';
```

Better still, use the warmer copy from the mockup ("Two new keepsakes and two sharper stamps."). Number words are nicer for 1–5.

### 2. A great guess on a card you already own shows as a failure
`recordVisit` returns 0 unless the tier *improves*, so `postcardRoundOutcome` returns `miss`. Take a player who already owns Kyoto at Bullseye and lands 12 km away again. They get the grey, dashed "No postcard" card next to a 12 km distance. That reads as punishment for a near-perfect round, and it gets more common the longer someone plays.

Fix: add a fourth state, **`kept`**. It applies when the round was within 150 km but didn't change the tier.
- Badge: `✓ In passport` (or `Already yours`) in neutral/white at full opacity, not the muted miss style.
- Solid border (not dashed), full-colour photo, and the owned tier's ring if it's Bullseye or Pinpoint.
- `postcardRoundOutcome(prev, newly, km)` needs the round's own earn tier: `kind: 'kept', tier: prevEarned` when `earnForKm(km) > 0 && !newly`.

The mockup's summary row already had a "kept" count. The implementation dropped it, probably because the state didn't exist.

### 3. A first-time Bullseye or Pinpoint looks *worse* than an upgrade
Say a player's first-ever visit to Petra lands 3 km away. That card gets `new pinpoint` classes, which means:
- a blue `✦ New` badge with no tier text (tier text is only added for `upgrade`),
- a grey distance (gold distance is `.upgrade`-only),
- no photo ring or glow (`.upgrade .postcard-summary-photo` only),
- a gold card border, because `.pinpoint` *does* apply. So the card shows a half-gold mismatch.

The best outcome in the game ends up looking less special than an upgrade. Fix: **separate "is it new" from "what tier".**
- Tier styling (ring, glow, gold distance, border) should key off `.bullseye` / `.pinpoint` classes on any non-miss card, not off `.upgrade`.
- Tier text should show on every Bullseye or Pinpoint card: `🇯🇴 Jordan · Pinpoint`.
- The badge then only answers "new or upgraded".

### 4. The close button probably overlaps the Share button (**verify**)
`index.html` puts `#results-home` inside `.results-actions`, and that container is `position: relative` (style.css:250). The `.results-card .home-nav-btn` rule (style.css:216) positions it `absolute; top:5px; right:5px` against *that* container, which places the × on top of the right end of the full-width Share pill. Meanwhile the header reserves `padding-right: 48px` for a close button that isn't there. The mockup puts × in the header's top-right.

Fix: move the button into `.postcard-summary-header`, which makes it match the mockup and the shared top-right close placement used on every other screen (see the "centralize shared UI" convention).

### 5. The mockup itself contradicts the rules
Santorini is marked `✦ New` at **186 km**, but the threshold is under 150 km. Change it to something like 112 km so the approved reference doesn't teach the wrong rule to whoever builds from it next.

---

## P1: NEW vs UPGRADED distinction

Right now the distinction rests on badge colour (blue vs gold) plus a short text label. That's fine at a glance, but two things weaken it.

1. **Gold means two things at once.** It marks both "upgraded" and "Bullseye/Pinpoint tier". Once fix 3 lands, a *new* Pinpoint gets gold tier styling too. Keep it clean:
   - **Blue = new to your passport** (badge only).
   - **Gold = tier** (ring, glow, tier label), whatever the badge says.
   - Upgrade badge: make it *say what changed*: `↑ Near → Bullseye`, `↑ Bullseye → Pinpoint`. "Upgraded" alone forces the player to hunt in the country line for the tier. The from-tier is `previousEarn`, which already exists at outcome time, so store it on the result.
2. **Pinpoint vs Bullseye is too subtle.** The only differences are a 2px vs 3px inset ring, slightly stronger glow, and the word. At 88px on a phone that's invisible. Give Pinpoint a *filled* gold badge (`background:#f5c451; color:#1a1204`) while Bullseye keeps the outlined gold badge. That way the top tier pops in peripheral vision.

Recommended badge matrix:

| Outcome | Badge | Badge style | Tier styling |
|---|---|---|---|
| New, Near | `✦ New` | blue outline | none |
| New, Bullseye | `✦ New` | blue outline | gold ring + `· Bullseye` |
| New, Pinpoint | `✦ New` | blue outline | thick ring + glow + `· Pinpoint` |
| Upgrade → Bullseye | `↑ Bullseye` | gold outline | gold ring |
| Upgrade → Pinpoint | `↑ Pinpoint` | **gold filled** | thick ring + glow |
| Kept | `✓ In passport` | neutral solid | ring of owned tier |
| Miss | `No postcard` | muted, dashed card | none |

---

## P1: Visual hierarchy

1. **The lede and the counts row say the same thing.** The lede ("2 new postcards and 2 upgraded.") and the totals row ("**2** new · **2** upgraded") sit about 500px apart and repeat each other. The counts row also turns into "**0** new · **0** upgraded" on a bad day, which reads as a scolding. Drop the counts row and let the lede carry the totals. That frees about 45px, which matters at 390px (see below).
2. **The score is now a footnote.** `Score 7,420 /10,000` is 12px grey with an 18px number, sitting under the cards. Demoting it is the right call because the screen is about postcards. But Share shares the *score*, so the share button and its subject shouldn't be separated by a streak line and a text link. Put the score and streak on one line directly above Share: `🔥 4 day streak · 7,420 pts`.
3. **Miss cards could motivate instead of just fading out.** For misses between 150 and 400 km, swap the plain distance for `23 km short`, computed as `distance - 150`. That turns a dead row into a "next time" hook. Keep raw km for far misses.

## P1: Mobile at 390px

1. **Share is likely below the fold (verify).** Rough stack at 390px wide: header ~90, cards 5×88 + 4×9 gap = 476, counts ~45, score ~30, streak ~30, globe link ~30, Share 52, status 16, next-game card ~80, plus about 56 of padding. That's roughly 905px. In iPhone Safari with toolbars, usable height is about 660–750px, so the primary action and the countdown sit off-screen at first view. The `max-height: 700px` rule only kicks in on short devices, and even then it saves just 50px. Options, in order of preference:
   - Remove the counts row (P1-hierarchy #1): −45px.
   - Cards to 76px everywhere (photo 76×76), copy padding 9/8: −60px.
   - Merge score and streak onto one line: −30px.
   - If it still doesn't fit, make `.results-actions` sticky at the bottom of the card with a fade-out gradient above it.
2. **Text is too small.** The badge is **9px** uppercase at `.12em` tracking, and distance is 11px. The 9px badge carries the most important information on the card and sits below a comfortable reading size. Use badge **10.5–11px** at `.08em`, and 12px for distance.
3. **The tap target has no affordance.** Tapping a card calls `enterReview(i)`, but nothing hints at that: no chevron, no `:active` state, and `<article>` isn't focusable. Fixes:
   - Render each card as a `<button>` (or add `role="button" tabindex="0"` and an Enter handler).
   - Add a `:active { transform: scale(.985); }` press state and a faint `›` at the right edge.
   - Add an `aria-label` that summarizes the card: `"Petra, Jordan. New postcard, Pinpoint, 3.2 km. Show on globe."` Today, screen readers get an unlabeled article.
4. **Long names truncate.** `.postcard-summary-place` is single-line with ellipsis at about 230px of copy width. Names like "Plitvice Lakes National Park" will clip. Allow 2 lines (`-webkit-line-clamp: 2; white-space: normal`). The card's `min-height` already absorbs the extra height.

## P2: Polish

1. **Entrance moment.** This is the payoff screen, and right now it just appears. Stagger the cards in (40–60ms apart, 8px rise and fade), then "stamp" the New and Upgraded badges with a quick scale from 1.25 to 1 and a gold shimmer on Pinpoint. Wrap it in `@media (prefers-reduced-motion: no-preference)`.
2. **The mockup's photo edge fade was lost.** The mockup has a subtle `inset -16px` shadow on the photo's right edge (`.photo::after`) that blends it into the card. The implementation uses a bare `<img>`, so the edge is hard. Add a wrapper or a `mask-image: linear-gradient(90deg, #000 85%, transparent)` on `.postcard-summary-photo`.
3. **The failed-image state is a blank grey square.** `.unavailable { opacity:.25 }` on a broken `<img>` shows the browser's broken-image icon in some engines. Hide the img and show the flag emoji centred on the tinted background instead.
4. **Card colour order.** Consider sorting cards by outcome (Pinpoint/upgrades first, misses last) instead of round order, so the strongest moment sits at the top. If round order matters for review navigation, keep it but add small round numbers ("R1"…"R5") so the tap-to-review mapping is obvious. Recommendation: keep round order and add the round numbers, since tap-to-review indexes by round.
5. **Pinpoint distance precision.** Pinpoint shows one decimal ("3.2 km") and everything else shows integers. That's good. Keep it, but also show the decimal for any distance under 10 km so a 7.4 km Bullseye doesn't read as "7 km".

---

## Suggested order of work
1. P0 #1 lede bug, #3 tier styling split, #4 close-button placement, #5 mockup fix. These are small and contained.
2. P0 #2 `kept` state (needs a `postcardRoundOutcome` signature change) plus the P1 badge matrix.
3. Drop the counts row, resize the text, and add card affordance and a11y. Then capture at 390×844 and 390×664 to confirm Share is visible without scrolling.
4. P2 polish.
