# R2 satellite tiles not changing on zoom: diagnosis

2026-10-10 · Opus 5.5 (diagnosis only, no code changed)

## TL;DR

**Root cause: the R2 tile domain sends no CORS headers.** The client loads tiles with
`fetch(url, { mode: 'cors' })` (`src/main.js:1102`). Chrome blocks every response, so no
detail tile ever reaches the inset textures. After the first burst of failures the client's
circuit breaker pauses all tile loading for 60 s, then 120 s, up to 8 min. What Sean sees at
every zoom level is the local 2k Blue Marble base texture alone, which is why it "shows the same
thing zoomed out or in".

The URL format, z/x/y order, harvest mapping, R2 paths and zoom-selection logic are **all
correct**.

**Second issue, which shows up once CORS is fixed:** the missing ocean tiles return 404, and
the breaker counts each 404 as a failure. Coastal or ocean views get 5 404s in a row, the
breaker trips, and loading stalls again.

## How this was measured

All checks were run directly by Opus. The live site (`src/main.js?v=6d988ac80724`) is identical
to local `demo/src/main.js` in the tile code; the only differences are asset `?v=` hashes and the
daily schedule.

| Check | Method | Result |
|---|---|---|
| R2 vs EOX bytes | curl R2 `tiles/{z}/{x}/{y}.jpg` and EOX `g/{z}/{y}/{x}.jpg` for 5 nested tiles over the Alps (z4 to z8) | 3/5 are byte-identical (same md5). The other 2 EOX downloads were cut short by this box's proxy (IncompleteRead), not a mismatch |
| Swapped order | EOX `g/{z}/{x}/{y}` for the same tiles | Different images (other md5s), so the swap would be wrong. The current mapping is right |
| Tiles differ by zoom | Visual montage (`tile-debug/montage-r2-vs-eox.jpg`) | z4 Europe, z5 SE France and Corsica, z6 Swiss Alps, z7 Swiss plateau, z8 Lake Constance. They nest correctly |
| CORS headers | `curl -H "Origin: https://www.where-on.earth"`, and Node `fetch` with browser-like headers | No `Access-Control-Allow-Origin` on GET (cache HIT or MISS). `OPTIONS` preflight returns **403** |
| Real browser | Playwright + Chromium (390x844), live site, Endless round, mouse-wheel zoom in 8 steps and out 3. **Real network**: Chrome sent through a local CONNECT relay (`tile-debug/relay.mjs`), no request interception | Console: `Access to fetch at 'https://tiles.where-on.earth/tiles/5/14/13.jpg' ... blocked by CORS policy: No 'Access-Control-Allow-Origin' header`. 7 requests, **7 failed, 0 succeeded**, LRU stays at 0 tiles |
| Zoom selection | `window.__sat.inset` sampled after each zoom step | Correct: z5 → z7 while zooming in, z4 → off while zooming out. Windows rebuild as expected (gen 1→2→3) but stay `queued: 48, inflight: 0` because `pausedFor` is about 58 s from the breaker |

### A trap worth knowing for future tests

My first browser run sent traffic through `page.route()` + `route.fulfill()`, and it *appeared*
to load tiles with `access-control-allow-origin: https://www.where-on.earth`. That header was
injected by Playwright: `playwright-core/lib/server/network.js:289-292` adds ACAO to any
fulfilled CORS response that lacks it. **Intercepted Playwright runs cannot detect CORS bugs.**
That run was still useful, though, because it behaves like the post-CORS-fix world (see below).

## Failure chain (real browser)

1. The camera settles. `pickInsetWindow` picks the right z (`src/main.js:955`), and
   `startInsetWindow` builds correct URLs `tiles/{z}/{x}/{ty}.jpg` (`:997`).
2. `fetch(..., { mode: 'cors' })` (`:1102`): R2 returns 200 with no ACAO header, and Chrome
   rejects it with a TypeError.
3. `.catch` (`:1118`): `++inset.fails >= 5` → `tripInsetBreaker()` → `pausedUntil = now + 60 s`
   (it doubles per trip up to 480 s and only resets on a success, which never happens).
4. `pumpInsetFetches` returns early while paused (`:1129`). New windows on zoom are created but
   never fetched, and the top inset buffer is cleared (alpha 0).
5. The shader shows `uSatBase` (Blue Marble 2048x1024) wherever the insets are empty, which is
   everywhere. The result looks identical at every zoom.

Why Esri worked: Esri's tile server sends `Access-Control-Allow-Origin: *` and has imagery for
ocean tiles. R2 does neither by default.

## Secondary issue: ocean 404s trip the breaker

This came from the intercepted run, where Playwright-injected CORS effectively simulates
"CORS fixed". On the first round (Valley of Kings, but the initial view was around the Canary
Islands at z7) there were **20 × 404 and 18 × 200**. `pausedFor: 55520` shows the breaker
tripped within about 4 s. Because of that, the z7 window never finished (`visLeft: 8` stuck),
and when the zoom changed no new window loaded for about 60 s.

- The ~3,635 missing ocean tiles are intended, but the client treats 404 as a hard failure:
  it counts toward the 5-in-a-row breaker and is retried once (`INSET_TRIES = 2`), so every
  ocean tile costs 2 requests.
- Any coastal or island location will keep stalling detail loading even after CORS is fixed.

## Recommended fixes (not applied)

1. **R2 CORS policy** on bucket `where-on-earth-tiles` (dashboard → R2 → bucket → Settings →
   CORS), for example:
   ```json
   [{ "AllowedOrigins": ["https://www.where-on.earth", "https://where-on.earth"],
      "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }]
   ```
   (Add the preview or localhost origins if needed, or use `"*"`. These are public tiles.)
2. **Purge the Cloudflare cache** for `tiles.where-on.earth` after adding CORS. Edge copies
   were cached without ACAO with `max-age=31536000, immutable`, and the response has no
   `Vary: Origin`. Cache-busting the client URL (e.g. `?v=2`) also protects browsers that
   already hold a cached copy without ACAO.
3. **Treat 404 as "no tile" in the client:** call `finishInsetTile` immediately, with no retry,
   don't increment `inset.fails`, and ideally keep a small negative cache. Alternatively, upload
   a solid ocean placeholder JPG for the missing keys, or serve one from a Worker on 404.
4. Verify in a real browser **without `route.fulfill`** (use `tile-debug/relay.mjs` +
   `tile-debug/tile-probe-real.mjs`). Expected result: `lru` grows, `ready: true`, and z
   changes in the network log.

## Other notes

- **Credential exposure:** `/tmp/harvest2.py` contains the R2 access key and secret in plain
  text. /tmp is wiped without warning, and the keys shouldn't live in a script anyway. Move
  them to an env file outside the repo, and consider rotating them if the script was shared.
- **Stale comment:** `src/main.js:744` still says "Esri provider used only by the detail
  insets".

## Artifacts (`demo/docs/tile-debug/`)

- `montage-r2-vs-eox.jpg`: top row R2, bottom row EOX (black cells are the proxy-truncated
  downloads)
- `network-log-real.txt`, `real-zoom-*.png`: faithful real-network run (CORS failures)
- `network-log.txt`, `zoom-*.png`, `zoom-strip.jpg`: intercepted run (simulates "CORS
  fixed"; shows the 404 breaker trips)
- `tile-probe.mjs`, `tile-probe-real.mjs`, `relay.mjs`: probes. Copy them into
  `~/workspace/map-game/shots/passport/` to run (that's where `playwright` resolves), and start
  `relay.mjs` first for the real run.
