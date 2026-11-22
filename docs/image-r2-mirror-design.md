# R2 photo mirror design

## Decisions for Sean

1. **Approve `images.where-on.earth` as the serving host.** Recommended: create it as a custom domain on the existing `where-on-earth-tiles` bucket. The stored token cannot make this zone-level change, so Sean must create/approve the DNS/custom-domain setting. This keeps photos outside the service worker's current host-wide interception without spending a second bucket.
2. **Approve HTTP cache only for v1.** Recommended: do not put photos in Cache Storage yet. R2 plus Cloudflare/browser HTTP caching provides the reliability benefit, while photos provably cannot consume or evict any of the 100 MiB `woe-tiles-v1` cache. Reconsider a separate `woe-photos-v1` cache only after real variant weights and passport-session telemetry exist.
3. **Approve WebP-only mirrored variants, with the original Wikimedia URL retained as the runtime fallback.** Recommended: do not double storage and operations for JPEG fallbacks; the game's supported browsers decode WebP. If legacy-browser support is a requirement, Sean should instead approve JPEG siblings and the small application change needed to use `<picture>`.
4. **Approve the three-width set: 256, 640, and 1280 physical pixels.** Recommended: it covers the roughly 40--83 CSS px passport/collection grids, roughly 110--150 CSS px pack cards, and up-to-440 CSS px reveal/postcard surfaces at common high device-pixel ratios. A source smaller than a target is never upscaled.
5. **Approve the v1 storage budget only after the Pi preflight records exact source and projected output bytes.** Working estimate: about 0.6--1.2 GB for 2,106 logical sources and at most 6,318 WebP variants, leaving the 10 GB free-tier bucket comfortably below capacity alongside its current 3.27 GB. The pipeline must stop before transcoding/upload if the measured projection would take the bucket over 8 GB total.

Everything below uses those recommended answers.

## Scope and invariants

This is a data migration, not a change to photo ownership or attribution. The source URL and attribution remain authoritative metadata; R2 is a derived, replaceable mirror. A record is rewritten only after every required variant is verified in R2. Records that fail remain on Wikimedia, so partially completed runs are safe.

Mirrored object URLs are immutable. No object is overwritten in place, and a new source or new encoder output produces a new content-hashed path. Responses may therefore use `Cache-Control: public, max-age=31536000, immutable`.

## Inventory

The inventory below was computed by recursively reading the four JSON files at design time (2026-11-22), selecting Wikimedia HTTP(S) image strings, and counting exact strings within each file.

| Data file | Entries | Image references | Exact unique URLs | `thumb.wikimedia.org` | `upload.wikimedia.org` | `commons.wikimedia.org` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `assets/locations.json` | 803 | 801 | 801 | 626 | 156 | 19 |
| `assets/locations-bank.json` | 479 | 478 | 478 | 394 | 77 | 7 |
| `assets/locations-bank-quarantine.json` | 244 | 244 | 237 | 187 | 37 | 13 |
| `assets/trivia-bank.json` | 1,303 | 1,282 | 728 | 553 | 131 | 44 |

There are 2,244 per-file unique URL memberships but 2,114 exact unique URLs in their union. Thus 130 exact URLs occur in more than one file: 14 in locations plus trivia, one in locations plus location bank, 34 in location bank plus trivia, and 81 in quarantine plus trivia. No exact URL occurs in three or four files. Quarantine also contains seven repeated references internally, and trivia contains 554 repeated references internally.

Across that 2,114-URL exact union, the host totals are 1,689 `thumb.wikimedia.org`, 362 `upload.wikimedia.org`, and 63 `commons.wikimedia.org`. These union totals are lower than the columns summed down the table because cross-file duplicates count only once.

Removing fragments and only `utm_*` query parameters reduces the union from 2,114 to **2,106 canonical source URLs**. Do not otherwise normalize query parameters or Wikimedia thumbnail paths: they can select different bytes. The ingest groups all 2,244 memberships by canonical URL before downloading, then groups downloaded sources again by SHA-256. Consequently each shared photo is downloaded once per canonical URL and each identical source payload is transcoded/uploaded once even when Wikimedia URL spellings differ.

The non-image gaps (two location rows, one bank row, and 21 trivia rows) are not invented or rewritten. The inventory command must emit their IDs in the run report.

## Serving host, keys, and variants

Use the existing `where-on-earth-tiles` bucket under the `photos/` prefix, exposed through `https://images.where-on.earth`:

```text
photos/v1/sha256/<source-sha256>/w256.webp
photos/v1/sha256/<source-sha256>/w640.webp
photos/v1/sha256/<source-sha256>/w1280.webp
```

The source hash, not a location ID, is the durable identity and provides cross-file deduplication. Location/trivia IDs live in the manifest as references. The width and extension make each encoder result explicit; `v1` freezes the encoder settings for reproducibility. If encoder settings change, use `v2`, never replace a `v1` object. If the original width is below a named target, encode the original dimensions but keep the requested key and record `actual_width`/`actual_height`; never upscale.

CSS establishes these demand classes:

| Surface | Repository sizing | Variant |
| --- | --- | --- |
| Passport home stamps and five-column dex; collection thumbs | 34--40 CSS px stamps; five columns inside a maximum 440 CSS px card; square crops | 256 |
| Three-column passport pack grid and collection cards | about 110--150 CSS px per image at the 440 CSS px card maximum | 640 |
| Reveal band, expanded recap, and postcard detail | full card/sheet width; postcard detail maxes at 380 CSS px and the passport/reveal container at 440 CSS px | 1280 |

The width choices are physical-pixel delivery targets, not CSS dimensions. `256` covers the small grids through DPR 3; `640` covers pack cards through DPR 3--4; `1280` covers the largest 380--440 CSS px photo through roughly DPR 3. Pack cover art is currently a separate static application asset, not a Wikimedia URL in these four files; it is out of this migration. If “pack covers” means the three-column location cards within a pack, they use `w640` as above.

The rewritten JSON keeps `image` as a string to preserve existing consumers and points it to the 1280 variant, for example:

```json
"image": "https://images.where-on.earth/photos/v1/sha256/0123...cdef/w1280.webp"
```

The build pass should add one URL-sizing helper used by all image mounts: it replaces `/w1280.webp` with `/w256.webp` or `/w640.webp` for the known small/medium surfaces. The 1280 URL remains directly usable by old clients and mixed deployments. This avoids expanding every data row into a variant object. The helper must return non-mirror URLs unchanged.

WebP is the only mirrored format in v1. Preserve animation/orientation/color correctly: apply EXIF orientation, convert to sRGB, strip nonessential metadata, encode with a pinned encoder/version and quality setting selected by the preflight visual sample. Alpha-bearing input remains lossless WebP if flattening would change the image.

## Pi-side resumable ingest

The implementation should be one manifest-driven command with explicit `inventory`, `fetch`, `transcode`, `upload`, `verify`, and `rewrite` phases. Every phase writes atomically to a run directory and may resume from its manifest state.

1. Inventory all memberships, canonicalize only fragments and `utm_*`, and join attribution/license data by source URL. Refuse a row without an attribution string; copying a URL is not a license record.
2. Download each canonical source into the raw cache with a descriptive user agent, bounded concurrency, exponential backoff honoring `Retry-After`, and a per-host rate limit. Stream to a temporary file, then rename by SHA-256.
3. Accept only a 2xx response whose decoded payload is a supported image. Do not trust `Content-Type` alone. Reject HTML/error bodies, decoder failures, zero dimensions, and a Wikimedia thumbnail whose decoded width disagrees with the width encoded in its URL (except documented smaller-original behavior). Record MIME type and decoded dimensions.
4. Group by source SHA-256, transcode each required width once with pinned settings, and decode every output again. Verify format, nonzero dimensions, expected aspect ratio within rounding tolerance, no enlargement, and SHA-256/byte size.
5. Upload with the correct `Content-Type: image/webp`, immutable cache control, and source/variant SHA metadata. Use create-only semantics: if a key exists, verify its size, checksum metadata, and content type; never overwrite it.
6. Verify each uploaded object by an R2 metadata read and a public-host GET of a rotating sample plus every newly uploaded first/last object. A membership becomes `ready` only when all required keys pass.
7. Produce a URL map only for `ready` memberships. Produce a separate exception report for failed fetches, attribution gaps, invalid images, transcode errors, and upload/verification failures.

Suggested durable layout on Sean's Pi:

```text
/mnt/external/where-on-earth/image-mirror/
  raw/sha256/ab/<source-sha256>        # immutable raw-input cache
  variants/v1/<source-sha256>/w*.webp
  runs/<run-id>/manifest.jsonl
  runs/<run-id>/url-map.json
  runs/<run-id>/exceptions.jsonl
  runs/<run-id>/meter.json
```

Each JSONL manifest record is one canonical source and contains at least:

```json
{
  "schema": 1,
  "canonical_source_url": "https://...",
  "source_urls": ["https://...utm_source=..."],
  "references": [{"file":"assets/locations.json","id":"paris"}],
  "license": "CC BY-SA 4.0",
  "attribution": "Author name / Wikimedia Commons",
  "source_sha256": "...",
  "source_mime": "image/jpeg",
  "source_width": 1280,
  "source_height": 853,
  "source_bytes": 234567,
  "variants": [{"width":256,"actual_width":256,"height":171,"key":"photos/v1/sha256/.../w256.webp","sha256":"...","bytes":12345,"status":"verified"}],
  "status": "ready",
  "error": null
}
```

Keep `credits.html` and the per-image source metadata authoritative. The ingest manifest adds an auditable copy; it does not replace visible attribution. The build must check that all rewritten records still resolve to their original source/attribution entry.

## Metered-pipeline accounting

The raw-input cache is `/mnt/external/where-on-earth/image-mirror/raw/sha256/`. A normal full rerun against a warm, intact cache performs **zero Wikimedia downloads**. It hashes/decodes the 2,106 cached logical inputs, reuses verified local variants, performs one paginated R2 prefix listing (Class A; currently at most seven list requests for 6,318 objects at 1,000 keys/page), and performs no uploads when reconciliation matches. Public sample GETs are Class B reads.

A cold initial run downloads exactly 2,106 canonical URLs minus failures/content-hash aliases discovered only after download. Its exact byte volume is unknowable from repository data and must be measured by the inventory/fetch preflight, not presented as false precision. Planning range is 0.6--2.5 GB of source downloads. It creates at most 6,318 variant objects (three per source; fewer for failures and content duplicates), therefore at most 6,318 R2 Class A `PutObject` operations plus roughly seven Class A list operations. Output is expected to be 0.6--1.2 GB; the preflight's encoded representative sample must replace that estimate before approval.

A forced rebuild after deleting only local derived variants still has zero network input downloads and zero R2 puts when output hashes match existing objects. A genuinely empty-bucket re-upload costs the same at-most 6,318 Class A puts and output bytes as the initial upload. No design step deletes R2 objects automatically.

Every run writes `meter.json` with raw cache hits/misses/bytes, fetch requests/bytes, transcodes, planned/attempted/succeeded/skipped puts, list pages, public verification GETs, and object/output bytes. At the end of **every run**, reconcile:

- manifest `verified` variant count, keys, SHA-256 values, and bytes;
- a complete R2 `photos/v1/` listing count and summed sizes;
- the run's operation counters against Cloudflare's R2 usage dashboard/export when it becomes available (dashboard totals can lag, so retain run ID and timestamps).

Any missing, extra, size-mismatched, or hash-metadata-mismatched object fails the run and blocks rewrite. Report extra objects but never delete them without a separately reviewed cleanup plan.

## Data rewrite and mixed-state behavior

Generate `url-map.json` from verified manifest rows, mapping every exact original string (including query-junk spellings) to its immutable `w1280.webp` URL. Apply it structurally to only the `image` fields of the four named JSON files. Preserve array order, all other fields, and formatting. The rewrite verifier must prove entry counts unchanged, non-image fields byte-for-byte semantically equal, every R2 URL present in the verified manifest, and every exception still equal to its original Wikimedia URL.

Runtime fallback is required because verification cannot make future R2/CDN outages impossible. The same image-sizing helper should attach one `error` fallback per image: for mirror URLs, look up the original source URL from a generated compact `assets/image-source-fallbacks.json`, replace `src` once, and mark the element to prevent a loop. Existing Wikimedia URLs need no lookup and retain existing error behavior. Load the fallback map lazily on the first mirrored-image error so it does not tax normal startup. A 404, decode failure, or unsupported WebP therefore falls back to Wikimedia. Mixed state is safe because the helper passes Wikimedia URLs through unchanged.

Deployment order is: create/verify the image custom domain; upload and reconcile objects; deploy the helper/fallback map while data still points to Wikimedia; then commit the four-file data rewrite. Old application code can display the `w1280.webp` strings, and new code can display old Wikimedia strings, so either side of the data deployment remains compatible.

The location/trivia authoring pipeline must gain a mandatory ingest gate. A new record enters with its Wikimedia source and attribution; the Pi job validates, caches, transcodes, uploads, reconciles, and returns the immutable mirror URL plus fallback-map entry. Only then is its `image` rewritten. If ingest fails, the author may merge the record with the Wikimedia URL and the exception report must retain it for retry. Quarantine follows the same process and never uploads twice merely because an item later moves files.

## Cache-layer decision

V1 deliberately does **not** intercept `images.where-on.earth` in `sw.js`. Photos use Cloudflare's tiered cache, immutable HTTP caching, and the browser's ordinary HTTP cache. `woe-tiles-v1` continues to intercept only GETs to `tiles.where-on.earth`, remains capped near 100 MiB, and contains no photo request. Conversely, no service-worker photo cache exists that could evict a tile. Separate host plus separate/no Cache Storage gives a direct proof of non-interference: the tile fetch predicate cannot match the image hostname, and Cache Storage eviction code opens only `woe-tiles-v1`.

The tradeoff is plain: repeat passport browsing after the browser evicts HTTP entries may read from Cloudflare again and offline passports will not gain new photo availability. In return, v1 avoids pinning an unmeasured photo working set in device storage and avoids photos churning globe tiles.

If telemetry later justifies offline photo caching, add an image-host-only handler and a distinct `woe-photos-v1` cache. Size its cap from p95 measured variant bytes times a realistic session: for example, visible passport rows plus two screens of look-ahead, not the full collection. A provisional formula is `cap = min(50 MiB, 1.25 * p95(w256 bytes) * 150 items + 1.25 * p95(w1280 bytes) * 10 details)`, rounded up after measurement. Its trimming function must receive/open only `woe-photos-v1`; tile activation cleanup must match only `woe-tiles-`, and photo cleanup only `woe-photos-`. This preserves mutual non-eviction at the application level, although a browser may still enforce a global origin quota—another reason the separate image origin is preferable.

## Rollback

The migration itself is data-only. Keep the pre-rewrite four JSON files and generated URL map in the migration commit history. Roll back by reverting the four data-file changes (and the generated fallback map if it has no remaining mirror entries), redeploying, and allowing clients to return to Wikimedia URLs. Do not delete R2 objects during rollback: immutable orphaned objects are harmless and retaining them keeps rollback/retry recoverable. The helper can remain because it is a no-op for Wikimedia URLs; the image custom domain can remain until traffic confirms the rollback.

If rollback is needed before the data rewrite, no user-visible rollback exists: stop the run and retain its manifest/cache. Failed images were never rewritten. If a subset somehow ships, applying the inverse URL map restores only that subset deterministically.

## Risks and recommended answers

| Risk / open question | Recommended answer |
| --- | --- |
| Custom-domain creation needs authority the stored token lacks | Sean creates `images.where-on.earth` on the existing bucket before the build; do not fall back silently to the tile host. |
| Bucket free-tier capacity is shared with 3.27 GB of tiles | Run the source/output-byte preflight and enforce an 8 GB total stop threshold, leaving at least 2 GB headroom. |
| Wikimedia rate limits bulk fetches | Pi raw cache, bounded per-host concurrency, `Retry-After`, exponential backoff, and resumability; never make a failed source block safe successes. |
| Different URLs may be identical, while identical-looking thumbnails may not be | Canonical-URL grouping first, SHA-256 payload grouping second; source hash owns the object path. |
| Source files can be renamed/deleted | Cache raw bytes and preserve original URLs/attribution in the manifest and credits. |
| Incorrect content or an HTML error page could be mirrored | Decode and dimension-check inputs and outputs; content type alone is insufficient. |
| Immutable cache could serve stale photos after re-sourcing | Source-hashed/versioned keys and no overwrite; data rewrite points to a new hash. |
| WebP-only support may exclude a legacy browser | Recommended WebP plus one-shot Wikimedia fallback. If legacy support is an explicit product requirement, add JPEG siblings and `<picture>` rather than content negotiation at immutable URLs. |
| A valid R2 object later 404s or the image host is unavailable | Lazy original-URL fallback map and one-shot image error handling. |
| Photo caching could evict globe tiles | No photo service-worker cache in v1 and a distinct image hostname. Revisit only with measured weights/session telemetry and a separately named cache. |
| Attribution could drift during rewrite | Make attribution presence a readiness gate and verify every mirror URL maps back to its source and visible credit record. |
| Quarantine data may never be served | Ingest it because it is explicitly in scope and may be promoted later, but deduplicate it with active/trivia sources and keep its records quarantined. |
| Estimated byte budget is not an exact measurement | Sean approves only after the Pi preflight replaces the estimate with measured raw bytes and representative encoded output projections. |

## Build-pass acceptance criteria

- Inventory counts reproduce this document or the build stops and explains repository drift.
- Every rewritten URL has a `ready` manifest row and three verified immutable variants; every failure stays on its exact original URL and appears in exceptions.
- R2 listing, manifest, and meter reconcile for the run.
- Automated tests cover canonicalization, shared URL/content dedupe, invalid/error payload rejection, no-upscale behavior, resume/idempotency, structural rewrite purity, one-shot fallback, and variant URL selection per surface.
- A browser check confirms WebP decoding, HTTP immutable headers, attribution links, mixed Wikimedia/R2 display, forced R2 404 fallback, and that `woe-tiles-v1` contains no `images.where-on.earth` requests.
- The existing test suite passes, and rollback via the inverse URL map restores the four original datasets.
