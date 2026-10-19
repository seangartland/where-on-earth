// Daily postcard pack store (docs/daily-pack-spec.md, build step 1): shape,
// no reroll on re-read, date rollover, distinctness and pool counts, with a
// fake localStorage and fixed date keys.
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

const { PACK_KEY, VERSIONED_KEYS } = await import('../src/core/config.js');
const {
  PACK_CARDS, packPool, readPack, ensurePack, savePackResult, packOutcome, packSummary,
} = await import('../src/meta/pack-store.js');
const { isPoolLandmark } = await import('../src/modes/landmarks.js');
const { isPlayableLocation } = await import('../src/daily.js');

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const cities = load('locations.json');
const landmarks = load('locations-landmarks-sol.json').filter(isPoolLandmark);
const pool = packPool(cities, landmarks);
const stored = () => JSON.parse(localStorage.getItem(PACK_KEY));

test('key is versioned and off the sync list', () => {
  assert.equal(PACK_KEY, 'where-on-earth-pack-v1');
  assert.ok(VERSIONED_KEYS.has(PACK_KEY));
  const sync = readFileSync(new URL('../src/account/sync.js', import.meta.url), 'utf8');
  assert.ok(!sync.includes('PACK_KEY') && !sync.includes('pack-v1'));
});

test('pool counts: every playable city plus the Landmarks pool, no shared ids', () => {
  const packLandmarks = pool.filter((item) => item.kind === 'landmark');
  assert.equal(cities.filter(isPlayableLocation).length, 805);
  assert.equal(packLandmarks.length, 330);
  assert.equal(pool.length, 805 + 330);
  assert.ok(pool.every((item) => item.kind !== 'area'));
  assert.equal(new Set(pool.map((item) => item.id)).size, pool.length);
  console.log(`pool: ${cities.filter(isPlayableLocation).length} cities + ${packLandmarks.length} landmarks = ${pool.length}`);
});

test('generation: shape, three distinct pool ids, saved before any play', () => {
  localStorage.clear();
  const record = readPack('2026-10-18');
  assert.deepEqual(record, { date: '2026-10-18', packs: [] });
  assert.equal(localStorage.getItem(PACK_KEY), null, 'a plain read writes nothing');
  const pack = ensurePack(record, 0, pool);
  assert.equal(pack.ids.length, PACK_CARDS);
  assert.equal(new Set(pack.ids).size, PACK_CARDS);
  const ids = new Set(pool.map((item) => item.id));
  assert.ok(pack.ids.every((id) => ids.has(id)));
  assert.deepEqual(pack.results, [null, null, null]);
  const saved = stored();
  assert.equal(saved._v, 1);
  assert.equal(saved.date, '2026-10-18');
  assert.deepEqual(saved.packs[0].ids, pack.ids);
});

test('no reroll on re-read (reload) of the same date', () => {
  localStorage.clear();
  const first = ensurePack(readPack('2026-10-18'), 0, pool).ids.slice();
  for (let i = 0; i < 20; i += 1) {
    const again = ensurePack(readPack('2026-10-18'), 0, pool);
    assert.deepEqual(again.ids, first);
  }
});

test('results persist with the record and the summary totals them', () => {
  localStorage.clear();
  const record = readPack('2026-10-18');
  ensurePack(record, 0, pool);
  savePackResult(record, 0, 0, { guess: { lat: 1, lng: 2 }, distance: 412, distanceExact: 411.7, base: 731, postcard: { kind: 'visited' } });
  savePackResult(record, 0, 2, { guess: { lat: 1, lng: 2 }, distance: 12, distanceExact: 12.2, base: 990, postcard: { kind: 'new', tier: 2 } });
  const reread = readPack('2026-10-18');
  assert.equal(reread.packs[0].results[0].base, 731);
  assert.equal(reread.packs[0].results[1], null);
  const summary = packSummary(ensurePack(reread, 0, pool));
  assert.equal(summary.played, 2);
  assert.equal(summary.nextCard, 1);
  assert.equal(summary.score, 1721);
  assert.deepEqual(summary.counts, { new: 1, upgrade: 0, visited: 1, repeat: 0 });
});

test('date rollover: a past record is replaced by an empty one, then a fresh draw', () => {
  localStorage.clear();
  const old = readPack('2026-10-18');
  ensurePack(old, 0, pool);
  savePackResult(old, 0, 0, { base: 500, postcard: { kind: 'visited' } });
  const today = readPack('2026-10-19');
  assert.deepEqual(today, { date: '2026-10-19', packs: [] });
  assert.equal(stored().date, '2026-10-19', 'the stale record is replaced on read');
  assert.ok(ensurePack(today, 0, pool));
  assert.equal(stored().packs[0].results.filter(Boolean).length, 0);
});

test('a round finishing after midnight banks under its own date but never over a newer day', () => {
  localStorage.clear();
  const yesterday = readPack('2026-10-18');
  ensurePack(yesterday, 0, pool);
  assert.equal(savePackResult(yesterday, 0, 0, { base: 1, postcard: { kind: 'repeat' } }), true);
  assert.equal(stored().date, '2026-10-18');
  readPack('2026-10-19');
  assert.equal(savePackResult(yesterday, 0, 1, { base: 1, postcard: { kind: 'repeat' } }), false);
  assert.equal(stored().date, '2026-10-19');
});

test('distinctness holds across many draws, including a tiny pool', () => {
  localStorage.clear();
  for (let i = 0; i < 2000; i += 1) {
    const pack = ensurePack({ date: '2026-10-18', packs: [] }, 0, pool);
    assert.equal(new Set(pack.ids).size, PACK_CARDS);
  }
  const tiny = pool.slice(0, 3);
  for (let i = 0; i < 200; i += 1) {
    assert.deepEqual(new Set(ensurePack({ date: '2026-10-18', packs: [] }, 0, tiny).ids), new Set(tiny.map((item) => item.id)));
  }
  assert.equal(ensurePack({ date: '2026-10-18', packs: [] }, 0, pool.slice(0, 2)), null);
});

test('a retired id is redrawn only in an unplayed slot', () => {
  localStorage.clear();
  const record = readPack('2026-10-18');
  record.packs[0] = { ids: ['gone-one', 'gone-two', pool[0].id], results: [{ base: 10, postcard: { kind: 'visited' } }, null, null] };
  const pack = ensurePack(record, 0, pool);
  assert.equal(pack.ids[0], 'gone-one', 'played slot keeps its id and result');
  assert.notEqual(pack.ids[1], 'gone-two');
  assert.equal(pack.ids[2], pool[0].id);
  assert.equal(new Set(pack.ids).size, PACK_CARDS);
  assert.deepEqual(stored().packs[0].ids, pack.ids);
});

test('reveal outcome kinds', () => {
  assert.deepEqual(packOutcome(false, 0, 0), { kind: 'visited' });
  assert.deepEqual(packOutcome(true, 0, 0), { kind: 'repeat' });
  assert.deepEqual(packOutcome(true, 3, 0), { kind: 'repeat' });
  assert.deepEqual(packOutcome(false, 0, 1), { kind: 'new', tier: 1 });
  assert.deepEqual(packOutcome(true, 0, 2), { kind: 'new', tier: 2 });
  assert.deepEqual(packOutcome(true, 1, 3), { kind: 'upgrade', tier: 3 });
});
