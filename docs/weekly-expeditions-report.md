# Weekly Expeditions free tier: build report

Date: 2026-10-15. Design: docs/expeditions-rethink-opus.md, Proposal 3, with
Sean's terms (catch-up Sunday is the free missed-day rule; the 4 classics
stay always open; no paid tier). Phase 1 (the code and the harness) was built
by Claude Opus 5.5; its session ended during the regression, so the final
gates (full regression, the rerun, this report) were completed by the
orchestrator (Muse, in-session). The orchestrator deploys after this
report.

## What a player gets

- The expedition picker opens with a **This week** card: the week's route
  name and sub, seven day dots, and progress text ("0 of 7 stops · Stop 1
  open today"). Below it, the 4 classics under a **Classic expeditions**
  heading, behavior unchanged, then a **Past weeks** archive listing each
  finished week with its dates, stop count and a medal for 7 of 7 weeks.
- One route a week from `assets/weekly-expeditions.json` (37 routes),
  chosen from the player's local date. Week 0 starts Monday 2026-10-19.
- Stop i opens on weekday i (Monday 0). A missed stop stays locked until
  Sunday, when every unplayed stop of the week opens (catch-up Sunday).
  Stops play through the existing expedition engine, so postcards and
  visits record exactly as in a classic, and earned postcards are kept
  whatever happens to the week.
- A week finished 7 of 7 records its badge in the archive. Past weeks are
  never replayable as weekly.
- No paywall, no accounts code, nothing about a paid tier.

## Implementation notes

- `src/modes/weekly.js` (new, pure functions): the calendar math. Whole days
  are counted on the local year-month-day against the epoch Monday
  (2026-10-19) in UTC day units, so DST cannot shift a day; the week index
  floors, and the route is `routes[positiveMod(index, 37)]`, so dates
  before the epoch wrap correctly. `stopStates()` returns played / open /
  locked per stop under the rule above. The epoch is frozen once shipped,
  like the Daily bands.
- `src/modes/expeditions.js`: loads the weekly routes at boot into their own
  list (never mixed with the classics), renders the This week card, the
  day dots and the archive, and runs a session over the currently open
  unplayed stops in route order. Weekly progress lives in the one new key
  `where-on-earth-weekly-v1`, registered in `VERSIONED_KEYS`
  (`src/core/config.js`). No existing key or shape changed.
- `src/modes/daily-game.js`: `showRunHaul` / `showPostcardSummary` gained an
  optional `note` parameter so a weekly session that earns no new postcards
  can still show its summary (with the week result). With no note, behavior
  is byte-for-byte the old path; the orchestrator re-ran the Landmarks
  harness (13 of 13) to prove the shared path did not regress.
- `src/main.js`: boot wiring for the weekly routes and picker.
- The weekly session's summary names the week outcome; no mode's share text
  was added or changed in this build.

## Verification (builder's harness and orchestrator gates)

- Builder's harness `shots/weekly/weekly-e2e.mjs` (390px, date faked per
  scenario, real taps): ALL CHECKS PASSED in the builder's runs and again
  in the orchestrator's rerun. It covers: Monday shows only stop 1 open and
  playing it records the postcard; Wednesday shows the missed stops locked
  with the Wednesday stop open; Sunday opens every unplayed stop and
  finishing them completes the week with the badge recorded; the next
  Monday shows a different route as This week and the finished week in the
  archive with its medal; a classic expedition still plays; the weekly key
  is the only new localStorage key; no page errors; fits 390px.
- Syntax: `node --check` and `node --check --input-type=module` pass on all
  five edited JS files (orchestrator).
- `scripts/validate-weekly-expeditions.mjs`: PASS (orchestrator rerun).
- Full regression (orchestrator): the non-PvP suites all pass; PvP H2H 3b
  failed in the full run and H2H 4 failed behind it; the PvP group rerun
  passed all 7 suites, so the pair reads as the known timing flakes, as in
  the two previous builds tonight. This change touches no PvP code.
- Screenshots in `shots/weekly/`: the picker with the This week card, the
  Wednesday locked state, the Sunday catch-up, the week-complete reveal and
  summary, and the next-Monday archive. The orchestrator viewed the picker
  and archive shots: the card, dots and medal all read clearly and match
  the site's design language.

## Commits

- `bddb797` Weekly Expeditions free tier (1/2): rotation, catch-up Sunday,
  picker card, archive (Opus).
- This report, committed by the orchestrator as the completion commit.

## Deploy

Pending orchestrator deploy at the time of writing. The first weekly route
(Pilgrim Week) becomes playable on Monday 2026-10-19; before that, the
card shows the current wrapped week from the same rotation math.
