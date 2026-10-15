# Refactor Phase 5 report: globe, core and game extraction (orchestrator closeout)

Built by Claude Opus 5.5 (claude-run). Closeout by the orchestrator, the same pattern as Phases 2 and 4: the builder banked every code step and pushed, then hit the Claude session limit a second time (reset 4:10pm UTC) before the final gate, deploy and report. The orchestrator audited the commits, ran the gate on the final tree, deployed, and verified production.

## Status: deployed, awaiting Sean's phone check

Phase 5 is NOT called complete until Sean checks the game on his phone, per the plan's gate. Everything automated is done and green (below). Production serves the Phase 5 build: deployment dpl_6qaddFt4iYgkUZmSgKCMaxLvUZUN READY, entry src/main.js?v=7e5406114b7d at 795 lines, importing all 30 local modules with content hashes (core 7, game 3, globe 5, meta 3, modes 7, pvp 5). Spot checks of globe/scene, core/state, game/round, modes/daily-game and meta/passport-store all returned 200. The deploy also added the 2026-10-17 daily pin; the pins commit 380e26f is pushed.

## Commits (all pushed, verified with git log origin/main)

| Commit | Step |
|---|---|
| d506b6a | Phase 5 (1/3): core modules (config, storage, audio, dom, math, format) and the shared state module src/core/state.js |
| 8240e9d | Phase 5 (2/3): globe modules in src/globe/ (scene, surface, outlines, pin, reveal) |
| 9989395 | Phase 5 (3/3): shared round screen, scoring and share plumbing in src/game/; Daily screens in src/modes/daily-game.js; passport store in src/meta/passport-store.js |
| dcc566b | Phase 5 (4/4): globe modules import downward only (breaks the surface/pin, pin/reveal and outlines/reveal cycles so deploy versioning settles: 32 modules, 5 passes) |
| 32f1894 | Untrack nine src backup files staged by mistake in dcc566b |
| 380e26f | Daily pins: pin 2026-10-17 (created by deploy.sh) |

Scope notes, all disclosed by the builder in its commit messages and confirmed in the diff:

- Two modules beyond the brief's named list: src/modes/daily-game.js (the Daily's screens; src/daily.js itself stayed where the pin flow reads it) and src/meta/passport-store.js (the passport store and dot cloud out of passport.js). Both serve the plan's goal of main.js as boot and wiring only.
- Two non-move edits in step 3, both forced by the layering rule: the Daily share button passes shareText() explicitly instead of relying on a default that would have made game/ import a mode, and main.js resets the store's location index through resetLocationIndex(). Behavior is unchanged; the seeded harnesses matched pre-Phase-5 output.
- Step 4 moved three shared items down into scene.js (the canvas pointer set, the drag rate and the screen projection) and made pin.js read two materials through its host, so globe imports run one way only. Literals byte-identical per the commit message.
- The backup-file mistake in dcc566b nets to zero: 32f1894 untracked them again, the net diff against Phase 4 (9f21b6c) contains no backup files, and the five backup files still tracked in src/ were already tracked at the Phase 4 baseline. They are Sean's Phase 6 hygiene decision, untouched.
- Per-mode share texts stayed in their mode files; only share plumbing moved to src/game/share.js. Endless stays disabled, Audit stays behind its flag. localStorage keys and saved-data shapes unchanged (the storage wrapper moved, its keys did not).

## Line counts (wc, final tree)

| File | Lines |
|---|---|
| src/main.js | 6,322 before Phase 5, 795 after |
| src/globe/scene.js | 215 |
| src/globe/surface.js | 1,542 |
| src/globe/outlines.js | 302 |
| src/globe/pin.js | 576 |
| src/globe/reveal.js | 1,302 |
| src/core/config.js | 58 |
| src/core/storage.js | 175 |
| src/core/audio.js | 183 |
| src/core/dom.js | 93 |
| src/core/math.js | 17 |
| src/core/state.js | 43 |
| src/core/format.js | 69 |
| src/game/round.js | 454 |
| src/game/scoring.js | 18 |
| src/game/share.js | 24 |
| src/meta/passport-store.js | 266 |
| src/modes/daily-game.js | 644 |

main.js is under the plan's roughly 1,000 line boot-and-wiring target. Full arc of the refactor: 10,486 lines at the start, 795 now.

## Gate evidence (orchestrator-run on the final tree, 32f1894)

1. Syntax: node --check in module mode passes on every module under src/ (32 files).
2. Regression: full run passed 11 of 12 suites. The baseline screenshot suite failed with a headless browser close (page.waitForTimeout: target page, context or browser has been closed), the same crash class the builder hit and passed on rerun at steps 1 and 3. Rerun solo, the baseline suite passed, so all 12 suites are green across the two runs. The committed shots/baseline/ files were restored afterward.
3. Builder's per-step evidence (from its commit messages): regression 12/12 at steps 1 and 3, Daily played end to end at every step, and the modes and Audit quarantine harnesses matched pre-Phase-5 output apart from the known sat-on timing flake, which also flips on unmodified code (documented in the Phase 4 report).
4. Clean tree before deploy: tracked src/ and index.html had no uncommitted changes; every step was committed and pushed before deploy.sh ran.
5. Deploy: ./deploy.sh, deployment READY, alias 200, 805 locations verified, 32 modules versioned in 5 passes, pins commit pushed.

## What remains

- Sean's phone check of the live game. Only after that is Phase 5, and the refactor, complete.
- Phase 6 (repo hygiene) is separate and unapproved; nothing was deleted.
