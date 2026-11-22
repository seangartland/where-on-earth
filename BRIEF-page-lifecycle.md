# Brief: Astra step 2, production page lifecycle (behind ?pages=1)

Authority: docs/zoom-astra-decision.md (Astra, 2026-11-22), Order and
scope item 2, plus the acceptance gates in the same memo. Step 1
(diagnostic patch) is banked at 35063ac; the fixed trace report is
the accounting this build is measured with. Build on the pilot
machinery (src/globe/page-plan.js, page-cache.js, page-manifest.js,
page-store.js, page-render.js); this step turns the pilot into the
production lifecycle. The flag stays on; the default game without
?pages=1 must behave exactly as before.

## Required behavior

1. Exclusive imagery ownership. During page preparation and during
   an active page round, the page path owns satellite imagery
   loading: the legacy inset driver (surface.js) must not issue new
   inset fetch/decode/upload work in those states. Any legacy work
   already in flight when a page round begins must be resolved
   (finished or abandoned) before the round is declared ready; it
   must never land as visible tile work during the page round.
2. Readiness-gated input. A page round admits gameplay input only
   after its required assets are resident and its meshes are ready.
   Until then the round shows a preparing state. Normal clue dwell
   is not a correctness guarantee: input attempted during
   preparation (including immediate input) must not be accepted as
   a page-round guess, must not trigger page or legacy loading, and
   must not stall the game.
3. Round-boundary fallback. On preparation failure, unsupported
   coverage (e.g. a z9-gap round), or an over-cap plan, the round
   transitions explicitly at a round boundary to the existing
   supported tile path. Late page results must never activate after
   that transition, and never after a newer round has begun (no
   stale activations). Failure must reach an explicit recoverable
   state, never a silent stall.
4. Resource bounds. Every admitted plan stays within
   PAGE_TEXTURE_CAP and PAGE_TRANSFER_CAP_BYTES (record their
   numeric values in the report). Count total live page resources,
   not only the current plan. After each settled round transition,
   live page resources return within the documented resident
   budget; no superseded meshes or textures are retained outside
   that budget. Warm repeats of a still-resident identical plan add
   zero page asset loads.
5. Flag-off parity. With the flag absent, round start, guessing,
   zoom, and pan behave exactly as on current main. Keep the
   s2gm2025 inset ladder exactly [5,7,8,9]; z6 stays out of
   rotation and its stored objects stay untouched.

## Verification required in the report

- Full test suite green, plus new tests covering: readiness gating
  (input during preparation is not accepted), round-boundary
  fallback on failure and on coverage gap, no late activation after
  fallback or after a newer round, inset suppression during page
  preparation and active page rounds, warm-repeat zero loads,
  resource return to budget after transitions.
- Harness runs (swiftshader, mechanism only) for Madrid and Congo
  page rounds, one coverage-gap round, and one forced-failure
  round, each checked with the fixed page-trace-report: zero page
  spans and zero legacy spans during the interactive interval.
- Any runtime fetch this build adds or moves must resolve from the
  DEPLOY OUTPUT include set, not just the repo tree (the pilot
  manifest 404 lesson): list every runtime fetch path the page path
  depends on and confirm each is published by deploy.sh.

## Out of scope

No flag removal, no deploy, no seam/source repair (Astra step 3,
separate lane), no EOX changes, no renderer residency or loading
policy changes beyond the lifecycle rules above, no changes to the
page geometry or zoom set from the Astra design.

## Delivery

Work on branch page-lifecycle in this clone, committing in phases
(lifecycle ownership, readiness gating, fallback transitions, tests)
so a kill loses at most one phase. Write LIFECYCLE-REPORT.md in the
clone root: what was built per requirement, the cap values, test
results, harness evidence with report output, the runtime-fetch
checklist, and any deviation from this brief with the reason.
