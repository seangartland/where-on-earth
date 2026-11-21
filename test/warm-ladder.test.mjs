import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  warmLadderEnabled, shouldScheduleWarmLadder, buildWarmLadderJobs, createWarmLadderQueue,
} from '../src/globe/warm-ladder.js';

test('the param gate is exact: only ?warm=ladder enables it', () => {
  assert.equal(warmLadderEnabled(''), false);
  assert.equal(warmLadderEnabled('?warm=1'), false);
  assert.equal(warmLadderEnabled('?warm=ladder'), true);
});

test('Save Data disables the arm even with coordinates; missing coordinates (PvP before reveal) disable it even without Save Data', () => {
  assert.equal(shouldScheduleWarmLadder({ saveData: false, lat: 35.7, lng: 139.7 }), true);
  assert.equal(shouldScheduleWarmLadder({ saveData: true, lat: 35.7, lng: 139.7 }), false);
  assert.equal(shouldScheduleWarmLadder({ saveData: false, lat: undefined, lng: undefined }), false);
  assert.equal(shouldScheduleWarmLadder({ saveData: false, lat: NaN, lng: 1 }), false);
});

const rawJobOptions = {
  lat: 35.7, lng: 139.7, rungs: [5, 7],
  resolveKey: (z, x, y) => `s2gm2025/${z}/${x}/${y}`,
  resolveUrl: (z, x, y) => `https://tiles.where-on.earth/s2gm2025/${z}/${x}/${y}.jpg`,
};

test('param on schedules focal-first jobs: the center tile of every rung sorts first', () => {
  const jobs = buildWarmLadderJobs(rawJobOptions);
  const z5 = jobs.filter((j) => j.z === 5);
  const z7 = jobs.filter((j) => j.z === 7);
  assert.equal(z5.length, 9);
  assert.equal(z7.length, 9);
  // Within each rung, every job's distance from the focal tile is non-decreasing.
  for (const rung of [z5, z7]) for (let i = 1; i < rung.length; i++) assert.ok(rung[i].dist >= rung[i - 1].dist);
  assert.ok(z7[0].dist < 1, 'the center tile leads its rung');
});

test('a tile already cached or known-missing is dropped from the plan', () => {
  const baseline = buildWarmLadderJobs(rawJobOptions);
  const focal = baseline[0]; // the lowest-distance job overall is some rung's center tile
  const known = new Set([focal.key]);
  const jobs = buildWarmLadderJobs({ ...rawJobOptions, isKnown: (key) => known.has(key) });
  assert.equal(jobs.length, baseline.length - 1);
  assert.ok(!jobs.some((j) => j.key === focal.key));
});

test('includeTile gates z10 to the pilot footprint, tile by tile', () => {
  const pilotXs = new Set([512]); // the exact-equator/prime-meridian center column only
  const jobs = buildWarmLadderJobs({
    lat: 0, lng: 0, rungs: [10],
    includeTile: (z, x) => pilotXs.has(x),
    resolveKey: (z, x, y) => `s2gm2025-pilot/${z}/${x}/${y}`,
    resolveUrl: (z, x, y) => `https://tiles.where-on.earth/s2gm2025-pilot/${z}/${x}/${y}.jpg`,
  });
  assert.equal(jobs.length, 3, 'only the 3 tiles sharing the pilot column survive');
  assert.ok(jobs.every((j) => j.x === 512));
});

test('the queue dispatches up to its concurrency and respects round tokens', async () => {
  const started = [];
  const resolvers = [];
  const queue = createWarmLadderQueue(2);
  queue.configure((job, token) => new Promise((resolve) => {
    started.push({ job, token });
    resolvers.push(resolve);
  }));
  queue.schedule([{ key: 'a' }, { key: 'b' }, { key: 'c' }], 1);
  assert.equal(started.length, 2, 'only `concurrency` jobs start at once');
  assert.equal(queue.pendingCount, 1);
  resolvers.shift()();
  await Promise.resolve().then(() => {}); // let the .finally microtask run
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(started.length, 3, 'the third job starts once a slot frees up');
});

test('round end (a new schedule/stop) drops not-yet-dispatched jobs; input pause never touches the queue', () => {
  const queue = createWarmLadderQueue(1);
  queue.configure(() => new Promise(() => {})); // never resolves, so slot 0 stays busy
  queue.schedule([{ key: 'a' }, { key: 'b' }, { key: 'c' }], 1);
  assert.equal(queue.pendingCount, 2);
  queue.stop();
  assert.equal(queue.pendingCount, 0, 'round end clears the queue');
});

test('round.js hooks the shared round-start path, gated on the param and a coordinate check, and drives stop/schedule from there', () => {
  const source = fs.readFileSync(new URL('../src/game/round.js', import.meta.url), 'utf8');
  const showRound = source.slice(source.indexOf('export function showRound'), source.indexOf('export function showEarnToast'));
  assert.match(showRound, /warmLadderParam\(\)\s*&&\s*item\s*&&\s*Number\.isFinite\(item\.lat\)\s*&&\s*Number\.isFinite\(item\.lng\)/);
  assert.match(showRound, /scheduleWarmLadder\(item\.lat, item\.lng, \+\+warmLadderToken\)/);
  assert.match(showRound, /stopWarmLadder\(\)/);
});

test('pin.js input handlers (pointerdown, wheel) never reference the warm-ladder arm, so it is never paused on input', () => {
  const source = fs.readFileSync(new URL('../src/globe/pin.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /[Ww]arm[Ll]adder/, 'pin.js has no coupling to ?warm=ladder at all');
});
