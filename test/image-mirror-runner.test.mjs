import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PILOT_SIZE,
  PI_FETCH_CONCURRENCY,
  PI_FETCH_DELAY_MS,
  assertValidStage,
  sourcesForStage,
  needsWork,
  pendingSources,
  selectPublicVerificationSample,
  buildSampleSheet,
  sampleSheetHtml,
  summarizeManifest,
  buildExceptions,
  createRunLogger,
} from '../tools/image-mirror/src/runner.js';

function source(url) {
  return { canonicalUrl: url, exactUrls: [url], memberships: [] };
}

test('throttle constants are conservative (near-serial, with a real delay)', () => {
  assert.ok(PI_FETCH_CONCURRENCY <= 3);
  assert.ok(PI_FETCH_DELAY_MS > 0);
});

test('assertValidStage rejects anything other than "pilot" or "full"', () => {
  assert.doesNotThrow(() => assertValidStage('pilot'));
  assert.doesNotThrow(() => assertValidStage('full'));
  assert.throws(() => assertValidStage('bogus'));
});

test('sourcesForStage("pilot") is the first PILOT_SIZE canonical sources in inventory order', () => {
  const sources = Array.from({ length: PILOT_SIZE + 10 }, (_, i) => source(`https://upload.wikimedia.org/x/${i}.jpg`));
  const pilot = sourcesForStage(sources, 'pilot');
  assert.equal(pilot.length, PILOT_SIZE);
  assert.deepEqual(pilot, sources.slice(0, PILOT_SIZE));
});

test('sourcesForStage("full") is the entire inventory, not a slice', () => {
  const sources = Array.from({ length: 5 }, (_, i) => source(`https://upload.wikimedia.org/x/${i}.jpg`));
  assert.deepEqual(sourcesForStage(sources, 'full'), sources);
});

test('sourcesForStage("pilot") honors a smaller pilotSize override', () => {
  const sources = Array.from({ length: 10 }, (_, i) => source(`https://upload.wikimedia.org/x/${i}.jpg`));
  assert.equal(sourcesForStage(sources, 'pilot', { pilotSize: 3 }).length, 3);
});

test('needsWork is true for a missing row or any status other than "ready"', () => {
  assert.equal(needsWork(undefined), true);
  assert.equal(needsWork({ status: 'pending' }), true);
  assert.equal(needsWork({ status: 'failed' }), true);
  assert.equal(needsWork({ status: 'attribution-failed' }), true);
  assert.equal(needsWork({ status: 'ready' }), false);
});

test('pendingSources separates already-"ready" sources from everything needing (re)work', () => {
  const a = source('https://upload.wikimedia.org/x/a.jpg');
  const b = source('https://upload.wikimedia.org/x/b.jpg');
  const c = source('https://upload.wikimedia.org/x/c.jpg');
  const manifestByUrl = new Map([
    [a.canonicalUrl, { status: 'ready' }],
    [b.canonicalUrl, { status: 'failed' }],
  ]);
  const { pending, alreadyDone } = pendingSources([a, b, c], manifestByUrl);
  assert.deepEqual(pending, [b, c]);
  assert.equal(alreadyDone, 1);
});

test('a relaunch after a kill (same manifest state) reprocesses nothing already "ready"', () => {
  const sources = Array.from({ length: 5 }, (_, i) => source(`https://upload.wikimedia.org/x/${i}.jpg`));
  const manifestByUrl = new Map(sources.map((s) => [s.canonicalUrl, { status: 'ready' }]));
  const { pending, alreadyDone } = pendingSources(sources, manifestByUrl);
  assert.deepEqual(pending, []);
  assert.equal(alreadyDone, 5);
});

test('selectPublicVerificationSample always includes the first and last newly-uploaded key plus a rotating sample', () => {
  const keys = Array.from({ length: 25 }, (_, i) => `photos/v1/sha256/${i}/w256.webp`);
  const sample = selectPublicVerificationSample(keys, { every: 10 });
  assert.ok(sample.includes(keys[0]));
  assert.ok(sample.includes(keys[24]));
  assert.ok(sample.includes(keys[10]));
  assert.ok(sample.includes(keys[20]));
});

test('selectPublicVerificationSample on an empty upload set returns nothing', () => {
  assert.deepEqual(selectPublicVerificationSample([]), []);
});

function readyRow(canonicalUrl, { withW640 = true } = {}) {
  return {
    canonical_source_url: canonicalUrl,
    source_sha256: 'abc123',
    attribution: 'Jane Doe / Wikimedia Commons',
    source_page_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
    status: 'ready',
    variants: withW640
      ? [{ width: 640, actual_width: 640, height: 480, key: 'photos/v1/sha256/abc123/w640.webp', sha256: 'deadbeef', status: 'verified' }]
      : [],
  };
}

test('buildSampleSheet selects only "ready" rows with a verified w640 variant', () => {
  const rows = [
    readyRow('a'),
    { ...readyRow('b'), status: 'failed' },
    readyRow('c', { withW640: false }),
  ];
  const sheet = buildSampleSheet(rows, { minCount: 1 });
  assert.equal(sheet.entries.length, 1);
  assert.equal(sheet.entries[0].canonical_source_url, 'a');
  assert.equal(sheet.entries[0].url, 'https://images.where-on.earth/photos/v1/sha256/abc123/w640.webp');
});

test('buildSampleSheet reports ok:false when fewer than minCount entries are available', () => {
  const rows = [readyRow('a'), readyRow('b')];
  const sheet = buildSampleSheet(rows, { minCount: 12 });
  assert.equal(sheet.ok, false);
  assert.equal(sheet.entries.length, 2);
});

test('buildSampleSheet reports ok:true once at least minCount entries are available', () => {
  const rows = Array.from({ length: 12 }, (_, i) => readyRow(`url-${i}`));
  const sheet = buildSampleSheet(rows, { minCount: 12 });
  assert.equal(sheet.ok, true);
  assert.equal(sheet.entries.length, 12);
});

test('sampleSheetHtml renders one <img> per entry and escapes attribution text', () => {
  const sheet = {
    entries: [{
      url: 'https://images.where-on.earth/photos/v1/sha256/abc/w640.webp',
      attribution: 'A & B <Author>',
      source_page_url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      sha256: 'abc',
    }],
  };
  const html = sampleSheetHtml(sheet);
  assert.ok(html.includes('<img src="https://images.where-on.earth/photos/v1/sha256/abc/w640.webp"'));
  assert.ok(!html.includes('<Author>'));
  assert.ok(html.includes('A &amp; B &lt;Author&gt;'));
});

test('summarizeManifest counts rows by status', () => {
  const rows = [
    { status: 'ready' }, { status: 'ready' },
    { status: 'pending' },
    { status: 'attribution-failed' },
    { status: 'failed' },
  ];
  assert.deepEqual(summarizeManifest(rows), { total: 5, ready: 2, pending: 1, attributionFailed: 1, failed: 1 });
});

test('buildExceptions lists every non-"ready" row with its status and error, never a "ready" row', () => {
  const rows = [
    { canonical_source_url: 'a', source_urls: ['a'], status: 'ready', error: null },
    { canonical_source_url: 'b', source_urls: ['b'], status: 'failed', error: 'verify-download-failed: decode-failed' },
    { canonical_source_url: 'c', source_urls: ['c'], status: 'attribution-failed', error: 'missing-attribution-fields' },
  ];
  const exceptions = buildExceptions(rows);
  assert.equal(exceptions.length, 2);
  assert.deepEqual(exceptions.map((e) => e.canonical_source_url), ['b', 'c']);
});

test('createRunLogger appends timestamped lines to the log file across calls', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'image-mirror-runner-'));
  try {
    const logPath = path.join(dir, 'nested', 'run.log');
    const log = createRunLogger(logPath);
    log('first');
    log('second');
    const contents = readFileSync(logPath, 'utf8');
    const lines = contents.trim().split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].endsWith('first'));
    assert.ok(lines[1].endsWith('second'));
    assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] first$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
