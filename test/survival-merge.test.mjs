// Merged Survival (docs/pacing-and-monetization.md, phase 1): one pool of
// cities plus the Landmark pool under Classic's uniform band 1 to 10 draw,
// legacy bests honored by read-time max.
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
globalThis.window = globalThis;

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const cities = load('locations.json');
const landmarks = load('locations-landmarks-sol.json');

const el = () => ({ addEventListener() {}, querySelector: () => ({ textContent: '' }) });
const host = {
  locations: cities,
  landmarks,
  gameEls: {
    survivalEntry: el(), survivalAgain: el(), survivalShare: el(), survivalHubEntry: el(), survivalHub: el(),
    moreModesEntry: el(), moreModesHub: el(), landmarksEntry: el(),
  },
  safeSetItem: (key, value) => localStorage.setItem(key, value),
};

const { initLandmarks, landmarkPool, LANDMARKS_BEST_KEY } = await import('../src/modes/landmarks.js');
const { initSurvival, mergedSurvivalPool, survivalBest } = await import('../src/modes/survival.js');
initLandmarks(host);
initSurvival(host);

test('merged pool is every playable city plus the whole Landmark pool, no duplicates', () => {
  // Counts derive from the data files: the Landmark pool grows as new
  // extent-aware entries are banked (341 at the merge, 361 after lakes and
  // parks batch 1 landed the same evening).
  const pool = mergedSurvivalPool();
  const citiesInPool = pool.filter((item) => item.kind !== 'landmark' && item.kind !== 'area').length;
  assert.equal(citiesInPool, 805);
  assert.equal(pool.length, 805 + landmarkPool().length);
  assert.equal(pool.filter((item) => item.kind === 'landmark' || item.kind === 'area').length, landmarkPool().length);
  assert.equal(new Set(pool.map((item) => item.id)).size, pool.length);
});

test('uniform band draw over the merged pool: worst overdraw under 1.6x, no zero-chance items', () => {
  const pool = mergedSurvivalPool();
  const cohorts = new Map();
  for (const item of pool) cohorts.set(item.difficulty, (cohorts.get(item.difficulty) || 0) + 1);
  const flat = 1 / pool.length;
  let worst = 0;
  for (const size of cohorts.values()) {
    assert.ok(size > 0);
    worst = Math.max(worst, (0.1 / size) / flat);
  }
  assert.ok(worst < 1.6, `worst overdraw ${worst.toFixed(2)}x`);
});

test('a thin-band landmark (CERN) draws at well under 1% per round', () => {
  const pool = mergedSurvivalPool();
  const cern = pool.find((item) => /cern/i.test(item.name || item.id));
  assert.ok(cern, 'CERN is in the merged pool');
  const cohort = pool.filter((item) => item.difficulty === cern.difficulty).length;
  assert.ok(0.1 / cohort < 0.01, `CERN per-round chance ${(100 * 0.1 / cohort).toFixed(2)}%`);
});

test('merged best is the max of the two legacy keys; neither key is rewritten', () => {
  localStorage.setItem(LANDMARKS_BEST_KEY, '17');
  assert.equal(survivalBest(), 17);
  localStorage.setItem('where-on-earth-survival-best-v1', '23');
  assert.equal(survivalBest(), 23);
  assert.equal(survivalBest(LANDMARKS_BEST_KEY), 17);
  assert.equal(localStorage.getItem(LANDMARKS_BEST_KEY), '17');
});
