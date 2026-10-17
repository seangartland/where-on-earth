# Satellite pipeline

Phase 0 commits the tile manifest only. The future renderer will use the CDSE
Sentinel Hub Process API with credentials supplied only through environment
variables. It renders low zoom layers first and z9 last, then slices each
rendered window into tiles. NASA Blue Marble fills open-ocean and Antarctic
gaps in the generated base and tiles.

Run `node scripts/sat/generate-manifest.mjs` after playable locations change.
It writes `scripts/sat/eox2025-manifest.json`: the deduplicated 3 by 3 tile
windows around every currently playable location for z4 through the source's
maximum zoom. Render and upload commands intentionally belong to later
phases.
