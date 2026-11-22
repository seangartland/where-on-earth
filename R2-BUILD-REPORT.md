# R2 image mirror: build report

Branch `image-r2-build`, built against docs/image-r2-mirror-design.md (banked
at 848c976) per BRIEF-image-r2-build.md. No deploy, no full ingest, no
production data files rewritten.

## What was built

`tools/image-mirror/` -- a manifest-driven Node (ESM) pipeline plus a
Python R2-access shim for this sandbox, with its own `package.json`
(`sharp` for decode/transcode).

- **`src/inventory.js`** -- scans the four data files for Wikimedia
  HTTP(S) `image` fields, grouping first by exact string (per-file counts)
  and then by canonical URL (cross-file dedupe), exactly as
  docs/image-r2-mirror-design.md's Inventory section specifies.
- **`src/canonicalize.js`** -- strips the fragment and `utm_*` query
  params only; the path and any other query string are left as exact text.
- **`src/expected-inventory.js`** -- the design-time snapshot and a drift
  checker; `bin/inventory.mjs` and `bin/preflight.mjs` both stop and report
  a diff instead of proceeding if the live repo no longer matches it.
- **`src/http.js`** -- bounded-concurrency fetch helpers: `headSize`
  (HEAD, falling back to a 1-byte ranged GET when a server omits
  Content-Length), `fetchBuffer`, retry with exponential backoff honoring
  `Retry-After`, and a descriptive User-Agent.
- **`src/verify-image.js`** -- rejects HTML/error bodies, decode failures,
  zero dimensions, and a thumbnail whose decoded width exceeds the width
  encoded in its own URL (Content-Type is never trusted alone).
- **`src/transcode.js`** -- `planVariantWidths` (never upscale; a target
  wider than the source collapses to the source's own width),
  `encodeWebpVariant` (EXIF-rotate, sRGB, lossless WebP for alpha input,
  pinned quality 82 otherwise), `verifyEncodedVariant` (re-decodes the
  output and checks format/dimensions/no-enlargement/aspect ratio).
- **`src/keys.js`** -- the exact key scheme:
  `photos/v1/sha256/<source-sha256>/w<width>.webp`.
- **`src/manifest.js`** -- atomic JSONL read/write and `buildUrlMap`
  (only `ready` rows with a verified `w1280` contribute to the url-map).
- **`src/reconcile.js`** -- diffs manifest `ready`/`verified` rows against
  a live R2 listing: missing, extra, size-mismatched.
- **`src/rewrite.js`** -- the data-rewrite tool (see below).
- **`src/r2-client.js`** -- production R2 client: plain
  `CLOUDFLARE_API_TOKEN` bearer auth against the Cloudflare REST API. This
  is the portable path meant for the Pi.
- **`bin/inventory.mjs`**, **`bin/preflight.mjs`**, **`bin/rewrite.mjs`**,
  **`bin/smoke.mjs`** -- the CLIs described below.

### The data-rewrite tool

`bin/rewrite.mjs` is dry-run by default and reports per-file counts
(`rewritten` / `exceptions` / `nonImage`) without writing. `--write` is
implemented in `src/rewrite.js` but the CLI refuses to use it
(`Refusing: this lane does not rewrite production data files`), per the
brief's boundary.

The rewrite does **not** round-trip the files through
`JSON.parse`/`JSON.stringify`. I checked: `JSON.stringify(data, null, 1)`
reproduces `assets/locations.json` byte-for-byte, but **not** the other
three files (`locations-bank.json`, `locations-bank-quarantine.json`,
`trivia-bank.json` all come back a different length -- almost certainly an
escaping difference between however each file was originally serialized).
Re-serializing parsed JSON would have silently reformatted those three
files. Instead, `rewriteFileText` does a targeted substring replacement of
the exact JSON-encoded URL literal (`JSON.stringify(url)` is a safe literal
match here because every Wikimedia image URL is plain ASCII), so every
other byte -- formatting, field order, unrelated escaping -- is untouched.
The same function also drives rollback (applying the inverse map), since
it matches on url-map membership rather than on "is this a Wikimedia URL."

## Preflight: real, measured numbers

Run live against this repo on 2026-11-22. Raw output: `tools/image-mirror/.runs/preflight-2026-11-22T19-43-31-172Z.json` (gitignored -- this directory is a VM-local scratch fallback, see "Pi path" below).

### Inventory (`node bin/inventory.mjs`)

Reproduces docs/image-r2-mirror-design.md's table exactly, with zero drift:

| Data file | Entries | Image refs | Exact unique | thumb | upload | commons | Non-image gaps |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `assets/locations.json` | 803 | 801 | 801 | 626 | 156 | 19 | 2 |
| `assets/locations-bank.json` | 479 | 478 | 478 | 394 | 77 | 7 | 1 |
| `assets/locations-bank-quarantine.json` | 244 | 244 | 237 | 187 | 37 | 13 | 0 |
| `assets/trivia-bank.json` | 1303 | 1282 | 728 | 553 | 131 | 44 | 21 |

Union: 2,244 per-file memberships, 2,114 exact-unique URLs, 130 cross-file
duplicates, **2,106 canonical sources** after stripping fragments/`utm_*`.
24 non-image gap rows total, IDs unchanged from the design doc.

### Source bytes (HEAD sizing, all 2,106 canonical URLs)

Concurrency 16, ~40ms inter-request delay, 15s timeout, 3 retries with
backoff on 429/5xx:

| Host | URLs | Bytes measured |
| --- | ---: | ---: |
| `thumb.wikimedia.org` | 1,681 | 453,716,579 |
| `upload.wikimedia.org` | 362 | 681,079,518 |
| `commons.wikimedia.org` | 48 of 63 | 187,586,539 |
| **Total (first pass)** | 2,091 of 2,106 | **1,322,382,636** (1.322 GB) |

15 of 63 `commons.wikimedia.org` HEAD lookups failed under this
full-concurrency run. I investigated rather than reported it blind
(AGENTS.md: verify a suspicious result before proceeding): those 63 URLs
are all `Special:FilePath`/`Special:Redirect` endpoints, which redirect to
the real image bytes rather than serving an image directly -- a
legitimate Commons pattern, not a data problem. Re-running HEAD against
all 63 in isolation (no concurrent pressure on the other 2,043 URLs)
succeeded 100%, total **195,545,290 bytes**, confirming the 15 failures in
the full run were transient contention/rate-limiting on that specific
endpoint under load, not broken URLs.

**Corrected total source bytes: 1,330,341,387 (1.330 GB)** (= 453,716,579 +
681,079,518 + 195,545,290). This is the number the gate check below uses.

### Representative sample (real encoding, not an estimate)

48 sources, stratified proportionally across the three hosts (sorted,
evenly spaced within each host group for reproducibility), downloaded and
encoded at all three widths with the pinned v1 settings:

- sample source bytes: 30,178,789
- sample variant bytes (all 3 widths, all 48 sources): 11,941,092
- **measured output/input ratio: 0.3957** (48/48 succeeded; 0 failures)

### Projected v1 output and bucket total

- Projected total variant bytes = ratio x corrected total source bytes =
  0.3957 x 1,330,341,387 = **526,387,222 bytes (0.526 GB)**
- Current live bucket usage (full paginated listing of the whole bucket,
  347 pages, 346,960 objects): **3,265,874,688 bytes (3.266 GB)** -- this
  matches the design doc's cited "3.27 GB" almost exactly; I re-measured
  it live rather than taking the doc's figure on faith.
- `photos/v1/` prefix: confirmed empty before and after this build (0
  objects) via a dedicated listing.
- **Projected bucket total: 3,792,261,910 bytes (3.792 GB)**

### Gate check: 8 GB

**PASS.** 3.792 GB projected total is **4.208 GB under** the 8 GB gate.
This replaces the design's working estimate (0.6-1.2 GB output, "about
0.6-1.2 GB" range) with a measured 0.526 GB projected output -- within
that range, at the low end, which tracks with WebP at quality 82 beating a
same-quality JPEG source handily on these mostly-already-web-sized
Wikimedia thumbnails.

## Smoke test: PASSED (5/5 images, 15/15 variants)

R2 credentials were reachable from this clone's environment (the
custom.cloudflare connector, same one `scripts/sat/local/upload_r2.py`
already uses for this bucket), so per the brief's boundary I ran the
allowed smoke test rather than building to dry-run only.

Ran `bin/smoke.mjs --limit 5`: downloaded 5 real canonical sources,
verified each, encoded all 3 widths, uploaded all 15 variants to the real
`photos/v1/sha256/.../w*.webp` keys, fetched each back and confirmed
byte-length and SHA-256 match, then deleted every object it created.
Verified independently afterward with a fresh listing: `photos/v1/`
contains 0 objects, confirming cleanup left nothing behind.

All 5 sources: real width/height decoded correctly, all 3 variants per
source encoded lossy at quality 82 (none had alpha), round-tripped
byte-for-byte through R2. One source (`Abuja_heritages_30.jpg`, a
6016x4016 original) exercised genuine downscaling at every width; none of
the 5 needed the no-upscale path (all were at or above 1280px wide).

### Credential path used for the smoke test (and the live preflight checks above)

This VM sandbox has no `CLOUDFLARE_API_TOKEN` in its environment -- the
only live Cloudflare credential reachable here is the pre-authorized
`custom.cloudflare` connector surrogate. `tools/image-mirror/smoke/cf-bridge.py`
is a thin, VM-sandbox-only adapter that reuses that connector (same
credential `scripts/sat/local/upload_r2.py` already uses for this bucket)
to do the smoke test's PUT/GET/DELETE and the bucket-usage listing. The
production pipeline's own client, `src/r2-client.js`, authenticates with a
plain bearer `CLOUDFLARE_API_TOKEN` instead -- the portable path intended
for the Pi, which has no access to this sandbox's connector. The bridge is
not used by, and proves nothing about, the Pi's eventual credential setup.

## Tests

`node --test "test/*.mjs"`: **238/238 passing** (the pre-existing suite was
180 across 38 files; this build adds 58 across 10 new files: canonicalization,
cross-file/content dedupe, non-image-gap detection, HTML/decode/dimension
rejection, no-upscale planning, alpha-lossless encoding, variant
re-verification (enlargement/aspect-ratio rejection), manifest
atomic-write/round-trip, url-map construction, structural rewrite purity
(byte preservation, exception handling, rollback via inverse map),
reconciliation (missing/extra/size-mismatched), and the bounded-concurrency
HTTP helpers). All of these run offline against fixtures or synthetic
images -- no test depends on network access or live credentials, so the
suite is reproducible anywhere.

The *live* inventory test (`image-mirror-inventory.test.mjs`) does read the
real `assets/*.json` files and assert zero drift from the design-time
snapshot -- it is the one test that would fail if the design doc and the
repo ever diverge, by design.

## Flagged ambiguities (not guessed)

1. **No per-image attribution source exists yet.** The design requires
   "join attribution/license data by source URL" and makes attribution
   presence a readiness gate ("refuse a row without an attribution
   string"). I checked `credits.html`: it has generic sections for
   satellite imagery and geometry providers, but **no per-photo Wikimedia
   attribution at all**. There is no file in this repo mapping a Wikimedia
   URL to an attribution/license string. I did not invent one. The
   manifest schema and `buildUrlMap` are implemented per the design, but
   nothing in this build populates attribution, so a real ingest run
   today would have to either skip this gate or have every one of the
   2,106 sources fail it. This needs a decision (author attribution data,
   or fetch it live from the Wikimedia API, or relax the gate) before a
   real Pi run, not just before v1 ships.
2. **WebP quality 82 is a pinned default, not a visually-selected one.**
   The design asks for "a quality setting selected by the preflight visual
   sample," which needs a human looking at images, not a script. I picked
   82 (a conventional high-quality WebP setting) and pinned it in
   `TARGET_WIDTHS`/`PINNED_WEBP_QUALITY`; the 0.526 GB projection above
   uses it. A real visual review before the Pi run could change this
   number materially (lower quality shrinks both the projection and the
   gate margin further; it won't threaten the gate either way given the
   4.2 GB of headroom).
3. **R2 custom-object-metadata header convention is unverified.** The
   design's manifest wants "source/variant SHA metadata" stored on upload.
   I could not confirm live (no web search available this session) the
   exact header Cloudflare's native R2 API (as opposed to its
   S3-compatible endpoint) uses for custom metadata, so `putObject`'s
   `metadata` option in `src/r2-client.js` is best-effort
   (`cf-r2-metadata-<key>` headers) and explicitly commented as unverified.
   This doesn't block anything: the JSONL manifest, not R2 object metadata,
   is the design's stated authoritative record of sha256/bytes, and the
   smoke test's round-trip check (byte length + SHA-256 compare) doesn't
   depend on it.
4. **Pi raw-cache/run-root path.** The design's path
   (`/mnt/external/where-on-earth/image-mirror/...`) doesn't exist on this
   VM (confirmed: `/mnt/external` is absent here). `bin/preflight.mjs`
   detects this and falls back to `tools/image-mirror/.runs/` (gitignored,
   a few KB of JSON, nothing bulk) rather than silently writing to that
   path or failing. On the Pi, where `/mnt/external` exists, it will use
   the design's real path automatically.

## Boundaries respected

- No full ingest: the only downloads were the 48-image representative
  sample (byte-projection only, no R2 writes) and the 5-image smoke test.
  2,106 x 3 = 6,318 variants were never bulk-produced.
- No mass uploads: only the smoke test's 15 objects were ever written to
  R2, and all 15 were deleted before this report was written (verified by
  a fresh listing).
- No production data files were rewritten; `bin/rewrite.mjs --write` is
  wired but the CLI refuses to use it.
- No bulk data was written to the VM; the 48-sample encode output lived in
  memory only, and the only on-disk artifact is a small JSON preflight
  report under a gitignored directory.
