# Build brief: R2 image mirror, pipeline tooling and preflight

Sean approved the design and all five of its decisions on 2026-11-22.
The governing document is docs/image-r2-mirror-design.md (banked at
848c976): read it in full first; where this brief and the design
disagree, the design wins. Baseline is current main (bc1c4bb).
Branch: image-r2-build.

Approved decisions: serving host images.where-on.earth (a custom domain
on the existing where-on-earth-tiles bucket; Sean creates it himself,
the build must not need it); HTTP cache only for v1, NO service-worker
photo cache; WebP-only mirrored variants with the original Wikimedia
URL retained as runtime fallback; widths 256, 640, 1280 physical
pixels, never upscale; v1 proceeds only if the preflight projects the
bucket total under 8 GB.

## Deliverables

1. tools/image-mirror/ pipeline implementing the design: inventory of
   unique image URLs across assets/locations.json,
   assets/locations-bank.json, assets/locations-bank-quarantine.json,
   assets/trivia-bank.json (dedupe across files); download with
   verification (reject error pages and wrong dimensions); dedupe by
   sha256; transcode the three widths as WebP; manifest in the design's
   format (source URL, attribution, sha256 of source and variants, byte
   sizes, status); upload to the design's key scheme; reconciliation of
   manifest vs R2 listing.
2. A preflight mode that downloads NOTHING in bulk: exact unique-URL
   counts per file and per host, source byte totals from HEAD requests
   (or the design's stated method), projected variant bytes, and the
   projected bucket total against the 8 GB gate. Run it and record the
   real numbers in the report.
3. The data-rewrite tool: applies the URL map to the four data files
   exactly as the design specifies (mirrored URL primary, Wikimedia
   fallback retained), runnable in dry-run mode that reports counts per
   file without writing.
4. Tests for the inventory and rewrite logic in the repo's suite style;
   full suite `node --test "test/*.mjs"` passes.

## Boundaries

- Do NOT run the full ingest (no bulk downloads, no mass uploads) and
  do NOT rewrite the production data files in this lane. A smoke test
  of at most 5 images end to end (download, transcode, upload, fetch
  back, delete) is allowed if R2 credentials are reachable from the
  clone's environment; if they are not, build to dry-run and state that
  plainly in the report.
- Bulk data lives on the Pi, not the VM: the pipeline's raw cache path
  follows the design (/mnt/external/where-on-earth/image-mirror/...).
  Nothing in this lane writes bulk data to the VM.
- R2-BUILD-REPORT.md: what was built, the preflight numbers (exact,
  measured), the smoke-test outcome, test counts, and anything the
  design left ambiguous, flagged rather than guessed.

No deploy.
