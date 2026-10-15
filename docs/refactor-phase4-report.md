# Refactor Phase 4 report: game modes into src/modes/

Built by Claude Opus 5.5 (claude-run). This was a relaunch: step 1 (the Survival family) was already committed but not pushed, and drafts for steps 2 to 4 were in `shots/p4-drafts/`. I audited the git log and the tree, checked each draft line by line against the main.js and passport.js sections it replaces, then applied, verified, committed and pushed each step in turn.

## Status: code done and pushed, NOT deployed (blocked by the pin step)

All four commits are on origin/main. The deploy did not run: `deploy.sh` stops at its fail-closed daily pin step because Node cannot read production from this VM (details below). Production still serves the Phase 3 build: its entry `src/main.js?v=f61a181cf178` is 6,945 lines and imports nothing from `src/modes/`. Production is therefore behind git, not ahead of it, which is the safe direction (the Phase 3 lesson). Nothing uncommitted shipped.

## Commits (all pushed, verified with `git log origin/main`)

| Commit | Step |
|---|---|
| 0f3aff3 | Phase 4 (1/4): Survival family: survival.js (classic Survival, the shared run-over screen, the hub), tap-country.js, blackout.js (mask canvas and scope picker included). Committed by the previous run; I pushed it. |
| 9bf62ac | Phase 4 (2/4): Expeditions into src/modes/expeditions.js |
| b375fe9 | Phase 4 (3/4): Endless quarantined in src/modes/endless.js, intact and disabled |
| 25a08f7 | Phase 4 (4/4): Audit quarantined in src/modes/audit.js, still behind its flag |

Pattern followed: each mode exports `initX(host)`. main.js calls it at the spot where the section used to run, and passes `modeHost` (or `passportHost` for Audit) as the narrow interface. No mode imports main.js. Mode variants stay in their modules: the round header, reveal card and next-stop logic for Expeditions, and the round header for Endless. Share texts moved with their modes word for word in step 1 (Expeditions, Endless and Audit have no share text).

Notes per step:
- **Expeditions:** the picker styles stay injected from main.js in their original order, because the Blackout picker and the Survival hub (index.html) use the same `.expedition-panel` / `.expedition-choice` classes. The `assets/expeditions.json` fetch also stays in main.js, at the same spot, and passes its data to `expeditionsLoaded`. deploy.sh's asset hash rewrite only touches `src/main.js`, so moving that URL into a module would have left it unversioned.
- **Endless:** still disabled. Its button is still `hidden` in index.html and nothing was re-enabled. The button has exactly one listener, so registering it at the section's new init spot does not change listener order.
- **Audit:** `AUDIT_AVAILABLE` is still `false`. The flag store, the card flag button, and the banner with its flags panel, Clear and Export moved out of both main.js and src/meta/passport.js. The Passport reaches Audit through `passportHost.addAuditFlagButton` / `mountAuditBanner`. `initAudit` reads the saved flags right before `initPassport`, the same moment the read used to happen inside it. The audit CSS stays in the Passport's style block, where it has always applied.
- **daily.js stays at src/daily.js.** Other code references it by path: `scripts/pin-daily.mjs` imports `../src/daily.js` and fetches the deployed `src/daily.js` from production, and `scripts/lib/deployed-daily.mjs` depends on that. Moving it would break the pin and deploy flow.

## Line counts

| File | Before (e720b9f) | After (25a08f7) |
|---|---|---|
| src/main.js | 6,945 | 6,322 |
| src/meta/passport.js | 2,088 | 1,956 |
| src/modes/survival.js | n/a | 205 |
| src/modes/tap-country.js | n/a | 238 |
| src/modes/blackout.js | n/a | 205 |
| src/modes/expeditions.js | n/a | 163 |
| src/modes/endless.js | n/a | 70 |
| src/modes/audit.js | n/a | 155 |

main.js by step: 6,945, then 6,480 (Survival family), 6,365 (Expeditions), 6,320 (Endless), 6,322 (Audit; the import line and two host entries added, three flag lines removed).

## Gate evidence

1. **scripts/regression.sh: ALL SUITES PASSED (12/12)**, run on 25a08f7: Passport/Daily, Survival hub tap-through (classic, Tap the Country, Blackout picker with 7 scopes, Blackout round, modals, back, home and hub fit), PvP H2H 1, 2, 3a, 3b, 4, 5 and 7, Open Challenge against the live worker, PvP layout, and baseline screenshots. Log: `shots/regression-phase4.log`. I then restored the committed `shots/baseline/` files with `git checkout`.
2. **Scripted runs beyond the regression** (`shots/passport/modes-verify.mjs`, seeded Math.random, real buttons plus `window.__game`). It plays classic Survival (a hit, then a miss, results, share), Tap the Country (the same), **Country Blackout on Europe** (scope list, a hit that paints the mask, a miss, results, mask state, share, Again, mask cleared at home), and **an Expedition** (picker, two stops played, saved progress). It also checks that the Endless button is hidden and the Audit banner is absent. After every step I diffed the output against `shots/modes-before.json`, which was captured on pre-Phase-4 code. Steps 2 to 4 were identical except for the `sat-on` body class on the first Survival round or reveal. **That difference already exists on unmodified code:** running the same harness against a worktree of e720b9f (pre-Phase-4) gave the same `sat-on` diffs in 2 of 3 runs. It comes from the satellite mix (`document.body.classList.toggle('sat-on', s > 0)` in the zoom and frame-timing path), and two reruns after step 2 were byte-identical.
   **Audit quarantine check** (`shots/passport/audit-quarantine.mjs`): the flag is flipped only in the served copy (`AUDIT_AVAILABLE` true plus `?audit=1`), never on disk. Results: the banner mounts, the Passport shows 805 flag buttons, flags cycle (image, then city), storage is written, the flags panel lists the entries, and Clear all empties it, with zero page errors. The output is **byte-identical** to the same check against e720b9f.
3. **node --check --input-type=module** passes on src/main.js, src/meta/passport.js and all six src/modes/*.js.
4. **Clean tree and deploy: partly met.** Tracked src/ and index.html are clean, and every step is committed and pushed. The only untracked files under src/ are old `*.bak*` backups, which deploy.sh deletes from the deploy copy. A dry run of `scripts/version-modules.mjs` on a copy of src/ settles in 5 passes over 16 modules (the mode import graph has no cycles), so every new module gets a `?v=` hash. **The deploy itself is blocked:** `deploy.sh` failed twice at `pin-daily.mjs` with `UND_ERR_HEADERS_TIMEOUT` reading https://where-on-earth-game.vercel.app/. Diagnosis: through the egress proxy, curl reaches production (200 in about 1s, repeatedly), and Node's fetch reaches example.com and api.github.com (200). Node's fetch to the production host gets no response headers, even with a 5 minute wait, and fails the same way on every retry. A direct connection without the proxy fails with an SSL error. This is a VM egress fault specific to Node and the vercel.app host, not Phase 4 code. The pin step is a deliberate fail-closed guard for today's Daily, so I did not bypass it or rewrite the pin tooling. No pins commit was produced, and the "production serves the new modules" check is outstanding.
5. Line counts: above.

No em dashes were added anywhere: I checked the Phase 4 diff and the commit messages.

## What is needed to finish

Once Node can reach production again (retry `timeout 30 node -e "fetch('https://where-on-earth-game.vercel.app/assets/version.txt').then(r=>console.log(r.status))"`), run `./deploy.sh` from demo/, push the pins commit it creates, and confirm that production's `src/main.js?v=...` imports `./modes/survival.js?v=`, `tap-country`, `blackout`, `expeditions`, `endless` and `audit`. If the Node path stays broken, the alternative is to change pin-daily's reads to go through curl. That changes the deploy tooling, so it needs Sean's approval first.
