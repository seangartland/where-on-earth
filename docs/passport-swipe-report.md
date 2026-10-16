# Passport postcard swipe: build report

Built from docs/expeditions-rethink-opus.md, Proposal 1 (approved by Sean 2026-10-15). Built and verified directly in one Claude Code session (Opus 5.5), no delegation. Audit at start: no swipe work was banked (HEAD was 422d77e), so this started from scratch.

## What a player gets

In the postcard detail view, a horizontal swipe on the card moves to the previous or next postcard in the list it was opened from, in the order on screen. Filters, collapsed continent groups, and mystery slots are skipped. Left and Right arrow keys do the same. A "2 of 60" counter sits under the card, and two quiet chevrons on the photo's left and right edges are tap targets. At either end the card gives a short nudge and stays put; there is no wrap-around. Closing still shrinks the card back into its tile, now the tile of the card on show.

Lists covered: Places dex, country detail, Landmarks shelf, the end-of-run postcard haul, and Collections (through the same generic path; Collections is hidden from players, so it was not exercised in the harness).

## Design decisions where the doc left room

1. **Generic siblings.** `openPostcard(entry, source, siblings)` takes the function the doc asks for. Its default, `postcardSiblings(source)`, finds the source's nearest `[data-pp-list]` container and returns its registered cards in DOM order, skipping anything under a `[hidden]` ancestor. The five containers carry `data-pp-list` (Places dex wrapper, country dex, landmark dex, Collections grid, `#breakdown` in index.html). Cards are registered in a WeakMap by one new helper, `bindPostcard(el, entry)`, which replaces four identical click and Enter/Space blocks (dex slot, Collections card, haul card). Mystery slots are never registered, so they are skipped by construction.
2. **Re-sort while open.** A sort change rebuilds the dex tiles. The open card is then found again by place id, and the lifted state moves to the new tile, so the next swipe and the close both follow the rebuilt list.
3. **Open card filtered out while open.** The counter hides, and a swipe goes to the nearest shown neighbour in that direction (DOM order). In the real UI the scrim covers the filter controls, so this mainly guards against state changes the player cannot see.
4. **Lists of one.** No counter and no chevrons.
5. **Chevrons.** Vertically centred on the photo's left and right edges, 44px tap targets. They reuse the close button's circle through a grouped selector (`.ppd-close::before, .ppd-nav::before`), at 0.55 opacity, dropping to 0.2 at an end. They are still tappable at an end and nudge. They take `tabindex="-1"` because the arrow keys already cover keyboard use and the dialog's Tab trap stays close and share.
6. **Counter.** Placed just under the card (absolutely positioned below the card's bottom edge), with the same typography as the "Postcard from" line through a grouped selector (`.ppd-from, .ppd-pos`). It uses `aria-live="polite"` so screen readers hear the new position.
7. **Swipe start rules.** Swipes start only on the card, and never on any `button` inside it. That covers the close, share, and chevron buttons, and any audit flag button if one is added to the detail view (today the detail view has none; audit flags live on grid tiles). Starts within 20px of either screen edge are ignored.
8. **Swallowed click.** A recognised swipe opens a 400ms window in which a capture-phase click listener on the overlay calls `stopImmediatePropagation`, so a swipe released over the scrim never closes the card.
9. **Motion.** Card change: 28px horizontal slide in from the travel side plus fade, 180ms. End nudge: 14px, 240ms. Both are skipped under reduced motion. Swiping during the open animation finishes it first.
10. **Close after a quick swipe.** The harness caught a real defect: closing while the 180ms slide was still running measured the shifted card, and the shrink landed 20px off its tile. `closePostcard` now finishes any running card animation before measuring.
11. **Scroll.** After a swipe the overlay scrolls back to the top of the new card, and the new tile is scrolled into view (`block: 'nearest'`) behind the scrim, as the doc specifies.

Unchanged: no other modes, no data, no storage shape, no new localStorage keys, per-mode share text, Daily selection and pins, and the difficulty scorer.

## Per-file summary

- `src/meta/passport.js`: `bindPostcard`, `postcardSiblings`, `ppdLocate`, `syncPostcardNav`, `stepPostcard`; `openPostcard` takes `siblings`; close re-locates a rebuilt tile and finishes running card animations; chevron and counter markup; pointer, click-swallow, and arrow-key handlers; CSS for `touch-action: pan-y` on `.ppd-card`, `.ppd-nav`, `.ppd-pos`; `data-pp-list` on the three passport containers and the Collections grid.
- `src/modes/daily-game.js`: haul cards use `bindPostcard` from the host instead of their own click and keydown handlers.
- `src/main.js`: the Daily host passes `bindPostcard` instead of `openPostcard`.
- `index.html`: `data-pp-list` on `#breakdown`.
- `shots/swipe/`: harness copy and screenshots.

## Gate results

**Syntax.** `node --check` and `node --check --input-type=module` pass on all three edited JS files: src/meta/passport.js, src/modes/daily-game.js, src/main.js.

**Swipe harness, 390px.** `~/workspace/map-game/shots/passport/swipe-shot.mjs` (copy in `shots/swipe/swipe-shot.mjs`): headless Chromium (swiftshader), 390x844, touch enabled, CDP touch events for swipes. **27 of 27 checks pass, no page or console errors.** Every entry point is reached by real clicks from the home screen. Nothing is forced visible, and each reachability check scrolls to the control the way a player would and confirms it is the topmost element at its centre. One exception, noted honestly: the filter and sort changes while a card is open are driven by script, because the scrim covers those controls and a player cannot reach them with a card open.

| Check | Result |
|---|---|
| Home screen reachable (Play and Passport buttons topmost, body `game-start`) | pass |
| Places, Countries, Landmarks tabs reachable | pass |
| Places: counter "1 of 60", swipe left to "2 of 60" with the right card and tile | pass |
| Places: swipe right back; swipe right at the first card stays put (no wrap) | pass |
| Places: Right arrow key advances | pass |
| Places: a vertical drag and a drag starting in the 20px edge do nothing | pass |
| Places: chevron tap advances | pass |
| Places: mouse swipe released over the scrim advances and does not close | pass |
| Places: band filter changed while open, next swipe walks the filtered 18 cards | pass |
| Places: sort changed while open, swipe follows the rebuilt tiles | pass |
| Places: close lands on the right tile (final frame within 2px of the tile, tile on screen, focus back on it) | pass (0px offset) |
| Country detail: swipe, counter, and close landing | pass (6 cards, 0px) |
| Landmarks shelf: swipe, counter, and close landing | pass (17 cards, 0px) |
| Reduced motion: swipe advances with no card animation | pass |
| Back to home from the passport | pass |
| Haul after a real Daily run (5 rounds, guesses on the answer): swipe, counter, close landing | pass (5 cards, 0px) |
| Haul "Continue to results" reachable, results screen reached | pass |

Two harness notes. Swiftshader blocks the main thread for seconds per frame, so the CDP touch and mouse events carry explicit timestamps; without them a 220ms swipe reaches the page as about 30 seconds and fails the 600ms rule. And screenshots wait for animations to settle plus 1.5s, because an earlier haul shot caught a stale frame with only the scrim painted. I checked that one: the DOM, hit testing, and a later capture all show the card in place.

**Full regression, `scripts/regression.sh`.** 10 PASS, 2 FAIL.

- PASS: Passport/Daily (pp-shot), Survival hub tap-through, PvP H2H 1, 2, 3a, 5, 7, Open Challenge vs live worker, PvP layout measurements, Baseline screenshots.
- FAIL: PvP H2H 3b (challenger refresh and resume) times out at `p3-play.mjs:36`, waiting for the round timer after the mid-round refresh. PvP H2H 4 fails at `p4-complete.mjs:19` because it needs 3b's finished match (no Rematch button).
- **These two failures predate this change.** A rerun of `regression.sh pvp` fails the same way. I then restored the four edited files to their pre-change versions (422d77e; the concurrent commits fd84687, 48d1d44, 57bece9, and 5922fe0 touch none of them), ran `regression.sh pvp` again, and got the same two failures at the same lines (`p3-play.mjs:36:16`, `p4-complete.mjs:19:14`). The files were restored to HEAD afterwards. PvP never opens the postcard detail view. Logs: `~/workspace/map-game/shots/regression-logs/swipe-full-run.txt`, `swipe-pvp-rerun.txt`, `swipe-pvp-prechange.txt`, `swipe-full-run-pvp-p3-challenger.log`, `swipe-full-run-pvp-p4.log`.
- The baseline suite rewrites `shots/baseline/*.png`. Those files were already modified in the working tree before this work started. I left them uncommitted, along with the other pre-existing changes (.gitignore, wd-cache.json, untracked favicons and .bak files).

## Screenshots

All 390x844 at 2x, in `shots/swipe/`:

- `01-home.png`: home screen after seeding
- `02-places-open.png`: Places card open, "1 of 60"
- `03-places-swiped.png`: after a swipe left, "2 of 60"
- `04-places-filtered-swipe.png`: band filter applied while open, "3 of 18"
- `05-places-closed.png`: dex after the close, re-sorted by name
- `06-country-swiped.png`: country detail, "2 of 6"
- `07-landmarks-swiped.png`: Landmarks shelf, "2 of 17"
- `08-haul.png`: end-of-run haul, 5 new postcards
- `09-haul-swiped.png`: haul card after a swipe, "2 of 5"

## Still to check on a real phone

The doc's main risk stands: iOS Safari handles `pan-y` inside a nested scroller inconsistently in some versions. Headless Chromium cannot answer that. Sean should try a swipe, a vertical scroll on a tall card, and a scrim tap on his phone. The thresholds (48px, 1.5 ratio, 600ms) are the doc's estimates and may need tuning there.

Not changed but noticed: dex and shelf tiles do not hide while lifted (`.pp-lifted` only hides haul cards), as before this work.

## Commits

- `abfdc20` Passport swipe (1/3): swipe between postcards in the list they came from
- `4e09fb2` Passport swipe (2/3): 390px swipe harness and screenshots
- Passport swipe (3/3): this report, a report-only commit

## Deploy

Pending orchestrator deploy. Nothing was deployed from this session.
