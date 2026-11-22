import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { planRewrite, rewriteFileText, rewriteDataFile } from '../tools/image-mirror/src/rewrite.js';

test('planRewrite counts rewritten/exception/non-image rows without touching anything', () => {
  const urlMap = { 'https://upload.wikimedia.org/x/a.jpg': 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp' };
  const rows = [
    { id: 'a', image: 'https://upload.wikimedia.org/x/a.jpg' },
    { id: 'b', image: 'https://upload.wikimedia.org/x/b.jpg' }, // no mirror yet -> exception
    { id: 'c' }, // non-image gap
  ];
  const plan = planRewrite(rows, urlMap);
  assert.deepEqual(plan, { total: 3, rewritten: 1, exceptions: 1, nonImage: 1 });
});

test('rewriteFileText replaces only the mapped image URL literal and leaves every other byte untouched', () => {
  const rawText = [
    '[',
    ' {',
    '  "id": "a",',
    '  "image": "https://upload.wikimedia.org/x/a.jpg",',
    '  "fact": "contains the string https://upload.wikimedia.org/x/a.jpg in prose, left alone? no -- only the image field value is targeted via its JSON literal, but since this exact literal only appears once as a field value here it must change only there"',
    ' }',
    ']',
    '',
  ].join('\n');
  const rows = [{ id: 'a', image: 'https://upload.wikimedia.org/x/a.jpg' }];
  const urlMap = { 'https://upload.wikimedia.org/x/a.jpg': 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp' };

  const out = rewriteFileText(rawText, rows, urlMap);
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].image, 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp');
  assert.equal(parsed[0].id, 'a');
  // Everything outside the literal "image" value is byte-for-byte unchanged.
  assert.equal(out.split('\n')[0], '[');
  assert.equal(out.split('\n')[2], '  "id": "a",');
});

test('rewriteFileText leaves an exception row on its exact original URL', () => {
  const rawText = '[{"id":"a","image":"https://upload.wikimedia.org/x/a.jpg"}]\n';
  const rows = [{ id: 'a', image: 'https://upload.wikimedia.org/x/a.jpg' }];
  const out = rewriteFileText(rawText, rows, {}); // empty url-map: nothing is ready yet
  assert.equal(out, rawText);
});

test('rewriteFileText rewrites every row sharing the same exact URL identically', () => {
  const url = 'https://upload.wikimedia.org/x/dup.jpg';
  const mirrored = 'https://images.where-on.earth/photos/v1/sha256/bb/w1280.webp';
  const rawText = `[{"id":"a","image":"${url}"},{"id":"b","image":"${url}"}]\n`;
  const rows = [{ id: 'a', image: url }, { id: 'b', image: url }];
  const out = rewriteFileText(rawText, rows, { [url]: mirrored });
  const parsed = JSON.parse(out);
  assert.equal(parsed[0].image, mirrored);
  assert.equal(parsed[1].image, mirrored);
});

test('rewriteDataFile dry-run (default) reports counts and does not write the file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-rewrite-'));
  try {
    const rawText = '[{"id":"a","image":"https://upload.wikimedia.org/x/a.jpg"}]\n';
    const file = path.join(dir, 'locations.json');
    writeFileSync(file, rawText);
    const urlMap = { 'https://upload.wikimedia.org/x/a.jpg': 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp' };

    const report = rewriteDataFile(dir, 'locations.json', urlMap); // write defaults to false
    assert.deepEqual(report, { file: 'locations.json', total: 1, rewritten: 1, exceptions: 0, nonImage: 0 });
    assert.equal(readFileSync(file, 'utf8'), rawText, 'dry-run must not modify the file on disk');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rewriteDataFile with write:true applies the rewrite, preserving entry count and non-image fields', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-rewrite-'));
  try {
    const rawText = '[\n {\n  "id": "a",\n  "lat": 1.5,\n  "image": "https://upload.wikimedia.org/x/a.jpg"\n }\n]\n';
    const file = path.join(dir, 'locations.json');
    writeFileSync(file, rawText);
    const mirrored = 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp';
    const urlMap = { 'https://upload.wikimedia.org/x/a.jpg': mirrored };

    rewriteDataFile(dir, 'locations.json', urlMap, { write: true });
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(after.length, 1);
    assert.equal(after[0].id, 'a');
    assert.equal(after[0].lat, 1.5);
    assert.equal(after[0].image, mirrored);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the inverse url-map restores the original dataset (rollback)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-rewrite-'));
  try {
    const original = 'https://upload.wikimedia.org/x/a.jpg';
    const mirrored = 'https://images.where-on.earth/photos/v1/sha256/aa/w1280.webp';
    const rawText = `[{"id":"a","image":"${original}"}]\n`;
    const file = path.join(dir, 'locations.json');
    writeFileSync(file, rawText);

    rewriteDataFile(dir, 'locations.json', { [original]: mirrored }, { write: true });
    const rewrittenRows = JSON.parse(readFileSync(file, 'utf8'));
    rewriteDataFile(dir, 'locations.json', { [mirrored]: original }, { write: true });
    assert.equal(readFileSync(file, 'utf8'), rawText);
    assert.equal(rewrittenRows[0].image, mirrored);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
