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
