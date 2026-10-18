# Brief: scoped sampling for the five acceptance sites (Sean approved 2026-10-18)

Work in this clone (eox1-work). The local pipeline is in
`scripts/sat/local/`. Goal: sample and finish the five acceptance
sites (Bay Area, Fiji, Sydney, Iceland, Antarctic Peninsula) as soon
as their source blocks are on disk, instead of waiting for the full
51 GB download. Leave work uncommitted. No network in your sandbox.

## Facts (measured 2026-10-18)

- The LR inventory is `scripts/sat/work/inventory/lr-inventory.jsonl`
  (800 per-file records, B08 excluded). Acquired source files land
  under `scripts/sat/work/s2gm2025/` via `acquire.mjs`; the download
  is running concurrently and resumes safely, do not disturb it.
- The site blocks (all four quarters) are already acquired:
  N18W144 (Bay Area), N54W036 (Iceland), S54E144 (Sydney, Fiji),
  S90W072 (Antarctic Peninsula), 64 records, byte-exact.
- `sample.py` currently refuses to sample unless every inventory key
  for a quarter is present, so no window can be sampled early.
- Three sites' plan windows straddle block edges: Fiji's windows
  extend into S18E144; Iceland, Sydney and Antarctic windows also
  have land in neighboring blocks at some zooms. The base equirect
  window needs the whole globe and stays out of the early scope.
- `finish.mjs` resolves the ocean asset
  `world.topo.bathy.200412.3x21600x10800.jpg` from the pipeline
  assets dir; that file is NOT on this machine (the orchestrator is
  fetching it separately; your code must keep failing closed without
  it, with a clear error naming the missing asset).

## Build

1. **Per-window source gating in the sampler** (`sample.py` and the
   node side as needed): a window may be sampled when every source
   object that window's footprint (plus the sampler's existing
   margin) requires is present and verified in the acquired cache.
   Windows whose sources are incomplete are skipped with a logged
   reason, never silently and never with substitute data. A full-set
   run behaves exactly as before (same cache keys, same outputs);
   the fixture self-test must still pass unchanged.
2. **Site block computation**: from the plan (`plan.mjs` output),
   compute the complete set of LR blocks the five acceptance sites'
   tile windows require at z4 through z9 (the finish-sites scope;
   exclude the base equirect window), and write it to
   `scripts/sat/work/inventory/site-blocks.json` (block tokens per
   site, plus the union). Derive site windows from the same site
   definitions the finish stage uses.
3. **A/B adaptation**: locate the pilot's blind A/B builder (search
   the repo and `~/workspace/map-game/shots/` for make-ab) and adapt
   or wrap it so it can compare the local pipeline's finished site
   tiles against the EOX pilot tiles, same blind protocol (shuffled
   A/B, key held back). Put the adapted tool under `scripts/sat/`
   with a short usage note.
4. Syntax-check everything; re-run the pipeline self-test
   (`scripts/sat/local/selftest.mjs`) and show it passing with the
   per-window gating in place (extend the fixtures only if a fixture
   already covers partial availability; do not weaken existing
   checks).

## Deliverables

The sampler patch, `site-blocks.json` generation (the file itself
may be produced by the orchestrator running your code), the adapted
A/B tool, and self-test output in your final summary.
