# Passport header: collapse, stick, auto-close

Opus review, 2026-10-12. This is a recommendation only: nothing in `src/` was changed.

Follows `docs/passport-header-compact-opus.md` (2026-10-11). That review's Option B shipped: the `⋯` toggle now hides rarity and sort. The jump chips stayed, and a sticky chip bar was left as an "optional phase 2". Sean's three ideas pick up from there.

## How this was measured

- **Code read:**
  - Markup: `src/main.js:6442-6504`.
  - Passport CSS: `src/main.js:6265-6423`. `.stats-screen` padding is at `:5401`.
  - Status state and localStorage: `:7002-7009`.
  - Collapse state: `:7014-7071`.
  - `renderPassportJump`: `:7073`.
  - `ppFilteredGroupCount`: `:7091`.
  - `applyPassportFilters`: `:7163`.
  - Event wiring: `:7413-7443`.
- **Heights are measured, not computed.** I used headless Chromium (`/opt/meta-chromium`, playwright) at 390×844, DPR 2, reading `getBoundingClientRect()` on every header block.
  - Harness: `~/workspace/map-game/shots/passport/hdr-measure.mjs`. Raw output: `hdr-measure.json`. Screenshots: `hdr-1-resting.png` through `hdr-6-countries.png`.
  - Seed data: 220 visited places out of 754, about two-thirds of them earned.
  - States measured: resting, filters open, Earned filter with the panel open, Earned filter with the panel closed, scrolled 1200px, and the Countries tab.
- **The old `pp-shot.mjs` no longer works.** It targets `.pp-post` and the always-visible continent select, which no longer exist. I wrote a fresh harness instead (see the note at the end).
- **The "target" heights in §3 are computed** from the CSS values I propose, using the measured heights of the elements that don't change. They are not mocked.
- **Unmeasured:**
  - iOS Safari sticky behavior.
  - The real `env(safe-area-inset-top)` in the standalone PWA. Chromium reports 0. On notched iPhones it is about 47-59px.
  - The real visible height once iOS browser chrome is subtracted.

## 1. Current state (measured, 390×844, Places tab)

| Block | Top (px) | Height (px) | Cost incl. gap (px) |
|---|---:|---:|---:|
| Screen padding (18 + safe-area) + card padding 14 + border 1 | 0 | — | 33 |
| Title row: "Your passport" + 🛡 + ↗, with × absolutely positioned. The 44px icon buttons set the row height; the h2 itself is 26. | 33 | 44 | 52 |
| Progress: count line 20 + 4 + bar 4 | 85 | 28 | 36 |
| Places / Countries tabs | 121 | 34 | 42 |
| Status row: All / Earned / Seen / Unvisited + `⋯` | 163 | **44** | 52 |
| Continent jump chips. Content is 624px wide in a 332px track, so about 2.5 of 6 chips are visible. | 215 | 32 | 42 (10 is the dex margin) |
| **Grid starts** (first sticky group head, 29px, then the first slot at 290) | **257** | | |

**Header share of the 844px viewport:**

| State | Grid starts at | Share | Delta |
|---|---:|---:|---|
| Resting | 257 | **30.5%** | |
| `⋯` open (rarity + sort row) | 309 | 36.6% | +52 |
| A filter active, panel closed ("57 of 754 shown" subrow) | 290 | 34.4% | +33 |
| Filter active, panel open | 342 | **40.5%** | |
| Countries tab (summary 17 + unstyled native sort select **19px**) | 219 | 26% | |

At rest, a slot row costs about 129px, so roughly 4.5 rows show at 844. In Safari with its toolbars showing, it is closer to 3.5 (unmeasured).

**What makes it feel thick:**

1. **Five stacked full-width bands** (title, progress, tabs, status, chips), separated by uniform 8px gaps. Nothing groups them, so the eye reads five toolbars.
2. **Three different pill languages:**
   - Tabs: 34px tall, 11px radius.
   - Status pills: 44px, fully round, purple tint.
   - Chips: 30px, round, 10px text.

   The tallest of these, the status pills, is a set-and-forget control: its value persists in localStorage.
3. **The header disappears completely when you scroll.** In `hdr-5-scrolled.png`, only the 29px continent group head stays.
   - The fully expanded dex measured **25,804px**, about 30 screens.
   - Once scrolled, the user can't reach ×, the tabs, the filters, or the jump chips, which are the navigation for that list. Escape works on desktop; iOS has no equivalent, so the only way back is to scroll back up.

   This, more than the 257px itself, is why the header feels like dead weight: it costs a third of the first screen and is useless everywhere else.
4. **An active rarity filter is invisible once `⋯` is closed.** `.pp-filters-toggle` only styles `[aria-expanded="true"]`, so "All rarities" and "Rare only" look identical when closed. The only hint is the "N of 754 shown" subrow, which itself costs 33px.

**Behaviors that must survive (verified in code):**

- **Filtered counts** (2cde1ab): `applyPassportFilters` rewrites each group head and `chipEl` with `ppFilteredGroupCount(name)`. Status "all" counts visited places; other statuses count matching places; the count respects the band filter. Measured: chips went from "Africa 13/116" to "Africa 9/116" under Earned.
- **Chips open a collapsed group before scrolling:** `head.ppExpand()` runs, then `section.scrollIntoView({block:'start'})`.
- **Persistence:** collapse state in `where-on-earth-collapsed-continents`, status in `where-on-earth-passport-status`, view in `where-on-earth-passport-view`.
- **Toggle-only filtering:** status, band, and continent changes only flip `[hidden]`. Only a sort change rebuilds the dex.
- **Shared header:** the Countries tab shares the title, progress, and tabs, and has its own summary + sort below them, plus a detail view with a "‹ Countries" back button.

## 2. Sean's three ideas

### (a) Filters behind a Filters button, expandable and collapsible

- **Saves:** 52px at rest by moving the status row in. Another 33px when filtered, by moving the "shown" subrow in. With (b), it also keeps the stuck bar to a single row.
- **Costs:**
  - Earned / Seen / Unvisited goes from 1 tap to 2. The 10-11 review kept status visible for exactly this reason.
  - The real cost is that a collapsed filter stops being visible. That is only acceptable if the button shows active state (a badge and a highlight, §3). With that in place, the persisted status is shown, not hidden.
  - Half of this already exists as the `⋯` toggle. This idea finishes it rather than adding a second mechanism.
- **Verdict: yes, with an active-filter badge.**

### (b) Frozen (sticky) header

- **Saves:** no space at rest. It fixes the larger problem: controls become unreachable after the first screen.
- **Sticking all 225px would be wrong.** That would permanently cover about 27% of the screen, which is worse than today while scrolling. Stick **one row**: the toolbar (Filters + jump chips + ×).
- **Cost: iOS sticky quirks.**
  - `position: sticky` inside `.passport-screen` (`overflow:auto`, `-webkit-overflow-scrolling: touch`) works in iOS 13+.
  - `.pp-card` uses `overflow-x: clip`, which does not break sticky. Safari before 16 ignores `clip` and treats it as `visible`, which is also fine. Never change that to `overflow: hidden`, which would kill sticky.
  - Measured in Chromium: the existing sticky group head sticks **18px below the scrollport top**, at the screen's padding edge. Cards scroll visibly through that strip (`hdr-5-scrolled.png`).
  - In the standalone PWA, that strip becomes 18px plus the safe-area inset (about 65-77px) of grid sliding under a translucent status bar. A stuck toolbar must cover it (§4). WebKit's handling of scroller padding is unmeasured.
- **Cost: collisions.**
  - The group heads are already `sticky; top:0` and would slide under the toolbar. They need `top: <toolbar height>`.
  - A chip's `scrollIntoView` would land the section under the toolbar. It needs `scroll-margin-top`.
- **Cost: no layout shift**, as long as the sticky element's height never changes while it is stuck. This is why I don't recommend a hide-on-scroll-down / show-on-scroll-up header: it would force the sticky group heads' `top` to animate along with it, and that is where jank comes from on a 25k-px list.
- **Verdict: yes, toolbar row only.**

### (c) Auto-close the filter panel on scroll down

- **Saves:** the panel's full height (about 128px, §3) as soon as the user goes back to browsing, without a dismiss tap.
- **Cost, if the panel is in normal flow (as `.pp-filters` is today):**
  - At the top of the list, closing it pulls the grid up 52-128px under the user's finger.
  - iOS Safari does not do scroll anchoring (`overflow-anchor`), so it can't compensate. That is the layout shift Sean wants to avoid.
- **Fix:** make the panel an **overlay dropdown** anchored under the sticky toolbar (absolutely positioned, out of flow). Opening and closing then never moves the grid, and auto-close becomes a class toggle.
- **Edge case:** changing a filter while scrolled deep shrinks the dex and clamps `scrollTop`. That scroll goes up, and the rule only closes on downward scroll, so it doesn't misfire.
- **Verdict: yes, but only together with the overlay panel.**

## 3. Recommended design

One toolbar row replaces the status row and the chip row, and it is the only part that sticks.

**Resting** (at the top of the list):

```
[Your passport]                      (🛡) (↗)   ×    44  (unchanged)
84 / 754 places          57 postcards · 1 🎯 · 1 📍   28  (unchanged)
[      Places      ][     Countries      ]           34  (unchanged)
[⚙ Filters •2] (Africa 9/116)(Asia 17/239)(Euro…     40  toolbar: 36px controls + 2px pad
Africa · 9/116                                    ⌃   29  sticky group head
[slot][slot][slot]
```

- Grid starts at 33 + 52 + 36 + 42 + 48 = **211px (25.0%)**, down from 257. That saves 46px at rest, 79px with a filter active (the subrow is gone), and 131px with the panel open (the overlay takes no flow space).
- The Filters button is fixed at the left of the toolbar. The chips scroll horizontally to its right, as they do today.

**Scrolled** (toolbar stuck):

```
[⚙ Filters •2] (Asia 17/239)(Europe 15/177)(…   ×    40 + 4 bottom pad = 44
Asia · 17/239                                   ⌃    29  group head, now sticky at top:44
```

- Stuck cost: **73px (8.6%)**, compared with 29px today, which has no controls. It also covers the padding and safe-area strip, which today shows content scrolling through.
- **What stays visible when stuck:**
  - Filters and chips, because those are what you need mid-list.
  - A compact × at the right end, because there is no other exit mid-list on iOS. It appears only while stuck; at rest the real × is visible.
- **What scrolls away:** title, counts, and tabs. Counts are summary information, and switching tabs mid-list is rare. Scrolling to the top brings them back.
- **Optional:** highlight the chip of the current section. Same IntersectionObserver. Not needed for this pass.

**Filters open** (overlay drops from under the toolbar, grid does not move):

```
[⚙ Filters •2 ▴] (chips…)
┌───────────────────────────────────────────────┐
│ [All][Earned][Seen][Unvisited]            36  │
│ [All rarities ▾]  [Atlas ▾]               40  │  (continent select joins in non-atlas sorts, as today)
│ 57 of 754 shown                           16  │
└───────────────────────────────────────────────┘   ≈128 incl. 10px padding and 8px gaps
```

- **Active-filter state, so a collapsed filter is never invisible:**
  - The button shows a count badge: the number of non-default filters among status ≠ all, band set, and continent set (when visible). Sort is an ordering, not a filter, so it doesn't count.
  - When the badge is above 0, the button takes the existing pressed style (`border #67e8ff; background rgba(103,232,255,.14); color #c9f6ff`) and the badge uses the gold count color (`#ffc76a`).
  - `aria-label="Filters, 2 active"`, plus `aria-expanded` and `aria-controls`.
- **The panel closes on:**
  - Tapping Filters again.
  - Escape. It should take precedence over closing the passport in the existing keydown handler.
  - A pointerdown outside the panel and toolbar. Don't swallow it; let the tap through.
  - **More than 24px of downward scroll** since the panel opened (rule c).
  - It stays open while you change filters, so you can set several and watch the grid update behind it.
- **Filter change while stuck:** after `applyPassportFilters`, scroll so the toolbar sits at its stuck position (`scrollTop = toolbar's resting offset`). Results then start from the first match, instead of wherever the shrunken list clamped. This is new, but it's required: before this change, filters could only be changed from the top.
- **Countries tab:** the same `.pp-toolbar` slot (centralize-shared-UI rule):
  - List view: summary text plus the sort select, restyled as the same pill. Today it is a bare 19px native select.
  - Detail view: "‹ Countries".
  - In both, the slot sticks the same way.
- **Motion,** matching the passport's existing `.12s-.16s ease-out` transitions (group chevron `.15s`, `.pp-post` `.16s`):
  - Panel in: `opacity 0→1` and `transform: translateY(-6px)→0` over 160ms ease-out.
  - Panel out: 120ms.
  - Stuck state: the bottom hairline/shadow and the compact × fade in over 150ms (opacity only).
  - Under `prefers-reduced-motion` (the helper exists at `:7913`), drop the transforms and keep the opacity.
  - Animate only `opacity` and `transform`, never height.

## 4. Implementation sketch

**Markup** (`passportScreen.innerHTML`, `:6442`):

- Replace `.pp-status-row` and `.pp-jump` with one block:

  ```html
  <div class="pp-toolbar" data-pp="toolbar">
    <button class="pp-filters-btn" aria-expanded="false" aria-controls="pp-filters">Filters <b class="pp-badge" hidden></b></button>
    <div class="pp-jump" data-pp="jump"></div>
    <button class="pp-toolbar-close" aria-label="Close passport">×</button>
    <div class="pp-filters" id="pp-filters" hidden> status group + selects + .pp-shown </div>
  </div>
  ```
- The status buttons keep `data-pp="status"` and `data-status`, so the handlers at `:7418` are unchanged.
- Put a 1px sentinel `<div data-pp="stick-sentinel">` immediately before the toolbar.
- Countries view gets its own `.pp-toolbar` holding the summary and sort.

**CSS** (passport style block):

- `.pp-toolbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 6px; padding: 2px 0; background: #0b1120; }`
  - Use the same solid color as `.pp-group-head`. Don't use `backdrop-filter`: blur on a sticky layer re-composites every scroll frame on iOS.
- `.pp-toolbar.is-stuck::before { content:''; position:absolute; left:-14px; right:-14px; bottom:100%; height: calc(env(safe-area-inset-top,0px) + 18px); background:#0b1120; }`
  - This covers the strip between the padded scrollport edge and the true top, without changing the toolbar's height. No layout shift.
  - Also widen the toolbar's background to the card edges with `margin: 0 -14px; padding-inline: 14px`.
- `.pp-filters { position:absolute; top:100%; left:0; right:0; z-index:4; … }`, plus an `.is-open` class for the transition.
  - Today the `.pp-card [hidden]` rule forces `display:none!important`, so animate with `visibility` + `opacity` instead of `[hidden]`.
- `.pp-group-head { top: 44px; }` (toolbar height + pad). Use a `--pp-toolbar-h` custom property so the Countries continent heads can share it. `.pp-ccards .pp-group-head` is `position: static` today; leave it.
- `.pp-group { scroll-margin-top: 44px; }` so chip jumps land below the toolbar. `scrollIntoView` honors `scroll-margin` in Safari 14.1+.
- Delete `.pp-status-row`, `.pp-filters-toggle`, `.pp-subrow`, and the duplicate `.pp-shown` rule (`:6312` and `:6315`).
- `.pp-toolbar-close { display:none }`, and show it under `.is-stuck`.

**JS:**

- **Stuck detection:** use an `IntersectionObserver` on the sentinel with `root: passportScreen` and `threshold: 0`. Toggle `.is-stuck` when it leaves. This needs no scroll listener.
- **Auto-close:** attach a `scroll` listener with `{ passive: true }` to `passportScreen` **only while the panel is open**, and remove it on close.
  - Coalesce with `requestAnimationFrame`. Read `scrollTop` only, and compare it with `openTop`, recorded at open.
  - Close when `scrollTop - openTop > 24`. If the user scrolls up, lower `openTop` to the new `scrollTop`, so the threshold measures downward travel since the last upward movement.
  - Never write layout in the handler. The only write is the class toggle on close.
- **Badge:** a small `updateFiltersBadge()` called at the end of `applyPassportFilters()`. It already knows `ppStatus`, `band`, and `continent`.
- **Move the "shown" text:**
  - Into the panel: `applyPassportFilters` keeps writing `ppEls.shown`, which now lives inside the panel.
  - The "No stamps match these filters yet." empty state must stay visible when the panel is closed. Render it in the dex area when `shown === 0`.
- **Filter change while stuck:** in the status/band/continent handlers, if `.is-stuck`, set `passportScreen.scrollTop = sentinel.offsetTop` after `applyPassportFilters()`. That moves upward, so it doesn't trip auto-close.
- **Unchanged:** `renderPassportJump` (chips are re-parented, not rebuilt), `ppFilteredGroupCount`, the collapse storage, `ppGroupHead`, and `ppExpand`.

**Risks and mitigations:**

| Risk | Mitigation |
|---|---|
| WebKit sticks relative to the padding edge differently from Chromium (unmeasured), leaving a gap or overlap under the status bar | The `::before` cover is sized to padding + safe-area and only shows when stuck. Verify on a real iPhone in the standalone PWA before calling it done. |
| Chip jumps land inexactly, because groups use `content-visibility:auto` with a 900px intrinsic estimate | This exists already, and `scroll-margin-top` doesn't make it worse. If it shows up, run a second `scrollIntoView` in the next rAF after `ppExpand()`. |
| Overlay panel covers the first ~2 grid rows while open | Intended: it closes on the first real scroll, and the filter results are visible below it. |
| Sticky group heads (z 1) and toolbar (z 3) inside `.glass` with backdrop-filter | Backdrop-filter doesn't affect sticky. Keep the z-order explicit. |
| Tap targets: 36px Filters button and 30-32px chips, below the 44px used elsewhere | The chips are already 30px. The Filters button is about 84px wide. If Sean wants strict 44px, the toolbar grows to 48px (+8px at rest and when stuck). |
| A future change to `overflow: hidden` on `.pp-card` silently breaks sticky | Add a one-line CSS comment next to `overflow-x: clip`. |

**Verification for whoever builds it:**

- Re-run `hdr-measure.mjs` and confirm the grid starts at about 211 at rest and about 73px are occluded when stuck.
- Check that chip taps on a collapsed group expand it and land the head below the toolbar.
- Check that filter counts still change on chips and heads.
- Check that collapse state survives a reload.
- Capture at 390px, then test on a real iPhone (standalone) for the safe-area strip.

## 5. Decisions for Sean

1. **Status pills inside the Filters panel (recommended), or kept visible?**
   - **Inside (recommended):**
     - Rest is 211px and stuck is a single 44px row.
     - Earned / Seen costs 2 taps, but the badge and highlight show it's on, and the choice persists.
   - **Visible:**
     - The 44px status row stays in flow above the toolbar, so rest is about 263px, slightly worse than today's 257.
     - Either the stuck bar can't change status, or it grows to two rows (about 96px stuck).

   Your complaint was thickness, so I'd move them in.

Everything else (stick only the toolbar, overlay panel, auto-close on downward scroll, badge) follows directly from the measurements, and I don't see a real either/or in it.

---

*Harness note:* I wrote `shots/passport/hdr-measure.mjs` at the same path as the 10-11 review's harness and overwrote it, including that harness's `MOCK=css|merge` modes, and `hdr-measure.json`. The 10-11 doc's "after" numbers can no longer be reproduced from that script. Its screenshots (`hdr-empty.png`, `hdr-played-css.png`, …) are untouched.
