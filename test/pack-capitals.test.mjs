// World Capitals pack pool (2026-10-29): the drawable pool is the capital
// set only, one city per bank country, never a landmark, and every drawn
// pack stays inside it.
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

const { packPool, ensurePack } = await import('../src/meta/pack-store.js');
const { PACK_CAPITAL_IDS } = await import('../src/meta/pack-capitals.js');

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const cities = load('locations.json');
const byId = new Map(cities.map((item) => [item.id, item]));
const pool = packPool(cities);
const emptyRecord = () => ({
  stamina: { stored: 2, nextAt: null },
  byType: { capitals: null, landmarks: null, landforms: null },
});

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

test('the capital set: 206 bank cities', () => {
  assert.equal(PACK_CAPITAL_IDS.size, 206);
  for (const id of PACK_CAPITAL_IDS) assert.ok(byId.has(id), `${id} is not in the city bank`);
  const countries = [...PACK_CAPITAL_IDS].map((id) => byId.get(id).country);
  assert.equal(new Set(countries).size, 201);
});

test('the drawable pool holds only ids from the capital set', () => {
  assert.ok(pool.length >= 3);
  assert.ok(pool.every((item) => PACK_CAPITAL_IDS.has(item.id)));
  assert.ok(pool.every((item) => item.kind !== 'landmark'));
  console.log(`pool: ${pool.length} capitals`);
});

test('500 simulated days: every card is a capital, three distinct', () => {
  for (let day = 0; day < 500; day++) {
    localStorage.clear();
    const pack = ensurePack(emptyRecord(), 'capitals', pool, rng(day + 1));
    assert.equal(new Set(pack.ids).size, 3, `day ${day}: duplicate in ${pack.ids}`);
    assert.ok(pack.ids.every((id) => PACK_CAPITAL_IDS.has(id)), `day ${day}: ${pack.ids}`);
    if (day === 0) console.log(`pack: ${pack.ids.join(', ')}`);
  }
});

test('a repair draw stays inside the capital set', () => {
  localStorage.clear();
  const record = emptyRecord();
  record.byType.capitals = { ids: ['gone-one', pool[0].id, pool[1].id], results: [null, null, null], torn: false };
  const pack = ensurePack(record, 'capitals', pool, rng(11));
  assert.ok(pack.ids.every((id) => PACK_CAPITAL_IDS.has(id)));
  assert.equal(new Set(pack.ids).size, 3);
});
