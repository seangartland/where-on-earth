# Refactor Phase 2 report: PvP extraction

Status: COMPLETE, live on production 2026-10-14 evening.
Builder: Claude Opus (build commits a1934e8 and 9388df9). Gate and deploy: finished by the orchestrator after a VM restart killed the builder session 26 minutes in; both step commits were already pushed, so no work was lost.

## What moved

Out of src/main.js into src/pvp/: api.js (195 lines, the worker client), home.js (333, Challenge home and lists), h2h.js (374, match flow, records, rematch), group.js (208, Open Challenge lobby, leaderboard, standings), play.js (278, PvP rounds on the shared round screen). main.js went from 10,486 lines (pre-refactor) to 9,185. No behavior, copy, or styling changes; localStorage keys and worker payloads unchanged.

## Gate evidence

- Syntax: node --check in module mode passes on main.js and all five new modules.
- Regression: scripts/regression.sh fully green (12 of 12 suites, exit 0), including the H2H flows, Open Challenge verification against the live worker, and PvP layout measurements unchanged.
- Deploy: ./deploy.sh succeeded (deployment READY, alias 200, 805 locations verified by the script). Production main.js imports pvp/api.js, pvp/group.js, pvp/home.js and pvp/play.js with content-hash version parameters, so the Phase 0 module versioning works on the real import chain (h2h.js is reached through the PvP modules, not the entry).
- The regression run refreshed the working-tree baseline screenshots; the committed baselines were restored afterward, following the Phase 1 precedent, so baseline changes stay deliberate.
