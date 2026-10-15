# Landmark Expeditions, Slice A: report

Date: 2026-10-15. Builders: Claude Opus 5.5 (steps 1-3, died on the Claude
session limit during step 4), finished and verified by Muse Wonder in-session
after Codex Sol proved unavailable (expired Codex auth; see below). Deploy:
dpl_AHJvgGpnNRmwJ5uQ6jpsa9yufvZ5, verified READY, alias 200.

## What shipped

Slice A makes the landmarks file playable content: it loads at boot, the four
existing expeditions resolve their stops against cities and landmarks through
one lookup, and the Passport gains a Landmarks tab whose postcards never count
toward city, country, or continent totals.

Commits, in order:

- d098332 (1/4): authored the 7 landmark entries the expeditions referenced but
  which existed in neither data file (mount-fuji, mount-vesuvius,
  mount-pinatubo, colosseum-rome, easter-island, galapagos-islands,
  lord-howe-island). Coordinates from Wikidata P625 cross-checked against OSM,
  difficulty from the frozen v2 scorer. Real photos replaced the placeholders
  for cotopaxi-refuge and pyramids-of-giza. Landmarks file: 909 to 916 entries.
- 3247c17 (2/4): `assets/locations-landmarks-sol.json` fetched at boot beside
  expeditions.json into `state.landmarks` (never `state.locations`).
  `findLocation()` in the passport store resolves cities first, then landmarks;
  Expeditions uses it, and its entry button stays disabled until both files
  have loaded.
- ce8dccd (3/4): Passport Landmarks shelf. A third tab (Places, Countries,
  Landmarks) with its own dex grid reusing the shared slot and card components
  and its own summary line ("X of 17 landmark postcards, Y visited"). The shelf
  holds the 17 distinct landmark stops used by the four expeditions. Design
  choices worth noting: `renderLandmarkShelf()` builds entries from the items
  directly, so landmark visits (stored by id in the existing passport record)
  display without entering `passportEntries()` or the country index; the
  saved-view storage key is never given a landmarks value, so no stored shape
  changed and no new localStorage key exists.

Also in this deploy, from the same day's separate work: the Daily share text
moved to the "I scored" format with base scores and (x2)/(x3) markers
(7127eff, Sean's spec), and the reveal multiplier renders as x2 instead of
x2.0 (0f24468).

## Verification (all measured, none estimated)

- Syntax: `node --check` and `node --check --input-type=module` pass on every
  edited module.
- End-to-end harness `shots/passport/lm-expedition-e2e.mjs` (390px, pp-shot
  pattern), run three times; the final run was against the exact committed
  tree including the Daily commits: all four expeditions play 7 of 7 stops in
  order, completion badges land, and all 13 checks pass (shelf before and
  after, persistence across reload, city totals identical, found counts cities
  only, no landmark in the Countries tab, stored passport records carry the
  landmark earns, fits 390px, zero page errors). One Island Hopping round is a
  deliberate 2,000 km miss by harness design, so the shelf also proves the
  visited-but-not-earned state. Screenshots: `shots/passport/lm3-*.png`
  (picker, landmark round, reveal, shelf empty and earned, badge summary).
- Regression: 12 of 12 suites. The full run passed 11 and failed PvP H2H 7
  with a headless browser crash at page load ("Target page, context or
  browser has been closed", before any game code ran); the PvP group rerun
  passed every suite including H2H 7, confirming the flake class already
  documented in the Phase 5 report.
- Orchestrator visual review: picker, landmark round, reveal, and shelf
  screenshots checked against the site's existing components and style before
  deploy. Card photos appear blank in sandbox screenshots because the harness
  captures before remote images finish; the URLs themselves were verified live
  (HTTP 200, real Wikimedia photos).
- Production, checked after deploy: landmarks file serves 916 entries, cities
  805, all 28 expedition stops resolve against production data, the 7 authored
  entries are present, and the served daily-game.js, round.js, and passport.js
  contain the new share format, the multiplier fix, and the shelf code.

## Process notes

- The Opus run banked steps 1-2 and the step 3 edits, then died on the Claude
  session limit. A Sol (Codex gpt-5.6-sol) resume was dispatched per Sean's
  reroute and blocked before starting: the codex-run auth probe failed on an
  expired Codex login (`codex login --device-auth` restores it). Sean offered
  Muse Wonder as the alternative; Wonder audited the surviving step 3 edits
  line by line, committed them unchanged, and ran step 4 itself.
- A VM restart killed the first full regression run at about 15 minutes with
  its log in /tmp; the rerun logged to a persistent path and completed.
- The agent watchdog entry and the one-shot Opus relaunch cron for this work
  were both removed once Wonder took the build in-session.

## Follow-ups

- Slice B (not started): clue and image pass over the landmarks file, plus new
  seven-stop expeditions from the `sets` tags (143 landmarks carry sets, 32
  set names).
- future-features.md #8 (Sean, 2026-10-15): bring back large area features
  (lakes and friends) with extent-aware scoring, a guess inside the extent
  counts as 0 km and outside guesses measure to the nearest border point. Nine
  bank entries already carry `extentKm`; nothing reads it yet.
