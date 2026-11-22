import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

// One manifest record per canonical source, schema per
// docs/image-r2-mirror-design.md's "Pi-side resumable ingest" section.
export const MANIFEST_SCHEMA = 1;

export function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) return [];
  const text = readFileSync(manifestPath, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

// Atomic write-then-rename so a killed process never leaves a half-written
// manifest in place (the design requires every phase to write atomically and
// resume from manifest state).
export function writeManifestAtomic(manifestPath, rows) {
  const tmpPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`;
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  writeFileSync(tmpPath, rows.length ? `${body}\n` : '');
  renameSync(tmpPath, manifestPath);
}

export function indexManifestByCanonicalUrl(rows) {
  const byUrl = new Map();
  for (const row of rows) byUrl.set(row.canonical_source_url, row);
  return byUrl;
}

// Builds a fresh manifest row for a canonical source the manifest has
// never seen before, merging inventory membership data with its
// attribution result (BRIEF-image-r2-ingest.md deliverable 1). A source
// whose attribution could not be resolved gets status "attribution-failed"
// and null license/author fields -- it is held out of the upload set (the
// runner never attempts fetch/transcode/upload for this status) and
// surfaces in the exception report, never silently uploaded.
export function buildManifestRowSkeleton(canonicalSource, attributionResult) {
  const base = {
    schema: MANIFEST_SCHEMA,
    canonical_source_url: canonicalSource.canonicalUrl,
    source_urls: canonicalSource.exactUrls,
    references: canonicalSource.memberships.map((m) => ({ file: m.file, id: m.id })),
    source_sha256: null,
    source_mime: null,
    source_width: null,
    source_height: null,
    source_bytes: null,
    variants: [],
  };

  if (attributionResult.status !== 'ok') {
    return {
      ...base,
      license: null,
      author: null,
      attribution: null,
      source_page_url: null,
      status: 'attribution-failed',
      error: attributionResult.reason,
    };
  }

  return {
    ...base,
    license: attributionResult.license,
    author: attributionResult.author,
    attribution: attributionResult.attribution,
    source_page_url: attributionResult.sourcePageUrl,
    status: 'pending',
    error: null,
  };
}

// Only "ready" rows (every required variant verified) contribute to the
// url-map; everything else must stay on its original Wikimedia URL.
export function buildUrlMap(manifestRows) {
  const urlMap = {};
  for (const row of manifestRows) {
    if (row.status !== 'ready') continue;
    const w1280 = (row.variants || []).find((v) => v.width === 1280 && v.status === 'verified');
    if (!w1280) continue;
    const mirroredUrl = `https://images.where-on.earth/${w1280.key}`;
    for (const sourceUrl of row.source_urls || [row.canonical_source_url]) {
      urlMap[sourceUrl] = mirroredUrl;
    }
  }
  return urlMap;
}
