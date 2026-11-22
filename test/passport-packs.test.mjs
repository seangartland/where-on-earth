import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };
const { PACK_CAPITAL_IDS } = await import('../src/meta/pack-capitals.js');
const { PACK_LANDMARK_IDS } = await import('../src/meta/pack-landmark-ids.js');
const { PACK_WORLD_CITY_IDS } = await import('../src/meta/pack-world-cities.js');
const { passportPackSections } = await import('../src/meta/passport-packs.js');
const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url)));
const cities = load('locations.json');
const landmarks = load('locations-bank.json');

test('Passport sections use the live pack pools in pack order', () => {
  const result = passportPackSections(cities, landmarks, {});
  assert.deepEqual(result.sections.map((section) => section.name), ['World Capitals', 'World Cities']);
  assert.deepEqual(result.sections.map((section) => section.total), [200, 200]);
  assert.equal(result.total, 400);
  const ids = result.sections.flatMap((section) => section.items.map((item) => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(result.sections.every((section) => section.items.every((item, index, items) =>
    index === 0 || (items[index - 1].short || '').localeCompare(item.short || '') <= 0)));
});

test('only earned postcards count as collected and gated packs fall to Other Postcards', () => {
  const capital = cities.find((item) => PACK_CAPITAL_IDS.has(item.id));
  const worldCity = cities.find((item) => PACK_WORLD_CITY_IDS.has(item.id));
  const landmark = landmarks.find((item) => PACK_LANDMARK_IDS.has(item.id));
  const unpacked = landmarks.find((item) => !PACK_LANDMARK_IDS.has(item.id));
  const dailyOnly = cities.find((item) => !PACK_CAPITAL_IDS.has(item.id) && !PACK_WORLD_CITY_IDS.has(item.id));
  const visits = Object.fromEntries([capital, worldCity, landmark, unpacked, dailyOnly].map((item) => [item.id, 500]));
  const meta = {
    [capital.id]: { e: 1 },
    [worldCity.id]: { e: 2 },
    [landmark.id]: { e: 0 },
    [unpacked.id]: { e: 2 },
  };
  const result = passportPackSections(cities, landmarks, visits, meta);

  assert.deepEqual(result.sections.map((section) => section.collected), [1, 1]);
  assert.equal(result.collected, 2);
  assert.ok(result.sections[0].items.some((item) => item.id === capital.id));
  assert.ok(result.sections[1].items.some((item) => item.id === worldCity.id));
  assert.ok(!result.everythingElse.some((item) => item.id === capital.id));
  assert.ok(!result.everythingElse.some((item) => item.id === worldCity.id));
  // Landmarks is gated (Sean, 2026-11-08): its visited cards, earned or not,
  // live in the catch-all until the pack returns. Bank entries outside
  // PACK_LANDMARK_IDS have never had a pack section (Sean's ruling,
  // 2026-11-21) and land in the catch-all the same way.
  const rest = result.everythingElse.map((item) => item.id);
  assert.deepEqual(new Set(rest), new Set([landmark.id, unpacked.id, dailyOnly.id]));
});
