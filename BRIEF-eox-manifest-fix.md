# EOX Phase 0 fix: manifest completeness (Terra)
Work in /home/hatch/workspace/map-game/eox-work. Phase 0 is complete in
this tree (see docs/eox-phase0-report.md) EXCEPT one gap the orchestrator
caught in review: scripts/sat/generate-manifest.mjs built the tile
manifest from assets/locations.json ONLY (7,992 tiles). The plan
(docs/eox-independence-plan.md section 2 step 1) requires the manifest
regenerated from EVERY playable location set, because landmark, trivia
and expedition targets are tapped at the same zooms and need the same
tiles. The current production tile set is about 10,947 objects.

Fix, bounded:
- Extend the generator to union the coordinates from every playable set
  in the repo: assets/locations.json, assets/locations-landmarks-sol.json,
  assets/trivia-bank.json, and the expedition route stops in
  assets/expeditions.json and assets/weekly-expeditions.json (resolve
  stops through whichever bank they reference; dedupe by coordinate).
- Regenerate scripts/sat/eox2025-manifest.json (3x3 windows, z4 to z8).
- Append a short addendum to docs/eox-phase0-report.md: the new total, the
  per-set unique-tile contribution, and how close the total lands to the
  production set's 10,947 (explain any material gap, do not force a match).
- node --check the generator. Zero em dashes. This sandbox cannot commit;
  leave the tree complete and say so in the addendum.
