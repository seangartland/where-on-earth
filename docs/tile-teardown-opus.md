# R2 tiles load briefly, then revert to the base layer: diagnosis + fix

2026-10-10 · Opus 5.5 (diagnosed, fixed in `src/main.js`, validated in a real browser; not committed or deployed)

## TL;DR

Two causes combine. Both are now fixed client-side.

1. **Cloudflare's edge still serves pre-CORS copies of the tiles.** Tiles cached before Sean
   added the CORS policy come back as `cf-cache-status: HIT` **without**
   `Access-Control-Allow-Origin`. Tiles nobody had requested yet come back as `MISS` **with** ACAO.
   So a view gets a mix: a few tiles load and the rest fail CORS. Five failures in a row trip the
   breaker, which pauses loading for 60 s. Browsers that fetched a tile before the CORS change also
   hold their own copy without ACAO (`max-age=31536000, immutable`), so purging the edge alone
   would not fix their caches.
2. **A partly loaded window gets wiped on the next rebuild.** `startInsetWindow` only kept the top
   buffer if its window was `ready`. Otherwise it called `clearInset()` on the buffer that was on
   screen. A window with any failed or 404 tile was never `ready`, so the next zoom step or idle
   drift erased the tiles that had loaded. The 404 change in c94f66f made this worse: a 404 tile
   returned `null` and was never finished, so **any** visible ocean tile kept its window from ever
   becoming `ready`.

Not the cause: `insetsOff()` is never called in the repro (`mixB` stays 1.00 the whole time).
The gen does increment, but that is the normal rebuild on zoom or drift. The bug was that a
rebuild wiped the buffer that was on screen.

## Reproduction (live site, before fix)

Method: Playwright + Chromium at 390×844, real network through the CONNECT relay (no
`route.fulfill` on tiles, so CORS is checked for real). Endless round, wheel-zoom in 5 steps,
then hold. `window.__sat.inset` sampled every 500 ms. Probe: `tile-teardown/td-probe.mjs`.

curl confirmation (same tiles, `Origin: https://www.where-on.earth`):

| Tile | cf-cache-status | ACAO |
|---|---|---|
| 5/14/13, 6/33/22, 4/8/5 | HIT | **missing** |
| 7/66/45, 8/133/90 (404) | MISS | `https://www.where-on.earth` |
| 5/14/13`?cb=…` | MISS | `https://www.where-on.earth` |

Live run (`tile-teardown/live-log.txt`): **2 × 200, 7 × CORS-blocked**. State trace:

```
29774 gen=1 z=5 vis=12 lru=0 paused=0     mixB=0.10   window starts
32208 gen=1 z=5 vis=10 lru=2 paused=59599 mixB=1.00   2 tiles on screen, breaker tripped
40881 gen=2 z=7 vis=24 lru=2 paused=50923 mixB=0.22   zoom -> gen1 not ready -> top buffer CLEARED
... gen 3, 4, 5 during hold, each one clears the buffer again; mixA stays 0 (nothing underneath)
```

This matches what Sean saw: the detail appears for a moment, then it's gone.
Screens: `tile-teardown/strip-live.jpg`, `strip2-live.jpg` (only blurry Blue Marble at every zoom).

## Fix (`src/main.js`)

1. **Cache-bust the tile URL** (`?v=2`, SAT_PROVIDERS): a new cache key at the edge and in every
   browser, so each tile is fetched fresh with ACAO. Verified: 112/112 requests went to `?v=2`
   with 0 CORS failures.
2. **404 = done:** a 404 now calls `finishInsetTile` (the base shows there), resets the failure
   streak, and adds the key to `inset.missing` so it is never fetched again. `feedInsetWindow`
   finishes known-missing tiles right away. Coastal and ocean windows can now become `ready`.
3. **Never wipe what is on screen:** each window counts `loaded` tiles. `startInsetWindow` swaps
   buffers when the top is ready, **or** when it has loaded tiles and the buffer underneath isn't
   a complete window. The partial window then stays underneath until the new one completes. It is
   refilled in place only when it shows nothing, or when a complete window underneath already
   covers the view.

Also fixed the stale "Esri provider" comment. Syntax was checked in both modes
(`node --check` and `--input-type=module`).

## Validation (patched build, real tile network)

Method: same probe. The patched local `demo/` is served at the real origin
`https://www.where-on.earth` via `route.fulfill` on the **site** URLs only, so the browser sends
the real Origin. Tile requests are **not** intercepted, so real R2/Cloudflare CORS applies.
`/assets/version.txt` is stubbed to 404 because the live version stamp otherwise triggers the
reload loop in index.html.

**Run A, normal network** (`fixed-log.txt`, `strip-fixed.jpg`, `strip2-fixed.jpg`): 43 × 200,
69 × 404 (Cape Verde, mostly ocean), **0 failures, 0 breaker trips**.
```
32536 gen=1 z=5 vis=0 ready=true lru=14 mixB=1.00
42407 gen=2 z=7 vis=0 ready=true lru=41 mixA=0.58 mixB=1.00   z7 lands, z5 crossfades out underneath
63758 gen=3 z=7 ready=true mixA=0.90 mixB=0.35                drift rebuild: old window stays under the new
84816 gen=4 z=7 ready=true mixB=1.00                          still full detail 23 s after the last zoom
```
The screenshots show the Cape Verde islands in sharp EOX detail at z5 and z7. They stay visible
until the globe's idle drift carries them off-screen.

**Run B, forced failures** (`FLAKY=2`: every even tile column aborted, a real network error):
this checks fix 3 without relying on the cache-bust.
```
32663 gen=1 z=5 vis=4 ready=false lru=8 paused=58886 mixA=0.00 mixB=1.00   partial + breaker tripped
43318 gen=2 z=6 vis=6 ready=false        paused=48231 mixA=1.00 mixB=0.35  rebuild: partial gen1 moved UNDER
```
Before the fix, the identical state (live run at 40881) gave `mixA=0.00`: the tiles were wiped.
`strip-flaky.jpg` shows the loaded islands surviving the rebuild, with the forced-failure stripes
in between.

## Not fixed / follow-ups

- **Purge the Cloudflare cache** for `tiles.where-on.earth` anyway. With `?v=2` the old edge
  entries are unused, but purging is free and helps if the query string is ever dropped.
  `Vary: Origin` on cached entries is fine because the apex `where-on.earth` 308s to www, so www
  is the only origin.
- **Cosmetic seam:** EOX ocean pixels are darker than the Blue Marble ocean. Where 404 tiles leave
  gaps, the inset edge shows as a visible rectangle in open ocean (`strip2-fixed.jpg`). Could be
  softened by tinting the base or uploading a solid ocean tile for 404 keys. This is a taste call
  for Sean.
- **Deploy:** the change is in the working tree only (not committed, pushed or deployed), per the
  batch-deploy rule. Sean needs to retest on his phone after deploy. A phone that already
  holds pre-CORS tiles in its HTTP cache is exactly the case `?v=2` covers.

## Artifacts (`demo/docs/tile-teardown/`)

- `td-probe.mjs`: probe. Copy it into `~/workspace/map-game/shots/passport/` (where playwright
  resolves) and start `relay.mjs` (from `docs/tile-debug/`) first. Env: `LOCAL=<demo dir>` serves
  the patched build, `TAG=`, `FLAKY=<n>`.
- `live-*`, `fixed-*`, `flaky-*`: per-step PNGs and 500 ms state/network logs.
- `strip-live.jpg` / `strip-fixed.jpg` (initial → z5 → z7 → hold), `strip2-*.jpg` (z7 detail over
  time), `strip-flaky.jpg`.
