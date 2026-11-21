# Brief: diagnose and redesign the Where on Earth zoom (Astra, design only)

You are the top-tier diagnostician on this problem because two rounds of
incremental tuning failed. Sean (the owner) says the competitor is "doing it
fundamentally differently and getting much better results." Your job: find the
fundamental difference, prove where our seconds go, and design the fix.
DESIGN ONLY: write one document, `docs/zoom-diagnosis-astra.md`, in this repo.
Do not change any code. Commit nothing; the orchestrator banks your file.

## The problem, in the owner's words and measurements

Where on Earth is a daily geography game: a stylized 3D globe, tap-to-guess,
satellite imagery from our own Sentinel-2 mosaic. Zooming in on a target
takes SEVERAL SECONDS to get sharp on the owner's iPhone. MapTap (maptap.gg,
a competing daily game with a similar globe) gets to a sharp, stable deepest
zoom almost immediately. Zoom speed is the site's #1 issue.

Measured evidence (gathered 2026-11-20/21; treat as ground truth):

- Cloud-browser comparison, back to back, same browser: MapTap was sharp and
  stable at its deepest zoom within the batch of scrolls itself, zero blurry
  phases captured, satellite imagery. Where on Earth was sharp at an
  intermediate zoom in under a minute (minute-resolution timing), and its
  deepest zoom never resolved in 2+ minutes in that run (caveat: the view
  had drifted onto open ocean, where no deep tiles exist).
- Local probe (headless Chromium, software rendering, REAL tile network,
  camera pinned instantly at max zoom; absolute times are inflated by the
  harness, request counts are exact):
  - Tokyo (no z10 coverage): 33 tile requests for one deep zoom: z7 x9,
    z8 x6, z9 x11 (200) + z9 x7 (404, coverage holes).
  - Madrid (inside a z10 pilot window): 55 requests: z7 x9, z8 x9, z9 x1,
    pilot z10 x36 fetched one by one, the z10 fetches alone spanning ~11 s.
  - Madrid with the ladder capped at z9 (?zcap=9, shipped as a feel test):
    zero z10 requests, z9 x36 + 12 x404 instead. Owner's phone verdict on
    the cap: "Maybe a touch snappier but still several seconds and much
    slower than MapTap." So the z10 tail is NOT the main cost.
- The current Daily prefetch: capped at z9, 3 concurrent, and PAUSES on any
  user interaction.

## The current architecture (read the code, do not trust this summary)

- `src/globe/surface.js` (~2,000 lines) is the whole system: SAT_PROVIDERS,
  the inset machinery (two render-target buffers, premultiplied composite),
  `pickInsetWindow`, `insetWindowAt`, `prepareInsetPrefetch`,
  `prefetchDailyTiles`, fetch/upload pumps, circuit breaker.
- Providers: default `s2gm2025`, our own Sentinel-2 mosaic served from
  tiles.where-on.earth (Cloudflare in front of R2), zoom ladder [5,7,8,9,10],
  base texture `assets/base-ours-4k-v4b.jpg`. z10 exists ONLY in four pilot
  windows (Great Lakes, Iberia, Congo, one Pacific atoll; ~10,385 tiles);
  everywhere else z9 is the deepest real layer (the picker skips z10 when a
  window holds no pilot tiles). `eox2025` is a fallback provider behind
  ?sat=eox2025.
- Tiles also ship in bundles (tile-bundle-worker, WOE1 format, one request
  per window) but bundles EXCLUDE z10 and pilot tiles; the client falls back
  to per-tile fetches when a bundle does not match exactly. A service worker
  (sw.js) caches tiles cache-first, 100 MB cap.
- Knobs you will find: fetch burst 18 / normal 12 concurrent, uploads pumped
  8 per frame (12 while loading), INSET_Q = 1/min(DPR,3), a settle timer,
  a 0.4 s fade (SAT_FADE_S), INSET_MIN_Z, saveData drops a rung.
- Game context: in the Daily, all 5 targets are known when the game loads;
  in every mode the current round's target is known when the round starts.
  The player typically spends several seconds reading the clue and spinning
  the globe before pinching deep.

## Permanent constraints (do not design around these, design within them)

- Own Sentinel-2 mosaic ONLY. Hosted tile APIs (Mapbox, Esri, Google,
  MapTiler) are permanently off the table. No paid CDN add-ons; Cloudflare
  Tiered Cache is ON for the zone.
- Source truth: the mosaic's source is ~400 m/px, so z9 is already a mild
  upscale and z10 a ~2.6x upscale: z10 is smoother, not sharper. More z10
  coverage is a separate open decision (scope unanswered); your design must
  work for a z9-deep world and treat z10 as a bonus where it exists.
- The globe and its look stay: stylized 3D globe, Atlantic-centered home,
  the inset IS the zoom experience. A wholesale engine swap would need an
  extraordinary justification in your doc, with migration cost priced.
- Mobile first: the owner's iPhone is the reference device. Data budgets
  matter; state the per-round bandwidth of any prefetch you propose.

## What your document must answer

1. **Where the seconds go.** A budget of the current deep-zoom path, step by
   step (gesture, window picking, ladder serialization, fetch count and
   concurrency, bundle hit/miss behavior, decode, upload pump, settle/fade
   timing, DPR-3 render cost), each line marked MEASURED (from the evidence
   above or from code constants you cite) or ESTIMATED (say how you would
   measure it). No hand-waving: if a step cannot be sized from what you
   have, name the instrumentation that would size it.
2. **What MapTap plausibly does differently.** Hypotheses ranked by how
   well they explain "sharp within the scroll batch, zero blur phases."
   For each: the observable evidence for/against, and what we could check
   from outside to confirm or kill it. Do not present guesses as facts.
3. **The fundamental redesign.** The change that puts zoom-to-sharp in
   MapTap's class within the constraints. Not parameter tuning: if your
   answer is only bigger concurrency numbers, you have failed the brief.
   Cover: what is fetched, when, in what units, what is rendered from what,
   and how the ladder/inset machinery changes or dies. Price it: requests
   and bytes per deep zoom before/after, per-round bandwidth, R2/Cloudflare
   request volume at plausible traffic, implementation size, risk.
   Evaluate the already-floated per-round target prefetch (stream the
   current target's full ladder from round start, focal-first, never
   paused) honestly among your options, including its waste profile.
4. **Proof plan.** The exact measurements, on what device class, that would
   demonstrate the improvement, with pass bars stated in advance.
5. **Build spec.** Sequenced steps a mid-tier coding lane can execute
   without further design decisions: files, functions, tests to add or
   change, and what to delete when the new path replaces the old.

Write the document, then end your final message with a summary of at most
15 lines: the diagnosis in one sentence, the redesign in three, the biggest
risk in one, and the first build step in one. The full document is the
deliverable; do not truncate it.
