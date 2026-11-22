# Renderer pilot: page-based inset behind ?pages=1 (Astra move 1, step 3; Sean go 2026-11-21)

## Why

Astra's zoom diagnosis (docs/zoom-diagnosis-astra.md) ruled that detail imagery must stop living in disposable camera windows: the redesign is immutable geographic pages for z5/z7/z9 (z8 dropped from the page ladder), a coverage manifest, a bounded GPU page cache, and round-start preparation during clue dwell. The Stage 2 revision fixed the page geometry (docs/zoom-stage2-evidence/stage2-revision-report.md) and the feasibility check just closed both window tables (docs/zoom-stage2-evidence/feasibility-report.md, verdict BOTH TABLES CLOSE). This lane builds the bounded renderer pilot that proves the design on real traces. It is a pilot: flag-gated, partial coverage, no deploy.

## Design authority (read before writing code)

- docs/zoom-diagnosis-astra.md: the redesign itself.
- docs/zoom-reconsideration-astra.md: geometry, zoom set, hard budgets and the 100/300 ms gates are retained.
- docs/satmap-advice-astra.md: the move sequence and the strip remedy for the three failing reference windows.
- docs/zoom-stage2-evidence/feasibility-report.md: measured strip sizes, the residency formula (66,617,160 bytes, 39 textures for repaired windows), and the landscape visibility-bounded closing (55,340,784 bytes, 37 textures). Note its honesty section: the Part 2 landscape bounded assets were argued, not encoded. The pilot uses the revision context pages for landscape windows and the report must say so.

## Assets staged in this clone

- assets/pages-pilot/pilot/ and assets/pages-pilot/revision/: page JPEGs in {z}/{x}/{y}.jpg layout, cut on the Pi from the production mosaic.
- assets/pages-pilot/feasibility/: the four measured z5 strips plus manifest.json (Madrid pair M = 121,813 bytes, ordinary-land pair L = 224,923).
- assets/pages-pilot/pilot-manifest.jsonl and docs/zoom-stage2-evidence/revision-manifest.jsonl: page inventories.
- assets/coverage-index.json: the tile coverage index (v2, all levels).
- Pilot serving path: same-origin static files under assets/pages-pilot/. Production serving would move pages to the tiles host; the pilot measures renderer preparation behavior, and the report must name this caveat rather than hide it.

## Build

A page-based inset path in src/globe/surface.js (and supporting modules where the existing structure prefers), active only with ?pages=1:

1. Window plans: for a round location inside pilot coverage, resolve the Stage 2 plan: z9 pages (2x2 tiles, 516 px), z7 context pages (4x4), z5 context (the feasibility strips for the Madrid and ordinary-land windows; 4x4 pages elsewhere in the set). Residency accounting must follow the feasibility formula: page resident bytes from the full mip chain figures used there, cache-wide caps of 40 textures and 67,108,864 resident bytes, LRU eviction that never evicts the active round's plan.
2. Preparation at round start: when a round's location is known and the clue is dwelling, fetch, decode and GPU-upload the plan so it is resident before the first zoom input. Preparation must not block the clue, the globe, or guessing.
3. Zoom behavior inside coverage: level changes consume prepared pages only. Zero required fetch, decode or upload after input. The page ladder is z5/z7/z9 (no z8).
4. Outside pilot coverage, and whenever ?pages=1 is absent: the existing tile path, behavior unchanged. With the flag absent the build must be behavior-identical to the baseline (no page fetches, no plan work beyond the flag check).
5. Instrumentation: extend src/globe/zoom-trace.js so a ?pages=1&trace=1 round records per round: plan page count and resident bytes, preparation start and completion times, whether preparation finished before the first zoom input, input-to-ready latency for each level change, and counts of any fetch/decode/upload that happened after input (with the serving path marked pages or tiles per round).

## Gates the pilot is measured against (Astra)

Prepared p95 at most 100 ms, median at most 50 ms; whole-experience p95 at most 300 ms; zero required post-input fetch/decode/upload inside coverage. The deciding measurement is Sean's phone trace; the VM harness run is a mechanism check only and the report must label it that way.

## Tests

Full suite green (node --test "test/*.mjs"). Add tests where the code structure allows for: plan resolution for a Madrid window (strip substitution, not 4x4 pages), plan resolution for an ordinary-land window, residency accounting against the caps, and fallback selection outside coverage. If a behavior cannot be expressed in the suite, say so in the report instead of forcing it.

## Deliverable: PILOT-REPORT.md in the clone root

What was built and where; how plans resolve; cache accounting against the caps; harness measurements for ?pages=1&trace=1 on a Madrid window, one landscape window, and one location outside coverage (fallback shown); the exact phone-test procedure for Sean (URL form, what to play, how the trace is exported); known limits, including: landscape bounded assets not encoded (revision pages used), pages served from the game origin rather than the tiles host, seam defects not repaired (source fidelity is a separate lane), coverage limited to the staged page set. Zero em dashes anywhere, including code comments and UI copy.

## Boundaries

No deploy. Do not change the default (flag-off) behavior, the tile path, satellite provider config, or any data file. Stage only your own work if you commit; if git commit is blocked in your sandbox, leave everything in the working tree and say so in the report. The orchestrator verifies, banks and deploys separately.
