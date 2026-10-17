# Blackout bundle: US scope, land-cleared %, best clear times, fill tone (Sonnet)
Work in /home/hatch/workspace/map-game/blackout-work. Sean approved this bundle
on 2026-10-17 ("You can start the blackout bundle"). Four parts, built and
committed as four slices in this order, each verified before the next starts.
If a seam fights back hard, stop and write what you found in the report rather
than forcing it.

## Ground truth (verified by the orchestrator against this tree)
- src/modes/blackout.js: scopes come from blackoutScopes() over country keys
  (Full World + continents with >= BLACKOUT_MIN_COUNTRIES = 10). A scope is
  { id, label, place, done, emoji, keys }. Bests persist per scope at
  where-on-earth-blackout-best-v1-<scopeId> (best COUNT). Found countries are
  painted into an equirect mask (blackoutFill) via host.countryGeom(key);
  the shader drops the satellite under the mask, revealing the classic style.
- Geometry: src/globe/outlines.js decodes assets/country-outlines.topo.json
  (built by build/make-country-outlines.mjs from Natural Earth, 261 units).
  topo.keys maps game keys to unit ids; decodeCountries(topo) returns
  { arcs, cut, units, keys, keyOf }; countryGeom(key) merges a key's units
  into rings; bordersHit(key, point, tolKm) hit-tests. The run machinery
  (src/modes/tap-country.js, the `borders` object) iterates scope.keys as
  targets and resolves names/geometry through these contracts.
- The classic-style surface lives in src/globe/surface.js, which ALSO just
  gained the coast-2 default (legibility fade + open-water flatten, driven
  by uLegFadeOn/uOceanFlat; ?coast=0 restores the old look). Do not disturb
  that behaviour.
- Sean's ruling, binding: "We should never trust client side timing for
  global leaderboards." Times in this bundle are LOCAL personal bests only.

## Slice 1: United States scope (50 states)
- Data: build assets/us-states.topo.json in the SAME format as
  country-outlines.topo.json (transform/arcs/objects/keys/cut conventions)
  from Natural Earth admin-1 (public domain), via a committed build script
  build/make-us-states.mjs in the pattern of make-country-outlines.mjs.
  Keys are state codes 'US-CA' style; unit properties carry the state name.
  Simplify to a comparable fidelity to the country file; report the size.
- Loading: decode the states file through the same decodeCountries path into
  its own structure (do not merge into countryData; the Passport's
  countryIndex and countryBands must never see states). Provide state
  equivalents of countryGeom/bordersHit for state keys (a small parallel
  module section in outlines.js or a sibling export set is fine; reuse the
  same ring/box code, do not copy-paste a second geometry engine).
- blackoutScopes() gains { id: 'united-states', label: 'United States',
  place: 'the United States', done: 'United States', emoji: flag emoji for
  the US (the UI uses flags for countries), keys: the 50 state keys },
  placed right after Full World. The run must work end to end on state
  keys: prompts show state names, taps hit-test states, blackoutFill paints
  state rings, the scope framing fits the US (the merged state box),
  completion/best logic uses the existing per-scope keys with scope id
  'united-states'. Where the shared borders machinery assumes country keys,
  extend it by key resolution (a geom/name resolver that tries countries
  then states), not by forking the mode.
- District of Columbia: exclude (50 states only, as specced).

## Slice 2: % of land cleared
- Build assets/land-areas.json via build/make-land-areas.mjs: spherical
  (Chamberlain-Duquette) polygon areas computed from the shipped topo
  geometries, for every country key AND every state key, in km2. Validate in
  the script's report: Russia and France and Texas and California against
  known real-world areas, and print the deltas (land area conventions
  differ; the game's own geometry is the source of truth for the stat).
- The game loads areas lazily alongside the outlines. During a Blackout
  run, the HUD progress line gains the stat: found area as % of the SCOPE
  total area, one decimal ("Streak 12 - 12/50 found - 34.2% of land
  cleared" style; match the existing line's separators and tone, HUD only).
  The results screen for a Blackout run shows the same % for the finished
  run. No other mode's text changes. Blackout SHARE TEXT DOES NOT CHANGE
  in this bundle.

## Slice 3: best clear time per scope (local only)
- Time a run from the first prompt to completion (all units found). Only
  complete runs record a time. One new storage key, exactly:
  where-on-earth-blackout-times-v1, a JSON object mapping scopeId to best
  seconds (a number). Use host.safeSetItem like the other Blackout keys.
- Display: the scope picker row shows "Best clear 9:41" when a time exists
  (alongside the existing best count, without crowding the row; match the
  picker's existing typography). The results screen after a complete run
  shows "Cleared in 9:12 - Best 8:57" (or "Cleared in 9:12 - new best"
  when it is). Format m:ss (h:mm:ss past an hour). Incomplete runs show no
  time anywhere. No server anything.

## Slice 4: found-area fill tone
- A prototype shader exists at
  /home/hatch/workspace/map-game/shots/blackout-ocean/surface-between2.js:
  the classic land color under the blackout mask blended 0.55 toward the
  satellite ocean tone, rendering #162D48 beside the #172B48 ocean, so a
  found country reads as it sank to the ocean's depth. Diff it against the
  CURRENT src/globe/surface.js and port ONLY the tone delta (the file has
  other drift; and the current file now carries the coast-2 terms, which
  must keep working). The classic (non-satellite) style and non-Blackout
  modes must look as they do today except inside Blackout found areas.
- Before/after renders at 390px of a Blackout run in progress (Europe
  scope, several countries found) go in the report for Sean's veto.

## Verify (all slices)
- node --check (module mode) on every touched file.
- Headless 390px harness in the pattern of shots/passport/mock-shot2.mjs
  (serve this clone, seed a Blackout run): (1) picker shows United States
  after Full World; (2) a US run prompts a state, a correct tap fills the
  state and increments found, framing fits the US; (3) the HUD shows the %
  and it moves when a big state (Texas) is found vs a small one (Rhode
  Island) by the right relative amount; (4) a completed short run (use the
  smallest continent scope, or stub the scope keys in the harness only,
  never in shipped code) records a best time that the picker then shows;
  (5) world scope still plays exactly as before.
- Report: docs/blackout-bundle-report.md, per slice, with the asset sizes,
  the area validation table, screenshots named, and anything unverified
  stated plainly. Commits per slice with subjects naming the slice, final
  commit may be the report. Zero em dashes anywhere.
