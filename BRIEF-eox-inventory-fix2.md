# Brief: inventory materialize fixes (dedupe, paging reconciliation, date slicing)

Work in this clone (eox1-work). Patch `scripts/sat/inventory.mjs` only.
Leave work uncommitted. No network in your sandbox; the orchestrator
re-runs the script on the credentialed VM.

## What run 2 established (measured, from state.json and the run log)

- All 8 jobs finished paging. The `S2MSI_L3__MCQ_LR` productType query
  returned 0 products in every quarter: the LR family is NOT catalogued
  under its own productType. Earlier probes found 1,290 sub-100 MB
  products in Q1 under the `S2MSI_L3__MCQ` filter, so LR products ride
  under productType `S2MSI_L3__MCQ` and are split out by their `_LR`
  S3Path at materialize time (the current family assignment already
  does this correctly).
- The `S2MSI_L3__MCQ` query paged exactly 11,000 objects in EVERY
  quarter (11 pages of 1,000), but a `$count` probe for Q1 says the
  filter matches 29,919 products. Paging is stopping early: the
  catalogue appears to cap a single query's reachable results.
  11,000 is a truncated inventory wearing a complete costume.
- Materialize then crashed: `Duplicate product id in
  S2MSI_L3__MCQ-2025-Q1`. Without a stable sort, the catalogue repeats
  products across page boundaries.

## The patch

1. **Date-sliced queries.** Replace the per-quarter MCQ query with
   per-DAY ContentDate slices (one query per day of the quarter,
   `ContentDate/Start ge <day> and lt <day+1>`), keeping the
   productType filter. Keep the per-quarter `S2MSI_L3__MCQ_LR`
   productType query as-is (zero is tolerated). Add `$orderby=Id` to
   every query for stable paging.
2. **Count reconciliation.** Capture `@odata.count` from each query's
   first page. A job is complete only when its fetched unique product
   count equals the count the catalogue reported for that exact
   filter; otherwise fail loudly naming the slice and both numbers.
   Sum the slice counts per quarter and print them in the report next
   to the retained totals.
3. **Dedupe, don't crash.** Within the whole run, dedupe products by
   Id. The same Id with identical S3Path and ContentLength is a page
   overlap: drop the copy and count it (report the count). The same Id
   with conflicting S3Path or ContentLength is still a hard error.
4. **Family coverage guard moves to after assignment.** A family
   (by S3Path) must have retained objects in every quarter; the LR
   productType query returning zero is fine and expected.
5. **Resume stays honest.** Existing complete jobs in state.json whose
   query shape changed (per-quarter MCQ) are stale: version the job
   keys (e.g. include the slice date) so old per-quarter jobs are
   ignored, not trusted. Saved raw pages for still-valid jobs may be
   reused.

## Deliverable

The patched `scripts/sat/inventory.mjs`, syntax-checked. Nothing else
changes: footprint intersection, ocean pruning, jsonl schema, report
structure (plus the two new reconciliation numbers from item 2).
