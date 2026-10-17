# Passport Group by: build (brief armed 2026-10-17; dispatch when a lane frees)
Work in /home/hatch/workspace/map-game/groupby-work. Source of truth:
docs/passport-groupby-plan.md IN THIS REPO (Sol's design plan, sections 5
to 9 are the build contract). Sean approved the design on 2026-10-17 from
the orchestrator's 390px renders (shots/groupby/render-r*.png on the
orchestrator's machine, built to the plan's section 8), INCLUDING the
plan's recommendations: keep the Countries tab; groupings Continent,
Country, Difficulty, None; default Continent; difficulty/rarity filter
removed; Landmarks parity; no new persisted keys in v1.

## Sean's approval includes two orchestrator adjustments (binding)
1. When the grouping switches to None, the sort flips to Most recent
   automatically (the plan changes the label to plain "Sort"; also change
   the value, per Render D). Switching back to a grouping restores the
   grouping's remembered sort.
2. Landmarks difficulty grouping ships with the same UI, but nothing in
   copy, comments or the report may claim Places and Landmarks bands are
   calibrated together (plan section 5's caveat).

## Non-negotiables from the plan
- Pill: renamed Browse; summary grammar exactly per plan section 6
  (for example "Grouped by continent - All places", with the active
  status-filter count badge counting status filters only, never grouping
  or sort). Panel order per section 6: Show, Group by, Sort within
  groups, result line. No Apply, Reset, helper copy or extra sheets.
- Places AND Landmarks lose the rarity control and the conditional
  continent filter. Sort select in Places becomes the "Sort within
  groups" control; the visible default sort reads "Country then name".
- Accordion identity is (tab, grouping, group key) in session memory
  (plan section 7). where-on-earth-collapsed-continents stays
  continent-only with its current string-array shape; Country and
  Difficulty collapse state is memory-only and never written there.
- where-on-earth-passport-status is untouched in shape and migration
  behavior; group and sort selections are memory-only on both tabs.
- Section heads keep full-group earned/visited/total and the two-layer
  mini bar even while a status filter hides cards (plan decision 9,
  Render C semantics), with the shown-count line explaining the filter.
- Country grouping renders the full up-to-202-section accordion with the
  plan's minimal head anatomy (flag in a fixed 22px column, name, counts,
  bar, chevron). Do not give country heads cover images or country-card
  treatments; they are shelf labels (orchestrator's note from the renders,
  Sean approved).
- Follow the plan's section 9 phasing. Per-mode share formats, scoring,
  and every other surface stay untouched.

## Verify
- node --check (module mode) on touched files.
- 390 by 844 harness in the pattern of shots/passport/pp-shot.mjs:
  reproduce Renders A, B, C and D from the plan's section 8 against the
  built code with the same seeded progress, plus: Landmarks tab shows the
  same panel structure with Landmark-only counts; toggle-close still
  works in every grouping (the nav fix must not regress); switching
  grouping away and back restores that grouping's accordion state;
  Group by None flips sort to Most recent; the Countries tab is
  byte-for-byte its old self.
- Report: docs/passport-groupby-report.md with screenshots named and
  anything unverified stated plainly. Commits per plan slice, subjects
  naming the slice. Zero em dashes anywhere.
