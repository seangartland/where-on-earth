import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { dailyIds, resolvePinnedIds } from '../src/daily.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const locations = load('locations.json');
const pins = load('daily-pins.json').pins;
const byId = new Map(locations.map((item) => [item.id, item]));

const dateAt = (offset) => new Date(Date.UTC(2026, 9, 1 + offset)).toISOString().slice(0, 10);

test('daily selection is deterministic for a fixed date', () => {
  assert.deepEqual(dailyIds('2027-04-19', locations), dailyIds('2027-04-19', locations));
});

test('daily selections have five unique ids and countries across a year', () => {
  for (let day = 0; day < 365; day += 11) {
    const ids = dailyIds(dateAt(day), locations);
    assert.equal(ids.length, 5, dateAt(day));
    assert.equal(new Set(ids).size, 5, dateAt(day));
    assert.equal(new Set(ids.map((id) => byId.get(id).country)).size, 5, dateAt(day));
  }
});

test('no id repeats in any seven-day window over three years', () => {
  const window = [];
  for (let day = 0; day < 365 * 3; day++) {
    const date = dateAt(day);
    const ids = dailyIds(date, locations);
    const prior = new Set(window.flat());
    for (const id of ids) assert.equal(prior.has(id), false, `${id} repeats within seven days on ${date}`);
    window.push(ids);
    if (window.length > 6) window.shift();
  }
});

test('usable pins are unchanged and one unusable slot alone is repaired', () => {
  const pinned = pins['2026-10-25'];
  assert.strictEqual(resolvePinnedIds('2026-10-25', pinned, locations), pinned);

  const broken = pinned.slice();
  broken[2] = 'missing-daily-location';
  const repaired = resolvePinnedIds('2026-10-25', broken, locations);
  assert.ok(repaired);
  assert.deepEqual(repaired.filter((_, slot) => slot !== 2), broken.filter((_, slot) => slot !== 2));
  assert.notEqual(repaired[2], broken[2]);
  assert.equal(new Set(repaired).size, repaired.length);
  assert.equal(new Set(repaired.map((id) => byId.get(id).country)).size, repaired.length);
});
