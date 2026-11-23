# Astra consult: measured storage census and step-3 seam rebuilds

Date: 2026-11-23. Scope: consult only, based on [BRIEF-ASTRA-CONSULT.md](../BRIEF-ASTRA-CONSULT.md), including its attempt-2 addendum, [step3-build-brief.md](step3-build-brief.md), and [zoom-astra-decision.md](zoom-astra-decision.md). The supplied measurements and checksum results are accepted as evidence; this consult did not independently query the Pi or R2. No seam build, acquisition, upload, deployment, or deletion was performed or authorized here.

## Verdict

Confirm the bounded reconstruction approach and the **1,000,000,000-byte complete-candidate budget**. Correct the plan before execution to give W2 sole ownership of the W1/W2 overlap, deduplicate output accounting, and generate shared derivatives from one resolved source composite. Confirm the one-ring extension rule and explicit polar fallback gate, with the qualifications below. W3 remains provisional until Sean confirms the screenshot extent. The measured storage does not require reducing these initial windows, merging them, or changing renderer strategy.

The page production decision stands: implementation behind `?pages=1` can proceed independently of source repair. Both diagnostic fixes must land before acceptance measurements; repaired source and regenerated pages must converge on the same candidate before final acceptance. This memo does not remove any approval or release gate in the source documents.

## W1 / W2 / W3 and overlap ownership

| Item | Verdict and reason |
| --- | --- |
| W1 polar west | Confirm the initial sampling/comparison rectangle `z5 x=0..2,y=1..4`. It covers both western defects and their combined one-tile halos. Its final output ownership excludes the overlap assigned below. |
| W2 polar east | Confirm `z5 x=2..5,y=0..5`. Its connected halos cover the five eastern locators, including the marginal and unmeasured edges; neither should be dropped merely because its statistics are weaker or missing. |
| W3 Spain/Iberia | Conditionally confirm `z5 x=13..17,y=10..15`, around provisional core `x=14..16,y=11..14`. The census supports budgeting it, but cannot validate geography. Sean's screenshot confirmation or exact bounds is still required before building W3. |

The listed z4 parents and z7/z8/z9 child ranges are geometrically correct for the initial rectangles. Keep them as source/support coverage; distinguish that coverage from exclusive output ownership. Rebuild base/lower-zoom pixels, filtering support, gutters, pages and manifests as specified. Keep the live ladder `[5,7,8,9]`; leave z6 objects untouched.

**Selected overlap policy: W2 is the single owner of `z5 x=2,y=1..4`.** W1 owns `x=0..1,y=1..4`; W2 owns its full initial rectangle. W2 is selected because this column supplies the western halo of its eastern defect group and gives it uninterrupted ownership of its larger rectangle. This is a deterministic compositing decision, not a claim about historical source attribution or superior W2 imagery.

Apply that ownership to every descendant pixel and output key: W2 owns overlap children `z7 x=8..11,y=4..19`, `z8 x=16..23,y=8..39`, and `z9 x=32..47,y=16..79`. W1 may sample the full original rectangle for context and compare all four quarters, but must not publish its own alternate version of those keys. Record both sampling bounds and ownership masks in the plan and provenance. No last-writer-wins behavior is acceptable.

Choose one coherent quarter per window, subject to the fallback rules. In the overlap, use W2's quarter, fallback, validity, tone and mask decisions exclusively; W1's local quarter result there is comparison material only. Ownership alone does not prove a clean join: test the W1/W2 boundary between z5 columns 1 and 2, including its endpoints, at source and derivative resolutions. If independent quarter/tone choices cannot meet the no-seam gate, require compatible coherent choices across the two windows, up to using the same quarter for both. Do not hide the mismatch with tile-local quarter swaps or blur. A failure to find a valid combination blocks acceptance.

Resolve the ownership masks into one canonical repaired source composite **before** resampling shared derivatives. Initial z4 parent keys `x=1,y=0..2` occur in both plans; base pixels, filter support and page footprints can also be shared. Generate each shared asset once from the resolved composite and unchanged surrounding source where required, with references to all actual contributions. Gutter reads across the ownership boundary must use that same composite. Two independent page/base exports followed by overwriting files would defeat this policy.

## One-ring extension rule

Confirm: when a defect reaches an outer edge, extend by exactly one z5 ring, clip y at the world edge, wrap x, recompute descendants and intersecting dependencies, and record the edge evidence and bounds. Repeat only as needed for clean comparisons. At the north world limit there is no out-of-world neighbor to demand; evaluate valid in-domain boundaries and polar coverage explicitly. Represent antimeridian wrapping as split intervals or a wrapped mask, never an accidental almost-global rectangle.

Before each extension build, recompute the union, ownership masks and byte projection. W2 retains ownership of any new W1/W2 intersection; W1's extension cannot overwrite W2. Revalidate the internal join as well as outer joins. An internal ownership seam calls for compatible source choices, not automatic geographic expansion. If extensions make coherent independent selection impractical, revise the plan explicitly; do not silently turn bounded repair into a global rebuild. Renew the budget decision if the projection exceeds 1.0 GB. Available bucket headroom is not permission for unlimited rings.

## Polar fallback ruling

Confirm explicit, coherent fallback and Sean's approval gate. Compare all four cached untoned quarters for each polar window using the specified coverage, discontinuity, join and tone criteria. No quarter has been selected by this consult, and no actual polar coverage result is inferred from the storage census.

Prefer an adjacent coherent quarter only where it actually contains valid observations and can pass the join gate. Apply a fallback consistently across each connected gap and record its footprint, source, validity and checksums. If no coherent quarter has valid observations at a footprint, an adjacent quarter cannot manufacture coverage. Ocean fill is appropriate only for verified ocean; missing land observations must not be relabeled ocean or hidden as black imagery. An explicit no-data treatment requires Sean's approval and visual assessment. If no acceptable sourced or approved fill treatment exists, leave the affected window unreleased and retain the final acceptance/flag-removal block. Approval of a fallback does not waive the no-visible-seam criterion. Apply W2's fallback decision throughout its overlap ownership.

## Corrected storage arithmetic

All units below are decimal bytes/MB/GB. The supplied five-prefix census sums to **346,960 objects and 3,265,874,688 bytes**. Retain all of it, including EOX/live/rollback assets; no deletion is needed to fit this projection.

Each z5 position expands to `1 + 16 + 64 + 256 = 337` positions across z5/z7/z8/z9.

| Initial coverage | z5 positions | All four levels | JPEG estimate at 10,900 bytes/tile |
| --- | ---: | ---: | ---: |
| W1 gross | 12 | 4,044 | 44,079,600 |
| W2 gross | 24 | 8,088 | 88,159,200 |
| W3 gross | 30 | 10,110 | 110,199,000 |
| Gross sum in build brief | 66 | 22,242 | 242,437,800 |
| Duplicate W1/W2 overlap | 4 | 1,348 | 14,693,200 |
| Unique candidate tile keys | **62** | **20,894** | **227,744,600** |

Under the selected ownership, W1 contributes 2,696 unique tile keys, W2 8,088, and W3 10,110. The corrected initial JPEG estimate is **227.7 MB**, not 242.4 MB. These are geometry-based estimates, not measured encoded outputs; lower zooms, base, support assets, pages, provenance, QA and comparisons are additional.

For comparison only, a merged polar bounding rectangle `x=0..5,y=0..5` contains 36 z5 positions, versus 32 in the actual polar union. Adding W3 yields 66 z5 positions, 22,242 tile positions and 242,437,800 estimated JPEG bytes. Its extra four cells are `x=0..1,y=0` and `x=0..1,y=5`. The equality to the old gross sum is coincidental: the old sum double-counted overlap, while the merged rectangle adds new coverage. Do not merge solely for bookkeeping or storage; this estimate does not establish a coherent quarter for the larger rectangle.

Keep the complete-candidate ceiling at **1,000,000,000 bytes**. The corrected JPEG estimate leaves 772,255,400 bytes within that allowance for other candidate assets and encoding variation, but their actual sizes remain unmeasured. Do not reduce the budget by the duplicate-tile estimate or treat the remainder as guaranteed sufficient for pages and extensions.

- Current retained: 3,265,874,688 bytes; current cap headroom: 6,734,125,312 bytes.
- Candidate allowance: 1,000,000,000 bytes.
- Projected retained: **4,265,874,688 bytes**.
- Remaining headroom against 10,000,000,000: **5,734,125,312 bytes**.

The Pi archive is 73,580,219,811 bytes; supplied external-disk available space is 3,580,037,537,792 bytes. That supports local staging without an immediate capacity concern, but archive size and disk availability do not predict peak raster scratch, runtime readiness, or R2 output size. Estimate scratch for four-quarter windows and shared derivatives on the actual Pi mount before execution. The 1.0 GB R2 candidate limit is not a raw-cache/scratch limit.

Risks: historical mean JPEG size is not a bound; dense polar coverage, support, pages and comparisons can differ substantially. Ring growth and multiple retained candidate versions accumulate bytes. Count each actual R2 object once, including any retained temporary uploads, separate page prefixes and rollback copies; do not count only the five familiar prefix names if new ones appear. Immediately before an authorized upload, refresh the full retained census and measure every candidate file to be uploaded. Count additional copies explicitly. Abort if the candidate exceeds 1,000,000,000 bytes or projected retained storage is at least 10,000,000,000 bytes. Obtain Sean's required projection approval; revise scope/encoding with him rather than deleting retained assets.

## Migration evidence and pre-build sequence

The attempt-2 addendum reports phase 1 SHA-256 verification of **140,890/140,890 files** against `phase1-manifest.sha256` (recounted 2026-11-22), and phase 2 verification of **15,590/15,590 files** (2026-11-23). Accept these passes. The old brief's blanket statement that archive receipt/checksums are unverified is superseded by this evidence; do not reopen a full-archive verification. These counts establish integrity of manifested transfers, not that the inventory supplies every observation needed by the selected windows or that a migrated virtual environment runs on the Pi.

Before W1/W2/W3 builds:

1. Resolve the actual archived `eox1-work` root from the received layout. The census listing includes `sat`; `/mnt/external/satmap/vm-archive/eox1-work` remains an example, not a verified executable path. Confirm the destination mount is writable and the Pi Python/raster and Node tools can run. Preserve the VM originals.
2. Implement the bounded planner/provenance support, including W2 ownership, descendant-key deduplication and single generation of shared dependencies. Confirm W3's screenshot bounds before its build; that decision need not block W1/W2 planning. Record the updated plan and estimates before execution.
3. Perform only scoped input checks: `scripts/sat/work/inventory/lr-inventory.jsonl`; its required `work/s2gm2025/source/<quarter>/` COG/band objects for all four quarters intersecting W1/W2 and confirmed W3 plus resampling support; reused `raw-quarterly/` entries; and the masks/Blue Marble assets actually read from `scripts/sat/cache/`. Resolve exact object paths from the inventory, match them to the applicable phase manifest and its recorded SHA-256, and check raster readability, georeferencing, bands and validity coverage. Record those paths in the build manifest. The supplied documents do not list individual product filenames, so inventing them here would be false precision. Verify used tool/config versions and whether reused caches match the new plan. No general archive rehash is required.
4. Materialize or validate the four untoned quarter windows, select coherent sources and resolve polar fallback approval before final derivative generation. Validate the W1/W2 join before expensive page recuts. Generate all dependent outputs from the canonical composite, then measure local bytes and run provenance, coverage, hashes, edge and fixed-view QA.
5. Keep acquisition conditional: the supplied verified cache is the starting point, not a reason to redownload. Only genuinely absent required objects permit acquisition under the brief's allowance/retry and per-batch reconciliation gates. Tone/mask/encoding reruns use Pi raw caches with zero CDSE S3 GETs, zero Process API PU and zero network egress; quarter-policy changes reuse the four quarter caches. Process API remains prohibited. A checksum/readability discrepancy is a stop-and-reconcile issue, not silent reacquisition.
6. Obtain the required storage/fallback decisions, refresh the pre-upload census, and use a separately authorized versioned non-live candidate prefix. Integrate repaired pages with the production renderer, collect acceptance evidence using corrected diagnostics, and obtain Sean's fixed-view and phone validation before any later release task. No live-key, provider, deployed-asset or pilot-flag changes follow automatically from this consult.

Delivery: this consult is saved only in `woe-prod-deploy/docs/ASTRA-CONSULT-2026-11-23.md`, per the attempt-2 override. The original out-of-workspace destination is not used. The two source decision documents are unchanged; this note supplies the corrections that must be carried into the executable plan.
