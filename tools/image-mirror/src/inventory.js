import { readFileSync } from 'node:fs';
import path from 'node:path';

import { canonicalizeUrl } from './canonicalize.js';
import { isWikimediaImageUrl, wikimediaHost } from './wikimedia.js';

// The four data files in scope, per the brief and design (Deliverable 1).
export const DATA_FILES = [
  'assets/locations.json',
  'assets/locations-bank.json',
  'assets/locations-bank-quarantine.json',
  'assets/trivia-bank.json',
];

export function readDataFile(repoRoot, relPath) {
  const abs = path.join(repoRoot, relPath);
  return JSON.parse(readFileSync(abs, 'utf8'));
}

const emptyHostCounts = () => ({
  'thumb.wikimedia.org': 0,
  'upload.wikimedia.org': 0,
  'commons.wikimedia.org': 0,
});

// Scans the four data files exactly as docs/image-r2-mirror-design.md
// describes: a row's top-level "image" field is a membership when it is a
// Wikimedia HTTP(S) URL; everything else is a non-image gap. Grouping is
// done twice, matching the design: first by exact string (per-file
// dedupe/counts), then by canonical URL (cross-file dedupe for the ingest).
export function buildInventory(repoRoot, dataFiles = DATA_FILES) {
  const perFile = {};
  const nonImageGaps = {};
  // exact URL -> Set<file> it appears in (for cross-file membership counts)
  const unionFilesByUrl = new Map();
  // canonical URL -> { canonicalUrl, exactUrls:Set, memberships:[...] }
  const byCanonical = new Map();

  for (const file of dataFiles) {
    const rows = readDataFile(repoRoot, file);
    const exactSet = new Set();
    const gaps = [];
    let imageReferences = 0;

    rows.forEach((row, index) => {
      const img = row && row.image;
      if (isWikimediaImageUrl(img)) {
        imageReferences += 1;
        exactSet.add(img);

        if (!unionFilesByUrl.has(img)) unionFilesByUrl.set(img, new Set());
        unionFilesByUrl.get(img).add(file);

        const canonicalUrl = canonicalizeUrl(img);
        if (!byCanonical.has(canonicalUrl)) {
          byCanonical.set(canonicalUrl, { canonicalUrl, exactUrls: new Set(), memberships: [] });
        }
        const entry = byCanonical.get(canonicalUrl);
        entry.exactUrls.add(img);
        entry.memberships.push({ file, id: (row && row.id) ?? null, index, sourceUrl: img });
      } else {
        gaps.push((row && row.id) ?? `${file}#${index}`);
      }
    });

    const hostCounts = emptyHostCounts();
    for (const url of exactSet) hostCounts[wikimediaHost(url)] += 1;

    perFile[file] = {
      entries: rows.length,
      imageReferences,
      exactUniqueUrls: exactSet.size,
      internalRepeats: imageReferences - exactSet.size,
      hostCounts,
    };
    nonImageGaps[file] = gaps;
  }

  const unionHostCounts = emptyHostCounts();
  for (const url of unionFilesByUrl.keys()) unionHostCounts[wikimediaHost(url)] += 1;

  const crossFileUrls = [...unionFilesByUrl.entries()].filter(([, files]) => files.size > 1);
  const crossFilePairCounts = new Map(); // "fileA|fileB" -> count
  for (const [, files] of crossFileUrls) {
    const sorted = [...files].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const key = `${sorted[i]}|${sorted[j]}`;
        crossFilePairCounts.set(key, (crossFilePairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const canonicalSources = [...byCanonical.values()].map((entry) => ({
    canonicalUrl: entry.canonicalUrl,
    exactUrls: [...entry.exactUrls],
    memberships: entry.memberships,
  }));

  return {
    perFile,
    nonImageGaps,
    totalMemberships: Object.values(perFile).reduce((sum, f) => sum + f.exactUniqueUrls, 0),
    unionExactUniqueCount: unionFilesByUrl.size,
    unionHostCounts,
    crossFileUrlCount: crossFileUrls.length,
    crossFilePairCounts: Object.fromEntries(crossFilePairCounts),
    canonicalSources,
    canonicalUniqueCount: canonicalSources.length,
  };
}
