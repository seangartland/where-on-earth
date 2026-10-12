# Daily game mechanism: recommendation

Opus 5.5, 2026-10-12. Written as analysis; Sean approved the build with one amendment (removals are substituted, never block a deploy), and it was then implemented as described in §4 (As built). Sections 1-3 are updated to match.
Method: I read `src/main.js`, `src/daily.js`, `scripts/build-daily-schedule.mjs`, `deploy.sh`, `vercel.json` and `../docs/daily-archive-design.md`. I fetched live production (`where-on-earth-game.vercel.app`: `index.html`, `main.js?v=d1013138eb66`, `src/daily.js`, `locations.json?v=3cc57dcff303`) and ran the live `dailyIds` against the local schedule files with node. Every number below is measured unless it is labelled otherwise.

## 0. What the audit found first: the freeze never ran

**The live client never reads `assets/daily/`.** `loadDaily()` (main.js:3176) calls `dailyIds(date, locations)` directly, and that is true in both the local and the live `main.js`. `main.js` imports `monthKey` but never uses it, and nothing in it fetches `assets/daily/*`. `deploy.sh` never runs `build-daily-schedule.mjs`. It only copies `assets/daily/` along with the other assets, so the files are uploaded to production and never used. The read path from design §4.4 was never built.

What follows from that:

- **What players actually get is `dailyIds(localDate, the live locations.json)`, recomputed on every page load.** `dailyIds` shuffles each difficulty band as a whole, so any deploy that adds a location, removes one, or changes a difficulty re-deals almost every day, today included. This is why the game "keeps changing every time we deploy." The only players protected are those who already started today's game, because their IDs are saved in localStorage. Everyone else gets the new deal.
- **The schedule files are not a record of anything served.** Today's check: the live code with the live pool serves a different game than the local files for **10-12, 10-13 and 10-14** (all three differ). I could not check 10-09 to 10-11 against today's pool, because the pool has changed since those days.
- **They are also internally broken.** Measured today: 39 of 75 IDs for Oct 9-10 (including variants) are in neither `locations.json` nor `retired-locations.json`, and so are 46 of 85 IDs for Oct 15-31. Examples are `kakadu`, `spitzkoppe` and `wadi-rum`, which are not in the local pool or the live pool (both have 738 locations). Yesterday's audit counted 72 and that count no longer reproduces, so the files have probably been rewritten since. Either way, they were generated against a pool that is not the one in production.
- **`archive-sources/` no longer exists.** The backfill script read it, and it is not anywhere under `~/workspace`.
- **The committed `src/main.js` imports `./daily.js`, and that file is untracked.** A fresh clone of the repo has no working game. This should be fixed whatever is decided about the daily.

## 1. Recommendation: compute live, and pin the dates in play at deploy time

There is ONE rule for a date's game:

```
ids(date) = pins[date]  if assets/daily-pins.json has the date
          = dailyIds(date, locations.json)  otherwise
```

- **`assets/daily-pins.json`** is tracked in git and shipped: `{"v":1,"pins":{"2026-10-12":[5 ids], ...}}`. It holds only dates that were captured from live production. It never holds future predictions.
- **`dailyIds`** stays exactly as it is now (band shuffle, one location per band, no repeated country, UTC date-key parsing).
- **A pin step runs first in `deploy.sh`** (`scripts/pin-daily.mjs`, before the deploy dir is built). At deploy time T it:
  1. Fetches live production's `index.html`, then `main.js`, `daily-pins.json`, `daily.js` and `locations.json`. On the first cutover deploy, the live site has no pins file and computes everything, which `scripts/lib/deployed-daily.mjs` already handles.
  2. For each date in the window **W = [date(T−12h) .. date(T+14h) + 1 day]** (every local date being played anywhere, plus the next one, usually 3 dates), records what live serves: `livePins[d] ?? liveDailyIds(d, livePool)`. It writes the dates that are missing into the local pins and never overwrites a pin that already exists.
  3. **Substitution (Sean's amendment, replaces the original deploy-blocking guard):** for every pinned date, each slot whose location is missing from the working-tree `locations.json` (or is no longer playable / is launch-excluded) is replaced by a substitute; all other slots stay identical. The deploy is not blocked. The exact rule is in "Substitution rule" below.
  4. If live production cannot be read, the deploy aborts. It never guesses.
  5. Commits `assets/daily-pins.json` automatically, so each deploy leaves an auditable record of what it pinned and substituted.

### Substitution rule (exact)

Implemented once, as `resolvePinnedIds(date, ids, pool)` in `src/daily.js`; the pin step and the client both call it.

1. A slot is *usable* if its ID is in `pool`, `isPlayableLocation` is true, and `isLandmark` (launch-excluded) is false. If all 5 are usable, the pin is returned unchanged.
2. Otherwise, slots are visited in order R1..R5. Slot *i* belongs to difficulty band *i* (R1 = diff 1-2, ..., R5 = 9-10), the same band `dailyIds` used for that round.
3. For an unusable slot, build band *i*'s queue from `pool` exactly as `dailyIds` does (`bandQueues`: same filter, same `band-<i>` seeded shuffle) and start at the date's day index (`dayNumber(date) mod queue length`, the same index `dailyIds` would use).
4. Walk forward (wrapping) and take the first location whose ID is not already in the game and whose country is not used by any of the other usable slots (including slots substituted earlier in this pass).
5. Only that slot changes. If no candidate exists, the result is null: the pin step aborts the deploy, and the client falls back to `dailyIds(date)` rather than render a missing location.

At deploy time the rule runs against the pool being deployed and the result is written into the pin, so the substitute is frozen from then on. The client applies the same rule on load, so even a pin that somehow ships unresolved can never render a missing location.

### Why deploys cannot change a date's game

A date can be in one of two states at any deploy:

- **It is in play somewhere, or is the next date.** Then it is in W, and the pin step copies exactly what live is serving for it into the pins before the new code or pool is built. The new client reads the pin before it computes anything, so the deploy changes nothing for that date. The substitution step makes sure every pinned ID resolves in the shipped pool, so the client's "missing location → recompute" fallback in `loadDaily` is never triggered for a fresh game.
- **It is not in play anywhere yet.** Then nobody has seen it, and from now on it is computed from the newly shipped pool. Without a deploy that pool cannot change, and the next deploy pins the date before changing anything else.

So a date's game is fixed from the moment the first timezone (UTC+14) reaches it until the last (UTC−12) leaves it, about 50 hours. That covers the whole Pacific day, through any number of deploys. The single permitted exception is a location dropped from the dataset: only its slot changes, per the substitution rule. The extra "+1 day" in W also covers stale tabs running old code past midnight and the 1-hour cache on unversioned `/assets/`.

### Adding and removing locations

- **Adding a location, changing a difficulty, or re-cutting:** the change takes effect at the first date outside W, which is about 2 days after the deploy. Dates in W keep their pins. Nothing has to be appended or tombstoned.
- **Removing a location:** never blocks a deploy. If it is in any pinned date, that one slot gets a substitute (rule above) and the rest of that day's game is unchanged. Players who already started that day keep their saved game unless the removed location is in it, in which case `loadDaily` restarts them on the repaired game. `retired-locations.json` is retired (archived, nothing reads it).
- **Changing the selection code** (for example a new dedup rule) works the same way: dates in W are unaffected, and later dates get the new code.

### Days already played (Oct 9-12)

**Recommendation: do not try to preserve them.** Nothing in the product reads past days, because replay was never launched. The local files are not a record of what was served (§0). Reconstructing those days is possible but is not needed for anything.

- Oct 12 (today) and Oct 13 are captured correctly by the first pin step. It reads what live is serving right now, which is the only correct source.
- If Sean wants a true record of Oct 4-11 anyway, here is how to check what production actually served. List production deployments through the Vercel API (`vercel-api raw GET /v6/deployments?projectId=prj_gqXXakaMlcpXFkZIOp792miGxtv5&target=production`). Treat each deployment's READY time as its go-live time, because `deploy.sh` assigns the alias right after READY. Fetch `main.js`, `daily.js` and `locations.json` from each deployment's own immutable URL, run its `dailyIds` for each date it was live, and anchor each date to the deployment that was live at noon Pacific. Write the result to `docs/`, not to shipped assets. I have **not** run this. It costs about an hour of a cheap agent's time, and nothing consumes the result.

### Past-day replay: what survives and what is given up

- **What survives:** from cutover onward, `daily-pins.json` is an accurate log of every served date. It is captured from live, not predicted, and costs about 100 bytes per day (about 40 KB per year). Replaying a date works as long as all 5 of its IDs are still in `locations.json`.
- **What is given up:**
  - Guaranteed replay of every past day. A date that contains a later-removed location can't be replayed.
  - The 60-day future schedule. Nobody can see future games in advance.
  - Any record of Oct 4-11.
  - The `variants` concept.

  When the subscription becomes real, the right addition is small: when a location that appears in any past pin is removed, append its record to a tombstone file. The pins log already provides everything else. At that point, also move past-day data behind an API if the paywall needs to be enforced (design §5).

## 2. Migration from the current state

1. **Keep holding the re-cut deploy** (23a588b) until steps 2-5 are done, then ship everything in one batched deploy.
2. **Retire the freeze artifacts by moving them, not deleting them,** because they are untracked and deletion can't be undone. As built they moved to `demo/archive/daily-freeze/` (tracked in git, never shipped: `deploy.sh` copies only `index.html`, `src/`, `vendor/`, `assets/`): `assets/daily/` (month files, `index.json`, `retired-locations.json`), `scripts/build-daily-schedule.mjs`, `scripts/backfill-daily-2026-10.mjs`, and `scripts/archive-daily.py` (which is tracked and already wrong: different hash, no category filter). Moving `assets/daily/` out also stops `deploy.sh` from shipping it.
   **The unresolvable IDs (72 yesterday, 39 of 75 today) need no fix.** The only file containing them is retired, and pins only ever ship with IDs that resolve in the shipped pool (substitution step).
3. **Track `src/daily.js` in git**, and `scripts/lib/deployed-daily.mjs` too, because the pin step reuses it for the cutover read.
4. **Build the new pieces** (built directly by Opus at Sean's instruction, not delegated; see §4):
   - `scripts/pin-daily.mjs`, about 80 lines.
   - `main.js`: add `pins` to `LOAD` so `deploy.sh` content-versions it and stamps its size, and make `loadDaily` use `pins[date] ?? dailyIds(...)` in both branches. About 10 lines.
   - `deploy.sh`: run the pin step first, abort on non-zero, and auto-commit the pins file. About 5 lines.
5. **Settle the local-vs-production divergence by letting production win.** The first pin step reads today's and tomorrow's games straight from live (the current computing client and its pool). The local schedule's 10-12/10-13 values are thrown away.
6. **Deploy once** (this change plus the difficulty re-cut). Then verify:
   - The live `daily-pins.json` holds the in-play dates, and they equal what the old live code computed just before the deploy (the pin step logs these).
   - A fresh browser profile on the live site shows today's 5 IDs equal to `pins[today]`.
   - A date beyond W equals `dailyIds(d, new pool)`, which means the re-cut is in effect from that date.
   - Run `git log origin/main` to confirm the pins commit is on the remote.

### What the deploy pipeline must provide

- **Network access to production at deploy time.** The pin step must read live, so it cannot run offline.
- **`deploy.sh` must be the only path to production.** `vercel.json` already disables git auto-deploy for `main`, which is good. Do not use dashboard redeploys or rollbacks for production.
- **`daily-pins.json` must be a top-level `assets/*.json` file** so the existing content-hash loop versions it.

## 3. Cost and main risk

**Cost:**
- About 95 new lines (pin script, client read, deploy hook), replacing about 600 lines and 5 data files of freeze machinery.
- One automatic git commit per deploy.
- Data changes reach the daily about 2 days after deploying. A re-cut shipped today first shows up around Oct 14-15 (estimated from the window rule, not measured).
- Removing a location that is in a pinned game changes that one slot (substitution); nothing is blocked.
- Permanent replay is given up, and Oct 4-11 has no record (§1).

**Main risk: a production deploy that does not go through `deploy.sh`.** The guarantee holds only because the pin step runs before every production change. A manual `vercel-api deploy`, a Vercel dashboard redeploy, or above all a **rollback** to an older deployment would ship an older pool and older pins. That could change today's game for anyone who has not started it yet. Mitigation:
- Production changes only go through `deploy.sh`.
- Roll forward (revert the commit, then run `deploy.sh`) instead of rolling back in Vercel.
- If git auto-deploy is ever re-enabled for `main`, this mechanism breaks.

A smaller risk: if production is unreachable at deploy time, the deploy is blocked. That is deliberate. (The `DAILY_ACCEPT_CHANGE` override proposed earlier was not built: with substitution there is nothing for it to override.)

## 4. As built (2026-10-12)

Built directly by Opus 5.5 at Sean's instruction (no delegation). Commit "Daily: live compute + deploy-time pins (freeze logic removed)".

**Files**
- `src/daily.js` (now tracked): `dailyIds` refactored into `bandQueues(list)` + `dayNumber(date)` with identical output, plus `resolvePinnedIds(date, ids, pool)` (substitution rule). `monthKey` removed.
- `src/main.js`: `LOAD.pins` (`assets/daily-pins.json`, so `deploy.sh` content-versions and size-stamps it like every other `assets/*.json`); the pins file is fetched alongside `locations.json` and is required the same way (if it fails, play stays disabled with an error, rather than compute a game that may differ from the pin). `dailyGame(date)` = `resolvePinnedIds(date, pins[date])` if pinned, else `dailyIds(date, locations)`; `loadDaily` uses it in both branches.
- `assets/daily-pins.json` (tracked): `{"v":1,"pins":{"YYYY-MM-DD":[5 ids],...}}`, one date per line. Shipped initially empty; the first `deploy.sh` run fills it from live.
- `scripts/pin-daily.mjs`: the pin step (§1). Window W = UTC date of (now − 12h) through UTC date of (now + 14h) + 1 day. Live read = production `index.html` → its `src/main.js?v=…` → `src/daily.js` (if imported) + the versioned `locations.json` + the versioned `daily-pins.json` if present; live game per date = live pin if present, else production's own `dailyIds` run in node via `scripts/lib/deployed-daily.mjs` (now tracked). Never overwrites an existing pin (warns if one differs from live). Applies substitution to every pinned date against the working-tree pool. Writes and commits only `assets/daily-pins.json` (`git commit -- assets/daily-pins.json`, so nothing else staged is swept in); it does not push. Flags: `--dry-run` (report only), `--pins-file <path>` (write elsewhere, no commit). Any production read failure → exit 1.
- `deploy.sh`: runs `node scripts/pin-daily.mjs` right after the `.vercelignore` guard and before the deploy dir is built; non-zero aborts the deploy. Everything else is unchanged.
- Archived to `archive/daily-freeze/`: `daily/` (the old `assets/daily/`: month files, `index.json`, `retired-locations.json`), `build-daily-schedule.mjs`, `backfill-daily-2026-10.mjs`, `archive-daily.py`. Nothing outside the archive references them.

**Verification (measured 2026-10-12 ~21:54 UTC, node 24)**
- `node --check --input-type=module` passes on `src/daily.js`, `src/main.js`, `scripts/pin-daily.mjs`, `scripts/lib/deployed-daily.mjs`; `bash -n deploy.sh` passes.
- Refactored `dailyIds` vs production's live `src/daily.js`: identical on all 730 dates of 2026-2027, on both the live pool and the local pool (738 locations each). `resolvePinnedIds` returns the pin unchanged when every slot resolves (same 1,460 cases).
- Substitution test (local pool, 2026-10-12 game, one slot dropped at a time for R1/R3/R5, then R2+R4 together): only the dropped slot(s) changed, each substitute came from the same band, all 5 countries stayed distinct, and repeated calls gave the same result.
- Dry run against production (`main.js?v=d1013138eb66`, `locations.json?v=3cc57dcff303`, no live pins file): W = 2026-10-12, 10-13, 10-14; 0 substitutions needed against the local pool. Pacific today (2026-10-12) would pin `hamburg-germany, san-salvador-sv, port-harcourt-ng, st-johns-antigua-and-barbuda, salta-ar`. An independent run of production's `daily.js` on production's `locations.json` with production's `localDateKey` under `TZ=America/Los_Angeles` gave the same 5 IDs.
- Append-only: a real run into a scratch copy pinned the 3 dates; a second run printed "Pins unchanged." and the file hash was identical. A forced bogus pin for 10-13 was kept (not overwritten by live) and its unresolvable slots were substituted.
- `deploy.sh`'s versioning loop, applied to the pins file, rewrites the URL to `assets/daily-pins.json?v=<hash>` and stamps the real size.
