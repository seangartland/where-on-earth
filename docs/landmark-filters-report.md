# Landmarks tab filters: build report (2026-10-16)

Request (Sean, 2026-10-16): "Need filters on landmarks passport page."
Built and verified directly in one Claude Code session (Opus 5.5), no delegation. Not deployed.

## Commits

- `6ca0f15` Passport Landmarks tab: filters mirroring Places (src/meta/passport.js only, +168 / -131)
- This report: a report-only commit after it.

Audit before starting: no banked landmark-filter work in git log or the working tree (passport.js clean at `48e5ba4`).

## Route taken: shared code, not a second copy

The Places filter code was written against one set of globals (`ppEls.sort`, `ppEls.band`, `ppStatuses`, `ppAll`, `ppDexLis`, `ppDexGroups`). I made that code shared instead of pasting a Landmarks copy:

- `ppDex(view, opts)` (new): one object per tab holding that tab's controls (found by data-pp inside the tab's view), its status set, its entries (`all`), and its rendered slots and groups. Built twice: `ppPlaces` and `ppLandmarks`.
- `ppFilterControls(id)` (new): the Filters toggle, toolbar close button and filter panel markup, moved verbatim out of the Places template and used by both tabs. Places renders the same bytes it did before (verified, see the fingerprint below).
- Reused unchanged, now taking a dex: `renderPassportDex`, `applyPassportFilters`, `ppFilteredGroupCount`, `syncPpStatusButtons`, `openPassportFilters` / `closePassportFilters`, and the listener wiring (one loop over both dexes).
- Reused as is: `passportSlot`, `ppTagSlot`, `ppAtlasCompare`, `PP_FLAT_COMPARE`, `DIFFICULTY_BANDS` / `difficultyBand`, `ppGroupHead`, `setPpGroupsCollapsed`, and all existing CSS classes (`pp-filters-btn`, `pp-badge`, `pp-filters`, `pp-status`, `pp-shown`, `pp-group-controls`, `pp-group`, `pp-empty`, `pp-dex-wrap`). No new CSS.
- `renderLandmarkShelf()` keeps its shelf choice (curated 332, or the 427 bank under `?audit=1`) and its summary line, then hands the entries to `renderPassportDex(ppLandmarks)` instead of mapping them to a flat list.

Landmarks therefore behaves exactly like Places: status buttons (All / Earned / Seen / Unvisited, multi-select like Places; earned = postcard earned, seen = visited without a postcard), rarity select with the same bands, the same four sorts, and the same 'N of M shown' line ('332 landmarks' when unfiltered), badge and empty line. Under Atlas the cards are grouped by continent (country then name inside each group) with Expand all / Collapse all, and the continent select is hidden, as in Places. Under Most recent / Closest guess / Name A-Z the list is flat (visited cards in sort order, mysteries after), group controls are hidden and the continent select shows, as in Places.

## Two deviations from a pure mirror, and one shared behaviour, all deliberate

1. **Status persistence.** The brief assumed Places filter state might be memory-only. It is not: Places saves its status choice to the existing key `where-on-earth-passport-status` (band, continent and sort are memory-only). Sharing that key would make a Landmarks tap change the Places filter, and a new key was ruled out. So **all Landmarks filter state is memory-only**: it survives tab switches and reopening the passport within a session, and resets on reload. Places persistence is unchanged. If Sean wants Landmarks status to persist, that needs a new key, which is his call.
2. **Continent choices come from the shelf** (as the brief asked), while Places keeps the fixed seven. The curated 332 shelf has no Antarctica landmark, so its select offers 6 continents; the audit bank offers all 7.
3. **Collapsed continents are shared.** Landmark group heads use the existing `ppGroupHead`, which stores collapsed continents in the existing key `where-on-earth-collapsed-continents` that Places and Countries already share. Collapsing Europe in Landmarks also collapses it in Places, the same way Countries and Places already affect each other today. No new key.

## Verification

### Syntax
`node --check src/meta/passport.js` and `node --check --input-type=module < src/meta/passport.js`: both clean.

### New harness: `~/workspace/map-game/shots/passport/lm-filters-shot.mjs`
Based on `pp-shot.mjs` (same disk-served game.local routing, 390x844 at 2x, CDP screenshots), with touch enabled and every button driven by real taps (`locator.tap()`); selects use `selectOption`, as in pp-shot. It seeds 34 pool landmarks as visited (17 earned, 17 seen) plus 30 places. Every expected number comes from an independent oracle: the app's own `landmarkPool()` module plus the seeded store, with bands computed from raw `difficulty`, never from the DOM.

Note: like every harness in `shots/`, it lives outside the git repo (`~/workspace/map-game/shots` is not versioned). Run: `PP_HEAD_SRC=<copy of HEAD~ passport.js> node lm-filters-shot.mjs`.

Final run: **58 of 58 checks passed**, exit 0. Highlights:

| Check | Result |
|---|---|
| Default render | 332 slots = pool 332; summary '17 of 332 landmark postcards · 34 visited' (format unchanged); shown line '332 landmarks' |
| Filters toggle | exists, opens the Landmarks panel (Places panel stays closed) |
| Status Earned / Seen / Unvisited | 17 / 17 / 298 shown = oracle, 0 off-status cards, shown line 'N of 332 shown', badge '•1' each |
| Earned + Seen | 34 = visited count (multi-select like Places); All restores 332 |
| Rarity common / uncommon / rare / legendary | 36 / 132 / 75 / 89 = oracle by difficulty range 1-3 / 4-6 / 7-8 / 9-10, every shown card's band correct |
| Sort Atlas | 6 groups in continent order (Africa 29, Asia 67, Europe 101, North America 81, South America 38, Oceania 16); country then name inside each |
| Sort Most recent / Closest guess / Name A-Z | visited order matches the oracle, mysteries after; flat list, group controls hidden, continent select shown |
| Continent Europe / Oceania (flat sort) | 101 / 16 = oracle; options = the shelf's 6 continents |
| Combined Europe + Earned | 5 = oracle, badge '•2' |
| Empty state (Africa + Seen) | 0 shown, 'No stamps match these filters yet.' in the empty line and the shown line |
| Collapse all / Expand all | all 6 landmark groups close, then all open; a single head tap toggles its group |
| State | Landmarks filter kept across a tab switch; Places status untouched; nothing written to the Places key; no new storage keys |
| Audit `?audit=1` | 427 slots behind the same controls ('427 landmarks'); legendary 140 of 427 = oracle; Antarctica 19 = oracle; 7 continent options |
| Horizontal scroll at 390px | none: document 390, passport screen 390 (default, filters open, audit) |
| Places / Countries unchanged | the same 18-step tap script (Places filters, all four sorts, continent, collapse/expand, Countries list, by-continent sort and its groups, a country detail, reopen) run against HEAD's passport.js and against the new file: **every step's outerHTML hash, visible count, shown line and storage keys identical** |
| Page errors | 0 in every run (main, audit, both fingerprint runs) |

Console errors: only `assets/version.txt` 404s, a deploy-time file that is missing in local serving. Not related to this change.

Screenshots, all viewed (`~/workspace/map-game/shots/passport/`):
- `lm-1-default.png`: Landmarks tab, Atlas, Africa group, Filters toggle beside the summary, Expand all / Collapse all.
- `lm-2-filters-open.png`: panel open (status, rarity, sort, '332 landmarks'), matching the Places panel. An earlier capture taken at 400 ms showed the button active but no panel; it was a mid-transition capture, and a capture at 1200 ms shows the panel (the DOM check passed both times).
- `lm-3-filtered.png`: Europe + Earned under Name A-Z, '5 of 332 shown', badge '•2'.
- `lm-4-audit.png`: audit mode, Antarctica under Name A-Z, '19 of 427 shown'.

**Visual note for Sean:** when a filter is active, the badge widens the Filters button and the summary line is cut off with an ellipsis ('17 of 332 landmark postcards · 34 visi…'; in audit '427 v…'). The summary text itself is unchanged, and the Countries toolbar already cuts off the same way next to its sort select. I left it alone. Options if it bothers him: shorter wording, or a two-line toolbar.

### Other landmark harnesses
- `audit-lm-check.mjs` counted `[data-pp="landmark-dex"] > li`, which the grouped markup turns into 0. I changed that one selector to `.pp-slot` at any depth. Rerun: plain 332, audit 427, 0 errors.
- `swipe-shot.mjs` (not in regression): in 2 runs, every check came out true, including landmarksTabReachable, landmarkSwipe ('1 of 14' through '3 of 14' across groups), reducedMotionNoSlide and landmarkCloseLands. But both runs then ended in 'browser has been closed' (exit 1, then a 400 s timeout). The same harness against the pre-change commit `48e5ba4` (temporary worktree, since removed) crashed the same way, so the crash is environmental, not caused by this change. The VM had about 1.3 GB of RAM available at the time.

### Full regression: `scripts/regression.sh`
- Run 1: PASS for Passport/Daily, Survival hub, PvP 1, 2, 5, 7, Open Challenge, PvP layout, Baseline. FAIL for PvP H2H 3a, 3b and 4. 3a hung at its first screenshot (unsettled top-level await at `p3-play.mjs:17`, before any game logic), and 3b and 4 continue the same match. 3b and 4 are the known timing flakes; 3a is not on the known list but failed at the screenshot hang, not in game logic.
- Rerun once (`regression.sh pvp`): **all 7 PvP suites PASS**, 3a, 3b and 4 included.
- The baseline suite rewrote `demo/shots/baseline/*.png`, which were already modified in the tree before this work. They are not part of these commits.

## Files touched
- `demo/src/meta/passport.js` (commit `6ca0f15`)
- `demo/docs/landmark-filters-report.md` (this report)
- Outside the repo (not versioned): `shots/passport/lm-filters-shot.mjs` (new), `shots/passport/audit-lm-check.mjs` (one selector), run logs `shots/passport/lm-filters-run*.log` and `shots/regression-logs/lm-filters-*.txt`, `shots/passport/lm-fingerprint.json`.

Pre-existing, untouched: passport.js already contained 2 em dashes in older comments; none were added.
