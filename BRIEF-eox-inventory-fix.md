# Brief: fix the inventory script's product identity matching

Work in this clone (eox1-work). Small corrective build: patch
`scripts/sat/inventory.mjs` only (plus its generated report behavior).
Leave work uncommitted. Your sandbox has no network; the orchestrator
re-runs the script on the credentialed VM after your fix lands.

## What happened

The orchestrator ran `node scripts/sat/inventory.mjs`. It failed loudly
and correctly at the first job: the low-resolution Q1 query returned
zero products, tripping your zero-products guard. Live probes by the
orchestrator (2026-10-18, against the real catalogue and bucket)
established why, and what the catalogue actually looks like:

1. The identity clause (an Attributes value equal to the BYOC
   collection id) matches nothing. These products carry no such
   attribute; `$expand=Attributes` returns empty attribute lists for
   them in list responses.
2. The productType + quarter-date filter DOES work. Sample Q1 product:
   `Sentinel-2_mosaic_2025_Q1_36UVV_0_0`, S3Path
   `/eodata/Global-Mosaics/Sentinel-2/S2MSI_L3__MCQ/2025/01/01/...`,
   ContentLength ~430-760 MB.
3. The bucket holds TWO families (verified by S3 listing):
   `Global-Mosaics/Sentinel-2/S2MSI_L3__MCQ/` (the 10 m product) and
   `Global-Mosaics/Sentinel-2/S2MSI_L3__MCQ_LR/` (the low-resolution
   product; its 2025 tree has quarterly subfolders 01, 04, 07, 10).
4. Under the `S2MSI_L3__MCQ` productType filter alone, Q1 2025 counts
   29,919 products, 1,290 of them under 100 MB. Whether the LR family
   is catalogued under productType `S2MSI_L3__MCQ` or
   `S2MSI_L3__MCQ_LR` is not yet established; the S3Path family prefix
   is the one discriminator verified to exist.

## The fix

- Drop the BYOC-attribute identity clause entirely.
- Query per quarter for both candidate productTypes
  (`S2MSI_L3__MCQ` and `S2MSI_L3__MCQ_LR`); tolerate a productType that
  returns zero for a quarter ONLY if the other productType covers that
  family for that quarter (keep a zero guard per FAMILY per quarter,
  where family is assigned by S3Path).
- Assign each product's collection (low-resolution vs 10 m) by its
  S3Path family segment (`S2MSI_L3__MCQ_LR` vs `S2MSI_L3__MCQ`), and
  record that assignment rule in the report. If a product's S3Path
  matches neither family, fail loudly with that product named.
- Keep everything else: paging, footprint intersection against both
  unions, ocean pruning, the jsonl schema, the raw-response saving,
  the resume state, and the report structure. If the same product Id
  appears under both productType queries, deduplicate by Id (the
  current duplicate check throws; make cross-query duplicates a
  dedupe, and same-query duplicates still an error).

## Deliverable

The patched `scripts/sat/inventory.mjs`, syntax-checked, with a short
note at the top of the generated report template stating the family
assignment rule. Nothing else changes.
