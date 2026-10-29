import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

const { PACK_KEY } = await import('../src/core/config.js');
const {
  STAMINA_PERIOD, accrue, spend, readPack, writePack, ensurePack,
  savePackResult, completePack, packOutcome, packSummary, packPool,
} = await import('../src/meta/pack-store.js');
const cities = JSON.parse(readFileSync(new URL('../assets/locations.json', import.meta.url)));
const pool = packPool(cities);
const raw = () => JSON.parse(localStorage.getItem(PACK_KEY));
const empty = (stamina = { stored: 2, nextAt: null }) => ({
  stamina, byType: { capitals: null, landmarks: null, landforms: null },
});

test.beforeEach(() => localStorage.clear());

test('accrual handles partial periods, multiple periods, and pauses at cap', () => {
  const record = empty({ stored: 0, nextAt: 1000 });
  accrue(record, 999);
  assert.deepEqual(record.stamina, { stored: 0, nextAt: 1000 });
  accrue(record, 1000 + STAMINA_PERIOD);
  assert.deepEqual(record.stamina, { stored: 2, nextAt: null });
});

test('spending from cap starts the clock; spending at one keeps it running', () => {
  const record = empty();
  assert.equal(spend(record, 5000), true);
  assert.deepEqual(record.stamina, { stored: 1, nextAt: 5000 + STAMINA_PERIOD });
  assert.equal(spend(record, 6000), true);
  assert.deepEqual(record.stamina, { stored: 0, nextAt: 5000 + STAMINA_PERIOD });
  assert.equal(spend(record, 7000), false);
});

test('fresh migration starts full and persists the new shape', () => {
  localStorage.setItem(PACK_KEY, JSON.stringify({ date: '2026-10-28', packs: [] }));
  assert.deepEqual(readPack(Date.parse('2026-10-29T12:00:00Z')), empty());
  assert.equal('date' in raw(), false);
});

test('legacy pack from today migrates its results and torn state', () => {
  const date = '2026-10-29';
  const legacyPack = { ids: pool.slice(0, 3).map((x) => x.id), results: [{ base: 1 }, null, null] };
  localStorage.setItem(PACK_KEY, JSON.stringify({ date, packs: [legacyPack] }));
  localStorage.setItem(`${PACK_KEY}-torn`, date);
  const record = readPack(Date.parse(`${date}T12:00:00Z`));
  assert.deepEqual(record.byType.capitals, { ...legacyPack, torn: true });
  assert.equal(record.stamina.stored, 2);
});

test('stale legacy pack is dropped', () => {
  localStorage.setItem(PACK_KEY, JSON.stringify({ date: '2026-10-28', packs: [{ ids: ['a', 'b', 'c'], results: [] }] }));
  assert.equal(readPack(Date.parse('2026-10-29T12:00:00Z')).byType.capitals, null);
});

test('per-type packs are isolated and retired unplayed ids redraw', () => {
  const record = empty();
  let n = 0;
  const random = () => ((n += 1) % pool.length) / pool.length;
  const capitals = ensurePack(record, 'capitals', pool, random);
  const otherPool = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  let m = 0;
  const landmarks = ensurePack(record, 'landmarks', otherPool, () => ((m += 1) % 3) / 3);
  assert.notEqual(capitals, landmarks);
  assert.deepEqual(new Set(landmarks.ids), new Set(['one', 'two', 'three']));
  landmarks.ids[1] = 'gone';
  landmarks.results[0] = { base: 10 };
  ensurePack(record, 'landmarks', otherPool, () => ((m += 1) % 3) / 3);
  assert.notEqual(landmarks.ids[1], 'gone');
  assert.equal(record.byType.capitals, capitals);
});

test('results summarize and completion clears only that type', () => {
  const record = empty();
  ensurePack(record, 'capitals', pool);
  ensurePack(record, 'landmarks', [{ id: 'one' }, { id: 'two' }, { id: 'three' }]);
  savePackResult(record, 'capitals', 0, { base: 731, postcard: { kind: 'new', tier: 2 } });
  assert.deepEqual(packSummary(record.byType.capitals), {
    played: 1, nextCard: 1, score: 731,
    counts: { new: 1, upgrade: 0, visited: 0, repeat: 0 },
  });
  completePack(record, 'capitals');
  assert.equal(record.byType.capitals, null);
  assert.ok(record.byType.landmarks);
});

test('outcome kinds remain stable', () => {
  assert.deepEqual(packOutcome(false, 0, 0), { kind: 'visited' });
  assert.deepEqual(packOutcome(true, 0, 0), { kind: 'repeat' });
  assert.deepEqual(packOutcome(false, 0, 1), { kind: 'new', tier: 1 });
  assert.deepEqual(packOutcome(true, 1, 3), { kind: 'upgrade', tier: 3 });
});
