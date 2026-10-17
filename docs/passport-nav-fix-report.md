# Passport nav fixes: accordion toggle and country back

Brief: `BRIEF-nav-fix.md`. Built and verified by Claude Opus 5.5 (Claude Code), directly in this session. Every result below was measured with a headless browser run, not estimated.

## Brief claims checked against the code first

All of them held:

- **The open row ignored taps.** The accordion toggle in `ppGroupHead` returned early on the open row (`if (!ppCollapsedContinents.has(name)) return;`).
- **Scroll was never reset.** `openCountryDetail` saved `ppCountryListScroll` and swapped views, but it never reset `passportScreen.scrollTop`. `closeCountryDetail` restores the saved value.
- **Shared back class.** The country detail toolbar already had `‹ Countries` (`data-pp="country-back"`, class `collections-back`). That class is shared with the Collections screen.
- **The country detail toolbar is already sticky.** It is a `.pp-toolbar` (`position: sticky`) with a `pp-stick-sentinel` directly before it, the same as the other tabs. No stickiness change was needed. The run below shows it pinning.

## Changes (`src/meta/passport.js` only)

### Problem 1: accordion toggle

Tapping a closed row opens it and closes the others, as before. Tapping the open row now closes it. Both go through the shared `ppGroupHead` path, so Places, Countries (By continent) and Landmarks all get it.

- **Saving all-collapsed.** Closing the open row saves every known continent as collapsed: `CONTINENT_ORDER` plus the rendered rows. The key `where-on-earth-collapsed-continents` and its shape (the collapsed-name array) are unchanged.
- **Reading saved state (`ppAccordionOpen`)**, applied to the rendered rows:
  - **Exactly one rendered row not in the set:** that row opens.
  - **No rendered row open, and every known continent in the set:** the saved all-collapsed state, honored as zero open.
  - **No rendered row open, but some known continent outside the set:** the saved open row is not rendered here. Falls back to the default rule among the rendered rows: the first with earned entries, else the first.
  - **More than one open:** this means no saved state, or a stale one. Same default rule.
- **Chevron.** It still follows `aria-expanded`, and no CSS changed for it.

### Problem 2: way back from a country page

- **Starts at the top.** `openCountryDetail` now sets `passportScreen.scrollTop = 0` after rendering the detail. Closing still restores the list scroll.
- **Back is now a pill.** The Back button gets a modifier class `pp-country-back`. The old rule `.pp-country-toolbar .collections-back { min-height: 36px; }` is replaced by `.pp-country-toolbar .pp-country-back`, which uses the same values as the Filters pill:
  - 1px border `rgba(157,211,255,.16)`, fill `rgba(157,211,255,.04)`, radius 12px
  - text 13px/650 `rgba(234,246,255,.85)`, min-height 36px
  - label unchanged: `‹ Countries`

  The Collections screen's back button is untouched.

## Verification

- **Script.** `shots/passport/pnav-shot.mjs` (outside the repo). It uses the same harness and seed as `pcons-shot.mjs` and `pc-shot.mjs`: every 9th location visited and every other visited one earned. It runs Playwright with /opt/meta-chromium at 390x844.
- **Outputs.** Screenshots are in **`shots/passport-nav-fix/`** and the full log is `shots/passport-nav-fix/run.log`.
- **Screenshots not viewed.** I could not open the screenshot images in this session (image read permission was denied). The checks below come from DOM and computed-style measurements in the same run. Please look at the PNGs before shipping.

### (a) Countries accordion toggle and persistence

- **Default.** Sort "By continent", Africa open (`a1-countries-default.png`).
- **Tap the open row (Africa).** Zero rows open and 0 cards visible. Every chevron reads closed (computed transform `rotate(45deg)`). Saved set: all 7 continents (`a2-countries-all-closed.png`).
- **Reopen Europe.** Europe is open with 49 cards. Europe's chevron reads open (`rotate(225deg)`) and the rest read closed (`a3-countries-europe-open.png`).
- **Tap Asia, then Asia again.** Asia opens (Europe closes), then all rows are closed again.
- **Landmarks** (same code path). On re-render it honors all-closed. Opening Asia and tapping it again closes it.
- **Reload persists all-closed.** After a full page reload and reopening the sheet, the saved set is all 7 continents, and Places, Countries and Landmarks each show zero rows open (`a4-countries-after-reload.png`).
- **Harness note.** CSS transitions only advance on a rendered frame in this headless setup. Chevron transforms read one step behind until each screenshot was taken before the read. With that order, every chevron matched its `aria-expanded`.

### (b) Country back reachability

- **Short country (Netherlands).** I scrolled the Countries list to 1400 (`b1-list-scrolled.png`) and tapped Netherlands.
  - **Opens at the top.** The detail opened at `scrollTop` 0.
  - **Back pill visible and tappable.** It sits 156px from the sheet top, 36px tall and 101px wide. The hit test at its centre is the button (`b2-detail-top.png`).
  - **Not a scroll test.** This detail fits on one screen (max scroll 0).
- **Back to the list.** Tapping Back restored the list at `scrollTop` 1400 (`b4-list-restored.png`).
- **Tall country (Russia), for the sticky check.** It was the Europe card with the most places, tapped from list scroll 2064.
  - **Opens at the top.** The detail opened at 0 with the pill visible (`b5-big-detail-top.png`).
  - **Back stays pinned.** At max scroll (371), the toolbar has `is-stuck`. Back is pinned 22px from the sheet top and still passes the hit test, and the toolbar × is visible (opacity 1) (`b6-big-detail-scrolled-*.png`).
  - **Back to the list.** Tapping Back restored the list at 2064 (`b7-big-back.png`).
- **Collections back unchanged.** Computed style: no border, transparent background, min-height 44px.
- **Errors.** No page errors. The only console errors are the known 404s for `assets/version.txt`, which does not exist in the local tree.
- **Syntax check.** `node --check --input-type=module < src/meta/passport.js` passes.

## Notes, not fixed

- **Places only re-renders when the passport opens**, as recorded in the consistency report. After closing all rows on Countries, Places still showed its earlier open row (Africa) until the next open. After a reload it showed all-closed.
- **A saved open row can still be lost across tabs.** If the saved open continent is not rendered on one tab (for example Antarctica, which the curated Landmarks shelf lacks), that tab's default opens one of its own rows. Back on a tab that does render the saved row, two rows are then out of the set, so the default rule applies. The old code had the same limit. Fixing it would need per-render state outside the saved set, which the brief keeps as is.
- **Not verified:** a real phone.

## Files

- `src/meta/passport.js`
- `docs/passport-nav-fix-report.md`
- Outside the repo: `shots/passport/pnav-shot.mjs`, `shots/passport-nav-fix/`.
