import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildInventory, DATA_FILES } from '../tools/image-mirror/src/inventory.js';
import { EXPECTED_INVENTORY_SNAPSHOT, diffFromExpectedSnapshot } from '../tools/image-mirror/src/expected-inventory.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

test('live inventory over the real repo data files matches the design-time snapshot exactly', () => {
  const inventory = buildInventory(REPO_ROOT);
  const mismatches = diffFromExpectedSnapshot(inventory);
  assert.deepEqual(mismatches, [], `repository drift from docs/image-r2-mirror-design.md: ${mismatches.join('; ')}`);
  assert.equal(inventory.canonicalUniqueCount, EXPECTED_INVENTORY_SNAPSHOT.canonicalUniqueCount);
  assert.equal(inventory.totalMemberships, EXPECTED_INVENTORY_SNAPSHOT.totalMemberships);
});

test('DATA_FILES lists exactly the four files named in the brief', () => {
  assert.deepEqual(DATA_FILES, [
    'assets/locations.json',
    'assets/locations-bank.json',
    'assets/locations-bank-quarantine.json',
    'assets/trivia-bank.json',
  ]);
});

function withFixtureRepo(fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'image-mirror-inventory-'));
  mkdirSync(path.join(root, 'assets'), { recursive: true });
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('non-Wikimedia or missing "image" fields are counted as non-image gaps, not memberships', () => {
  withFixtureRepo((root) => {
    writeFileSync(path.join(root, 'assets', 'a.json'), JSON.stringify([
      { id: 'has-image', image: 'https://upload.wikimedia.org/x/a.jpg' },
      { id: 'no-image-field' },
      { id: 'non-wikimedia', image: 'https://example.com/a.jpg' },
      { id: 'null-image', image: null },
    ]));
    const inventory = buildInventory(root, ['assets/a.json']);
    assert.equal(inventory.perFile['assets/a.json'].entries, 4);
    assert.equal(inventory.perFile['assets/a.json'].imageReferences, 1);
    assert.deepEqual(inventory.nonImageGaps['assets/a.json'], ['no-image-field', 'non-wikimedia', 'null-image']);
  });
});

test('identical exact URLs across two files count as one cross-file membership and one canonical source', () => {
  withFixtureRepo((root) => {
    const shared = 'https://upload.wikimedia.org/wikipedia/commons/a/shared.jpg';
    writeFileSync(path.join(root, 'assets', 'a.json'), JSON.stringify([{ id: 'a1', image: shared }]));
    writeFileSync(path.join(root, 'assets', 'b.json'), JSON.stringify([{ id: 'b1', image: shared }]));
    const inventory = buildInventory(root, ['assets/a.json', 'assets/b.json']);
    assert.equal(inventory.unionExactUniqueCount, 1);
    assert.equal(inventory.crossFileUrlCount, 1);
    assert.equal(inventory.canonicalUniqueCount, 1);
    assert.equal(inventory.canonicalSources[0].memberships.length, 2);
  });
});

test('two differently-spelled URLs that canonicalize to the same source collapse to one canonical source', () => {
  withFixtureRepo((root) => {
    const base = 'https://thumb.wikimedia.org/x/1280px-a.jpg';
    writeFileSync(path.join(root, 'assets', 'a.json'), JSON.stringify([
      { id: 'a1', image: `${base}?utm_source=commons.wikimedia.org` },
      { id: 'a2', image: `${base}?utm_source=en.wikipedia.org` },
    ]));
    const inventory = buildInventory(root, ['assets/a.json']);
    // Two distinct exact strings (different utm_ spellings) ...
    assert.equal(inventory.unionExactUniqueCount, 2);
    assert.equal(inventory.perFile['assets/a.json'].exactUniqueUrls, 2);
    // ... but one canonical source once utm_* is stripped.
    assert.equal(inventory.canonicalUniqueCount, 1);
    assert.equal(inventory.canonicalSources[0].exactUrls.length, 2);
    assert.equal(inventory.canonicalSources[0].memberships.length, 2);
  });
});

test('a within-file repeated URL counts once as exact-unique but twice as an image reference', () => {
  withFixtureRepo((root) => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/a/dup.jpg';
    writeFileSync(path.join(root, 'assets', 'a.json'), JSON.stringify([
      { id: 'a1', image: url },
      { id: 'a2', image: url },
    ]));
    const inventory = buildInventory(root, ['assets/a.json']);
    assert.equal(inventory.perFile['assets/a.json'].imageReferences, 2);
    assert.equal(inventory.perFile['assets/a.json'].exactUniqueUrls, 1);
    assert.equal(inventory.perFile['assets/a.json'].internalRepeats, 1);
  });
});

test('per-host counts are correct for each of the three Wikimedia hosts', () => {
  withFixtureRepo((root) => {
    writeFileSync(path.join(root, 'assets', 'a.json'), JSON.stringify([
      { id: 't', image: 'https://thumb.wikimedia.org/x/1px-a.jpg' },
      { id: 'u', image: 'https://upload.wikimedia.org/x/a.jpg' },
      { id: 'c', image: 'https://commons.wikimedia.org/wiki/File:a.jpg' },
    ]));
    const inventory = buildInventory(root, ['assets/a.json']);
    assert.deepEqual(inventory.perFile['assets/a.json'].hostCounts, {
      'thumb.wikimedia.org': 1,
      'upload.wikimedia.org': 1,
      'commons.wikimedia.org': 1,
    });
  });
});
