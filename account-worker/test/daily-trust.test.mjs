import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { deriveDailyAggregate, consecutiveUtcStreak } from '../src/daily-aggregates.js';
import { manifestIds } from '../src/daily.js';
import { isBullseye, isPostcard, scoreForDistance } from '../src/daily-score.js';
import { xpForCompletion } from '../src/progression.js';
import { dailyIds, resolvePinnedIds } from '../../src/daily.js';

globalThis.location = { search: '' };
const { scoreGuess } = await import('../../src/game/scoring.js');

const locations = JSON.parse(readFileSync(new URL('../../assets/locations.json', import.meta.url), 'utf8'));
const pins = JSON.parse(readFileSync(new URL('../../assets/daily-pins.json', import.meta.url), 'utf8')).pins;
const workerLocations = JSON.parse(readFileSync(new URL('../data/daily-locations.json', import.meta.url), 'utf8')).locations
  .map((location) => ({ location_id: location.locationId, country: location.country }));
const dateAt = (offset) => new Date(Date.UTC(2026, 9, 1 + offset)).toISOString().slice(0, 10);

test('worker manifest picks match the client selector for 60 UTC dates, including pins', () => {
  for (let day = 0; day < 60; day += 1) {
    const date = dateAt(day);
    const pinned = pins[date];
    const client = pinned ? resolvePinnedIds(date, pinned, locations) : dailyIds(date, locations);
    assert.deepEqual(manifestIds(date, workerLocations), client, date);
  }
});

test('server score curve matches client scoring and preserves strict postcard boundaries', () => {
  for (const distance of [0, 24.999, 25, 149.999, 150, 112, 301, 3500, 20000]) {
    assert.equal(scoreForDistance(distance), scoreGuess(distance), String(distance));
  }
  assert.equal(isBullseye(24.999, 1000), true);
  assert.equal(isBullseye(25, 1000), false);
  assert.equal(isPostcard(149.999), true);
  assert.equal(isPostcard(150), false);
});

test('sub-25-km scorer grants a real bullseye score and XP at the strict boundary', () => {
  const under = scoreForDistance(24.999);
  const at = scoreForDistance(25);
  assert.equal(under, 1000);
  assert.notEqual(at, 1000);
  assert.equal(isBullseye(24.999, under), true);
  assert.equal(isBullseye(25, at), false);
  assert.equal(xpForCompletion(under, [{ distance_km: 24.999, score: under }]).bullseyes, 3);
  assert.equal(xpForCompletion(at, [{ distance_km: 25, score: at }]).bullseyes, 0);
});

test('canonical aggregates require five slots and use server round facts', () => {
  const rounds = Array.from({ length: 5 }, (_, slot) => ({
    slot, score: slot === 0 ? 1000 : 800, distance_km: slot === 0 ? 24.999 : 25,
    country: slot < 2 ? 'A' : `C${slot}`,
  }));
  assert.deepEqual(deriveDailyAggregate(rounds), {
    complete: true, totalScore: 4200, bullseyeCount: 1, distinctCountries: 4,
  });
  assert.equal(deriveDailyAggregate(rounds.slice(0, 4)).complete, false);
  assert.equal(deriveDailyAggregate([...rounds.slice(0, 4), { ...rounds[3] }]).complete, false);
  assert.equal(consecutiveUtcStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'], '2026-10-05'), 2);
  assert.equal(consecutiveUtcStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'], '2026-10-02'), 2);
});
