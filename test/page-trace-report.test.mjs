import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePageTrace } from '../scripts/sat/page-trace-report.mjs';

let nextId = 1;
function mark(t, type, data) { return { id: 0, phase: 'mark', type, t, data }; }
function start(t, type, data) { const id = nextId++; return [{ id, phase: 'start', type, t, data }, id]; }
function end(id, t, data) { return { id, phase: 'end', t, data }; }

test('two rounds: a warm repeat round reports zero new page spans, not round one\'s counts', () => {
  const [fetchA, fa] = start(2, 'page-fetch', { src: 'a', pool: 'pages' });
  const [decodeA, da] = start(10, 'page-decode', { src: 'a', pool: 'pages' });
  const [uploadA, ua] = start(15, 'page-upload', { src: 'a', pool: 'pages' });
  const [fetchB, fb] = start(2, 'page-fetch', { src: 'b', pool: 'pages' });
  const [decodeB, db] = start(10, 'page-decode', { src: 'b', pool: 'pages' });
  const [uploadB, ub] = start(15, 'page-upload', { src: 'b', pool: 'pages' });
  const [prep1, p1] = start(1, 'page-prep', { textureCount: 2 });
  const [prep2, p2] = start(102, 'page-prep', {});
  const events = [
    mark(0, 'page-round', { path: 'pages', lat: 1, lng: 1 }),
    mark(1, 'page-plan', { textureCount: 2 }),
    fetchA, end(fa, 10, { bytes: 100 }),
    decodeA, end(da, 15, {}),
    uploadA, end(ua, 16, {}),
    fetchB, end(fb, 10, { bytes: 100 }),
    decodeB, end(db, 15, {}),
    uploadB, end(ub, 16, {}),
    prep1, end(p1, 16, {}),
    mark(20, 'input-start', {}),
    mark(100, 'page-round', { path: 'pages', lat: 1, lng: 1 }), // warm repeat, same plan, already resident
    mark(101, 'page-plan', { textureCount: 2 }),
    prep2, end(p2, 102, {}),
    mark(110, 'input-start', {}),
  ];
  const summary = summarizePageTrace(events);
  assert.equal(summary.rounds.length, 2);
  assert.equal(summary.rounds[0].pageSpanCount, 6);
  assert.equal(summary.rounds[0].firstInputMs, 20);
  assert.equal(summary.rounds[1].pageSpanCount, 0, 'warm repeat loads nothing new');
  assert.equal(summary.rounds[1].firstInputMs, 110);
});

test('a round with no input reports that fact, not a neighboring round\'s timestamp', () => {
  const [fetchX, fx] = start(2, 'page-fetch', { src: 'x', pool: 'pages' });
  const events = [
    mark(0, 'page-round', { path: 'pages' }),
    fetchX, end(fx, 4, {}),
    mark(50, 'page-round', { path: 'pages' }),
    mark(60, 'input-start', {}),
  ];
  const summary = summarizePageTrace(events);
  assert.equal(summary.rounds[0].hasInput, false);
  assert.equal(summary.rounds[0].firstInputMs, null);
  assert.equal(summary.rounds[0].overlapsFirstInput, null, 'overlap is inapplicable, not an inherited false');
  assert.equal(summary.rounds[1].hasInput, true);
  assert.equal(summary.rounds[1].firstInputMs, 60);
});

test('preparation overlapping first input: a load started before input but finishing after counts as overlap', () => {
  const [prep, p] = start(0, 'page-prep', {});
  const [fetchY, fy] = start(1, 'page-fetch', { src: 'y', pool: 'pages' });
  const [decodeY, dy] = start(10, 'page-decode', { src: 'y', pool: 'pages' });
  const [uploadY, uy] = start(12, 'page-upload', { src: 'y', pool: 'pages' });
  const events = [
    mark(0, 'page-round', { path: 'pages' }),
    prep,
    fetchY,
    mark(5, 'input-start', {}), // fires while prep and the fetch are both still open
    end(fy, 10, {}),
    decodeY, end(dy, 12, {}),
    uploadY, end(uy, 13, {}),
    end(p, 13, {}),
  ];
  const summary = summarizePageTrace(events);
  const round = summary.rounds[0];
  assert.equal(round.firstInputMs, 5);
  assert.equal(round.overlapsFirstInput, true);
  const overlappingTypes = round.overlappingSpans.map((s) => s.type).sort();
  assert.deepEqual(overlappingTypes, ['page-fetch', 'page-prep']);
  assert.equal(round.postInputPageSpanCount, 2, 'decode and upload both started after input, by start time alone');
});

test('a span that starts before a later page-round mark and ends after it stays assigned to the originating round', () => {
  const [fetchZ, fz] = start(1, 'page-fetch', { src: 'z', pool: 'pages' });
  const events = [
    mark(0, 'page-round', { path: 'pages' }),
    fetchZ,
    mark(5, 'page-round', { path: 'pages' }), // round 2 begins before span z closes
    end(fz, 8, {}),
  ];
  const summary = summarizePageTrace(events);
  assert.equal(summary.rounds[0].pageSpanCount, 1);
  assert.equal(summary.rounds[1].pageSpanCount, 0);
});

test('historical trace naming (tile-fetch/decode/upload-submit) is still parsed pool-aware: pool pages counts as page work, everything else stays a separate legacy count', () => {
  const [legacyPage, lp] = start(1, 'tile-fetch', { src: 'legacy-page', pool: 'pages' });
  const [realTile, rt] = start(1, 'tile-fetch', { src: 'real-tile', pool: 'visible' });
  const [legacyDecode, ld] = start(1, 'decode', { src: 'real-tile' }); // no pool at all: surface.js's own decode span
  const events = [
    mark(0, 'page-round', { path: 'pages' }),
    legacyPage, end(lp, 5, { bytes: 1 }),
    realTile, end(rt, 5, { bytes: 1 }),
    legacyDecode, end(ld, 5, {}),
  ];
  const summary = summarizePageTrace(events);
  assert.equal(summary.totalPageSpans, 1);
  assert.equal(summary.totalLegacyTileSpans, 2);
  assert.equal(summary.rounds[0].pageSpanCount, 1);
});
