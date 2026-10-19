# Brief: build the Daily postcard pack, steps 1 to 5 of the approved spec

Work in this clone (pack-work), based on current main, which
contains `docs/daily-pack-spec.md` including its Decisions section
(Sean, 2026-10-18). Implement spec steps 1 to 5 exactly. Step 7
(the subscriber pack 2) is NOT in this build: it is blocked on the
payments entitlement helper. Leave all work uncommitted; the
orchestrator verifies and banks. No network.

## Decisions baked in (do not relitigate)

- Name: **Daily postcard pack** (Sean's override). The home row
  label follows the name.
- Pool: `state.locations.filter(isPlayableLocation)` plus
  `landmarkPool()` (805 + 332 = 1,137 today). Uniform draw, no
  weighting; three distinct cards within one pack.
- Key `where-on-earth-pack-v1` in config.js and VERSIONED_KEYS,
  today-only record, generated lazily on first tap and saved
  before the first clue (no reroll on reload), unplayed cards
  forfeit at midnight, an on-screen round at midnight finishes
  and banks under its own date.
- Rounds: PvP clue-only presentation, NO timer, local. Normal
  earning via recordVisit. Black and white is the existing seen
  state: no new storage, no new visual state.
- Payout surface: grey-card toast ("Visited · added to your
  Passport") on a first visit; a repeat with nothing new shows
  "Already in your Passport" on the reveal and no toast; earns
  use the existing earn toast. Pack screen shows per-card +base
  and a total out of 3,000; no streak, no Stats feed, no history.
- No pack-level share format. Flipped cards open the existing
  postcard detail (which has its own share).
- Pack 2: not built, not stubbed beyond what the spec's state
  shape already allows (packs array). No upsell line anywhere.
- Placement P1: a slim full-width row directly under the Daily,
  quiet style (outline, no fill), states per the spec, with
  syncPackButton() wired like the Daily's.
- Cleanup C1 to C7 as one batch, exactly as section 4 rules:
  remove the covered home mute instance; remove the disabled
  Photo mode row; reword the More modes label; remove the dead
  Endless home button and its main.js toggles (the endless module
  itself stays quarantined, with null guards where entry points
  were read); continent chips off the home passport card (they
  stay on the Passport page); trim the Survival hub row names;
  Expeditions label names the live week with the existing
  fallback. Per-mode share formats are untouched.

## Verification (the spec's section 5, headless)

- Pack-store unit tests: shape, no reroll on re-read, date
  rollover, distinctness, pool counts.
- Playwright through the game hooks: a hit inside 150 km sets
  meta.e; a miss leaves a seen-only entry; a pack miss followed
  by a Survival hit colours the card; reload mid-pack resumes
  the same card; zero page errors.
- Pack screen element counts per state; flipped slot opens the
  postcard detail; totals correct.
- Layout at 390x844 and 390x664: no overflow with P1 + C5, the
  Daily still full width, mode pairs intact; elementFromPoint
  on the settings gear returns the gear.
- Both syntax checks on every touched file, including
  `node --check --input-type=module < src/main.js`, and the repo
  regression script green.

Keep a short log of commands and results in
`docs/pack-build-log.md`. Sean's phone check comes later, on the
pack screen's opening feel and the trimmed home; your deliverable
is the headless evidence.
