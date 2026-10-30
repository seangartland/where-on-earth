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

test('the canonical 206 landform ids exist and disambiguate Uyuni', () => {
  const byId = new Map(landmarks.map((item) => [item.id, item]));
  assert.equal(PACK_LANDFORM_IDS.size, 206);
  assert.ok([...PACK_LANDFORM_IDS].every((id) => byId.has(id)));
  const names = new Set([...PACK_LANDFORM_IDS].map((id) => byId.get(id).short));
  assert.ok(names.has('Salar de Uyuni'));
  assert.ok(!names.has('Uyuni Salt Flats'));
});

test('landmark and landform pools are exclusive', () => {
  const landforms = landformPackPool(landmarks);
  const other = landmarkPackPool(landmarks);
  assert.equal(other.length, 249);
  assert.equal(landforms.length, PACK_LANDFORM_IDS.size);
  assert.ok(other.every((item) => !PACK_LANDFORM_IDS.has(item.id)));
});

test('capital pool remains 207 playable entries', () => {
  const capitals = packPool(cities);
  assert.equal(capitals.length, 207);
  assert.equal(capitals.length, PACK_CAPITAL_IDS.size);
});
