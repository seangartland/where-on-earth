# Passport Group by build report

Date: 2026-10-17

## Outcome

Implemented the approved Group by design for Places and Landmarks:

- Browse panel order is Show, Group by, Sort within groups, result line.
- Grouping choices are Continent, Country, Difficulty, and None.
- Default is Continent with Country then name.
- None switches to Most recent and uses the label Sort. Returning to a grouped mode restores that mode's remembered sort.
- Status is the only filter and the only contributor to the Browse badge.
- Rarity and continent filter controls were removed.
- Continent, Country, and Difficulty each remember their accordion state separately for Places and Landmarks during the session.
- Only Continent reads and writes `where-on-earth-collapsed-continents`. Its string-array shape is unchanged.
- `where-on-earth-passport-status` retains its existing JSON-array write and legacy single-string read behavior.
- Country heads use a fixed flag column, name, full-group counts, the two-layer bar, and a chevron. They do not use country-card imagery or treatments.
- Filtered sections retain full-group earned, visited, and total values. The shown-count line reports the filtered card count.
- Landmarks use their own shelf entries for all section counts. This build makes no claim that Places and Landmarks difficulty values are calibrated together.
- The Countries renderer and detail route were not changed.

## Phasing

1. Slice 1: added the pure grouping, ordering, fallback, and within-section sort model in `src/meta/passport-grouping.mjs`, with fixtures in `test/passport-grouping.test.mjs`.
2. Slice 2: replaced the shared Places and Landmarks panel, added summaries and immediate state changes, and added namespaced in-memory accordion state.
3. Slice 3: added country flags and enabled the same model for the normal Landmark shelf.
4. Slice 4: removed the old rarity and continent control path and added `shots/passport/pp-shot.mjs` for the approved 390 by 844 states and interaction checks.

Separate slice commits could not be created because this worktree exposes `.git` read-only. The first commit attempt failed while creating `.git/index.lock`. Product files remain as working-tree changes.

## Verification

Passed:

- `node --test test/*.test.mjs`: 2 test files passed.
- Module-mode syntax check for `src/meta/passport.js`.
- Syntax checks for `src/meta/passport-grouping.mjs` and `shots/passport/pp-shot.mjs`.
- `git diff --check`.
- Checked-in data measurements: 805 Places, 202 country values, and 332 entries accepted by the normal Landmark shelf rule.
- Pure fixtures cover all four groupings, unknown continent and band fallback, section order, all within-section sorts, mystery ordering for recent and distance, and full totals under filtered visibility.

Not verified:

- The headless browser did not create a page. Chromium exited with `SIGTRAP` at launch after a crashpad `setsockopt: Operation not permitted` error. The required single retry failed identically. There were no product page errors because no page started.
- Therefore keyboard and touch behavior, outside-tap and scroll closing, sticky transitions, zero-result rendering, repeated tab and grouping interaction, postcard navigation after regrouping, reload persistence, narrow-breakpoint layout, and visual overflow remain unverified by a live browser.
- The Countries tab was kept out of the product diff, but its runtime DOM comparison could not execute because of the browser launch failure.

## Screenshot names

The harness is configured to produce:

- `shots/passport/render-a-continent.png`
- `shots/passport/render-b-country-panel.png`
- `shots/passport/render-c-difficulty-unvisited.png`
- `shots/passport/render-d-none-recent.png`

No screenshot files were produced because Chromium failed before page creation.

## Orchestrator verification (2026-10-17)

The harness above was executed in the orchestrator's environment
(Chromium cannot launch in the Codex sandbox). Final result: exit 0,
every check true, zero product errors, and all four renders produced.
Six harness-side defects were fixed along the way, none in product code:
four missing panel-open steps before select interactions, one status
selector that also matched card slots, and two toggle checks that
clicked the first head instead of the expanded head (the open head is
the first group with an earned card, not the first in the DOM). A
focused probe confirmed toggle-close in the product directly: with
Algeria expanded in Country grouping, clicking its head left zero
sections open. The build is banked by the orchestrator from this tree.
