# Lifecycle report: Astra step 2, production page lifecycle (behind `?pages=1`)

Branch `page-lifecycle`, built on `main`@`35063ac` (the banked diagnostic
patch). Authority: `BRIEF-page-lifecycle.md` and `docs/zoom-astra-decision.md`
Order and scope item 2. No deploy, no flag removal, no seam/source repair —
all out of scope per the brief and left untouched.

Four phase commits, each independently green:

1. `a2c163d` — exclusive imagery ownership (requirement 1) + the over-cap
   fallback gap in requirement 3 + two staleness guards.
2. `1f52b8e` — readiness-gated input at round start (requirement 2).
3. `ab8000c` — new unit tests for the above, plus requirement 4 (resource
   bounds); found and fixed a real pre-existing eviction bug.
4. `54138b6` — the swiftshader mechanism harness and its evidence.

## What was built, per requirement

### 1. Exclusive imagery ownership

New pure module `src/globe/page-lifecycle.js`: an `idle` / `preparing` /
`active` state machine. `src/globe/page-render.js`'s `preparePageRound`
calls `beginPagePreparation()` the instant a round commits to the page path
(before any fetch for it begins) — this synchronously invokes a registered
callback that aborts whatever the legacy inset driver (`surface.js`) has in
flight (`insetsOff()`: aborts in-flight fetches/bundle, clears the queue,
nulls `inset.win`), then marks the state `preparing`. `markPageRoundActive()`
moves it to `active` once the round is resident and rendering;
`endPageLifecycle()` returns it to `idle` on fallback, failure, or flag-off.

`src/globe/surface.js`'s `updateSatellite(dt)` previously only skipped the
legacy driver once a page round was already *resident*
(`pageRenderActive()`); it now skips it for the whole `preparing`+`active`
window via `pageLifecycleBusy()`, closing exactly the risk the Astra
decision memo flagged ("the ungated inset driver could run alongside pages
when the camera drifts with satellite imagery live"). `page-lifecycle.js`
never imports `surface.js` — `surface.js` registers its own `insetsOff` via
`registerLegacyAbort()`, the same import-cycle-avoidance convention
`page-render.js` already used for `sampleInsetView`.

Already-in-flight legacy work that can't be synchronously aborted (a decode
already past the fetch) is handled by code that predates this build:
`decodeInsetTile`'s `stale()` check (`inset.win !== win`) bails without
queuing an upload, and `pumpInsetUploads`/bundle handlers carry the same
check — once `insetsOff()` nulls `inset.win`, nothing stale can land as
visible tile work. This build's job was making sure the legacy driver is
never *running* in the first place during preparation, which `updateInsets`
being skipped now guarantees.

### 2. Readiness-gated input

`src/game/round.js`'s `showRound()`: for a round with coordinates while the
flag is on (`pagesGate = pagesEnabled() && hasCoords`), `window.__canGuess`
is set `false` immediately and the guess hint reads "Preparing imagery…".
`preparePageRound(item)`'s returned promise is tracked; once it settles
(ready, round-boundary fallback, or failure — whichever the lifecycle
reaches), a guarded callback sets `__canGuess = true` and restores the
normal hint. The guard (`mySeq !== roundSeq || state.gameMode !== 'guess'`)
is a per-call sequence number, not a token reused from `page-render.js`,
so a superseded round's late resolution can never re-admit input or touch a
round that has already moved to `reveal`.

Input gating itself needed no new code: `src/globe/pin.js`'s
`placeGuessPin` already starts with `if (!window.__canGuess) return;` — an
immediate tap during preparation is silently dropped, never accepted as a
guess, never triggers any loading itself (loading was already decoupled
from input in this codebase), and never stalls anything.

Flag off, or no coordinates (Borders, etc.): `pagesGate` is `false`,
`__canGuess` is set `true` synchronously exactly as before, and the
`.then()` branch never runs at all — zero behavior change, verified by the
harness and by the unchanged flag-off test coverage.

### 3. Round-boundary fallback

`preparePageRound` already had the three fallback branches (manifest load
failure, out-of-coverage, prepare failure); this build:

- Added the missing **over-cap** branch. `src/globe/page-plan.js`'s
  `selectRenderPath` previously admitted any in-coverage plan into pages
  regardless of `fit.all`. It now returns `{ path: 'tiles', reason:
  'over-cap' }` when an admitted plan would exceed a cap, so an over-cap
  plan takes the explicit tile path without partially entering pages
  (brief requirement 3 names this explicitly as a fallback trigger; the
  code did not yet implement it). Unit-tested in `test/page-plan.test.mjs`.
- Fixed two **no-stale-activation** gaps: the manifest-load-failure catch
  branch and the prepare-failure catch branch did not check
  `token !== roundToken` before acting, so a superseded round's late
  failure could emit a phantom `page-round` trace mark and (after this
  build's lifecycle wiring) incorrectly reset a *newer* round's lifecycle
  state to idle. Both now check staleness first and do nothing if a newer
  round already owns the token.
- Every fallback and failure path reaches an explicit mark
  (`traceMark('page-round', { path: 'tiles', reason, ... })`) and resolves
  `preparePageRound`'s promise, so `round.js`'s readiness gate always
  recovers — never a silent stall.

### 4. Resource bounds

`PAGE_TEXTURE_CAP = 40`, `PAGE_TRANSFER_CAP_BYTES = 3,145,728` (3 MiB/round),
`PAGE_RESIDENCY_CAP_BYTES = 67,108,864` (64 MiB) — unchanged from the pilot
(`src/globe/page-plan.js`); admission now requires all three to pass
(`fit.all`), not just coverage.

The round-transition mechanics (`src/globe/page-store.js`'s
`prepareRoundPages`/`releaseRoundPages`, backed by `src/globe/page-cache.js`)
were already structurally correct: pin the new plan, evict, unpin the old
round, evict again, dispose GPU textures for whatever gets evicted. Writing
a round-transition-shaped test for it
(`test/page-cache.test.mjs`, "round transition: the previous round's pinned
plan is released and evicted once the new round pins its own") exposed a
real, previously-undetected bug in `page-cache.js`'s `evict()`: the break
condition compared `entries.size - evicted.length` against the cap, but
`entries.size` is a live `Map.size` that already reflects every
`entries.delete()` the same loop performs — subtracting `evicted.length` on
top double-counted every deletion. Any single `evict()` call needing two or
more evictions stopped after roughly half of what the cap required,
leaving the cache resident *over* budget after exactly the kind of
transition requirement 4 describes (verified: 6 entries, cap 3, 3 pinned +
3 unpinned → old code evicted only 2, leaving 4 resident; fixed code evicts
all 3, landing exactly on budget). None of the five pre-existing
`page-cache.test.mjs` cases ever needed a two-eviction call, so this had
gone unnoticed. Fixed by comparing `entries.size` alone. All pre-existing
cache tests still pass unchanged.

`fetchDecodeUpload` (`page-store.js`) already short-circuits on
`resident.has(asset.key)` before any span is emitted, so warm repeats of a
still-resident identical plan were already zero-load; this build's harness
confirms it end-to-end (Madrid round 2, see below: `pageSpanCount: 0`).

### 5. Flag-off parity

No behavior changed for the flag-off path: `preparePageRound`'s first
branch (`!pagesEnabled()`) is untouched except for also calling the new
`endPageLifecycle()` (a no-op reset when nothing was ever begun), and
`round.js`'s `pagesGate` is `false` so `__canGuess` is set `true`
synchronously exactly as before. `s2gm2025`'s inset ladder
(`[5, 7, 8, 9]`), z6 exclusion, and z6's stored objects were not touched by
any change in this build.

## Test results

Full suite: `node --test test/*.test.mjs` → **180/180 pass** (172
pre-existing + 8 new: 6 in `test/page-lifecycle.test.mjs`, 1 in
`test/page-plan.test.mjs` (over-cap fallback), 1 in `test/page-cache.test.mjs`
(round-transition resource bound)).

```
ℹ tests 180
ℹ pass 180
ℹ fail 0
```

New pure-logic coverage (no browser needed, same convention as the existing
`page-cache.test.mjs`/`page-plan.test.mjs`):

- `test/page-lifecycle.test.mjs`: the idle/preparing/active state machine —
  `beginPagePreparation` invokes the registered legacy-abort callback
  exactly once and claims `preparing`; `markPageRoundActive` moves to
  `active` with the legacy driver still suppressed; `endPageLifecycle`
  returns to `idle` from either state; a second `beginPagePreparation`
  while still busy aborts legacy work again; no registered callback never
  throws.
- `test/page-plan.test.mjs`: an admitted plan with one asset inflated past
  `PAGE_TRANSFER_CAP_BYTES` (at one of Madrid's own resolved z9 keys, not
  an unrelated manifest entry) takes the tile path with
  `reason: 'over-cap'`; the unmodified manifest for the same window still
  resolves pages, confirming the cap — not something else — decided it.
- `test/page-cache.test.mjs`: the round-transition/eviction-bug test above.

`readiness gating`, `round-boundary fallback on failure and on coverage
gap`, `no late activation after fallback or after a newer round`, `inset
suppression during page preparation and active page rounds`, and `warm
repeat` are integration behaviors of `round.js` + `page-render.js` +
`surface.js` together — all three depend on THREE/DOM/`createImageBitmap`,
which is why this codebase has never unit-tested this layer directly (there
was no `page-store.test.mjs` or `page-render.test.mjs` before this build
either; browser-dependent lifecycle logic here is exercised by the
Playwright probe, same as `scripts/sat/page-trace-probe.mjs` already did
for step 1). This build's new harness (below) covers exactly those five
items with real, asserted, pass/fail checks against the actual production
code — not a mock.

## Harness evidence (swiftshader, mechanism only, no deploy)

`node scripts/sat/page-lifecycle-harness.mjs` — new script, drives the
real `src/game/round.js` `showRound()` (not a reimplementation) for Madrid,
Congo, a coverage-gap round, a forced-failure round, a warm repeat, and a
superseded round, in the full booted game (same same-origin static-file
routing as the existing probe). **24/24 checks pass**; full output at
`docs/zoom-stage2-evidence/pilot-trace-evidence/lifecycle-harness-results.json`,
raw traces alongside it (`lifecycle-*-trace.json`).

| Check | Result |
|---|---|
| Madrid: immediate input is gated | `__canGuess=false` right after `showRound()` |
| Madrid: preparing state is shown | hint = "Preparing imagery…" |
| Madrid: readiness reached, no stall | pass |
| Madrid: page path active once ready | `pageRenderActive()=true` |
| Madrid round 1: zero page spans after first input | `postInputPageSpanCount=0` |
| Madrid: zero legacy tile spans in the whole trace | `totalLegacyTileSpans=0` |
| Madrid round 2 (warm repeat): zero page asset loads | `pageSpanCount=0` |
| Congo: immediate input gated, resolves pages, zero post-input page spans, zero legacy spans | all pass |
| Coverage-gap: explicit fallback (`path=tiles`, `reason=z9-gap`), readiness recovers, zero page spans | all pass |
| Forced-failure: explicit fallback (`path=tiles`, `reason=prepare-failed`), readiness recovers, page path never activates | all pass |
| Superseded round: the newer round (Congo) ends up active, not the stale one; input admitted once it settles | pass |

Independently confirmed for the coverage-gap trace (not just trusted from
the report): all 28 legacy tile-pipeline spans start strictly *after* the
`page-round` fallback mark at t=4193.7ms (first legacy span at t=5528.3ms,
zero before) — ownership was never held by the legacy driver during the
decision window, and correctly returned to it once the round explicitly
fell back.

Also reran the pre-existing `scripts/sat/page-trace-probe.mjs` against this
build (same tool the Astra decision memo's "first implementation step"
named for step 1), through `scripts/sat/page-trace-report.mjs`:

- Madrid: 24 textures, 72 page spans, 0 post-input, 0 legacy spans —
  matches the memo's historical 72-span accounting exactly.
- Congo: 22 textures, 66 page spans, 0 post-input, 0 legacy spans —
  matches the memo's historical 66-span accounting exactly.
- Outside coverage: `path=tiles`, `reason=z9-gap`, 0 page spans, 28 legacy
  spans (all after the fallback, see above).

One reporting nuance, not a defect: `page-trace-report.mjs` starts a new
"round" entry at every `page-round` mark (its own documented convention
from step 1). A prepare-failure round emits two marks (commit-to-pages,
then fall-back), so it shows as two report entries; the harness reads the
*last* one for the outcome. This pre-dates this build (`page-store.js`'s
prepare-failed branch already emitted both marks before this brief) and
`page-trace-report.mjs` is explicitly out of scope to change further here
(step 1 is banked and closed) — noted for anyone reading the raw report
output directly.

## Runtime-fetch checklist (the pilot-manifest-404 lesson)

This build added or moved **zero** runtime fetch paths — all fetches below
are unchanged from the banked pilot/step-1 code, re-verified here because
the brief requires it regardless:

| Fetch | Source | Published by `deploy.sh`? |
|---|---|---|
| `/assets/pages-pilot/revision-manifest.jsonl` | `page-manifest.js` | yes |
| `/assets/pages-pilot/feasibility/manifest.json` | `page-manifest.js` | yes |
| `/assets/pages-pilot/revision/{z}/{x}/{y}.jpg` | `page-manifest.js` (Z9_URL_BASE) | yes |
| `/assets/pages-pilot/pilot/{z}/{x}/{y}.jpg` | `page-manifest.js` (CONTEXT_URL_BASES[0]) | yes |
| `/assets/pages-pilot/revision/{z}/{x}/{y}.jpg` (context fallback) | `page-manifest.js` (CONTEXT_URL_BASES[1]) | yes |
| `/assets/pages-pilot/feasibility/{key}.jpg` | `page-manifest.js` (FEASIBILITY_URL_BASE) | yes |

Confirmed against `deploy.sh`: its asset-copy loop (`for f in
"$SCRIPT_DIR"/assets/*; do ... cp -r "$f" "$DEPLOY_DIR/assets/"; done`)
excludes only `*.bak`, `*.pre-*`, `world.geo.json`, `world-10m.geo.json`,
`image-audit`, and `difficulty` — `pages-pilot` matches none of those, so
the whole directory (`feasibility/`, `pilot/`, `revision/`,
`revision-manifest.jsonl`, `pilot-manifest.jsonl`) ships as-is. All files
referenced above exist on disk at those paths today.

## Deviations from the brief

None. Every required-behavior item (1–5) and every verification item is
implemented and checked above. Out-of-scope items (flag removal, deploy,
seam/source repair, EOX changes, renderer residency/loading-policy changes
beyond the lifecycle rules, page geometry/zoom-set changes) were not
touched; the one code change outside the four numbered requirements
(`page-cache.js`'s eviction fix) is a bug fix directly in service of
requirement 4, not a policy change, and is covered above.
