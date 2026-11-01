import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function response(status, data) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => data,
  };
}

test('backfill submits exactly today\'s stored results and accepts locked guesses', async () => {
  globalThis.location = new URL('https://game.local/?accounts=1');
  globalThis.window = new EventTarget();
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options) { super(type); this.detail = options?.detail; }
  };
  const session = {
    sessionToken: 'session-token',
    expiresAt: Date.now() + 60_000,
    deviceId: 'dev_1234567890abcdef',
  };
  globalThis.localStorage = { getItem: (key) => key === 'where-on-earth-account-v1' ? JSON.stringify(session) : null };

  const { localDateKey } = await import('../src/core/format.js');
  const { state } = await import('../src/core/state.js');
  state.daily = {
    date: localDateKey(),
    ids: ['alpha', 'bravo'],
    results: [
      { guess: { lat: 1, lng: 2 }, distance: 3, score: 4 },
      { guess: { lat: 5, lng: 6 }, distance: 7, score: 8 },
    ],
  };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    const stored = { date: state.daily.date, slot: requests.length - 1,
      locationId: requests.length === 1 ? 'alpha' : 'bravo',
      guess: requests.length === 1 ? { lat: 1, lng: 2 } : { lat: 9, lng: 10 }, submittedAt: 1 };
    return requests.length === 1
      ? response(200, { stored, friends: [] })
      : response(409, { code: 'GUESS_LOCKED', stored, friends: [{ friendId: 'f1', displayName: 'Ana', guess: { lat: 0, lng: 0 }, submittedAt: 1 }] });
  };

  const { backfillToday, cachedFriendPins } = await import('../src/account/friends.js');
  const completed = await backfillToday();

  assert.equal(completed.length, 2);
  assert.deepEqual(requests.map(({ body }) => body), [
    { date: state.daily.date, slot: 0, locationId: 'alpha', guess: { lat: 1, lng: 2 }, distanceKm: 3, score: 4, deviceId: session.deviceId },
    { date: state.daily.date, slot: 1, locationId: 'bravo', guess: { lat: 5, lng: 6 }, distanceKm: 7, score: 8, deviceId: session.deviceId },
  ]);
  assert.equal(cachedFriendPins(state.daily.date).locations.bravo.mine.lat, 9);
  assert.equal(cachedFriendPins(state.daily.date).locations.bravo.friends[0].displayName, 'Ana');

  session.expiresAt = Date.now() - 1;
  const { submitDailyGuess } = await import('../src/account/friends.js');
  assert.equal(await submitDailyGuess(state.daily.results[0], 0), null);
  assert.equal(requests.length, 2);
});

test('friends data layer makes no request when accounts are disabled', () => {
  const script = `
    globalThis.location = new URL('https://game.local/');
    globalThis.window = new EventTarget();
    globalThis.localStorage = { getItem: () => JSON.stringify({ sessionToken: 'x', expiresAt: Date.now() + 60000, deviceId: 'dev_x' }) };
    globalThis.fetch = () => { throw new Error('unexpected request'); };
    const { state } = await import('./src/core/state.js');
    state.daily = { date: '2026-11-01', ids: ['alpha'], results: [] };
    const { submitDailyGuess } = await import('./src/account/friends.js');
    if (await submitDailyGuess({ guess: { lat: 1, lng: 2 }, distance: 3, score: 4 }, 0) !== null) process.exit(1);
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('round integration gates submission to a new Daily reveal', () => {
  const source = fs.readFileSync(new URL('../src/game/round.js', import.meta.url), 'utf8');
  const dailyBranch = source.match(/if \(!restoring && !oneOff\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(dailyBranch, /saveDaily\(\);[\s\S]*if \(ACCOUNTS_ENABLED\)/);
  assert.match(dailyBranch, /if \(!isSignedIn\(\)\) return;/);
  assert.match(dailyBranch, /submitDailyGuess\(result, slot\)/);
  assert.doesNotMatch(source.slice(source.indexOf('if (!restoring && (survival.active')), /submitDailyGuess/);
});
