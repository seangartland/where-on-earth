# EOX full base render report

## Method

- Source plan: `scripts/sat/work/s2gm2025/full-plan.json`.
- Source inventory: `scripts/sat/work/inventory/lr-inventory.jsonl` only.
- Work directory: `scripts/sat/work/s2gm2025`.
- Output directory: `scripts/sat/work/s2gm2025/finished/full`.
- Finish configuration: the tuned `scripts/sat/local/finish.mjs` configuration as dispatched, with its default land-shadow lift enabled.
- Execution order: z4 through z8, with the base included only in z4. z9 is tabled except for the bounded source-window sampling required by the z8 derive sweep. Each layer is sampled, finished, and verified before the next layer begins.
- Coverage: windows with `nodataPixels > 0` are reported as coverage-limited and are not hidden.

## Relaunch audit

At start, this report, the layer plans, and `finished/full` did not exist. Therefore no layer met the completion rule requiring both a report section and finished tiles plus QA entries on disk. The existing raw-quarterly acceptance cache contained 84 files from prior work and is reusable. Free disk before z4 was 34 GB, above the 6 GB guard.

Before resuming z4, the cache audit found 11 duplicate window/quarter pairs left by an earlier generation. The older-mtime file in each pair was moved, without deletion, to `scripts/sat/work/s2gm2025/stale-cache-pre-reorder/`; the active cache then contained 149 files for 149 unique window/quarter pairs. Sampling produced current-plan files alongside nine more stale-hash files that had not initially formed duplicate pairs; a post-sample audit moved those nine older-mtime files to the same holding area. The active cache then contained 200 files for 200 unique window/quarter pairs.

## z4 and base

- Chunk: `z4-01` (34 detail windows plus 1 base window).
- Result: 35 of 35 windows finished; 218 tiles written; chunk QA status `passed`.
- Mask-edge QA: all 10 Antarctic windows used `observations` mode, passed, and reported `geometricMaskPixels: 0`.
- Coverage: 35 of 35 windows reported `nodataPixels > 0` and are coverage-limited.
- Assembly: all 218 z4 tiles and `base-ours.jpg` were copied to `finished/full`; a SHA-256 comparison of the canonical z4 tree against the banked chunk matched exactly.
- Elapsed: approximately 15 minutes for resumed sampling, duplicate cleanup, finishing, QA verification, and assembly.
- Disk free after assembly: 34 GB.
- Cache lifecycle: after canonical assembly verification, all 140 raw-quarterly files for the 35 z4/base windows were deleted (212,666,564 bytes, approximately 203 MiB); no z4/base cache directory remains.

## z5

- Chunk: `z5-01` (90 detail windows).
- Result: 90 of 90 windows finished, zero skipped; 573 tiles written; chunk QA status `passed`.
- Mask-edge QA: all 26 Antarctic windows used `observations` mode, passed, and reported `geometricMaskPixels: 0`; all 90 windows passed mask-edge QA.
- Coverage: 72 of 90 windows reported `nodataPixels > 0` and are coverage-limited.
- Assembly: all 573 z5 tiles were copied to `finished/full`; a SHA-256 comparison of the canonical z5 tree against the banked chunk matched exactly. The filesystem rejected ownership preservation during the copy, but file contents were unaffected and verified by the hash comparison.
- Elapsed: approximately 20 minutes for resumed sampling, cache verification, finishing, QA verification, and assembly.
- Disk free after assembly: 33 GB.
- Cache lifecycle: after canonical assembly verification, all 360 raw-quarterly files for the 90 z5 windows were deleted (630,584,718 bytes, approximately 601 MiB); no z5 cache directory remains. The 60 remaining active cache files belong to other layers.

## z6

- Chunks: `z6-01` (128 windows) and `z6-02` (101 windows).
- Result: 229 of 229 windows finished, zero skipped; 1,302 tiles written (`z6-01`: 708, `z6-02`: 594); both chunk QA statuses `passed`.
- Mask-edge QA: all 37 Antarctic windows used `observations` mode, passed, and reported `geometricMaskPixels: 0`; all 229 windows passed mask-edge QA.
- Coverage: 152 of 229 windows reported `nodataPixels > 0` and are coverage-limited (`z6-01`: 96, `z6-02`: 56).
- Cache audit: five inherited acceptance windows held duplicate cache generations. Finishing was stopped before QA, and the older-mtime generation for each was moved to `scripts/sat/work/s2gm2025/stale-cache-pre-reorder/`; each active window then held exactly one file per quarter.
- Assembly: all 1,302 z6 tiles were copied to `finished/full`; the canonical path set and SHA-256 hashes matched the union of both banked chunks exactly.
- Elapsed: approximately 28 minutes for resumed sampling, duplicate cleanup, both chunk finishes, QA verification, and assembly.
- Disk free after assembly: 31 GB.
- Cache lifecycle: after canonical assembly verification, all raw-quarterly cache directories for the 229 z6 windows were deleted (1,711,779,290 bytes, approximately 1.59 GiB); no z6 cache directory remains. The 40 remaining active cache files belong to other layers.

## z7 — stopped on plan/brief dependency conflict

- Regular chunks: `z7-01` through `z7-04` banked QA files with overall status `passed`, covering all 496 plan entries and 2,799 tiles. However, their eight derive entries have per-window status `skipped`; therefore the layer is incomplete under the brief's explicit zero-skips rule and was not assembled into `finished/full`.
- z8 prerequisite sampling: all nine z8 chunk plans were sampled with the explicitly required `lr-inventory.jsonl`. Sampling ran from 2026-10-20 01:34 UTC through 02:05 UTC and completed without an error. Three inherited z8 windows had two cache generations (12 duplicate window/quarter pairs); the older-mtime files were moved to `stale-cache-pre-reorder/`. A post-sample audit found zero duplicate pairs.
- Blocking conflict: the brief says the eight z7 entries derive from z8 and permits no z9 sampling for them, but both `full-plan.json` and the banked z7 chunk plans point those entries at 128 distinct z9 source windows. Recomputing overlap against the sampled z8 layer found four covering z8 windows per target, but those z8 windows are themselves derived and have no quarterly caches. A bounded test sweep at `finished/full-chunks/z7-derive-z8-attempt/` consequently skipped all 8 windows and wrote 0 tiles; its `qa.json` says overall `passed`, but the per-window statuses prove it is incomplete.
- Required decision: completing z7 with the current plan requires sampling its 128 named z9 source windows, which would violate the brief's statement that z8's derive sweep is the sole z9 exception. The run stopped rather than silently expanding that authorization. No z7 or z8 cache was pruned, because z7 is unassembled and z8 remains in flight.
- Stop state: 18 GB free; active `raw-quarterly` cache approximately 12 GB. The disk guard did not trigger.

## 2026-10-20 relaunch audit and execution stop

- The reported dependency conflict is narrower than first recorded: the 128 distinct z9 windows named by the eight z7 derive entries are all members of the 904 distinct z9 windows already named by the 226 z8 derive entries. Therefore they fit inside the brief's bounded z9-source exception and can be sampled once as shared prerequisites; no additional z9 window is required for z7.
- The first incomplete layer remains z7. Its four regular chunk QA files remain banked and were not rerun. All nine z8 chunk plans also retain four quarterly cache files for every non-derived window, with no duplicate cache pair found; z8 finishing is a prerequisite before the authorized z9-source sampling and the two derive sweeps.
- A finish attempt for `z8-01` was started with the dispatched command and unchanged finish configuration. It stalled in `make-land-mask.py --batch` before producing a mask, tile, or `qa.json`: the worker remained sleeping with unchanged process CPU counters (`utime=36`, `stime=5`) and zero new mask files across repeated observation intervals. The unbanked attempt was interrupted after more than 20 minutes with no progress. No completed chunk, source, cache, or finished tile was deleted or modified.
- Stop state: 18 GB free; active `raw-quarterly` cache approximately 12 GB. The disk guard did not trigger. Resume at `z8-01`; investigate the vector-mask batch stall without rerunning any passed z4–z7 regular chunk or resampling the verified z8 cache.

## 2026-10-20 z8 resume and disk-guard stop

- Mask-stall cause and fix: the failure was isolated to the large JSON batch being delivered to `make-land-mask.py` through `spawnSync` standard input. The batch path itself completed when given the same job set from a file. `finish.mjs` now writes the batch JSON to `masks/batch-jobs.json`, and `make-land-mask.py` accepts that optional filename while retaining its original stdin mode. This changes only batch transport; mask inputs, geometry, output naming, and finish configuration are unchanged. The same fix allowed all nine z8 chunk mask batches to complete.
- Regular z8 chunks: `z8-01` through `z8-09` now have banked `qa.json` files with overall status `passed`. Together they cover all 1,082 plan entries and wrote 3,673 tiles. The 856 non-derived windows finished; the expected 226 derived windows are explicitly `skipped`, so the layer is still incomplete and was not assembled.
- Per-chunk verification (windows / skipped / tiles / coverage-limited): `z8-01` 128 / 24 / 427 / 54; `z8-02` 128 / 26 / 501 / 36; `z8-03` 128 / 30 / 390 / 54; `z8-04` 128 / 35 / 417 / 17; `z8-05` 128 / 27 / 485 / 6; `z8-06` 128 / 23 / 462 / 23; `z8-07` 128 / 39 / 392 / 19; `z8-08` 128 / 18 / 431 / 33; `z8-09` 58 / 4 / 168 / 43. Total coverage-limited finished windows: 285. All finished Antarctic entries used observations mode, passed mask-edge QA, and reported zero geometric-mask pixels.
- Authorized z9 source set: `plans/z9-derive-sources.json` lists the exact 904 distinct z9 windows referenced by the 226 z8 derive windows; it also contains all 128 sources needed by the eight z7 derive windows. No full z9 layer was sampled.
- Partial z9-source sampling: 1,866 of the required 3,616 quarter files are cached (Q1: 904, Q2: 904, Q3: 56, Q4: 2), totaling 5,217,578,480 bytes. Two windows currently have all four quarters. Two inherited cache directories contained older generations; four older-mtime files were moved to `stale-cache-pre-reorder/`, leaving zero active duplicate window/quarter pairs.
- Disk guard: free space is 8,808,456,192 bytes (8.2 GiB). The remaining 1,750 source-quarter files are estimated from the files already produced to require 4,893,227,406 bytes (4.6 GiB), which would leave about 3.6 GiB free and cross the mandated 6 GB floor. Sampling therefore stopped cleanly before resumption. No z7 or z8 cache was pruned because both derive sweeps remain unfinished consumers; no incomplete layer was assembled.
- Resume point: free at least 2.4 GiB outside the protected EOX sources, finished tiles, and in-flight caches, then rerun the explicit-inventory sample command for `plans/z9-derive-sources.json` (the cache check resumes at Q3). After sampling, finish and assemble `z7-derive`, assemble z7 and prune only its cache, finish and assemble `z8-derive`, assemble z8, then prune the z8 and bounded z9-source caches.

## 2026-10-20 completion resume

- Disk-guard clearance: free space had increased to 14,491,934,720 bytes before resumption. The measured remaining source-cache requirement fit above the 6 GB floor, so sampling resumed with `plans/z9-derive-sources.json` and the explicitly required `lr-inventory.jsonl`.
- Bounded z9 source sampling completed for the exact 904-window set recorded in `plans/z9-derive-sources.json`: all 3,616 expected window/quarter files were present. A post-sample audit found four duplicate window/quarter pairs in `9/81/195` and `9/228/132`; the older-mtime generation of each pair was moved to `stale-cache-pre-reorder/`, leaving zero active duplicates. No z9 window outside the bounded plan was sampled.

## z7 derive sweep and final assembly

- Derive sweep: `z7-derive` finished all 8 of 8 windows with zero skips, wrote 72 tiles, and recorded overall QA status `passed`.
- Final layer result: the four regular banks plus the derive sweep cover all 496 z7 plan windows with no unresolved skip. They contain 2,871 tiles in total (2,799 regular plus 72 derived).
- Mask-edge QA: all 41 Antarctic finished entries used observations mode, passed, and reported `geometricMaskPixels: 0`.
- Coverage: 237 of 496 windows reported `nodataPixels > 0` and are coverage-limited; none of the eight derive windows was coverage-limited.
- Assembly: the canonical z7 tree contained exactly the 2,871-path union of `z7-01` through `z7-04` and `z7-derive`; every SHA-256 hash matched and there were no missing or extra paths.
- Cache lifecycle: after assembly verification, 488 z7 raw-quarterly directories were deleted (4,379,262,588 bytes, approximately 4.08 GiB). No targeted z7 cache directory remained.

## z8 derive sweep and final assembly

- Derive sweep: `z8-derive` finished all 226 of 226 windows with zero skips, wrote 2,028 tiles, and recorded overall QA status `passed`.
- Final layer result: `z8-01` through `z8-09` plus the derive sweep cover all 1,082 z8 plan windows with no unresolved skip. They contain 5,701 tiles in total (3,673 regular plus 2,028 derived).
- Mask-edge QA: all 45 Antarctic finished entries, including one derive entry, used observations mode, passed, and reported `geometricMaskPixels: 0`.
- Coverage: 317 of 1,082 windows reported `nodataPixels > 0` and are coverage-limited (285 regular and 32 derived).
- Assembly: the canonical z8 tree contained exactly the 5,701-path union of all ten banks; every SHA-256 hash matched and there were no missing or extra paths.
- Cache lifecycle: after assembly verification, the validated final prune removed 858 z8 cache directories and all 904 bounded z9-source cache directories, 18,404,249,130 bytes in total (approximately 17.14 GiB). No targeted directory remained. Three small pre-existing z9 acceptance-cache directories outside the bounded source plan remain and were not touched.

## Final state

- Status: complete. z4 through z8 and the base are finished and QA-passed; both derive sweeps are finished and assembled. z9 remains tabled and was not rendered as a layer.
- Canonical deliverable: `finished/full` contains 10,665 slippy-map tiles plus `base-ours.jpg` (10,666 JPEG files total). Layer tile counts are z4 218, z5 573, z6 1,302, z7 2,871, and z8 5,701.
- Final canonical tree size: 150,548,994 bytes. Final free disk after authorized pruning: 29,809,143,808 bytes (approximately 27.8 GiB).
- The banked chunk directories and their QA files remain in `finished/full-chunks/` as resumable audit artifacts. Source COGs, finished tiles, and unrelated cache data were not deleted.
