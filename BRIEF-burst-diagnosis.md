# Brief: diagnose the 66-event tile burst in Sean's phone trace

Read-only diagnosis. Do NOT change any game code. Your deliverable is a
diagnosis document, committed on your branch.

## The evidence

Sean's phone trace from the renderer pilot's first successful page-path
run is at `sean-trace.json` in this clone root (copied in before launch;
it is gitignored scratch, do not commit it). Run
`node scripts/sat/page-trace-report.mjs sean-trace.json` for the summary.

Key facts from the trace:
- t=8824ms: Pin Madrid preparePageRound served path "pages" (24
  textures, plan fit all true). Prep done t=9793. All Madrid level
  selects after that are pure visibility swaps; ZERO tile-pipeline
  events during ~25s of Madrid interaction.
- t=37187ms: Pin Congo preparePageRound starts (22 textures). In the
  same millisecond a burst of 66 tile-fetch / decode / upload-submit
  events begins, ending ~t=37691 (Congo prep resident mark). Tile keys
  in the burst include z9 143-146/126-129, z7 17-18/15-16, z5 4/3, 5/4/4.
- t=46251ms: second Pin Congo preparePageRound; NO tile burst.
- Earlier in the session a real round at lat 41.12, lng 16.87 fell back
  to tiles with reason z9-gap (outside pilot coverage, by design).

## Your job

Find the exact mechanism that emitted those 66 tile-pipeline events,
with code-level and trace-level evidence. Candidate mechanisms to
confirm or eliminate (find the real one; there may be others):
1. Page-cache eviction: Congo's prepare evicted Madrid's resident
   pages while the Madrid window was still the visible view, and
   surface.js fell back to fetching tiles for the visible window.
2. A legacy prefetch path (round-start or inset prefetch in
   surface.js) firing for the pin target in parallel with the page
   prepare.
3. The base-globe / context layer loading its own tiles when the view
   state changed.
4. Page-store itself tracing page loads as tile events (naming
   collision in the instrumentation).

Method requirements:
- Compute the tile keys each candidate mechanism would emit for the
  Madrid and Congo windows from the plan/manifest data, and compare
  against the burst's actual keys.
- Use event timing (start/end, ordering vs the page-prep spans) as
  evidence, not just code plausibility.
- State plainly which mechanism(s) the evidence supports and which it
  eliminates, and what additional evidence would settle any remainder.

Also answer the production question: in a REAL round (not the pin
buttons), preparePageRound runs at round start during clue dwell. Can
this burst mechanism fire mid-round while a player is interacting? If
yes, under what exact conditions?

End the diagnosis with a fix proposal (design only, no code): what
change eliminates the burst, what it costs (residency, complexity),
and any risk it introduces. Astra (the design authority for this
program) will decide from your document.

## Deliverable

`docs/zoom-stage2-evidence/burst-diagnosis.md` in this clone, committed
on branch `burst-diagnosis`. Run the test suite once to confirm you
broke nothing (you should have changed no source files). Final message:
5 lines max: mechanism verdict, production risk yes/no, fix proposal
in one line, commit hash.
