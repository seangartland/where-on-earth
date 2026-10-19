// Pack landmark guarantee (docs/pacing-and-monetization.md, phase 3): every
// freshly generated pack holds at least one landmark, cards stay distinct,
// stored packs are never redrawn, and a repair draw keeps the guarantee.
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
const { packPool, readPack, ensurePack } = await import('../src/meta/pack-store.js');
const { isPoolLandmark } = await import('../src/modes/landmarks.js');
const { isPlayableLocation } = await import('../src/daily.js');

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const cities = load('locations.json');
const landmarkPoolItems = load('locations-landmarks-sol.json').filter(isPoolLandmark);
const pool = packPool(cities, landmarkPoolItems);
const byId = new Map(pool.map((item) => [item.id, item]));
const isLandmarkId = (id) => byId.get(id)?.kind === 'landmark';

// Deterministic RNG (mulberry32) so the simulated days are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('pool shape: 805 cities plus 331 landmarks, areas excluded', () => {
  assert.equal(cities.filter(isPlayableLocation).length, 805);
  assert.equal(pool.filter((item) => item.kind === 'landmark').length, 331);
  assert.equal(pool.length, 1136);
});

test('500 simulated days: every pack has a landmark and three distinct cards', () => {
  for (let day = 0; day < 500; day++) {
    localStorage.clear();
    const record = { date: '2026-10-18', packs: [] };
    const pack = ensurePack(record, 0, pool, rng(day + 1));
    assert.equal(pack.ids.length, 3);
    assert.equal(new Set(pack.ids).size, 3, `day ${day}: duplicate in ${pack.ids}`);
    assert.ok(pack.ids.some(isLandmarkId), `day ${day}: no landmark in ${pack.ids}`);
  }
});

test('the guaranteed landmark is not always in the same slot', () => {
  const slots = new Set();
  for (let day = 0; day < 60; day++) {
    const record = { date: '2026-10-18', packs: [] };
    const pack = ensurePack(record, 0, pool, rng(day + 1000));
    slots.add(pack.ids.findIndex(isLandmarkId));
  }
  assert.ok(slots.size > 1, `landmark slots seen: ${[...slots]}`);
});

test('a stored pack with no landmark is loaded unchanged, never redrawn', () => {
  localStorage.clear();
  const cityIds = pool.filter((item) => item.kind !== 'landmark').slice(0, 3).map((item) => item.id);
  localStorage.setItem(PACK_KEY, JSON.stringify({ date: '2026-10-18', packs: [{ ids: cityIds, results: [null, null, null] }] }));
  const record = readPack('2026-10-18');
  const pack = ensurePack(record, 0, pool, rng(7));
  assert.deepEqual(pack.ids, cityIds);
});

test('a repair draw keeps the guarantee when the only landmark leaves the pool', () => {
  localStorage.clear();
  const landmark = pool.find((item) => item.kind === 'landmark');
  const cityIds = pool.filter((item) => item.kind !== 'landmark').slice(0, 2).map((item) => item.id);
  const smallerPool = pool.filter((item) => item.id !== landmark.id);
  localStorage.setItem(PACK_KEY, JSON.stringify({ date: '2026-10-18', packs: [{ ids: [landmark.id, ...cityIds], results: [null, null, null] }] }));
  const record = readPack('2026-10-18');
  const pack = ensurePack(record, 0, smallerPool, rng(11));
  assert.equal(new Set(pack.ids).size, 3);
  assert.ok(pack.ids.some((id) => smallerPool.find((item) => item.id === id)?.kind === 'landmark'), `repair lost the landmark: ${pack.ids}`);
});
