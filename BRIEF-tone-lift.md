# Brief: targeted land tone-lift pass (Sol, gpt-5.6-sol)

Workdir: ~/workspace/map-game/eox1-work. Baseline commit: afb4311 (the G1 tune
round, banked). Your sandbox has no network. Leave all changes uncommitted.

## Why

Sean reviewed the finished full base image (base-ours.jpg, finished before the
tune round's code landed). His verdict: structurally not bad, but too dark in
many places, and detail is hard to judge at full-world scale. This matches his
G1 note that panels where our land renders darker than EOX are the weaker
ones. The tune round (docs/eox-g1-tune-round-report.md) repaired the Antarctic
mask and ocean continuity and set per-window tones, but deliberately did NOT
raise the global land gain, and Sol's cold review warned against a global gain
raise because Sydney z9 was already too bright. Sean has now ordered a
targeted tone-lift pass.

## Task

1. Audit first. Read docs/eox-g1-tune-round-report.md and the current
   scripts/sat/local/finish.mjs tone path (CONFIG, WINDOW_TONE, landTone).
   Continue from afb4311; do not restart or redesign the pipeline.
2. Implement a targeted land shadow lift inside the land tone path:
   - Land pixels only. The ocean path (oceanAt and its normalization) must be
     byte-identical in behavior.
   - Strength decreases with pixel luminance: dark land lifts the most,
     highlights are unchanged. The lift must taper to zero well below the
     highlight knee so bright ice, snow, and desert are not pushed brighter.
   - No increase to the global landGain. The existing WINDOW_TONE overrides
     stay in force. Sydney z9 (9/471/306) must not regain its old excess:
     its highlights must not measure brighter than the tuned baseline.
   - Parameterize through CONFIG (lift strength and curve), with a switch so
     the same code can finish with the lift OFF for a like-for-like baseline.
   - The polar observations path and maskEdgeQa invariants are untouched.
3. Re-finish from the existing untoned quarterly caches only. Zero network,
   zero Process API, zero PU; fail closed on missing cache keys as today.
   Produce two sets under scripts/sat/work/s2gm2025/finished/tone-lift/:
   baseline/ (lift off, current tuned settings) and lifted/ (lift on), each
   covering the 20 acceptance windows plus the base window (base-ours.jpg in
   each set). Use the acceptance plan the earlier stages used.
4. Measured evidence, in the report: per-window land-only luminance
   percentiles (p10, p50, p90) and mean for baseline vs lifted; ocean
   luminance stats proving the ocean did not move; seam QA for both sets;
   maskEdgeQa results for both sets (Antarctic z8/z9 must keep zero
   source-gap edge pixels). Success shape: dark windows' land p50 rises
   materially, p90 barely moves, ocean unchanged. Flag honestly any window
   where the lift misbehaves (halos, washed shadows, color shift).
5. Blind A/B for Sean, following the tune round's make-local-ab.mjs pattern:
   20 window panels, baseline vs lifted, opaque asset names in BOTH the page
   and standalone builds (no ours/eox/tone/lift words in file names or URLs;
   the standalone build embeds its images). Keep the mapping key in a
   separate file that is not part of the presented page.
6. Base deliverables for Sean: the lifted base-ours.jpg, plus three
   native-resolution crops from the lifted base (Europe, East Asia, South
   America suggested; state the crop boxes in the report) so he can judge
   detail and darkness above full-world scale.
7. Report: docs/eox-tone-lift-report.md with the method, the lift curve and
   its parameters, the measured stats table, QA results, and open issues.
   The report file existing is the completion deliverable.

## Out of scope

No serving or default changes, no globe integration, no 10 m or high-zoom
work, no new downloads, and do NOT delete any EOX, source, or cache data.
Sean's standing rule: EOX data is deleted only after he validates the new
data on the actual game globe, which has not happened.
