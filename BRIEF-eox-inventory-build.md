# Brief: build the inventory tooling for both mosaic products (EOX Phase 2, milestone 1)

Work in this clone (eox1-work). Build the tooling, compute everything
that is computable offline, and amend the two design docs. Your sandbox
has no network: do NOT attempt live CDSE calls. The orchestrator runs
your inventory script on the VM (which has the credentials) after your
deliverable lands, and the script itself writes the measured report.
Leave all work uncommitted.

## Read first

- `docs/eox-local-pipeline-design.md` (the base design; sections 1, 3, 4
  are the spec for this milestone, as amended below)
- `docs/eox-highzoom-design.md` ("Measurements to run next" is partly
  yours here: items 1 and 2)
- `docs/eox-independence-plan.md` (gates and phase order)
- `scripts/sat/render.mjs`, `scripts/sat/evalscript.js`,
  `scripts/sat/eox2025-manifest.json`, `scripts/sat/pilot-sites.json`
  (existing conventions, tile math, the manifest, the acceptance sites)

## Sean's decisions since the designs were banked (binding amendments)

1. **R2 retention is capped at the 10 GB free allowance; no monthly R2
   storage cost.** Durable R2 contents: finished tiles, the high-zoom
   pin layer, and the selected untoned windows (projected ~9 GB worst
   case). The four-quarter source COGs are build-time VM cache only:
   downloaded, sampled, never retained in R2, re-downloadable from CDSE
   if ever needed again. The base design's section 3 retention table
   must be amended to this model.
2. **Ocean pruning.** The inventory excludes any source object whose
   footprint is entirely ocean (our composite paints ocean from Blue
   Marble). Use the Natural Earth land data already in this repo and
   state the test you used.
3. **z9 is in scope** as an upscale of the 400 m product (base design
   already assumes this; the high-zoom 10 m layer starts at z10).
4. **Derive-down windowing.** Where the sampling design stores windows
   per zoom, prefer sampling once at the finest scale per area and
   deriving lower zooms at finish time. Record this as an amendment
   note in the base design where section 2 describes window storage;
   the full sampling build is a later milestone, so a short, precise
   amendment is enough here.

## Deliverables

1. **`scripts/sat/inventory.mjs`** (Node, no new dependencies; the
   repo's sat tooling is Node). When run on the VM with
   `scripts/sat/.env` present (it holds `CDSE_CLIENT_ID`,
   `CDSE_CLIENT_SECRET`, `CDSE_S3_ACCESS_KEY`, `CDSE_S3_SECRET_KEY`;
   read it, never print values), it must:
   - exchange the OAuth client credentials for a token (same token
     endpoint the existing probe scripts use);
   - query the CDSE OData `Products` endpoint for product type
     `S2MSI_L3__MCQ` for BOTH product identities (the ~400 m
     low-resolution collection `byoc-6af2d932-8f18-4bed-a31b-d32bc49d43a0`
     and the 10 m collection `byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca`)
     across all four 2025 quarters, paging completely;
   - intersect product footprints client-side against (a) the union of
     the Phase 0 manifest tile bounds and (b) the union of the
     high-zoom pin-patch bounds from deliverable 2;
   - apply the ocean-pruning test and record, for every excluded
     object, that it was excluded and why;
   - write `scripts/sat/work/inventory/source-inventory.jsonl`: one
     normalized record per retained object (product id, name, quarter,
     collection, footprint, S3 path, content length, checksum), plus
     the raw OData responses saved unedited alongside;
   - write **`docs/eox-inventory-report.md`** from the live data:
     per product and quarter, unique grid cells, object counts, total
     bytes; pin-union vs manifest-union diff for the 10 m product; the
     ocean-pruned count and bytes; and a closing R2 ledger projecting
     durable contents against the 10 GB free allowance under the
     amended retention model. Every number in the report is measured
     by the run or explicitly marked as still estimated.
   - fail loudly and resumably: a failed page or quarter leaves a
     partial inventory clearly marked incomplete, never a silent
     truncated success.
2. **`scripts/sat/highzoom-manifest.json`**, computed by you locally
   (pure math, runnable in your sandbox; include the small generator
   script or a documented one-off in the report appendix of the
   high-zoom design amendments): the z10-z14 3-by-3 pin tile sets from
   `../demo`-equivalent asset files in this clone (805 cities + 427
   landmarks; the South Pole landmark excluded as outside Web
   Mercator), per-zoom sorted XYZ lists with counts and a hash, plus
   the confirmed full-footprint descendant counts from the z8 manifest.
3. **Amendments** appended to both design docs as a dated section
   "Amendments, 2026-10-18 (Sean)": the R2 free-allowance retention
   model (base design), ocean pruning (both, where acquisition is
   described), derive-down windowing (base design section 2), and in
   the high-zoom doc a pointer to the frozen pin manifest from
   deliverable 2. Amend, do not rewrite; keep the original text intact.

## Out of scope for this milestone

No bulk downloads, no GDAL sampling, no rendering, no R2 uploads. The
inventory report is the gate: Sean sees measured totals before any of
that is dispatched.
