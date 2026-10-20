# Brief: full base render, layered (Sol, gpt-5.6-sol)

Workdir: ~/workspace/map-game/eox1-work. Baseline commit: 8d73638 (tuned finish
with the targeted land shadow lift, which is the finish.mjs DEFAULT:
--land-shadow-lift on). Your sandbox has no network. Leave all changes
uncommitted.

## Why

Sean approved the tone lift and ordered the full base render started. All
prior finishes were the 21-window acceptance set. This run produces the full
base tile set from the completed LR download so the imagery can go on the
game globe for Sean's validation. His standing order: lower layers first,
ascending z, z9 last, so a stop leaves a playable stack.

## Inputs (verified at dispatch)

- Plan: scripts/sat/work/s2gm2025/full-plan.json: 3,984 windows (3,983 detail
  + 1 base). By z: z4 34, z5 90, z6 229, z7 496, z8 1,082, z9 2,052.
- Inventory: scripts/sat/work/inventory/lr-inventory.jsonl ONLY (800 records,
  all downloaded and size-verified under scripts/sat/work/s2gm2025/source/).
  NEVER use source-inventory.jsonl (78,877 records; that is the undownloaded
  10 m inventory and is out of scope). run.mjs defaults to the wrong
  inventory, so pass --inventory explicitly on every sample command.
- Finish settings: the tuned CONFIG in scripts/sat/local/finish.mjs as-is,
  lift on (default). Do not change tone, mask, or ocean code in this run.
- Disk: about 34 GB free at dispatch. The raw-quarterly cache is the durable
  asset; finished tiles are small. Guard below.

## Orchestrator note (2026-10-19 ~19:45): z8-01 mask stall, investigate first

The previous attempt stopped cleanly at z8-01: the finish stalled inside
`make-land-mask.py --batch` for over 20 minutes before producing any mask,
tile, or qa.json. The worker was SLEEPING with frozen CPU counters
(utime=36, stime=5) and zero new mask files across repeated observations,
so this reads as a blocked hang, not slowness. The attempt was interrupted
with nothing lost: all passed chunks stand, z8 sampling is complete and
its caches are verified intact, 18 GB free, disk guard never triggered.

On resume, before finishing z8-01:
1. Reproduce the mask step standalone for z8-01's window set with stderr
   visible and a hard timeout. Bisect to the specific window(s) that hang.
2. Identify what the process blocks on (inspect the script's batch path:
   lock files, stdin, a vector read, per-window output naming). Check the
   antimeridian-crossing and polar windows in the chunk first; they are
   the classic pathological cases for polygon mask work, and z4-z7 masks
   built fine with the same script.
3. Fix the minimum in the mask step so the batch completes, keeping every
   finish setting and output byte-identical in effect for windows that
   already worked. Record the cause and the fix in the report's z8
   section.
4. If one window proves genuinely pathological, isolate it, finish the
   rest of the chunk, and report the held window by id in the report as
   an open item. Never silently skip it and never mark the chunk passed
   while it is unfinished.
Then continue the normal sequence (z8 chunks, sweeps, assemblies, pruning).

## Scope amendment (Sean, 2026-10-19): through z8; z9 is TABLED

The run now covers z4 through z8 plus the base (10,665 tiles). The z9
layer is tabled for now: do not sample z9 as a layer and do not finish z9
tiles, with ONE bounded exception under "Derive windows" below (sampling
the specific z9 windows that z8 windows derive from). If z9 is later
un-tabled it gets its own dispatch.

## Derive windows (measured from full-plan.json; handle exactly this way)

234 windows carry deriveSources, all pointing at FINER windows: 226 z8
windows derive from z9 windows (904 refs), and 8 z7 windows derive from
z8 windows (128 refs). sample.py does not cache derive windows themselves;
finish derives them from their sources' caches, and finish SKIPS a derive
window whose source caches are missing. Rules:

- A chunk or layer with any skipped window is INCOMPLETE, never a pass.
  Count skipped windows explicitly in every chunk verification.
- z7's 8 derive windows finish in a sweep AFTER z8 sampling exists and
  BEFORE z8's cache is pruned: build a small sweep plan of those 8
  windows, finish it into finished/full-chunks/z7-derive/, assemble its
  tiles into finished/full, and add a report addendum.
- z8's 226 derive windows finish in a sweep after z8's regular chunks:
  sample ONLY the distinct z9 windows referenced by those 226 (list them
  in the report; expect hundreds, not the full 2,052), build a sweep plan
  of the 226, finish into finished/full-chunks/z8-derive/, assemble, and
  add a report addendum. This sampling is the sole z9 exception.
- Cache pruning respects derive consumers: never prune a layer's cache
  while an unfinished derive window still reads from it. Prune order
  that satisfies this: z7 cache after the z7 sweep assembles; z8 cache
  and the sampled z9-source caches after the z8 sweep assembles.

## Execution: layer by layer, chunked inside each layer, resumable

Amendment (orchestrator, 2026-10-19, Sean's challenge): the big layers are
too large to be single finish runs. z8 has 1,082 windows and z9 has 2,052,
and finish.mjs writes its qa.json only at the end of a run and does not skip
already-finished windows, so a VM reset late in a z9 finish would waste
hours of compositing. Sampling is per-window resumable; finishing must bank
inside the layer too. Therefore:

- Split every layer into chunks of at most 128 windows (z4: 1 chunk plus
  the base window, z5: 1, z6: 2, z7: 4, z8: 9; z9 is tabled, see the scope
  amendment). Build one plan file
  per chunk under scripts/sat/work/s2gm2025/plans/.
- Sample per chunk (sampling itself is cache-resumable per window):
  node scripts/sat/local/run.mjs --stage sample --plan <chunk plan>
  --inventory scripts/sat/work/inventory/lr-inventory.jsonl
  --work scripts/sat/work/s2gm2025
  --python /home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python
  Exactly one file per window/quarter in raw-quarterly (the duplicate-cache
  trap from earlier rounds: if duplicates appear, move the older-mtime
  generation aside to scripts/sat/work/s2gm2025/stale-cache-pre-reorder/
  and note it).
- Finish each chunk into its OWN out dir so its qa.json is banked when the
  chunk ends:
  node scripts/sat/local/run.mjs --stage finish --plan <chunk plan>
  --work scripts/sat/work/s2gm2025
  --out scripts/sat/work/s2gm2025/finished/full-chunks/<layer>-<chunk idx>
  --python /home/hatch/workspace/map-game/eox1-work/.venv-sat/bin/python
  (run.mjs does not forward --land-shadow-lift; finish.mjs defaults it on,
  which is what we want. Do not pass --all-tiles; finish the plan's listed
  tiles.)
- A chunk is complete only when its out dir holds a qa.json with overall
  status passed AND zero skipped windows (see Derive windows: a skipped
  window makes the chunk incomplete until its sweep finishes it). Verify
  per chunk: maskEdgeQa invariants hold (Antarctic windows in observations
  mode, zero geometric-mask pixels), and count tiles written and windows
  with nodataPixels > 0 (coverage evidence, reported as coverage-limited,
  never hidden).
- When every chunk of a layer is complete, assemble the layer into the
  canonical tree: copy the chunk tiles (and base-ours.jpg for z4) into
  scripts/sat/work/s2gm2025/finished/full/ preserving the z/x/y.jpg layout
  (copying is idempotent; chunk dirs stay as the banked intermediates),
  then append the layer's section to docs/eox-full-render-report.md
  (chunk list, window and tile counts, QA status, coverage counts, elapsed
  time, disk free) and continue to the next layer without waiting.

On any relaunch or restart: audit first. Resume at the first incomplete
CHUNK, not layer: never re-finish a chunk whose qa.json passed, never
re-sample windows already cached, and re-assemble a layer only when all
its chunks are complete. A VM reset can now waste at most one chunk of
finishing (at most 128 windows), never a whole layer.

Cache lifecycle (orchestrator amendment, 2026-10-19, measured): the
raw-quarterly cache averages about 1.85 MB per window-quarter over the
first 277 files, so caching all 15,936 window-quarters would reach about
29 GB against 34 GB free and trip the disk guard late in the run. The
cache is a speed asset only; the retained source COGs on disk are the
source of truth and any window can be re-sampled from them. Therefore:
after a layer is fully assembled into finished/full and verified, delete
that layer's raw-quarterly cache files (the ones its chunks sampled) and
log the freed space in the layer's report section. Do not prune the
in-flight layer, and do not prune a layer before its assembly verifies.
This caps cache growth at roughly one layer at a time. The disk guard
(stop before a layer if free disk would drop under 6 GB) still applies.

Disk guard: check free disk before each layer. If free disk would drop
under 6 GB, stop before that layer, document the state in the report, and
end the run cleanly.

## Out of scope

No R2 upload (no upload tooling exists in this tree; the orchestrator runs
that as a separate verified step). No provider wiring or serving changes.
No deletions of source COGs, finished tiles, or any EOX data (the cache
pruning rule above is the only authorized deletion). No 10 m or high-zoom work. No tone or pipeline
code changes; if a code defect blocks a layer, fix the minimum, note it in
the report, and keep the finish settings byte-identical in effect.

## Deliverable

docs/eox-full-render-report.md covering every layer, plus the finished/full
tree (base-ours.jpg at its root, tiles as z/x/y.jpg). The run is complete
when z4 through z8 and the base are finished and QA-passed, both derive
sweeps (z7's 8 windows, z8's 226 windows) are assembled, and the caches
are pruned per the lifecycle rule; or it stops on the disk guard or an
unfixable error with the state documented in the report. The z9 layer is
tabled (Sean, 2026-10-19) and is not part of completion.
