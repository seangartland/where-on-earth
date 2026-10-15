# Refactor Phase 3 report: Passport and Stats extraction

Status: COMPLETE, live on production 2026-10-15 (just after midnight PDT).
Builder: Claude Opus (commits 683172b Stats, 36bde10 Passport, ccd97c6 format wiring). Gate and deploy: finished by the orchestrator after the builder session ended before its final commit; the last step was found uncommitted in the working tree, reviewed line by line, and committed as (3/3).

## What moved

Out of src/main.js: src/meta/stats.js (286 lines) and src/meta/passport.js (2,088 lines, including the postcard share-card rendering). A new src/core/format.js holds formatKm, the one formatter whose output was byte-identical at every call site; the wiring commit swaps the inline template strings for formatKm in main.js and stats.js. The injected stats/passport style blocks remain in main.js, as the brief allowed (known CSS-in-JS leftovers for a later cleanup). main.js: 9,185 to 6,945 lines. Passport storage keys and saved-data shapes unchanged; share texts unchanged.

## Disclosure

The deploy briefly ran ahead of git: deploy.sh ships the working tree, and the builder's final step was still uncommitted when the orchestrator deployed. The diff was reviewed before committing (import plus byte-identical formatKm swaps only, 13 insertions across two files) and is now ccd97c6 on origin/main, so git and production match again. The regression gate below ran against the exact tree that deployed.

## Gate evidence

- Syntax: node --check in module mode passes on main.js, meta/passport.js, meta/stats.js and core/format.js.
- Regression: scripts/regression.sh fully green (12 of 12, exit 0), including pp-shot (Passport/Daily) with its stats assertions, and baselines were restored after the run.
- Deploy: ./deploy.sh succeeded (alias 200, 805 locations verified). Production main.js imports core/format.js, meta/passport.js and meta/stats.js with content-hash version parameters.
- The postcard share card is not separately asserted by the regression; it moved verbatim with the Passport module, and the Passport suite exercises the Passport screens end to end.
