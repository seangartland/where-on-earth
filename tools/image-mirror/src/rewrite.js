import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isWikimediaImageUrl } from './wikimedia.js';

// Dry-run counts for one file: how many rows would be rewritten, how many
// are non-image gaps left untouched, and how many are exceptions (a
// Wikimedia image row with no verified mirror yet, so it stays on its exact
// original URL). No file I/O beyond the read.
//
// Matching is keyed on urlMap membership, not on "is this a Wikimedia URL",
// so the same function and the same rewriteFileText below also drive
// rollback: applying the inverse map (mirrored URL -> original URL) rewrites
// rows whose current "image" is a mirrored URL, which is not itself a
// Wikimedia URL.
export function planRewrite(rows, urlMap) {
  let rewritten = 0;
  let exceptions = 0;
  let nonImage = 0;
  for (const row of rows) {
    const img = row && row.image;
    if (typeof img !== 'string') {
      nonImage += 1;
    } else if (urlMap[img]) {
      rewritten += 1;
    } else if (isWikimediaImageUrl(img)) {
      exceptions += 1;
    } else {
      nonImage += 1;
    }
  }
  return { total: rows.length, rewritten, exceptions, nonImage };
}

// Applies the url-map to raw file TEXT rather than re-serializing parsed
// JSON. This is deliberate: round-tripping these files through
// JSON.parse/JSON.stringify does not reproduce their original bytes (see
// R2-BUILD-REPORT.md), so a parse-and-reserialize rewrite would silently
// reformat unrelated fields. Targeted substring replacement on the exact
// JSON-encoded string literal leaves every other byte in the file
// untouched, which is what "preserve array order, all other fields, and
// formatting" requires. Wikimedia image URLs are plain ASCII, so
// JSON.stringify(url) reproduces the literal's exact original bytes.
export function rewriteFileText(rawText, rows, urlMap) {
  const uniqueImageValues = new Set(
    rows.map((row) => row && row.image).filter((img) => typeof img === 'string'),
  );
  let text = rawText;
  for (const currentUrl of uniqueImageValues) {
    const mappedUrl = urlMap[currentUrl];
    if (!mappedUrl) continue; // exception (or no entry in this map direction): leave untouched
    const literal = JSON.stringify(currentUrl);
    const replacement = JSON.stringify(mappedUrl);
    text = text.split(literal).join(replacement);
  }
  return text;
}

// Dry-run by default. Pass { write: true } to actually rewrite the file on
// disk (never invoked against the real assets/*.json files in this lane --
// see BRIEF-image-r2-build.md boundaries).
export function rewriteDataFile(repoRoot, relPath, urlMap, { write = false } = {}) {
  const abs = path.join(repoRoot, relPath);
  const rawText = readFileSync(abs, 'utf8');
  const rows = JSON.parse(rawText);
  const plan = planRewrite(rows, urlMap);
  if (write) {
    const newText = rewriteFileText(rawText, rows, urlMap);
    writeFileSync(abs, newText);
  }
  return { file: relPath, ...plan };
}
