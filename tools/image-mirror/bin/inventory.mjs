#!/usr/bin/env node
// Prints the inventory table (per-file and per-host counts, cross-file
// dedupe, non-image gaps) and checks it against the design-time snapshot.
// Reads only the four JSON data files; no network access.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildInventory } from '../src/inventory.js';
import { diffFromExpectedSnapshot } from '../src/expected-inventory.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function main() {
  const inventory = buildInventory(REPO_ROOT);
  const asJson = process.argv.includes('--json');

  if (asJson) {
    console.log(JSON.stringify(inventory, (key, value) => (value instanceof Set ? [...value] : value), 1));
    return;
  }

  console.log('Per-file inventory:');
  for (const [file, stats] of Object.entries(inventory.perFile)) {
    console.log(`  ${file}`);
    console.log(`    entries=${stats.entries} imageReferences=${stats.imageReferences} exactUniqueUrls=${stats.exactUniqueUrls} internalRepeats=${stats.internalRepeats}`);
    console.log(`    hosts: ${JSON.stringify(stats.hostCounts)}`);
    const gaps = inventory.nonImageGaps[file];
    console.log(`    nonImageGaps (${gaps.length}): ${JSON.stringify(gaps)}`);
  }
  console.log();
  console.log(`totalMemberships (sum of per-file exact-unique)=${inventory.totalMemberships}`);
  console.log(`unionExactUniqueCount=${inventory.unionExactUniqueCount}`);
  console.log(`unionHostCounts=${JSON.stringify(inventory.unionHostCounts)}`);
  console.log(`crossFileUrlCount=${inventory.crossFileUrlCount}`);
  console.log(`crossFilePairCounts=${JSON.stringify(inventory.crossFilePairCounts)}`);
  console.log(`canonicalUniqueCount=${inventory.canonicalUniqueCount}`);

  const mismatches = diffFromExpectedSnapshot(inventory);
  console.log();
  if (mismatches.length === 0) {
    console.log('Matches the design-time snapshot (docs/image-r2-mirror-design.md): no repository drift.');
  } else {
    console.log('DRIFT from the design-time snapshot:');
    for (const m of mismatches) console.log(`  - ${m}`);
    process.exitCode = 1;
  }
}

main();
