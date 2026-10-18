# Brief: inventory paging switches to keyset (Id cursor) pagination

Work in this clone (eox1-work). Patch `scripts/sat/inventory.mjs` only.
Leave work uncommitted. No network in your sandbox; the orchestrator
re-runs the script on the credentialed VM.

## Why the date slicing failed (measured on run 3)

Every product in a quarter shares the same ContentDate: the quarter's
first day (their S3Paths all read `/2025/01/01/` for Q1). The first
daily slice therefore contained the whole quarter: expected count
29,919, and the nextLink chain again terminated at 11,000 fetched.
The count reconciliation guard caught it and failed the run, as
designed. Date slicing cannot partition this product family.

## The proven replacement (probed live by the orchestrator)

Keyset pagination on Id works against this catalogue:

- Page 1 with `$orderby=Id`, `$top=1000`: `@odata.count` 29,919,
  last Id `08a54436-bd86-40dd-9c29-4d804a49719f`.
- The same filter plus `and Id gt 08a54436-bd86-40dd-9c29-4d804a49719f`:
  `@odata.count` 28,919 (exactly 1,000 less), returning the next Ids
  in order. GUID comparison in the filter is supported.

## The patch

1. **Remove the per-day slicing.** One job per productType per
   quarter, keyed `v3-<productType>-<quarter>` so v2 state is ignored.
2. **Keyset paging.** For each job: page 1 uses the base filter
   (productType + quarter ContentDate range) with `$orderby=Id` and
   `$top=1000`; capture `@odata.count` as the expected total. Each
   following page adds `and Id gt <last Id of the previous page>` to
   the filter (a fresh query, never `$skip` or nextLink). Stop when
   fetched unique products equal the expected total, or when a page
   returns zero rows before that, which is a loud failure. Save every
   raw page as today.
3. **Keep everything else from fix2:** count reconciliation at job
   completion (unique fetched vs expected, fail loudly on mismatch),
   dedupe by Id with conflict errors, family assignment by S3Path,
   the post-assignment family coverage guard (the `S2MSI_L3__MCQ_LR`
   productType query returning zero remains tolerated), footprint
   intersection, ocean pruning, the jsonl schema, and the report
   (which keeps its per-quarter reconciliation numbers, now per job
   rather than per slice).

## Deliverable

The patched `scripts/sat/inventory.mjs`, syntax-checked.
