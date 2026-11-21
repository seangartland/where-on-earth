import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };
const { PACK_LANDFORM_IDS } = await import('../src/meta/pack-landforms.js');
const { PACK_CAPITAL_IDS } = await import('../src/meta/pack-capitals.js');
const { packPool, landmarkPackPool, landformPackPool } = await import('../src/meta/pack-store.js');
const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url)));
const landmarks = load('locations-landmarks-sol.json');
const cities = load('locations.json');

test('the canonical 200 landform ids exist and disambiguate Uyuni', () => {
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.equal(PACK_LANDFORM_IDS.size, 200);
  assert.ok([...PACK_LANDFORM_IDS].every((id) => byId.has(id)));
  const names = new Set([...PACK_LANDFORM_IDS].map((id) => byId.get(id).short));
  assert.ok(names.has('Salar de Uyuni'));
  assert.ok(!names.has('Uyuni Salt Flats'));
});

test('landmark and landform pools are exclusive', () => {
  const landforms = landformPackPool(landmarks);
  const other = landmarkPackPool(landmarks);
  assert.equal(other.length, 200);
  assert.equal(landforms.length, PACK_LANDFORM_IDS.size);
  assert.ok(other.every((item) => !PACK_LANDFORM_IDS.has(item.id)));
});

test('mountain ranges are in the bank but out of the landmark pool', async () => {
  const { PACK_MOUNTAIN_RANGE_IDS } = await import('../src/meta/pack-mountain-ranges.js');
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.equal(PACK_MOUNTAIN_RANGE_IDS.size, 19);
  assert.ok([...PACK_MOUNTAIN_RANGE_IDS].every((id) => byId.has(id)));
  const other = landmarkPackPool(landmarks);
  assert.ok(other.every((item) => !PACK_MOUNTAIN_RANGE_IDS.has(item.id)));
});

test('waterways are extent entries in the bank but out of the landmark and landform pools', async () => {
  const { PACK_WATERS_IDS } = await import('../src/meta/pack-waters.js');
  const extents = load('extents.json');
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.ok(PACK_WATERS_IDS.size > 0);
  assert.ok([...PACK_WATERS_IDS].every((id) => byId.get(id)?.kind === 'extent' && extents[id]?.type === byId.get(id).extentType));
  assert.ok(landmarkPackPool(landmarks).every((item) => !PACK_WATERS_IDS.has(item.id)));
  assert.ok([...PACK_WATERS_IDS].every((id) => !PACK_LANDFORM_IDS.has(id)));
});

test('capital pool remains 200 playable entries', () => {
  const capitals = packPool(cities);
  assert.equal(capitals.length, 200);
  assert.equal(capitals.length, PACK_CAPITAL_IDS.size);
});
