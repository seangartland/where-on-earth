# Passport consistency report: Countries and Landmarks match Places

Built by Claude Opus 5.5 (Claude Code, headless) on 2026-10-17 on top of 300a004 (Passport C plus the share fix). All code changes are in `src/meta/passport.js` and its embedded styles.

## Brief facts checked before editing

I checked these against the code and the shipped screenshots (`shots/passport-c/4-countries.png` and `5-landmarks.png`). All of them held:

- **Landmarks controls.** Landmarks used the compact `ppFilterControls('pp-landmark-filters')` button without the pill. It had an Expand all / Collapse all pair (`data-pp="landmark-group-controls"`).
- **Landmarks section heads.** The heads were the plain `ppGroupHead` style, e.g. "Africa · 29/29". Those counts were filter-matched over total, not visited.
- **Landmarks toggles.** Each shelf toggled on its own, so several could be open at once.
- **Countries default sort.** "Most earned" is the first option and the sort is not persisted, so it was always the default. The accordion only existed under "By continent". The shipped screenshot shows "By continent" because the C shot script selected it.
- **Countries counts line.** It was `white-space: nowrap; text-overflow: ellipsis` next to a 126px select. At 390px it rendered "36 of 202 countries · 6 comp...".
- **Shared storage.** Landmarks already shared `ppCollapsedContinents` / `PP_COLLAPSED_KEY`.

## Changes by spec point

### 1. Landmarks

- **Accordion rows.** Landmarks continent heads now use the same `ppGroupHead` accordion rows as Places and Countries: the continent name, "`<earned>` of `<total>` collected", the same mini bar (visited plus earned layers), and the same chevron. They use the same `.pp-group-head.is-accordion` classes and markup, with no forked style. In code, `renderPassportDex` now builds accordion heads for every dex in Atlas sort, not just Places, and the Landmarks dex container carries `data-pp-accordion`.
- **Accordion semantics.** These are the same code paths as Places (`ppAccordionOpen` / `ppSetAccordionOpen`). Exactly one section is open, and tapping the open row does nothing. The default rule is: a saved state with exactly one open section among those rendered, else the first section with earned entries, else the first section. State uses the same `ppCollapsedContinents` set and `PP_COLLAPSED_KEY`, with the same shape. No new keys.
- **Expand all / Collapse all removed.** Their only user was Landmarks, so these became dead and were removed: `setPpGroupsCollapsed`, the `groupControls` option of `ppDex`, the click handler, and the `.pp-group-controls` CSS. The non-accordion head path also became dead, because every continent head is now an accordion row. So `ppGroupHeadText`, `ppFilteredGroupCount` and the non-accordion branches of `ppGroupHead` and `applyPassportFilters` were removed too. `ppGroupHead` now has the signature `(name, onCollapse, { earned, visited, total })`.
- **Filters pill.** Filters is now the Option A pill. `ppFilterControls` always renders the pill, since both callers use it now, so the `pill` argument is gone. The summary is built by the same code as Places from Landmarks' own filter state, e.g. "All landmarks · Atlas" or "Unvisited · Common · Atlas". Filter behaviour is unchanged, and Landmarks filters stay memory-only: the Places status key stayed unset after Landmarks filter changes.
- **Counts line moved.** The pill needs the full toolbar width to match Places, so the Landmarks counts line ("0 of 332 landmark postcards · 0 visited") moved out of the toolbar to a line just above it. It is still there in full; it just no longer sticks.
- **Unchanged.** Shelf contents, grouping and audit behaviour.

### 2. Countries

- **Default sort.** "By continent" is now the default (`selected` on that option). The tab opens with the accordion. The other three sorts remain in the same select and behave as before (verified: "Most earned" renders the flat grid with no accordion rows).
- **Sort select restyled.** It is now in the Filters pill language: a quiet outline (`rgba(157,211,255,.16)` border, `.04` fill, 12px radius, 13px/650 text), full row width (332px, the same as the Filters pill), text on the left and the chevron on the right. The filled purple is gone. It is still a real `<select>`. When the toolbar is not stuck, the close button is hidden beside it, using the same rule as the Places pill.
- **Counts line fixed.**
  - **Change:** it moved out of the toolbar to a full-width line above it, in the same position as the Landmarks counts line, so both tabs read the same way. Nowrap and ellipsis are dropped, so it wraps cleanly if it ever needs to.
  - **At 390px (measured):** "36 of 202 countries · 6 complete" renders on 1 line, and its scrollWidth equals its clientWidth (328px).
  - **Worst case (measured):** "202 of 202 countries · 202 complete" also fits on 1 line.
  - **Format:** unchanged.

### 3. Places

Unchanged in behaviour and appearance. The headless screenshot matches the shipped one: pill "All places · Atlas", Africa open. The only code change on Places' side is that `ppFilterControls` no longer takes the `pill` flag, because the pill is now always on.

### 4. Out of scope

Not touched: scoring, earning, share text, share builders, the share card, storage keys and shapes, other modes, and index.html.

## Verification

- **Syntax check.** `node --check --input-type=module < src/meta/passport.js` passes, and so does plain `node --check`.
- **Headless run.** Script: `shots/passport/pcons-shot.mjs`. It uses the same harness and the same seeded passport as the C build (`pc-shot.mjs`): every 9th location visited and every other visited one earned. It runs Playwright with /opt/meta-chromium at 390x844. Screenshots are in `shots/passport-consistency/` and I reviewed them visually.
  - **`1-places.png` (Places):** pill "All places · Atlas", Africa open, 6 accordion rows. This matches the shipped Places.
  - **`2-countries-default.png` (Countries on open):** sort `continent`, 6 accordion rows, exactly one open (Africa). The counts line "36 of 202 countries · 6 complete" is fully visible on 1 line.
  - **`3-countries-most-earned.png`:** "Most earned" still renders the flat grid (0 heads).
  - **`4-landmarks.png` (Landmarks):**
    - 6 accordion rows ("Africa 0 of 29 collected" and so on), exactly one open (Africa).
    - The pill reads "All landmarks · Atlas" at 332px wide.
    - 0 Expand/Collapse-all buttons.
    - Tapping Asia left exactly `["Asia"]` open. Tapping Asia again left it open.
  - **`5-landmarks-filters.png` (Landmarks filters):**
    - Tapping the pill opened the panel (`#pp-landmark-filters` has `is-open`).
    - The summary went "All landmarks · Atlas" → "Unvisited · Atlas" (status) → "Unvisited · Common · Atlas" (rarity).
    - The Places status key stayed null.
  - **No page errors.** The only console errors are two 404s for `assets/version.txt`, which does not exist in the local tree. That is a harness artefact, unrelated to this change.
- **Seed limitation.** The seed has no landmark visits, so the Landmarks rows all show 0 collected and their default opened the first section (Africa) through the "else the first" branch. The "first with earned entries" branch is the same code path that Places and Countries exercise above.

## Notes, not fixed

- **The shared collapsed set now moves with Landmarks.** Because all three tabs share `ppCollapsedContinents` as the brief requires, opening Asia on Landmarks also makes Asia the saved open continent for Places and Countries.
  - **Countries:** it re-renders on every tab switch, so it follows immediately.
  - **Places:** it only re-renders when the passport opens, so it keeps showing its current open row until the next open. Its next tap rewrites the saved state from its own rows.
  - **Status:** this is the behaviour the brief asked for (same set, no new keys), recorded here so it is not a surprise.
- **The "stuck" state looks unreliable in this headless harness, on baseline too.** Tested at 390px with scripted `scrollTop` jumps.
  - **Baseline (300a004):** Countries and Landmarks never got `is-stuck`, though the toolbar did pin visually.
  - **With this change:** Countries still never got it, and Landmarks did.
  - **Effect:** the toolbar close button only appears with `is-stuck`. This is the same IntersectionObserver code that was already there, with each sentinel still directly before its toolbar. I did not change it and did not chase it; it may only be a headless artefact. Worth a real-phone check that the × shows when the Countries toolbar is pinned.
- **Not verified:** a real phone.

## Files

- `src/meta/passport.js`
- `docs/passport-consistency-report.md`
- Outside the repo: `shots/passport/pcons-shot.mjs`, `shots/passport/stick-probe.mjs`, and the screenshots in `shots/passport-consistency/`.
