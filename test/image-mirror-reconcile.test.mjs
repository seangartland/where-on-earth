import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileManifestWithR2 } from '../tools/image-mirror/src/reconcile.js';

const readyRow = {
  status: 'ready',
  canonical_source_url: 'https://upload.wikimedia.org/x/a.jpg',
  variants: [
    { width: 256, key: 'photos/v1/sha256/aa/w256.webp', status: 'verified', bytes: 100 },
    { width: 640, key: 'photos/v1/sha256/aa/w640.webp', status: 'verified', bytes: 200 },
    { width: 1280, key: 'photos/v1/sha256/aa/w1280.webp', status: 'verified', bytes: 300 },
  ],
};

test('a clean run with every expected key present at the right size reconciles ok', () => {
  const r2Objects = [
    { key: 'photos/v1/sha256/aa/w256.webp', size: 100 },
    { key: 'photos/v1/sha256/aa/w640.webp', size: 200 },
    { key: 'photos/v1/sha256/aa/w1280.webp', size: 300 },
  ];
  const result = reconcileManifestWithR2([readyRow], r2Objects);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.extra, []);
  assert.deepEqual(result.sizeMismatched, []);
});

test('a key the manifest expects but R2 does not have is reported as missing and fails reconciliation', () => {
  const r2Objects = [
    { key: 'photos/v1/sha256/aa/w256.webp', size: 100 },
    { key: 'photos/v1/sha256/aa/w640.webp', size: 200 },
  ];
  const result = reconcileManifestWithR2([readyRow], r2Objects);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['photos/v1/sha256/aa/w1280.webp']);
});

test('an object in R2 with no matching manifest entry is reported as extra, not deleted', () => {
  const r2Objects = [
    { key: 'photos/v1/sha256/aa/w256.webp', size: 100 },
    { key: 'photos/v1/sha256/aa/w640.webp', size: 200 },
    { key: 'photos/v1/sha256/aa/w1280.webp', size: 300 },
    { key: 'photos/v1/sha256/zz/w256.webp', size: 999 },
  ];
  const result = reconcileManifestWithR2([readyRow], r2Objects);
  assert.equal(result.ok, false);
  assert.deepEqual(result.extra, ['photos/v1/sha256/zz/w256.webp']);
});

test('a size mismatch between the manifest and the live object fails reconciliation', () => {
  const r2Objects = [
    { key: 'photos/v1/sha256/aa/w256.webp', size: 999 },
    { key: 'photos/v1/sha256/aa/w640.webp', size: 200 },
    { key: 'photos/v1/sha256/aa/w1280.webp', size: 300 },
  ];
  const result = reconcileManifestWithR2([readyRow], r2Objects);
  assert.equal(result.ok, false);
  assert.deepEqual(result.sizeMismatched, [{ key: 'photos/v1/sha256/aa/w256.webp', expectedBytes: 100, actualBytes: 999 }]);
});

test('a non-ready manifest row contributes no expected keys', () => {
  const failedRow = { status: 'failed', variants: [] };
  const result = reconcileManifestWithR2([failedRow], []);
  assert.equal(result.expectedCount, 0);
  assert.equal(result.ok, true);
});
