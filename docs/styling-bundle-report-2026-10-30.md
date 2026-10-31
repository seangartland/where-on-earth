# Styling cleanup bundle: report (2026-10-30)

Worktree: `~/workspace/map-game/woe-styling` at base commit `eee0f4d`. Scope: steps 1-8 and 10 of the audit at `~/workspace/map-game/demo/docs/site-styling-audit-2026-10-29.md` (the audit lives in the demo tree, not in this worktree). Step 9 was out of scope and untouched. Nothing here is committed, pushed, or deployed.

Method disclosure: every number below is measured, not estimated. Captures: this worktree's fake-origin CDP harness (`shots/styling-bundle/capture.mjs`), 390x844 at deviceScaleFactor 2, seeded RNG, globe frozen at a fixed view. Pixel diffs: Python/PIL per-pixel max-channel delta; "sig" means delta over 8 on a 0-255 channel. Test suite: `node --test test/*.test.mjs`.

Result: suite 83/83 green. The capture gate caught two real regressions during the work (both cascade-order ties created by step 5, both fixed; details under step 5). After the fixes, every one of the 26 before/after pairs is either pixel-identical or has its difference fully explained below.

## Step 1: palette tokens

`src/styles/game.css` `:root` now defines the dark palette: `--gold: #ffc76a` and `--rgb-gold: 255, 199, 106` (the three golds #ffd166, #ffc76a, #ffd45e and their rgba families collapse onto these two), the ink family (`--ink-hi` #f5fbff, `--ink` #f3f9ff, `--ink-title` #f1f8ff, `--ink-btn` #ecf7ff, `--ink-alt` #eaf7ff, `--ink-dim` #dcefff, `--ink-body` #cfe6ff), and the rgba triplets `--rgb-muted` (193, 224, 250), `--rgb-mist` (198, 226, 250), `--rgb-line` (157, 211, 255). Swapped across game.css, flyover.css, pvp.css.

Proof: the only gold literal left in the three stylesheets is the token definition itself (game.css lines 23-24); grep for #ffd166, #ffd45e, #ffc76a, 255,209,102 and 255,212,94 outside `:root` returns nothing.

Left literal by design: pale gold tints that are not the brand gold (#ffe2a0, #fff5d4 pack cream, #ffe29a, #ffe0ae, #e9b23c), the collections palette (#d2ae62 family), the cyan/sky accent families, and small one-off rgba near-whites in component art. Tokenizing those would have changed no rendering but would have blurred which colors are the shared palette.

## Step 2: one close button

New `.icon-close` in game.css carries the old `.home-nav-btn` geometry and skin, plus its `:active` and `:focus-visible` states. Context rules pin it in place per card: `.settings-card.icon-close, .stats-card.icon-close, .pp-card.icon-close { position: absolute; top: 6px; right: 6px; }` and the renamed overrides for round header, results cards, survival results, and the expedition panel. Deleted: `.settings-close`, `.stats-close`. `.ppd-close` became `.icon-close--badge`, the filled-circle variant (the glyph sits on a `::before` disc); `.recap-close`, a fifth fork the audit did not list, was also folded in, with `.recap-head .icon-close` carrying its in-flow placement.

One structural point: home buttons keep a second class, `home-nav`, alongside `icon-close`. The home click delegation in main.js must fire only for home buttons, never for card closes, so the behavior hook had to stay a separate class from the shared skin. Delegation, the startup normalize loop, `createHomeButton` in `src/core/dom.js`, pack.js's closest check, and round.js's nearTopUI test all select `.home-nav` now. Call sites updated in index.html (5 buttons), main.js, stats.js, passport.js, account/sheet.js, pvp/group.js, pvp/h2h.js, daily-game.js.

Proof: exactly one `.icon-close {` base rule in game.css; grep for home-nav-btn, settings-close, stats-close, ppd-close, recap-close across src and index.html returns nothing.

Deliberately left: `.pp-toolbar-close`, a 32px chip in the stuck passport toolbar. It is a different component (a toolbar pill, not a card close), and folding it into `.icon-close` would have changed its size. Noted here as remaining drift for a future call.

## Step 3: danger pair collapse

One class `.settings-danger` carries the merged destructive-button rule. `.settings-cancel` is now standalone with the full shared geometry (it no longer borrows the danger class for layout). In main.js the "Reset all data" button uses `settings-danger`; the two wirings are scoped so they cannot collide: reset is `.settings-main .settings-danger`, the confirm step is `.settings-confirm .settings-danger`. Both labels kept.

## Step 4: `.primary` pinned, gold as a variant

Base `.primary` unchanged: min-height 52px, `--ink-btn` skin. New `.primary--gold { background: linear-gradient(135deg, var(--gold), #ff9f6a); color: #21152f; }`. Applied in index.html to the two survival result actions and the lock button (the lock button keeps its own color, min-height 54px, shadow, and animation; only its background now comes from the variant). `.survival-result-actions .primary` override deleted.

Height forks removed, per the audit's enumeration: `.account-form .primary` drops min-height 50px (width only; `.account-google` and `.account-done` keep their own 50px), `.reveal-card .primary` drops min-height 48px, pvp.css `.pvp-field .primary, .pvp-panel .pvp-wide, .pvp-actions .primary` drop min-height 48px and font-size 15px, `.pvp-join .pvp-field .primary` drops 42px (the join input keeps 42px).

Two scope notes. First, `.reveal-card` is the Daily review recap card in daily-game.js, not the reveal sheet; its "Back to globe" primary is now 52px tall. That is what the brief ordered; the recap card is not in the capture set, so this one change is verified by code, not by capture. Second, `.peek-bar .peek-next` keeps min-height 44px. It is a `.primary`, but the audit's finding did not enumerate it, and raising it to 52px would grow the peek bar, a visual change outside the two named exceptions. Left as is and flagged here rather than silently expanded.

## Step 5: injected sheets moved into the real stylesheets

All nine JS-injected style blocks are gone from the source: passport.js's four sheets (passportStyle, passportPageStyle, collectionsStyle, postcardStyle), postcard-card.js's `ensurePostcardCardStyles` (plus its import and calls in passport.js and reveal.js), stats.js's statsStyle, daily-game.js's reviewStyle, main.js's expeditionStyle, and round.js's per-toast style element in showEarnToast (including its dismissal-time `style.remove()`).

Proof: `grep -rn "createElement('style')" src` returns nothing.

The CSS now lives at the end of game.css as labeled sections. Two additions went to their natural homes: the `.next-game` trio merged into flyover.css (the injected values won the old cascade: margin 12px 0 0, padding 10px 16px 8px, time 28px, sub 11px). Merges done during the move, all declaration-preserving: postcardStyle's `.ppd` rule folded into the existing `.ppd` rule; the review sheet's `.results-card { position: relative; }` folded into the main block; its `.results-card.streak` margin folded in (`margin: 0 0 10px`); `.results-globe` merged to `display: block; margin: 0 auto;`; the duplicate `.passport` and `.pp-filters select` blocks inside the passport sheets merged.

### The cascade-order problem the capture gate caught

Injected sheets used to land after every static stylesheet, and two same-specificity ties quietly depended on that:

1. The passport screen element carries the classes `screen stats-screen passport-screen`. The stats sheet's `.stats-screen` padding (18px vertical, 14px horizontal) ties at specificity 0-1-0 with the passport page sheet's `@media (max-width: 560px)` rule `.passport-screen { padding: 0; }`. With stats placed after passport in game.css, the passport screen rendered shifted by exactly (+14, +18): measured pp-card rect (14, 18) instead of (0, 0). In the pristine tree the stats sheet is simply absent on a fresh passport open, so the passport rule stood unopposed.
2. `.pp-dex .pp-slot-photo` (postcard component: 3px white frame, #d9cdb2 ground) ties at 0-2-0 with `.pp-unvisited .pp-slot-photo` (passport page sheet: dashed border, striped cream). With the component placed after the passport sheets, unvisited dex slots lost their stripes and dashed border.

Fix: the moved sections now sit in the order stats, postcard component, passport, results review, expeditions, earn toast, which reproduces the pristine cascade for every observed tie. After the fix the probe measures the pp-card at (0, 0) and the dex captures match. Honest footnote: in the pristine app the first tie was flow-dependent (visiting Stats before Passport in one session could shift the passport screen); the static order removes that latent bug rather than reproducing it.

## Step 6: duplicate selectors merged, dead rules deleted

A context-aware checker (selector owns more than one block at top level or within the same @media block) now reports zero duplicates: game.css 803 selector blocks, flyover.css 28, pvp.css 62, and no top-level selector appears in two files. Merged beyond the step-5 list: the `html, body` group split (one block each), the two `#play-button` blocks, the `.mode-name` / `.mode-desc` group split, the results-breakdown family (the Daily list's grid refinement from the review sheet is now its single merged block set; the shared flex group keeps only the PvP and run lists), `.account-google` / `.account-done`, the confirm-modal button pair, `.expedition-choice small`, `.home-recs #expeditions-button`, the pack card line layers, the sealed-pack art layers, the peek-slot tier badges, `.ppd-face-back`, `.ppd-stamp::before` / `::after`, `.settings-account small`, `.survival-results-card`, and the pvp.css primary group.

Dead rules deleted (4): `.map-credit`, `.map-credit a`, `.sat-on .map-credit`, `#results-breakdown .result-separator`.

Audit-vs-code drift: the audit called `.pack-slot-note.is-new` and `.is-upgrade` dead. They are live: pack.js builds the class from a template (`is-${kind}` in packSlot), so the static grep the audit relied on could not see them. Kept.

## Step 7: z-index layer scale

`:root` tokens: --z-screen 10, --z-sheet 11, --z-float 12, --z-stamp 13, --z-toast 50, --z-picker 80, --z-nav 95, --z-boot 100, --z-modal 105, --z-confirm 110, --z-error 200. Every app-level literal in the three stylesheets and the index.html boot block now references the scale (16 token uses; values unchanged). The `.line-distance` comment that narrated stacking in prose now names the tokens. Intra-component stacking in the 0-4 range (toolbar 3, filters 4, badges) stays literal by design: it is local layering inside one component, not app layering.

## Step 8: type scale

`:root` tokens: --fs-micro 10px, --fs-caption 11px, --fs-small 12px, --fs-body 13px, --fs-base 15px, --fs-title 17px, --fs-head 21px, --fs-display 25px. Exact matches swapped across the three stylesheets: 155 token uses. Two fractionals were rounded onto the ladder as the audit's scale requires: 10.5px to 10px (`.ppd-stats`, `.ppd-addr-country`) and 9.5px to 10px (`.ppd-uncollected`). Off-ladder sizes stay literal by design: the display and heading range (14, 16, 18-20, 22, 24, 26-36, 44px, the h1 and results-score clamps) and print-detail micro sizes (8.5px slot names, 7.5px postmark, 11.5px `.ppd-fact`). The measured consequence of the rounding is under capture accounting, pair 15.

## Step 10: reveal slab fix

Chosen treatment: collapse the header during peek, by removing the FLIP. Probe on the pristine tree showed why the slab existed: the CSS end state already collapsed the header (`body.game-reveal .round-header { height: 52px }`), but `collapseRoundHeader` ran a 340ms WAAPI FLIP from the guess height (70px), and the reveal name was faded in over a backwards-fill delay, so the opening state of the animation was the slab. The framing constant REVEAL_HEADER_H (52) already assumed the collapsed bar everywhere else.

Change: `collapseRoundHeader` deleted from `src/globe/reveal.js` (a comment records the CSS contract), both call sites and both `headerFrom` measurements removed from `src/game/round.js`, the call site and measurement removed from `src/modes/tap-country.js`, and the wiring (imports, roundHost, modeHost) removed from main.js and round.js. REVEAL_HEADER_H stays; revealStrip still uses it. No `collapseRoundHeader` or `headerFrom` references remain, and every edited JS file passes `node --check --input-type=module`.

Measured: harness reveal probe, header height at reveal +500ms with travel animation off: 70px before, 52px after. Reveal name visible, clue hidden, peek bar hidden in both states, as designed.

## Capture accounting (26 pairs, 390x844)

Identical, 0.00% at any threshold: 10-passport-dex, 51-pack-sealed, 52-pack-stack, 53-pack-flipped, 56-pack-stack-after-first. In the final run 54-pack-round and 55-pack-reveal also landed at 0.00%.

The harness has one proven nondeterminism, and it accounts for most of the table: the frozen globe races tile loading. The harness freezes the globe shortly after boot (fixed view, then GL draws suppressed); whether the satellite tiles or the built-in base texture won the last frame before the freeze is a coin flip in both trees. Measured envelope, pristine tree against itself: 01-home differs 14.92% sig between two pristine runs; 03/04/05 differ 27-30% sig. The styled tree flips too (02 run-to-run: 17.04% sig), and when the flip lands the same way the pair nearly vanishes (02 before vs after, third run: 0.54% sig). The pairs below sit inside that envelope and their diff maps show only globe disc, globe glow at card edges, and nothing structural:

- 01-home-default-fresh: 15.44% sig (globe flip; the Daily button's cream bbox measured identical at x 71-310, y 183-275, its gradient center within the step-1 gold delta).
- 02-home-default-returning: 0.75% sig final run (earlier runs flipped to ~17%); remainder is the passport card's circular stamp thumbnails (image resample noise, see 11) and the gold gradient start on the Daily button.
- 03-daily-round 6.76%, 04-daily-reveal-peek 6.76%, 05-daily-reveal-expanded 5.93%: globe flip. Pair 04/05 additionally contain the step-10 header change, verified by probe (70 to 52px) rather than by pixels, since the flip noise swamps the header band.
- 31-survival-round: 25.38% (full-globe screen, flip).
- 32-survival-results: 7.40% (globe backdrop flip behind the results card, plus the gold variant buttons, the step-1 exception).
- 06-daily-postcard-summary: 0.22% sig, diff map shows only globe-glow slivers at the card's far edges; the card itself is pixel-clean.
- 07-daily-results: 0.51% sig: edge glow slivers, plus the live countdown digits (21:07:36 style), which differ by capture second in any run.
- 20-settings 0.53%, 21-stats 0.52%: edge glow slivers only; both UIs pixel-clean, including the rebuilt danger button and the `.icon-close` buttons.
- 54/55 in the first after run: 22.47% sig (flip); 0.00% in the final run.

Image resample noise, also proven on the pristine tree: thumbnails of the same image file occasionally repaint at a slightly different resample. Pristine against itself on 11 shows 0.65% sig, max 187, in the same top-row photo region.

- 11-passport-pack-section-open: 0.32% sig, confined to one visited slot's photo (Abuja).
- 57-pack-done: 0.70% sig, confined to the postcard thumbnail images; layout, badges, and text clean.
- 14-postcard-front: 0.00% sig (max delta 5, the pristine noise floor; pristine against itself also measures max 5).

Named exception, step 1 (one gold): sub-threshold to at-threshold shifts wherever the old #ffd166 or #ffd45e rendered: 50-pack-select 0.10% sig with max delta 10 (the G channel difference between #ffd166 and #ffc76a is exactly 10), 02b-home-recs-returning 0.43% with max 10, and the Daily gradient on 01/02.

Named exception family, step 8 rounding: 15-postcard-back, 0.42% sig. The diff map sits exactly on two text lines, "United Arab Emirates" (`.ppd-addr-country`) and "32 km · Pinpoint" (`.ppd-stats`), the two rules rounded from 10.5px to 10px. Layout is unmoved; only glyph rasterization changes. Pristine against itself on this screen is 0.00% sig, so this one is real, small, and a direct consequence of the ordered type scale.

Remainder: 30-practice-hub 0.01% sig (a 3px-wide sliver at x 333-336, scrollbar region), 40-expeditions-picker 0.00% sig (max delta 7).

No pair is left unexplained, and no pair shows a layout shift, a missing element, or a color change outside the two named exceptions.

## Tests

83/83 green (`node --test test/*.test.mjs`). Two test files needed anchor updates because step 5 removed the text they anchored on; both preserve the test's intent:

- `test/passport-summary.test.mjs`: the source-extraction regex anchored on `let passportStyle;`, which no longer exists; it now anchors on `let passportBox;`, the declaration that follows passportSummary in the cleaned file.
- `test/passport-store-distance.test.mjs`: the `.pp-chunk[hidden] { display: none; }` assertion read passport.js source; the rule now lives at game.css line 804, and the test reads the stylesheet.

Diff total: 19 files changed, 734 insertions, 728 deletions. game.css is 1,196 lines (the audit measured 716 in its tree; this worktree's base had already drifted to about that size before the bundle, and the moved sections account for the growth).

## Other drift between the audit and this tree, for the record

- The audit's base (848126c) predates this worktree's base (eee0f4d); several counts differ (game.css 713-716 lines there, stats-close and settings-close each had a second user the audit did not list: passport.js used stats-close, account/sheet.js used settings-close; both are on `.icon-close` now).
- The audit says the reveal header's collapse did not exist; in this tree the CSS collapse already existed and the slab was the FLIP animation's opening state (see step 10).

## Blind spots

This verification is desktop Chromium (SwiftShader) at one viewport. It does not prove iOS Safari: dvh behavior, safe-area insets (several moved rules use env(safe-area-inset-*)), WAAPI timing, and font rasterization all differ there, and nothing in this bundle's evidence covers them. The harness also names its own limits: the globe freeze makes globe-bearing screens racy by construction (handled above by measuring the noise envelope on the pristine tree), and WAAPI animations sit at their first frame under SwiftShader, which is why step 10 was verified by computed-style probe instead of pixels.
