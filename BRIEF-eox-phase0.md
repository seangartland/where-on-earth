# EOX Phase 0: swap shape (Terra)
Work in /home/hatch/workspace/map-game/eox-work. Source of truth:
docs/eox-independence-plan.md sections 1c, 4 and 5 (Phase 0 row) IN THIS
REPO. Sean approved the rebuild route on 2026-10-17 with amendments that
OVERRIDE the plan text where they conflict:
- There is NO paid fallback. Do not encode, reference or prepare any EOX
  licence purchase anywhere.
- Renders go low layers first and z9 comes last (Phase 2 concern; here it
  only means: do not hardcode maxZ assumptions beyond the provider record).
- Sean's CDSE account and OAuth client now exist (no action for you).

## Scope (plan section 4, refactors 1 to 5, bounded as follows)
1. One provider record per source in src/globe/surface.js (today the fields
   sit at about lines 507 to 512 plus SAT_BASE_URL): a record holds
   { id, tiles (URL template with the source id as path prefix), base
   (filename carrying the id), credit, maxZ }. Today's source becomes the
   record with id "eox2025", and it must produce BYTE-IDENTICAL tile URLs,
   base URL and credit text to what production builds today (the ?v=
   versioning it uses today stays inside its template). The default source
   id is eox2025. A future record (s2gm2025) is a data addition, not code.
2. Tile and base cache keys partition by source id (use the existing
   provider-partitioned key helpers if present; extend if not).
3. ?sat=<id> override, working alongside ?map=classic: a known id selects
   that record; an unknown id falls back to the default silently. The
   override affects only this page load's source selection.
4. credits: deploy.sh gains credits.html in its copy list (it is 404 live
   today; the file exists in the repo root). Its credit content for the
   current imagery is already correct (see plan 1c); keep the text, and
   structure the page so a second source credit can be added later. Link
   credits.html from the game's existing settings or about surface,
   wherever attribution already lives; smallest consistent link, no new UI
   patterns. The in-game .sat-credit keeps reading from the active record.
5. scripts/sat/ home: a README stating the pipeline shape from plan
   section 2 (c1) as amended (Process API render, low layers first, z9
   last; gap fill NASA Blue Marble; credentials from environment only),
   plus a manifest generator script that regenerates the tile manifest
   from every playable location set (3x3 windows, z4 to the record maxZ)
   and writes it under scripts/sat/. Run it and commit its output. Do NOT
   write the render/upload steps yet; they are Phase 1 and 2.
6. R2 serving: investigate how tiles.where-on.earth serves objects (the
   repo and docs know; check docs/r2-setup.md and any Worker source in the
   repo). In the report, state what a new prefix (s2gm2025/) requires when
   it arrives: object upload only, or a serving change too. Do NOT move or
   copy the existing 10,947 EOX objects in this phase.

## Exit checks (all required, evidence in the report)
- The default game renders identically: scripts/regression.sh baseline
  passes from this tree (harness pattern in ~/workspace/map-game/shots/),
  and a URL audit: enumerate the tile and base URLs the game builds for a
  fixed set of views with no params and with ?sat=eox2025, and show they
  match the pre-change shapes exactly.
- ?sat=bogus falls back to the default source without errors.
- node --check (module mode) on every touched file; deploy.sh still
  parses (bash -n) and its copy list now includes credits.html.
- Report: docs/eox-phase0-report.md with the record shape, the URL audit
  result, the R2 serving finding, and anything unverified stated plainly.
- Zero em dashes. Codex sandboxes here cannot always commit; if git commit
  fails, leave the tree complete and say so in the report.
