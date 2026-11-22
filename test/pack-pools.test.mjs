import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };
const { PACK_LANDMARK_IDS } = await import('../src/meta/pack-landmark-ids.js');
const { PACK_CAPITAL_IDS } = await import('../src/meta/pack-capitals.js');
const { packPool, landmarkPackPool } = await import('../src/meta/pack-store.js');
const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url)));
const landmarks = load('locations-bank.json');
const cities = load('locations.json');

test('the Landmarks pack is the explicit top-100 list and nothing else', () => {
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.equal(PACK_LANDMARK_IDS.size, 100);
  assert.ok([...PACK_LANDMARK_IDS].every((id) => byId.has(id)));
  const pool = landmarkPackPool(landmarks);
  assert.equal(pool.length, 100);
  assert.ok(pool.every((item) => PACK_LANDMARK_IDS.has(item.id)));
  // Sagrada Familia topped the fame measure; Ahu Tongariki sat at the bottom
  // of the 200-entry candidate set, well below the cut.
  assert.ok(PACK_LANDMARK_IDS.has('sagrada-familia'));
  assert.ok(!PACK_LANDMARK_IDS.has('ahu-tongariki'));
});

test('there is no landforms pool', async () => {
  assert.equal(existsSync(new URL('../src/meta/pack-landforms.js', import.meta.url)), false);
  const { landformPackPool } = await import('../src/meta/pack-store.js');
  assert.equal(landformPackPool, undefined);
});

test('mountain ranges are in the bank but out of the landmark pool', async () => {
  const { PACK_MOUNTAIN_RANGE_IDS } = await import('../src/meta/pack-mountain-ranges.js');
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.equal(PACK_MOUNTAIN_RANGE_IDS.size, 19);
  assert.ok([...PACK_MOUNTAIN_RANGE_IDS].every((id) => byId.has(id)));
  const pool = landmarkPackPool(landmarks);
  assert.ok(pool.every((item) => !PACK_MOUNTAIN_RANGE_IDS.has(item.id)));
  assert.ok([...PACK_MOUNTAIN_RANGE_IDS].every((id) => !PACK_LANDMARK_IDS.has(id)));
});

test('waterways are extent entries in the bank but out of the landmark pool', async () => {
  const { PACK_WATERS_IDS } = await import('../src/meta/pack-waters.js');
  const extents = load('extents.json');
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.ok(PACK_WATERS_IDS.size > 0);
  assert.ok([...PACK_WATERS_IDS].every((id) => byId.get(id)?.kind === 'extent' && extents[id]?.type === byId.get(id).extentType));
  assert.ok(landmarkPackPool(landmarks).every((item) => !PACK_WATERS_IDS.has(item.id)));
  assert.ok([...PACK_WATERS_IDS].every((id) => !PACK_LANDMARK_IDS.has(id)));
});

test('capital pool remains 200 playable entries', () => {
  const capitals = packPool(cities);
  assert.equal(capitals.length, 200);
  assert.equal(capitals.length, PACK_CAPITAL_IDS.size);
});
