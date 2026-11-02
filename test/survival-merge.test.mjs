// Merged Survival (docs/pacing-and-monetization.md, phase 1): one pool of
// cities plus the Landmark pool under a flat no-repeat draw, legacy bests
// honored by read-time max.
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
const { initSurvival, mergedSurvivalPool, survival, survivalBest, survivalPick } = await import('../src/modes/survival.js');
initLandmarks(host);
initSurvival(host);

test('merged pool is every playable city plus the whole Landmark pool, no duplicates', () => {
  // Counts derive from the data files: the Landmark pool grows as new
  // extent-aware entries are banked (341 at the merge, 363 after lakes and
  // parks batch 1, the island extents, Galapagos and Loch Ness).
  const pool = mergedSurvivalPool();
  const citiesInPool = pool.filter((item) => !['landmark', 'area', 'extent'].includes(item.kind)).length;
  assert.equal(citiesInPool, 803);
  assert.equal(pool.length, 803 + landmarkPool().length);
  assert.equal(pool.filter((item) => ['landmark', 'area', 'extent'].includes(item.kind)).length, landmarkPool().length);
  assert.equal(new Set(pool.map((item) => item.id)).size, pool.length);
});

test('draws uniformly without difficulty values or repeats inside a run', () => {
  const originalLocations = host.locations;
  const originalLandmarks = host.landmarks;
  const originalRandom = Math.random;
  host.locations = [
    { id: 'plain-a', image: 'a.jpg', lat: 0, country: 'A' },
    { id: 'plain-b', image: 'b.jpg', lat: 1, country: 'B' },
  ];
  host.landmarks = [];
  survival.results = [];
  Math.random = () => 0;
  try {
    const first = survivalPick();
    survival.results.push({ item: first, distance: 0 });
    const second = survivalPick();
    survival.results.push({ item: second, distance: 0 });
    assert.deepEqual([first.id, second.id], ['plain-a', 'plain-b']);
    assert.equal(survivalPick(), null);
  } finally {
    Math.random = originalRandom;
    host.locations = originalLocations;
    host.landmarks = originalLandmarks;
    survival.results = [];
  }
});

test('merged best is the max of the two legacy keys; neither key is rewritten', () => {
  localStorage.setItem(LANDMARKS_BEST_KEY, '17');
  assert.equal(survivalBest(), 17);
  localStorage.setItem('where-on-earth-survival-best-v1', '23');
  assert.equal(survivalBest(), 23);
  assert.equal(survivalBest(LANDMARKS_BEST_KEY), 17);
  assert.equal(localStorage.getItem(LANDMARKS_BEST_KEY), '17');
});

// Runs in progress persist (save at every draw and survived guess, resume
// from the entry, clear when the run ends).
const RUN_KEY = 'where-on-earth-survival-run-v1';
const { enterSurvival, startSurvival, survivalRecordGuess, survivalRevealCard } = await import('../src/modes/survival.js');
const runHost = () => {
  const text = () => ({ textContent: '', classList: { add() {} } });
  Object.assign(host, {
    runHaul: [],
    expeditionRun: {}, endless: {}, borders: {},
    showRound() {},
    showRunHaul() {},
  });
  Object.assign(host.gameEls, { number: text(), survivalStreak: text(), score: text(), next: text() });
  return text();
};

test('a run saves on every draw and survived guess, and resumes on the round it was on', () => {
  const pill = runHost();
  localStorage.removeItem(RUN_KEY);
  startSurvival();
  const first = survival.item;
  let saved = JSON.parse(localStorage.getItem(RUN_KEY));
  assert.deepEqual(saved, { round: 1, survived: 0, item: first.id, results: [], haul: [] });

  survivalRecordGuess(first, 40, 40.2);
  host.runHaul.push({ item: first, result: { distance: 40, distanceExact: 40.2, postcard: { kind: 'new', tier: 1 } } });
  survivalRevealCard(pill);
  saved = JSON.parse(localStorage.getItem(RUN_KEY));
  assert.equal(saved.survived, 1);
  assert.deepEqual(saved.results, [{ id: first.id, distance: 40 }]);
  assert.equal(saved.haul[0].id, first.id);

  // A refresh during that reveal resumes on a fresh draw, history intact.
  survival.results.length = 0;
  host.runHaul.length = 0;
  enterSurvival();
  assert.equal(survival.active, true);
  assert.equal(survival.round, 2);
  assert.equal(survival.survived, 1);
  assert.equal(survival.results[0].item, first);
  assert.equal(host.runHaul[0].item, first);
  assert.notEqual(survival.item, first);

  // A refresh mid-round resumes that same target, not a reroll.
  const second = survival.item;
  survival.results.length = 0;
  enterSurvival();
  assert.equal(survival.item, second);
  assert.equal(survival.round, 2);
});

test('a miss clears the save; the next entry starts fresh', () => {
  const pill = runHost();
  startSurvival();
  survivalRecordGuess(survival.item, 900, 900);
  survivalRevealCard(pill);
  assert.equal(localStorage.getItem(RUN_KEY), null);
  enterSurvival();
  assert.equal(survival.round, 1);
  assert.equal(survival.survived, 0);
});

test('a corrupt or invalid save is dropped and the mode starts fresh', () => {
  runHost();
  for (const bad of ['{not json', '{"round":1,"survived":0,"item":"no-such-id","results":[],"haul":[]}',
    JSON.stringify({ round: 5, survived: 0, item: cities[0].id, results: [], haul: [] }), '[]']) {
    localStorage.setItem(RUN_KEY, bad);
    enterSurvival();
    assert.equal(survival.active, true);
    assert.equal(survival.round, 1);
    assert.equal(survival.results.length, 0);
    assert.equal(JSON.parse(localStorage.getItem(RUN_KEY)).round, 1); // replaced by the fresh run
  }
});
