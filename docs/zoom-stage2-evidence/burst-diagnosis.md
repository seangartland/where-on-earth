# Burst diagnosis: the 66-event "tile burst" at Congo prep

Read-only diagnosis per BRIEF-burst-diagnosis.md. No game code changed.
Evidence: `sean-trace.json` (Sean's phone trace, gitignored scratch, not
committed), read via `node scripts/sat/page-trace-report.mjs sean-trace.json`
and direct queries against the raw event array with
`scripts/sat/zoom-trace-report.mjs`'s `pairSpans`.

## Verdict

The 66 events are not satellite tiles at all, and no tile-pipeline mechanism
fired. They are page-store's own one-time load of Congo's 22 page assets
(`src/globe/page-store.js`'s `fetchDecodeUpload`), which happens to emit
spans typed `tile-fetch` / `decode` / `upload-submit` — the exact same type
strings the legacy satellite-inset pipeline in `src/globe/surface.js` uses
for its own fetch/decode/upload spans. That is candidate 4, "page-store
itself tracing page loads as tile events (naming collision in the
instrumentation)," and it is the only candidate the evidence supports.
Candidates 1, 2 and 3 are eliminated outright: there is no inset-pipeline
activity anywhere in this trace to be evicted, duplicated, or triggered by a
context layer.

## The decisive count

```
$ node -e '... pairSpans(events) ...'
total pages-pool fetch/decode/upload spans in whole trace: 138
madrid prep window (8000-10500ms):  72   (= 24 textures x 3 phases)
congo1 prep window (37000-38000ms): 66   (= 22 textures x 3 phases)
congo2 prep window (46000-47500ms):  0   (cache hit, see below)
```

- Madrid's plan reported 24 textures; Madrid's prep window carries exactly
  24 x 3 = 72 `tile-fetch`/`decode`/`upload-submit` spans, all tagged
  `pool: 'pages'`.
- Congo's plan reported 22 textures; the "burst" is exactly 22 x 3 = 66
  spans, all tagged `pool: 'pages'`. The count is not a coincidence next to
  the plan size — it *is* the plan size, times the three load phases
  `page-store.js` traces per asset (`fetchDecodeUpload`, lines 29-49:
  `traceSpanStart('tile-fetch', { src: asset.key, pool: 'pages' })`, then
  `'decode'`, then `'upload-submit'`, each with `pool: 'pages'`).
- Across the *entire* trace — not just the burst window —
  `allTileTypeSpans.filter(pool !== 'pages')` returns **zero** spans. Every
  single `tile-fetch`/`decode`/`upload-submit` event in this session, from
  boot to the end, carries `pool: 'pages'`. The real satellite-inset tile
  pipeline (`loadInsetTile` -> `fetchInsetTile` at `surface.js:1200`,
  `decodeInsetTile` at `surface.js:1152`, the upload in `pumpInsetUploads` at
  `surface.js:1483`) never ran once in this session. There is nothing for
  candidates 1-3 to be eliminated *from* except by this direct absence.

## Why the keys looked like satellite tile keys (and why they didn't match either pin's coordinates under the satellite tile formula)

`src/globe/page-plan.js` explains its own key format at lines 56-59: "Every
page key (z9 at a 2-tile divisor, z7/z5 context at a 4-tile divisor) is a
page-grid index, not a native tile coordinate." `lookupAsset` (line 134)
builds the asset's `key` and fetch URLs directly as `${z}/${x}/${y}`, so a
page-store trace's `src` field is indistinguishable in form from a real
tile's `${z}/${x}/${y}` key — it is one more facet of the same naming
collision.

Running the satellite-tile formula (`tileAt` from `warm-ladder.js`, same
math `surface.js`'s inset code uses) against Congo's actual coordinates
(-0.7, 24.6) at z9 gives tile (290, 256) under the standard 1:1 slippy grid
— nowhere near the observed page keys 143-146/126-129. That mismatch is not
evidence against a tile mechanism; it is confirmation that the keys are
page-grid indices. `page-plan.js`'s z9 page divisor is 2
(`Z9_PAGE_TILES = 2`): native tile x=290 divided by 2 is page column 145,
dead center of the observed 143-146 range, and native y for a near-equator
latitude lands in the 126-129 page-row range the same way. The z7/z5 keys
follow the same divide-by-4 context-page convention
(`CONTEXT_PAGE_TILES = 4`, `pageGridKeysForTileRect`). Every key in the
burst is accounted for by Congo's own z9 footprint (7x8 or 8x7 native tiles
-> page grid) and z7/z5 context windows — not by any inset/satellite window
math.

The `page-round` marks make the target explicit without needing to invert
any tile math at all:

```
t=8824   path=pages  lat=40.4   lng=-3.7   (Madrid)
t=37187  path=pages  lat=-0.7   lng=24.6   (Congo)
t=46251  path=pages  lat=-0.7   lng=24.6   (Congo, second pin)
```

## Timing confirms containment, not a parallel mechanism

The burst's first event and `page-prep`'s span start are the same
millisecond (37187) because they are the same call: `preparePageRound` ->
`prepareRoundPages` -> `Promise.all(allAssets.map(fetchDecodeUpload))`. The
burst's last event (37690/37691) lands right at the brief's "Congo prep
resident mark." The 66 events don't start *before* or persist *after* the
page-prep span — they are its entire body. There is no separate mechanism
running concurrently with page-prep; there is nothing left over once
page-prep's own fetch/decode/upload accounting is subtracted.

The second Congo pin (t=46251) shows **zero** tile-type spans because
`fetchDecodeUpload` checks `resident.has(asset.key)` first (page-store.js
line 30) and returns the cached entry instantly when the same 22 keys are
already resident — exactly the cache-hit behavior you'd expect from a
plain asset loader, and further confirmation this has nothing to do with
inset/tile eviction or re-fetching.

## Candidate-by-candidate

1. **Page-cache eviction forcing a tile fallback for the still-visible
   Madrid window.** Eliminated. Madrid's own window shows zero tile-type
   spans for ~25s of interaction (confirmed above: the only spans in that
   period are Madrid's own pre-input prep, pool `pages`, 72 of them,
   finished at 9793ms, well before first input at 11688ms). Nothing fires
   for Madrid again. There is no fallback-to-tiles event (`page-round`
   marks only ever show `path: 'pages'` for in-coverage pins in this trace)
   and no non-`pages`-pool tile span anywhere, so there is no eviction
   causing a fetch of anything, let alone Madrid's.
2. **A legacy prefetch path (round-start/inset prefetch) firing for the pin
   target in parallel with page prepare.** Eliminated by the same absence:
   zero non-`pages`-pool tile-type spans anywhere in the trace. The
   candidate mechanisms that would produce such spans — `updateInsets` /
   `evaluateInsets` / `startInsetWindow` (the continuously-running per-frame
   inset pipeline, which is in fact never gated off by `pagesEnabled()` or
   `pageRenderActive()` and in principle *could* run in parallel with page
   rendering) and the `?warm=ladder` experiment arm (`scheduleWarmLadder`,
   which separately traces its fetches as `speculative-fetch`, not
   `tile-fetch`) — left no trace of having fired. This is worth flagging as
   a latent risk even though it isn't what happened here: nothing in
   `surface.js` stops the inset pipeline from running underneath an active
   page round, so a trace from a session where the camera *does* drift
   during a page round (unlike this one, where `satTarget` was presumably
   never pushed to 1 for the satellite layer under `?pages=1`, or the
   camera simply never moved far enough to invalidate the home-fill window)
   could show a genuine candidate-2 event. See "production risk" below.
3. **The base-globe/context layer loading its own tiles on a view-state
   change.** Eliminated for the same reason as #2: no non-`pages`-pool
   tile-type span exists in the trace to attribute to it.
4. **Page-store tracing page loads as tile events (naming collision).**
   Confirmed. Exact count match (22 x 3 = 66), exact timing containment
   inside the `page-prep` span, exact `pool: 'pages'` tag on every event,
   exact key-format match to `page-plan.js`'s documented page-grid
   convention, and the cache-hit (zero-event) behavior on the second pin —
   every piece of evidence is consistent with this and only this.

## A second, compounding bug: the report script's global "first input"

Even granting that the 66 events are legitimate page-asset loads and not a
tile burst, the brief's framing ("ZERO tile-pipeline events during ~25s of
Madrid interaction" vs. "a burst... begins" for Congo) comes from
`scripts/sat/page-trace-report.mjs`'s `postInputPagesFetchDecodeUploadCount`
metric, and that metric has its own bug independent of the naming
collision: `firstInput` (line 23) is found once, globally, as the first
`input-start`/`input-wheel` mark in the *entire* trace — Madrid's first tap
at 11688ms. Every later round's `pages`-pool work, including a second
pin's entirely legitimate from-scratch prepare, is then compared against
that single global timestamp (`postInputWork`, line 36-38), not against the
first input *of that round*. Madrid's own prep (72 events, 8824-9793ms)
predates the global first input and is correctly excluded. Congo's prep
(37187-37691ms) necessarily postdates the global first input — it's a later
pin in the same session — so its 66 events are counted as "post-input work"
even though, from Congo's own round's perspective, no input had happened
yet: prep hadn't even started. The metric would flag *every* round after
the first one in a multi-round trace this way, regardless of whether that
round's own prep ever overlapped real interaction.

This means the "burst" is in fact two independent findings stacked: (a) a
real instrumentation naming collision (candidate 4) that makes
page-asset-load spans indistinguishable from tile-pipeline spans by `type`
alone, and (b) a report-script scoping bug that, even for a human reading
only `pool: 'pages'`-filtered output, mislabels a second round's normal
prepare as suspicious "post-input" activity.

## Production question: can this fire mid-round during real interaction?

In a real round, `preparePageRound` is called exactly once, from
`showRound()` (`src/game/round.js:119`), at round start. `page-store.js`'s
own header comment is explicit: "Everything here runs once, at round start,
during the clue dwell; nothing it does is re-invoked by a zoom/pan input."
Confirmed by code: `page-render.js`'s `updatePageRender` only toggles
`mesh.visible` on meshes `preparePageRound` already built (no fetch/decode/
upload in that path, ever), and nothing outside `preparePageRound` calls
`prepareRoundPages`/`fetchDecodeUpload`.

So this is not a mechanism that can be *triggered* mid-round by zoom or pan.
But it can genuinely *overlap* player interaction under one exact
condition: **if the round-start prepare is still in flight when the player
acts.** `showRound()` calls `preparePageRound(item)` without `await` and
sets `window.__canGuess = true` in the same synchronous block — nothing
blocks input while `prepareRoundPages`'s `Promise.all` is still resolving.
Normally the clue-dwell delay before a player can/does act covers this (as
seen here: Madrid's prep finished at 9793ms, 1895ms before the first input
at 11688ms). If the player's first tap lands before prep resolves — a fast
player, a slow network, or a plan near the `PAGE_TEXTURE_CAP`/
`PAGE_TRANSFER_CAP_BYTES` ceiling — the trailing `pages`-pool fetch/decode/
upload spans would genuinely postdate first input, for real, not as a
report-script artifact. The player-visible consequence in that window is
not a fetch storm affecting anything else on screen — it's simply that
`activeRound` is still `null` until `prepareRoundPages` resolves (meshes are
only built after the `await` in `preparePageRound`), so `pageRenderActive()`
is false and no page mesh is shown yet; the globe shows base/satellite only
until prepare catches up.

Separately, the latent candidate-2 risk flagged above stands on its own and
is worth a line item for whoever owns the inset pipeline: `updateInsets`
(the per-frame driver for the legacy satellite-inset system) is called
unconditionally and is never gated by `pagesEnabled()` or
`pageRenderActive()`. Nothing observed in this trace exercised that path
concurrently with an active page round, but nothing in the code prevents it
either — a session where the camera gaze drifts (not just dist/zoom) while
`?pages=1` is active and the satellite layer is also live could produce a
real second fetch pipeline running alongside page-render's. That is a code
read, not something this trace demonstrates; flagging it as unconfirmed.

## Fix proposal (design only)

Two independent, low-risk fixes, both diagnostic-only — neither touches
page-store's caching, eviction, or fetch behavior, so there is no residency
or gameplay cost or risk:

1. **Rename page-store's span types.** Change `page-store.js`'s
   `fetchDecodeUpload` to emit `'page-fetch'` / `'page-decode'` /
   `'page-upload'` (or similar) instead of reusing `'tile-fetch'` /
   `'decode'` / `'upload-submit'`. This removes the naming collision at its
   source for every future trace and every tool that reads one, not just
   this report script. Cost: a handful of string literals in one file, plus
   updating any report/analysis script that currently matches on the old
   type names for page-pool work (at minimum
   `scripts/sat/page-trace-report.mjs`). Risk: none to runtime behavior;
   the only risk is missing a consumer of the old type strings elsewhere
   (grep for `'tile-fetch'`, `'decode'`, `'upload-submit'` filtered to
   `pool === 'pages'` before changing).
2. **Scope `page-trace-report.mjs`'s "first input" per round, not
   globally.** Compute `firstInput` relative to the nearest preceding
   `page-round`/`round-start` mark instead of the trace's very first input
   mark, so a second or later round's legitimate prepare isn't compared
   against an input timestamp from a different round entirely. Cost: a
   small change to `summarizePageTrace` in that one script. Risk: none;
   this is a report-only change.

Doing only #1 would still leave the report script capable of
mis-scoping multi-round traces (the global-`firstInput` bug would just
compare against the new, distinctly-named page spans — which it no longer
would, since it filters by type name, so #1 alone actually *also* fixes the
immediate symptom by making the type filter stop matching page spans at
all; but it would leave the scoping bug latent for anyone who re-adds a
pool-based filter later). Doing only #2 leaves the type-name collision
in place for any other tool or person reading raw trace type strings
without also checking `pool`. Recommend both.
