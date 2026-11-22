#!/usr/bin/env node
// Data-rewrite tool (BRIEF-image-r2-build.md deliverable 3). Dry-run by
// default: reports per-file counts without writing. Pass --write to apply
// the url-map for real -- never invoked that way in this lane; the
// boundary is "do NOT rewrite the production data files in this lane."
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DATA_FILES, readDataFile } from '../src/inventory.js';
import { planRewrite } from '../src/rewrite.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? fallback : process.argv[idx + 1];
}

function main() {
  const urlMapPath = arg('url-map', null);
  const write = process.argv.includes('--write');

  const urlMap = urlMapPath && existsSync(urlMapPath) ? JSON.parse(readFileSync(urlMapPath, 'utf8')) : {};
  if (!urlMapPath) {
    console.log('No --url-map given: running with an empty url-map, so every image row reports as an exception (dry-run shape check only).');
  }

  if (write) {
    console.error('Refusing: this lane does not rewrite production data files (see BRIEF-image-r2-build.md boundaries).');
    process.exitCode = 1;
    return;
  }

  console.log(`Dry-run rewrite report (url-map entries: ${Object.keys(urlMap).length}):`);
  for (const file of DATA_FILES) {
    const rows = readDataFile(REPO_ROOT, file);
    const report = planRewrite(rows, urlMap);
    console.log(`  ${file}: total=${report.total} rewritten=${report.rewritten} exceptions=${report.exceptions} nonImage=${report.nonImage}`);
  }
}

main();
