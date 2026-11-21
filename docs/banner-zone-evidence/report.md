# Banner treatment audit

All 12 treatments were checked against the tall profile header and the compact friends row. The shared card and swatch selectors remain the sole treatment source. No layout, markup, or catalog changes were needed.

| Treatment | Verdict | CSS change |
| --- | --- | --- |
| Blue Horizon | fixed | Sun: `90% 78%`, `7px` radius. Horizon: `87%` to `91%` vertical band at the bottom. |
| Airmail | fixed | Removed the full-field line layer. Kept the `24px 8px` repeating stripe at `center top` with `repeat-x`. |
| Return Ticket | fixed | Perforation dots moved to `calc(100% - 3%)`; dashed edge moved from `82%` to `94%`. |
| Regular Route | fixed | Stops moved to `70% 84%`, `86% 70%`, and `92% 88%`; route line is a `12px` bottom strip. |
| Seasoned Traveler | fixed | Contour-ring origins moved from the seal and title area to `104% 112%` and `106% -12%`. |
| Right on the Map | fixed | Target moved to `88% 82%`; grid lines moved to `91%` vertical and `88%` to `90%` horizontal. |
| Five Star Landing | fixed | Star image reduced to `min(130px, 38%)` and positioned `right 8px bottom 2px`. |
| High Flyer | fixed | Contrails are `18%`-wide, lower-right layers sized `48%`, `38%`, and `28%` high. |
| Worldly | fixed | Grid is a single `26% 42%` patch at `right 6px bottom 5px`, with `no-repeat`. |
| Around the World | fixed | Globe artwork is a `24% 36%` lower-right patch at `right 4px bottom 4px`, with `no-repeat`. |
| Harvest | pass | Unchanged. The dark low-contrast field texture and sparse warm flecks preserve cream title contrast. |
| Winter Post | pass | Unchanged. The snowbank is bottom-aligned and the sparse snow and moon stay outside the compact text zone. |

The CSS changes are limited to the shared `.traveler-card[data-card="..."]` and `.banner-swatch[data-card="..."]` rules in `src/styles/game.css`.

No treatment is judged marginal after the changes. The compact-row artwork is now confined to edges or corners outside the seal, name, title, and level-badge area.

## Suite results

- `node --test "test/*.mjs"`: passed, 33 tests.
- `cd account-worker && npm test`: 3 of 4 test files passed. `test/friends.test.mjs` failed as a file-level test without an assertion message or stack from Node's test runner. The directly rerun file produced the same file-level failure. The unaffected required progression test passed.

## Orchestrator banking notes (Muse, 2026-11-21)
- Verified on Muse's own rerun (game suite 150/150) and by sighting all 13 harness captures (12 friends rows + the Blue Horizon profile header) against the text-zone rule.
- One adjustment at banking: Winter Post's moon sat at 78% 23%, touching the Level badge's left edge on rows (the same defect class Sean flagged on Blue Horizon). Moved to 68% 20% in the shared treatment.
- Two texture-class passes disclosed: Seasoned Traveler and Harvest carry low-contrast tonal lines behind the text; name and title contrast is unaffected. Flagged to Sean with the captures.
