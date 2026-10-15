# Deploy tooling fix: Phase 5 asset-manifest move

## What was wrong

Phase 5 of the refactor (commits d506b6a..dcc566b) moved the asset LOAD
manifest, locations.json, daily-pins.json, the topo files, out of
src/main.js into src/globe/surface.js. Two deploy-time tools still assumed
those URLs and the daily.js import lived in main.js:

1. scripts/pin-daily.mjs scraped only the fetched main.js text for the
   assets/locations.json and assets/daily-pins.json URLs. Since production
   already runs the Phase 5 build (confirmed live before this fix; the
   deploy that shipped Phase 5 landed separately from this tooling fix),
   main.js no longer contains those strings, so the scrape returned
   undefined and the script failed closed with
   "production main.js has no assets/locations.json URL" on every run.
2. deploy.sh's asset-versioning loop (content-hash ?v= rewrite and the
   LOAD-manifest size restamp) ran its seds against src/main.js only. Both
   were silent no-ops against production: the deployed surface.js served
   plain assets/locations.json with no hash and never had its size
   denominators restamped, so the loader's progress bar could drift and
   browsers could not cache-bust those assets by content.

A related, previously undiagnosed issue surfaced while fixing (1): the
daily.js import itself also moved, from a direct `./daily.js` import in
main.js to `../daily.js` inside src/modes/daily-game.js. pin-daily.mjs's
companion module, scripts/lib/deployed-daily.mjs, detected "does this build
use daily.js" by re-testing mainJs text for that same `./daily.js` pattern,
which no longer matches either.

## The fix

**deploy.sh** (asset versioning loop, same position in the script, before
version-modules.mjs and before main.js is hashed): both seds (the content
hash ?v= rewrite and the LOAD-manifest size restamp) now run against every
.js file under the deploy copy of src/, found recursively with `find
"$DEPLOY_DIR/src" -name '*.js'`, instead of against src/main.js alone. The
set of assets being hashed, and what counts as a match inside a file, is
unchanged; only the target file set widened.

**scripts/pin-daily.mjs**: added a small module-graph walker
(`fetchModuleGraph`). Starting from main.js, it follows every relative
import specifier (`from './x.js'` or `import('../a/b.js')`, each optionally
carrying a deploy-time `?v=hash`), resolves it against the importing
module's own path, and fetches each module once. The asset URLs and the
daily.js-import check now search the union of all fetched module text
(`graphText`) instead of main.js alone. Fail-closed semantics are
unchanged: if no module in the graph contains the locations.json URL, the
script still calls `fail('production module graph has no
assets/locations.json URL')` and exits non-zero. The daily.js source, once
needed, is still fetched from the fixed path `src/daily.js` exactly as
before (that path is absolute from the deploy root and does not depend on
which module imports it).

**scripts/lib/deployed-daily.mjs** (minimal, matching change):
`selectionSource(mainJs, dailyJs)` used to decide whether to use the
supplied `dailyJs` source by re-testing `mainJs` for a `./daily.js` import.
That test is now wrong since the import moved to a submodule that
`mainJs`'s own text never mentions. The function now branches on whether
the caller supplied `dailyJs` at all (`if (dailyJs) { ... }`), since the
caller (pin-daily.mjs) is the one with visibility into the whole module
graph and already decided dailyJs was needed before fetching and passing
it. The two code paths themselves (use dailyJs verbatim minus `export`, or
fall back to extracting inline declarations from mainJs for pre-cutover
builds) are unchanged.

No game code under src/ was touched, except as the sed target set in
deploy.sh. The difficulty scorer and daily selection logic were not
touched.

## Proof

### 1. Reproduced the failure on unmodified tooling

```
$ node scripts/pin-daily.mjs --dry-run
❌ pin-daily: production main.js has no assets/locations.json URL
(exit 1)
```

### 2. After the fix: pin-daily.mjs completes, pins file unchanged

Dry run:

```
Production: https://where-on-earth-game.vercel.app (src/main.js?v=7e5406114b7d, assets/locations.json, 805 locations, pins assets/daily-pins.json)
In-play window at 2026-10-15T20:02:43.231Z: 2026-10-15, 2026-10-16, 2026-10-17
Backfill range: 2026-10-12 .. 2026-10-15 (exclusive)
  2026-10-12  hamburg-germany, san-salvador-sv, port-harcourt-ng, st-johns-antigua-and-barbuda, salta-ar  (already pinned)
  2026-10-13  chicago, nassau-bahamas, carcassonne-cite, lanzhou-cn, kirkenes-norway  (already pinned)
  2026-10-14  paris-france, tallinn-estonia, cartagena, nashik-in, khiva-uzbekistan  (already pinned)
  2026-10-15  rio-de-janeiro-brazil, st-johns-canada, monterrey-mexico, bukhara-uzbekistan, oymyakon-russia  (already pinned)
  2026-10-16  reykjavik-iceland, panama-city, toulouse-france, oaxaca-mexico, funafuti-tuvalu  (already pinned)
  2026-10-17  the-hague-nl, havana, cartagena, vientiane, honningsvag-norway  (already pinned)
Pins unchanged.
(exit 0)
```

Real run (non-dry-run): same output, same "Pins unchanged.", exit 0.

```
sha256sum assets/daily-pins.json
before: 2c9322f033d4ce17a3907f09fb2af76f24974243f38762b77853cde362b17db9
after:  2c9322f033d4ce17a3907f09fb2af76f24974243f38762b77853cde362b17db9
```

`git status --short assets/daily-pins.json` showed no output before or
after: identical file, no diff. Every window and backfill date
(2026-10-12 through 2026-10-17) was already pinned and matched what
production serves, so nothing needed to change.

### 3. Scratch test of the deploy.sh asset-sed fix

Copied src/ and only two assets (locations.json, daily-pins.json) into a
scratch deploy dir, ran a harness replicating the fixed loop (find every
.js under the scratch src/, apply both seds to each):

```
js file count: 32
=== surface.js LOAD manifest after sed ===
  land: { url: 'assets/world.topo.json', size: 970247 },
  islands: { url: 'assets/islands.topo.json', size: 4605 },
  locations: { url: 'assets/locations.json?v=6f2bf9f0070c', size: 539897 },
  coast: { url: 'assets/world-10m.topo.json', size: 1681949 },
  lakes: { url: 'assets/lakes-10m.topo.json', size: 726015 },
  rivers: { url: 'assets/rivers-10m-scalerank.topo.json', size: 1782934 },
  pins: { url: 'assets/daily-pins.json?v=2c9322f033d4', size: 660 },
  countries: { url: 'assets/country-outlines.topo.json', size: 1211450 },
  countryBands: { url: 'assets/country-bands.json', size: 2855 },
=== control file (no asset refs) unchanged? ===
/tmp/woe-sed-scratch/src/core/math.js: OK
```

`locations.json` and `daily-pins.json`, the two assets present in the
scratch dir, gained `?v=` hashes and correct sizes in surface.js. The
other manifest entries (assets not copied into the scratch dir in this
test) were correctly left untouched, and a control file with no asset
references (`src/core/math.js`) was byte-identical before and after.

### 4. Syntax checks

```
$ bash -n deploy.sh && echo OK
OK
$ node --check scripts/pin-daily.mjs && echo OK
OK
$ node --check scripts/lib/deployed-daily.mjs && echo OK
OK
```

## Shipping

- Committed deploy.sh, scripts/pin-daily.mjs, scripts/lib/deployed-daily.mjs
  only (commit 42d3e43), pushed, confirmed on origin/main before deploying.
- Ran ./deploy.sh. pin-daily.mjs reported "Pins unchanged", so no pins
  commit was created or needed to be pushed.
- Deploy id: dpl_2NWmsuyf4kuC17L2G63uKwYSaYdE, state READY.
- deploy.sh's own verification: vendor (three.js) HTTP 200, locations
  805 (expected 805), "Deploy successful".

## Production checks after deploy

- Deployed src/globe/surface.js LOAD manifest: every asset URL carries a
  `?v=<hash>` that matches the local file's sha256 (12-char prefix), and
  every `size:` matches the local file's byte size exactly (verified for
  all 9 manifest entries: world.topo.json, islands.topo.json,
  locations.json, world-10m.topo.json, lakes-10m.topo.json,
  rivers-10m-scalerank.topo.json, daily-pins.json,
  country-outlines.topo.json, country-bands.json).
- Deployed src/core/format.js: `SHARE_URL = 'www.where-on.earth'`.
- Deployed src/modes/daily-game.js: `shareText()` returns a string
  starting with `` www.where-on.earth\n${dateStr}... ``, confirming
  commit 015b234's share-text change is now live.
- Deployed locations.json: 805 locations (matches
  assets/locations.json locally).

## Method note

All verification above (reproduction, scratch test, syntax checks, pins
diff, deploy output, production fetches) was done by direct inspection:
running the actual scripts and reading their output, fetching the
deployed files and grepping/diffing them against the local working tree.
Nothing in this report is estimated.
