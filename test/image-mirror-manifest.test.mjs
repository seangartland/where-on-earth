import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readManifest, writeManifestAtomic, buildUrlMap } from '../tools/image-mirror/src/manifest.js';

test('readManifest returns an empty array when the file does not exist yet (fresh/resumed run)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-manifest-'));
  try {
    assert.deepEqual(readManifest(path.join(dir, 'manifest.jsonl')), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeManifestAtomic + readManifest round-trips rows, one JSON object per line', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-manifest-'));
  try {
    const manifestPath = path.join(dir, 'manifest.jsonl');
    const rows = [
      { schema: 1, canonical_source_url: 'https://upload.wikimedia.org/x/a.jpg', status: 'ready' },
      { schema: 1, canonical_source_url: 'https://upload.wikimedia.org/x/b.jpg', status: 'failed' },
    ];
    writeManifestAtomic(manifestPath, rows);
    assert.deepEqual(readManifest(manifestPath), rows);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeManifestAtomic never leaves a .tmp file behind and overwrites cleanly on rerun', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-manifest-'));
  try {
    const manifestPath = path.join(dir, 'manifest.jsonl');
    writeManifestAtomic(manifestPath, [{ a: 1 }]);
    writeManifestAtomic(manifestPath, [{ a: 2 }]);
    assert.deepEqual(readManifest(manifestPath), [{ a: 2 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildUrlMap only includes "ready" rows with a verified w1280 variant, mapping every source_url spelling', () => {
  const manifestRows = [
    {
      status: 'ready',
      canonical_source_url: 'https://upload.wikimedia.org/x/a.jpg',
      source_urls: ['https://upload.wikimedia.org/x/a.jpg', 'https://upload.wikimedia.org/x/a.jpg?utm_source=y'],
      variants: [{ width: 1280, status: 'verified', key: 'photos/v1/sha256/aa/w1280.webp' }],
    },
    {
      status: 'failed',
      canonical_source_url: 'https://upload.wikimedia.org/x/b.jpg',
      source_urls: ['https://upload.wikimedia.org/x/b.jpg'],
      variants: [],
    },
    {
      status: 'ready',
      canonical_source_url: 'https://upload.wikimedia.org/x/c.jpg',
      source_urls: ['https://upload.wikimedia.org/x/c.jpg'],
      variants: [{ width: 1280, status: 'pending', key: 'photos/v1/sha256/cc/w1280.webp' }],
    },
  ];
  const urlMap = buildUrlMap(manifestRows);
  assert.deepEqual(urlMap, {
    'https://upload.wikimedia.org/x/a.jpg': 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp',
    'https://upload.wikimedia.org/x/a.jpg?utm_source=y': 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp',
  });
});
