# Where on Earth: modularization and cleanup plan

Author: Muse Wonder, as planner and reviewer. Execution: Claude Opus, phase by phase, on approval.
Status: PROPOSAL, written 2026-10-14 from a measured survey of the repo. No code has been changed for this plan.

## Why, and why now

The client is one ES module, `src/main.js`, at 10,486 lines, plus `src/daily.js` at 140. Everything lives in that one file: the globe renderer, the Daily, three Survival modes, Expeditions, the Passport, Stats, both PvP modes, all sharing, settings, and audio. The game works and ships well; nothing here is a correctness emergency. The cost shows up as a tax on every change:

- Every build agent spends a real share of its budget just finding the right region of the file, and edits land near unrelated systems. The stray "null" that reached the PvP home on 2026-10-14 came from a shared helper edited in passing.
- CSS lives in four places: `src/style.css` (375 lines), two inline `<style>` blocks in `index.html` (boot at lines 54-73, main UI at 74-200), and `<style>` elements injected from JavaScript (the PvP stylesheet as a template string near line 7189, plus flyover and countdown style blocks). The PvP home cleanup had to work around that split.
- Preserved-but-inactive code sits in the same file as live code: Endless (disabled by Sean's decision, logic kept) and Audit (retired 2026-10-12, kept behind a flag), roughly 51 and 57 mentions respectively.
- Feature work is accelerating into exactly the crowded areas: virality ideas will touch the PvP and share code, and landmark Expeditions will touch the Passport. Each of those builds is cheaper and safer on a split codebase.

The honest counterweight: a refactor freezes or complicates feature work while it runs, and this file, for all its size, is internally organized with clear banner sections. This plan is therefore phased so the game is deployable and verified after every phase, and so the highest-value extractions land first.

## Ground rules

1. **Behavior-preserving.** No feature changes, no copy changes, no tuning. If a phase seems to need one, it stops and asks.
2. **Deployable after every phase.** Each phase is one build session, one or more commits, one deploy, one verification pass. A phase that cannot be verified does not ship.
3. **Contracts that must not move:** every localStorage key and saved-data shape (players' phones hold live state), the worker API and its payloads, the daily pins flow in deploy.sh, the frozen difficulty scorer, and per-mode share text. Share formats differ per mode by Sean's decision; they are not duplication to be merged.
4. **No build step, no framework.** The site stays static files with native ES modules and the existing import map, exactly as it deploys today.
5. **Preserved code is quarantined, not deleted.** Endless and Audit move into their own modules, intact and still inactive, per Sean's standing decisions.
6. **Shared state is handled last and carefully.** The game keeps state in module-scope variables that many sections read. Untangling that is Phase 5's problem, not Phase 1's.

## Constraints found in the survey

- **Deploy versioning.** deploy.sh content-versions assets by rewriting `?v=` hashes into the deployed copies. Any multi-module layout must extend that rewriting to every module's import URL, or iOS Safari will hold stale submodules while the entry file updates. This is Phase 0 work, before the first split.
- **The boot screen paints before anything loads**, so the small boot `<style>` in `index.html` stays inline on purpose. It is the one deliberate exception to "all CSS in stylesheets."
- **The headless harnesses serve files by path** from demo/ (shots/pvp/harness.mjs, shots/passport/pp-shot.mjs), so a folder split is compatible with them as long as paths are updated in the harness or kept stable.
- **The worker is already modular** (`index.js`, `scoring.js`, `catalog.js`, `group-room.js`) and is out of scope.

## Target layout

```
src/
  main.js            boot and wiring only: imports, storage migration, home screen, mode registry
  core/
    config.js        constants, storage keys, scoring thresholds
    storage.js       the one wrapper for localStorage reads and writes
    dom.js           element builders and shared panel, row, and button helpers
    format.js        km, score, date, and name formatting used across screens
    audio.js         game sounds and the ambient mixing setup
  globe/
    scene.js         renderer, backdrop, starfield, atmosphere
    surface.js       land data, satellite imagery, detail insets
    outlines.js      country outline loading and the answer border
    pin.js           pin placement and view interaction
    reveal.js        camera flights, flyover, reveal framing and beats
  game/
    round.js         the shared round screen: clue card, timer, lock in, reveal card
    scoring.js       distance and score computation shared by local modes
    share.js         share plumbing only (sheet, clipboard, card canvas); text stays per mode
  modes/
    daily.js         the Daily (already separate; moves here, logic untouched)
    survival.js      classic Survival
    tap-country.js   Survival: Tap the Country
    blackout.js      Survival: Country Blackout
    expeditions.js   Expeditions
    endless.js       QUARANTINED: disabled, preserved as is
    audit.js         QUARANTINED: retired, preserved as is
  meta/
    passport.js      Passport, postcards, countries tab
    stats.js         Stats page
  pvp/
    api.js           the worker client (identity, matches, groups), extracted from inline code
    home.js          Challenge home, Direct and Open Challenge cards, code entry, lists
    h2h.js           match screen, records, rematch
    group.js         Open Challenge lobby, leaderboard, standings
    play.js          PvP round glue onto game/round.js
  styles/
    game.css         style.css plus the main UI styles now inline in index.html
    pvp.css          the PvP stylesheet now injected from JavaScript
    flyover.css      flyover and countdown styles now injected from JavaScript
```

The split follows the banner sections already in the file; it formalizes seams that mostly exist instead of inventing new ones.

## Phases

### Phase 0: safety net and deploy versioning (small)
- Extend deploy.sh's content versioning to rewrite `?v=` on every `src/**/*.js` module URL in the deployed copy, with a local test proving a changed submodule gets a new URL.
- Consolidate the existing checks into one regression command that serves demo/ locally and runs: the Passport/Daily harness (pp-shot), the Survival hub tap-through (sh-verify), the PvP H2H phase flows, the Open Challenge verification (g-verify), and the PvP layout measurements. Capture baseline screenshots of every main screen before anything moves.
- Gate: the regression command passes on the unmodified code.
- Estimate: one short session. This phase is what makes the rest safe; it is not optional.

### Phase 1: CSS extraction (small)
- Move the PvP, flyover, and countdown style strings out of main.js into `src/styles/`, and the main UI styles out of index.html into `game.css`. Boot styles stay inline. No selector or value changes; this is a move, verified by screenshot diff.
- Gate: before and after screenshots of home, Daily round, PvP home, lobby, Passport, Stats show no visual difference; the regression command passes.
- Estimate: one short session. Risk: cascade order. Mitigate by preserving the exact order the styles apply in today (link order replaces injection order, checked in the diff).

### Phase 2: PvP extraction (medium)
- Move the PvP block (roughly lines 7000 to the end of the file, about 72 declarations plus the API code currently inline in the round flow) into `src/pvp/` per the layout above. PvP imports the shared round screen; nothing else imports PvP internals.
- Also extract `pvp/api.js` properly; today the H2H and group API calls are interleaved with UI code.
- Gate: g-verify end to end against the live worker, the H2H phase scripts, layout measurements unchanged, regression command green.
- Estimate: one full session. This is the extraction the virality work will thank us for, since most of it lands in `src/pvp/` and the share plumbing.

### Phase 3: meta surfaces (medium)
- Extract Passport and Stats into `src/meta/`. Pull genuinely shared formatting (km pills, distance and score text) into `core/format.js` where the outputs are byte-identical.
- Gate: pp-shot screenshot pass, stats-shot, a scripted postcard earn and share-card render, regression command green.
- Estimate: one session.

### Phase 4: modes (medium)
- Extract Survival, Tap the Country, Blackout, and Expeditions into `src/modes/`; move Endless and Audit into their quarantine modules untouched. The shared round screen seams get used by all of them; where a mode has its own variant behavior (Blackout's mask, Tap the Country's input), the variant stays in the mode module.
- Gate: sh-verify, scripted runs of each Survival mode and one Expedition, regression command green.
- Estimate: one to two sessions.

### Phase 5: globe and core (large, riskiest, last)
- Extract the globe (`scene`, `surface`, `outlines`, `pin`, `reveal`) and the core utilities; introduce one explicit state module for the cross-cutting game state instead of scattered module-scope variables. main.js shrinks to boot and wiring.
- Gate: the full regression command, a headless Daily played end to end, a PvP match end to end, and a phone check by Sean before this phase is called done.
- Estimate: two sessions. If any phase is going to be deferred, it is this one; Phases 0-4 already capture most of the day-to-day benefit.

### Phase 6: repo hygiene (separate, Sean-gated, not code)
- The repo root carries working clutter: `.main.js.bak-flags` (99 KB), `.main.js.pre-challenge-simplify` (226 KB), several `src/*.bak-*` files, a 768 KB locations-review.csv, favicon explorations, one-off preview pages, scratch directories (.batch1, .batch2, .build-tmp, .fanout-tmp, .harvest-2025), and about twenty one-off review documents at the root. Proposal: move keepers into `archive/` inside the repo or out to the workspace, delete pure backups (git history already holds them), and leave the tree showing only what the game is. This needs Sean's pass over the categories first; nothing here is deleted on an agent's judgment. The `.harvest-2025` directory also still holds credential-bearing scripts flagged earlier for removal.

## DRY, with a fence

Worth consolidating as the seams are cut: the element-builder pattern (already partly shared via pvpEl and the expedition rows), localStorage access (one wrapper, so key names live in one file), number and date formatting, and the share plumbing (sheet versus clipboard fallback, card canvas rendering). Explicitly NOT merged: per-mode share text (Daily, Survival, Tap the Country, Blackout, PvP each have their own decided format), per-mode scoring presentation, and the frozen difficulty code. Every consolidation must show byte-identical output on the regression checks before it counts as done.

## Risks

- **Stale modules on phones** if deploy versioning misses a file. Mitigated in Phase 0 and re-tested every phase by fetching the deployed module URLs.
- **Circular imports** as sections separate. Mitigated by the layering rule: core imports nothing from the app, globe and game import core, modes and meta import core plus game, PvP imports core plus game, main wires. Any import that breaks the rule is a design smell to raise, not to sneak in.
- **A phase that quietly changes behavior.** Mitigated by the Phase 0 regression command and by the rule that a phase diff should read as moves plus import changes; anything else in a diff gets explained or reverted.
- **Opportunity cost.** Five to eight build sessions is real time. The sequencing below is the compromise.

## Sequencing against the rest of the roadmap

1. **Pin backfill fix first.** It is small, it is a correctness item (future Daily archive integrity), and it should not be tangled into a refactor.
2. **Phases 0-2.** Safety net, CSS, and the PvP extraction. After Phase 2, the virality builds (which mostly touch PvP and sharing) get cheaper immediately.
3. **Virality work**, whichever ideas Sean picks from the Opus and Wonder lists.
4. **Phases 3-4**, then the landmark Expedition slices (which touch Passport and Expeditions, both cleaner after Phase 3-4).
5. **Phase 5** when there is a natural gap; **Phase 6** whenever Sean wants to spend ten minutes ruling on the clutter categories.

## What done looks like

- main.js under roughly 1,000 lines of boot and wiring.
- Every screen and mode owned by a named file; a new feature touches one or two files.
- All CSS in stylesheets except the deliberate boot block.
- One regression command that plays the whole game headlessly and is run before every deploy.
- No behavior change a player could detect, verified phase by phase.

## Decisions for Sean

1. Approve the target layout, or adjust folder names and groupings.
2. Approve the phase order and the sequencing against pin backfill and the virality work.
3. Phase 6 hygiene: in scope soon, later, or never; and which clutter categories are keepers.
4. Phase 5 appetite: commit now, or explicitly defer until after the landmark work.
