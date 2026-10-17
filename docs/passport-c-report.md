# Passport C build report: two-level calm, no search

Built by Claude Opus 5.5 (claude-run, headless) on 2026-10-17 against main at e501fce. I checked every code fact in the brief against `src/meta/passport.js` before editing. All of the code changes are in that one file, including its embedded styles.

## Brief facts checked

All held: `.pp-share-icon` with `data-pps="share"`, the shared `ppDex` filters, Places status persisted under `PP_STATUS_KEY`, Landmarks filters memory-only, `ppCollapsedContinents` with `PP_COLLAPSED_KEY` (`where-on-earth-collapsed-continents`, an array of collapsed continent names), `host.CONTINENT_ORDER`, and the Expand/Collapse-all controls.

Facts that needed small adaptations:

- **Continent sections only exist in some sorts.** Places has continent sections only under the Atlas sort, its default. Countries has them only under the "By continent" sort. Its default sort is "Most earned", which shows a flat grid. The accordion applies wherever sections exist. The other sorts are unchanged.
- **The collapsed set is shared with Landmarks.** Landmarks already used the same `ppCollapsedContinents` set before this change. Its shelves keep their old independent toggles and their Expand/Collapse-all, so Landmarks can leave the set with zero or several open continents. When Places or Countries next renders, that reads as "no valid saved state" and falls back to the default open continent.
- **There was no filter summary to keep.** The old Filters toggle only showed a count badge (`•N`). The summary is new logic, described under point 5. The badge is kept.

## Changes by spec point

1. **Header.** The gradient circle share button is now a quiet text pill labelled "Share" (`.pp-share-pill`), still `data-pps="share"` and wired to `sharePassport`. The hidden Collections button keeps `.pp-share-icon`, so that rule stays. The title and close button are untouched.
2. **Stats line.** There is now one line, "`<visited>` of `<total>` places · `<earned>` postcards" (singular for 1), with the existing two-layer progress bar beneath it. The separate earned span (`data-pp="earned"`, with its 🎯/📍 counts) is gone. `passportShareText` and the share card are untouched; they still carry bullseyes and pinpoints. The line is styled after mock `.stats-line`.
3. **Tabs.** Unchanged.
4. **No search field.** None was added. The headless check counts 0 search inputs.
5. **Filters bar.**
   - On Places the toggle is now the Option A pill: "Filters" on the left, and on the right a summary plus ▾. The summary reads "`<statuses or All places>` · `[rarity]` · `[continent]` · `<sort>`", for example "All places · Atlas" or "Earned · Atlas".
   - Tapping the pill opens the existing panel. The filter system itself is unchanged.
   - While the toolbar is not stuck, the toolbar close button (invisible in that state anyway) is `display:none` so the pill can span the full width. Once the toolbar sticks, the close button returns as before.
   - Landmarks keeps its compact Filters button. The pill is opt-in through a `pill` argument on the shared `ppFilterControls`.
6. **Accordion.**
   - Places (Atlas) and Countries (By continent) continent heads are now calm rows: the continent name, "`<earned>` of `<total>` collected", a mini bar (visited plus earned layers), and the existing chevron.
   - Exactly one continent is open at a time. Tapping a collapsed row opens it and collapses the others. Tapping the open row does nothing, because "exactly one" rules out closing it to zero.
   - State lives in `ppCollapsedContinents` / `PP_COLLAPSED_KEY`, with the same key and the same shape: every continent except the open one is stored as collapsed. No new keys.
   - Default rule (my reading of the brief): if the saved state names exactly one open continent among those rendered, that one opens, so reopening the Passport lands where you left off. Otherwise, the first continent in `CONTINENT_ORDER` with earned entries opens, or the first continent if none has any.
   - Expand/Collapse-all is removed from Places and Countries.
   - Card rendering inside a continent is unchanged.
   - When closing a continent above pulls the new one off-screen, the new one is scrolled into view.
   - Collapsed Places sections opt out of `content-visibility`'s 900px placeholder, so the page doesn't show phantom scroll space.
   - The accordion row counts are not filter-aware. Landmarks heads still show their filtered "`name · n/total`" text. Under filters, a continent with no matching cards hides its whole row, as before.
7. **Landmarks.** Gets the new header, stats line and tabs only. Its shelves, grouping, heads, Expand/Collapse-all and filter button are unchanged.
8. **Out of scope.** Not touched: scoring, earning, visits, share text and builders, other modes, storage keys and shapes, index.html, deploy tooling.

**Countries fix that the accordion needed.** In `renderCountryList`, the continent head applied its saved collapsed state before its country cards existed. So under "By continent", saved collapsed groups never actually hid their cards on first render. This was already in the code before this build. The head now reapplies its state after the cards are added. Without that fix, the accordion visibly fails on Countries.

## Verification

- `node --check --input-type=module < src/meta/passport.js` passes.
- **Headless run.** Script `shots/passport/pc-shot.mjs`: Playwright with /opt/meta-chromium at 390x844, serving this repo, with a seeded passport of 90 visited places and 47 postcards. Measured results:
  - Stats line reads "90 of 805 places · 47 postcards". The share button reads "Share".
  - The pill summary reads "All places · Atlas", and "Earned · Atlas" after the Earned filter is set.
  - Default open continent is Africa (the first with earned postcards). The stored key held the other five continents.
  - Tapping Europe gave exactly one open continent (Europe), and the stored key was updated. Tapping Europe again changed nothing.
  - Countries (By continent) opened Europe from the shared saved state.
  - No Expand/Collapse-all on Places or Countries; Landmarks still has its pair. 0 search inputs.
- **Screenshots** at 390px: places default, places after expanding Europe, places with the filter panel open, countries, landmarks. They are in `shots/passport-c/` and were reviewed visually after the mini-bar and Countries fixes.
- **Not verified:** a real phone, and the Countries detail swipe. Swipe code is unchanged and still skips `[hidden]`, so cards in collapsed continents drop out of swipe order, same as collapsed groups did before.

## Pre-existing bug found, not fixed (out of scope)

**The passport share card is broken whenever any visit has a km distance.** In `passportShareStats` (around line 279), `buildPassportShareCard` calls `passportSlotFace`. That function was removed in afc6a83 ("Postcard centralize"), so tapping Share throws "passportSlotFace is not defined" and the card never opens. I reproduced it on the untouched baseline with the same seed using `shots/passport/pc-share-baseline.mjs`, so this build did not cause it. The brief puts share builders out of scope, so I left it alone. It needs its own fix.

## Files

- `src/meta/passport.js`
- `docs/passport-c-report.md`
