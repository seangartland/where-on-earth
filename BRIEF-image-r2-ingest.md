# Build brief: R2 image mirror, attribution step and Pi ingest runner

Sean approved the full image-mirror plan and the attribution lean on
2026-11-22: per-image license and author are pulled from the Commons
API during ingest. The pipeline tooling already exists on main in
tools/image-mirror/ (banked 500cd65) per docs/image-r2-mirror-design.md.
Baseline is current main. Branch: image-r2-ingest.

## Build

1. Attribution step: extend the ingest pipeline so each manifest record
   gains license, author, and source-page URL fetched from the Commons
   API for that image's file page (the design's manifest format is the
   contract). Batch the API calls politely, cache responses in the raw
   cache so reruns cost zero API calls, and record a per-image status;
   an image whose attribution cannot be fetched is held out of the
   upload set and listed on the exception report, never uploaded
   silently.
2. Pi runner: a single staged runner script the check-back can stage
   onto the Pi and launch there (the ingest runs Pi-side; bulk data
   never lands on the VM). Stages: PILOT (first 50 canonical sources:
   download, verify, transcode at the design's WebP quality 82, upload,
   reconcile, write a sample sheet of at least 12 mirrored images at
   the 640 width for visual review, then STOP) and FULL (the remaining
   inventory, resumable, same verification and reconciliation, final
   manifest vs R2 listing check). The runner logs to a file, is safe to
   relaunch after a kill (resume from manifest state), and throttles
   Wikimedia requests to avoid the 429 pattern hit during the census
   (serial or near-serial with backoff).
3. Tests for the attribution mapping and the runner's staging logic in
   the repo suite style; full suite passes.

## Deliverables

- Code on branch image-r2-ingest, committed.
- INGEST-REPORT.md: what was built, how attribution is fetched and
  cached, the exact commands to stage and launch the runner on the Pi
  (file list, target paths under /mnt/external/where-on-earth/
  image-mirror/, pilot launch command, full launch command), and any
  design ambiguity flagged rather than guessed.

Boundaries: do NOT run the pilot or the full ingest from this lane
(the check-back stages and launches on the Pi). No production data
rewrite in this lane. No deploy.
