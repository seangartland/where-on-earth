# R2 image mirror: attribution step and Pi ingest runner

Branch `image-r2-ingest`, built against docs/image-r2-mirror-design.md and
BRIEF-image-r2-ingest.md, on top of the pipeline tooling banked at
500cd65/848c976. No pilot or full ingest was run from this lane: the
sections below say explicitly what *was* run (local, no network/R2) versus
what is staged for the check-back to launch on the Pi.

## What was built

### 1. Attribution step (`src/attribution.js`)

- `commonsFileTitle(url)` derives the Commons `File:<name>` page title from
  any of the three URL shapes actually present in the four data files:
  `thumb.wikimedia.org/.../thumb/<h1>/<h2>/<Filename>/<width>px-...`,
  `upload.wikimedia.org/.../<h1>/<h2>/<Filename>`, and
  `commons.wikimedia.org/wiki/{Special:Redirect/file/<Filename>,
  Special:FilePath/<Filename>, File:<Filename>}`. Returns `null` for a
  commons.wikimedia.org page that isn't one of those shapes (a category
  page, etc.) -- a documented attribution failure, not a crash.
- `fetchAttributionBatchLive(titles)` calls the Commons API
  (`action=query&prop=info|imageinfo&inprop=url&iiprop=extmetadata`,
  `redirects=1`) for up to 50 titles per request (brief: "batch the API
  calls politely"), reusing `http.js`'s `withRetry`/`USER_AGENT` so 429/5xx
  responses back off exactly like the rest of the pipeline's Wikimedia
  calls. Redirects and MediaWiki's title normalization are resolved before
  matching a requested title back to its page.
- `buildAttributionResult(page)` requires **both** a license
  (`LicenseShortName`, falling back to `License`) and an author
  (`Artist`, falling back to `Credit`), HTML-stripped. Either missing, or
  a missing/absent Commons page, is `{status:'failed', reason:...}` --
  the design's "refuse a row without an attribution string; copying a URL
  is not a license record" is enforced here, before a manifest row is
  ever created.
- `fetchAttributionForCanonicalSources(canonicalSources, {cacheDir,...})`
  is the orchestrator: every result (success **and** failure) is cached
  on disk keyed by `sha256(canonicalUrl)` under `<cacheDir>/<hash[0:2]>/
  <hash>.json`, so a rerun against a warm cache costs zero Commons API
  calls, matching the design's metered-pipeline contract for the raw
  cache. Sources are deduped by Commons title before fetching (two
  canonical URLs -- e.g. an `upload.wikimedia.org` original and a
  `thumb.wikimedia.org` rendition -- that resolve to the same underlying
  file cost one lookup, not two), and batches are separated by a delay.
- `src/manifest.js` gained `buildManifestRowSkeleton(canonicalSource,
  attributionResult)`, which merges an inventory canonical-source entry
  with its attribution result into a fresh manifest row: `status:
  'pending'` with `license`/`author`/`attribution`/`source_page_url`
  filled in on success, or `status: 'attribution-failed'` with all four
  left `null` and `error` set to the failure reason on failure. A
  `attribution-failed` row is never handed to fetch/transcode/upload (the
  runner checks this status first and skips it) and always lands in
  `exceptions.jsonl` -- never uploaded silently.

**Flagged design extension:** the design's raw cache
(`raw/sha256/<source-sha256>`) is keyed by *content* hash, but attribution
is resolved before a source is ever downloaded, so there is no content
hash yet. Attribution responses are cached in a sibling directory,
`raw/attribution/<sha256(canonicalUrl)>.json`, keyed by the canonical
*URL* instead. This is not in the design document; flagging it rather
than silently inventing a convention.

**Flagged behavior:** an `attribution-failed` row is a permanent
exception, not auto-retried on a later run (its outcome is cached
precisely so reruns are free). If a renamed/moved Commons file should be
retried, delete that row from the run's `manifest.jsonl` and its entry
under `raw/attribution/` to force a fresh lookup.

### 2. Pi runner (`src/runner.js`, `src/upload.js`, `bin/run.mjs`)

One staged, resumable command, run on the Pi (see "Pi staging commands"
below):

- `src/runner.js` -- pure/filesystem-only staging logic: `sourcesForStage`
  (PILOT = first 50 canonical sources in inventory order; FULL = the
  entire inventory), `pendingSources` (skips any source whose manifest row
  is already `status: 'ready', so FULL after a PILOT -- or a relaunch
  after a kill at any point -- only does the remaining work), the pilot
  `buildSampleSheet`/`sampleSheetHtml` (>=12 `ready` rows with a verified
  `w640` variant, rendered as a plain HTML contact sheet for visual
  review), `selectPublicVerificationSample` (first/last newly-uploaded key
  plus every 10th, for the design's "public-host GET of a rotating sample
  plus every newly uploaded first/last object"), `summarizeManifest`,
  `buildExceptions`, and `createRunLogger` (append-only, timestamped, to a
  file -- brief: "logs to a file").
- `src/upload.js` -- `uploadVariantCreateOnly`: GETs the key first; if it
  exists, verifies size and SHA-256 and reports a mismatch without ever
  overwriting; otherwise PUTs. Implements the design's "if a key exists,
  verify its size, checksum metadata, and content type; never overwrite
  it" exactly.
- `bin/run.mjs` -- the CLI. `--stage pilot` processes the first 50 sources
  end to end (attribution -> fetch -> verify -> transcode -> verify ->
  upload (create-only) -> public-host spot-check), writes
  `exceptions.jsonl`/`url-map.json`/`meter.json`/`sample-sheet.{json,html}`
  under the run directory, then **stops** (it does not chain into FULL).
  `--stage full` processes the entire inventory, but `pendingSources`
  means it only does work for sources the pilot (or a prior full run)
  hasn't already finished; at the end it lists the live `photos/v1/`
  prefix and reconciles it against the manifest
  (`reconcile-report.json`), per the design's final check.
  Throttling: `PI_FETCH_CONCURRENCY = 2`, `PI_FETCH_DELAY_MS = 300` --
  near-serial with a per-item delay, specifically to avoid repeating the
  429 pattern hit during the earlier census.
  Resumability: every completed source updates its manifest row in
  memory; the manifest is written atomically every 10 completed sources
  and always at the end of the run, so a kill costs at most ~10 sources
  of rework, never corrupted state (`writeManifestAtomic` is
  write-to-temp-then-rename). A raw download already on disk at
  `raw/sha256/<sha>` and a variant already `verified` in the manifest are
  both reused rather than re-fetched/re-transcoded/re-uploaded.
  `--self-check` runs the inventory + stage/resume calculation only --
  **no network, no R2, no attribution fetch** -- for sanity-checking the
  script; this is the only mode of `bin/run.mjs` run in this lane (see
  "What was actually run" below).

**Flagged design choice:** the manifest schema in the design shows
`license` and `attribution` fields; the brief additionally asks for
`author` and "source-page URL" as separate fields. Both are satisfied:
`attribution` remains the design's combined display string ("Author /
Wikimedia Commons"), and `author` plus `source_page_url` are added
alongside it -- compatible with the design's manifest example, which says
a record "contains at least" the fields shown.

### 3. Tests

New files, repo suite style (`node:test`, `node:assert/strict`, temp dirs
via `mkdtempSync`, dependency-injected fakes for network/R2 instead of
live calls):

- `test/image-mirror-attribution.test.mjs` -- URL-to-title resolution for
  all three host shapes plus unresolvable cases, `buildAttributionResult`
  success/fallback/failure paths, cache-hit-skips-fetch, title dedup
  across two canonical URLs, and cache round-trip.
- `test/image-mirror-runner.test.mjs` -- stage selection (pilot slice vs.
  full), `needsWork`/`pendingSources` resume behavior (including a
  simulated relaunch-after-kill scenario), the public-verification sample
  selection, the sample-sheet min-count/ok gating and HTML escaping,
  manifest summarization/exceptions, and the file logger.
- `test/image-mirror-upload.test.mjs` -- create-only upload against a
  fake R2 client: fresh upload, matching-existing-object no-op,
  mismatched-existing-object reported without overwriting, and a failed
  PUT reported without throwing.
- `test/image-mirror-manifest.test.mjs` gained two cases for
  `buildManifestRowSkeleton` (attribution resolved vs. attribution
  failed).

## What was actually run in this lane

- `npm install` in `tools/image-mirror/` (installs `sharp`; was missing,
  which is why the pre-existing suite showed 2 failures before any of
  this lane's changes -- confirmed by running the baseline suite before
  installing).
- `node --check` on every new/changed file.
- `node bin/run.mjs --self-check` once, from this repo -- inventory
  computation and stage/resume arithmetic only, zero network requests,
  zero R2 calls, zero attribution fetches. Its scratch output under
  `tools/image-mirror/.runs/` (already gitignored) was deleted afterward.
- The full repo test suite: `node --test test/*.test.mjs` -- see below.
- **Not run:** `--stage pilot`, `--stage full`, or `bin/smoke.mjs`/
  `bin/preflight.mjs` live modes. No image was downloaded, transcoded, or
  uploaded in this lane. No production data file was rewritten.

## Full suite result

`node --test test/*.test.mjs`: **277/277 passing** (238 pre-existing +
39 new: 16 attribution + 17 runner + 4 upload + 2 manifest).

## Pi staging commands

The check-back stages this directory onto the Pi and launches it there.
Exact commands, assuming the Pi's checkout of this repo lives at
`~/map-game` (adjust the path if the Pi's checkout is elsewhere) and the
durable data root is `/mnt/external/where-on-earth/image-mirror/` per the
design:

```bash
# 1. Stage: sync the built tool onto the Pi (run from the VM/build host).
#    Update <pi-host> to the check-back's actual Pi SSH alias.
rsync -av --delete \
  tools/image-mirror/ \
  <pi-host>:~/map-game/tools/image-mirror/

# Also sync the four data files and the design doc so the Pi's inventory
# matches this repo exactly (the drift check in bin/run.mjs stops the run
# otherwise):
rsync -av \
  assets/locations.json assets/locations-bank.json \
  assets/locations-bank-quarantine.json assets/trivia-bank.json \
  <pi-host>:~/map-game/assets/
rsync -av docs/image-r2-mirror-design.md <pi-host>:~/map-game/docs/

# 2. On the Pi: install dependencies (sharp needs a native build for the
#    Pi's architecture -- do not copy the VM's node_modules).
ssh <pi-host> 'cd ~/map-game/tools/image-mirror && npm install'

# 3. On the Pi: create the durable data root if it doesn't exist yet.
ssh <pi-host> 'mkdir -p /mnt/external/where-on-earth/image-mirror'

# 4. On the Pi: set R2 credentials for this shell (the Pi has no
#    sandbox connector; it must carry its own bearer token per
#    src/r2-client.js).
ssh <pi-host>
export CLOUDFLARE_ACCOUNT_ID=<account-id>
export CLOUDFLARE_API_TOKEN=<api-token>
# optional: export R2_BUCKET=where-on-earth-tiles   (this is already the default)

# 5. PILOT: first 50 canonical sources, then STOP.
cd ~/map-game/tools/image-mirror
nohup node bin/run.mjs \
  --stage pilot \
  --run-root /mnt/external/where-on-earth/image-mirror \
  --run-id main \
  >> /mnt/external/where-on-earth/image-mirror/runs/main/run.log 2>&1 &

# Safe to relaunch the exact same command after a kill -- it resumes from
# manifest.jsonl state (`--run-id main` is what makes resumption land on
# the same manifest; do not change it between pilot and full for the same
# campaign). Review before proceeding to FULL:
cat /mnt/external/where-on-earth/image-mirror/runs/main/run.log
cat /mnt/external/where-on-earth/image-mirror/runs/main/meter.json
cat /mnt/external/where-on-earth/image-mirror/runs/main/exceptions.jsonl
#   runs/main/sample-sheet.html  <- open this for the >=12-image visual review

# 6. FULL: the remaining inventory (pilot's already-"ready" rows are
#    skipped automatically), resumable the same way.
nohup node bin/run.mjs \
  --stage full \
  --run-root /mnt/external/where-on-earth/image-mirror \
  --run-id main \
  >> /mnt/external/where-on-earth/image-mirror/runs/main/run.log 2>&1 &

# If FULL is killed, relaunch with the identical command -- it resumes
# from manifest.jsonl and the raw/variant caches on disk; no re-download
# of anything already cached, no re-upload of anything already verified
# in R2.
cat /mnt/external/where-on-earth/image-mirror/runs/main/reconcile-report.json
```

Resulting layout under `/mnt/external/where-on-earth/image-mirror/`
(matches the design exactly):

```text
raw/sha256/<h1h2>/<source-sha256>       # immutable raw-input cache
raw/attribution/<h1h2>/<urlHash>.json   # cached Commons API results (flagged addition above)
runs/main/manifest.jsonl
runs/main/url-map.json
runs/main/exceptions.jsonl
runs/main/meter.json
runs/main/run.log
runs/main/sample-sheet.json             # pilot only
runs/main/sample-sheet.html             # pilot only
runs/main/reconcile-report.json         # full only
```

## Other flagged ambiguities (not guessed)

- **Encoder quality 82** (inherited from 500cd65/`transcode.js`) is still
  the pinned v1 default, not a value chosen from a human visual sample --
  that gap was already flagged in R2-BUILD-REPORT.md and remains open;
  this lane does not resolve it.
- **Manifest write granularity on the Pi (every 10 completed sources)** is
  this lane's choice, not stated by the design (which only requires
  "writes atomically... may resume from manifest state" without a
  frequency). Trades at most ~10 sources of rework after a kill for
  much less I/O than writing after every single source across ~2,106
  sources. Flagging the number in case Sean wants it tighter/looser.
- **`--run-id`**: the design's `runs/<run-id>/` layout implies a run-id
  per campaign; this runner defaults to a fixed `main` rather than a
  fresh timestamp per invocation, specifically so PILOT and FULL (and any
  relaunch after a kill) share one resumable manifest. A genuinely new
  campaign (e.g., re-ingesting after a `v2` encoder change) should pass a
  new `--run-id` explicitly.
