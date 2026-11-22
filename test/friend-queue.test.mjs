import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function response(status, data) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

globalThis.location = new URL('https://game.local/?accounts=1');
globalThis.window = new EventTarget();
globalThis.CustomEvent = class CustomEvent extends Event {
  constructor(type, options) { super(type); this.detail = options?.detail; }
};

const { FRIEND_QUEUE_KEY, ACCOUNT_KEY } = await import('../src/core/config.js');
const { localDateKey, localYesterday } = await import('../src/core/format.js');
const { state } = await import('../src/core/state.js');
const {
  submitDailyGuess, flushPendingQueue,
} = await import('../src/account/friends.js');

function readQueue() {
  const raw = globalThis.localStorage.getItem(FRIEND_QUEUE_KEY);
  return raw ? JSON.parse(raw).entries : [];
}

function signOut() {
  globalThis.localStorage.removeItem(ACCOUNT_KEY);
}

function signIn() {
  globalThis.localStorage.setItem(ACCOUNT_KEY, JSON.stringify({
    sessionToken: 'session-token', expiresAt: Date.now() + 60_000, deviceId: 'dev_abcdef0123456789',
  }));
}

test('a signed-out or failed submission is queued, deduped by date+slot', async () => {
  globalThis.localStorage = makeLocalStorage();
  signOut();
  globalThis.fetch = () => { throw new Error('signed-out submission must never request'); };
  state.daily = { date: 'queue-test-date', ids: ['loc-a'] };

  assert.equal(await submitDailyGuess({ guess: { lat: 1, lng: 2 }, distance: 3, score: 4 }, 0), null);
  assert.deepEqual(readQueue(), [
    { date: 'queue-test-date', slot: 0, locationId: 'loc-a', guess: { lat: 1, lng: 2 }, distanceKm: 3, score: 4 },
  ]);

  // A second failed attempt for the same date+slot replaces, not duplicates.
  assert.equal(await submitDailyGuess({ guess: { lat: 9, lng: 10 }, distance: 30, score: 40 }, 0), null);
  const queue = readQueue();
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].guess, { lat: 9, lng: 10 });
});

test('a request failure while signed in also queues; a GUESS_LOCKED-with-stored success never queues', async () => {
  globalThis.localStorage = makeLocalStorage();
  signIn();
  state.daily = { date: 'queue-test-date-2', ids: ['loc-b', 'loc-c'] };
  globalThis.fetch = async () => { throw new Error('offline'); };

  assert.equal(await submitDailyGuess({ guess: { lat: 1, lng: 2 }, distance: 3, score: 4 }, 0), null);
  assert.equal(readQueue().length, 1);

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const stored = { date: body.date, locationId: body.locationId, guess: { lat: 5, lng: 6 }, submittedAt: 1 };
    return response(409, { code: 'GUESS_LOCKED', stored, friends: [] });
  };
  await submitDailyGuess({ guess: { lat: 7, lng: 8 }, distance: 9, score: 10 }, 1);
  assert.equal(readQueue().length, 1, 'GUESS_LOCKED-with-stored is a success and must not be queued');
});

test('flushing sends every queued entry once signed in, firing events only for today, and keeps a still-failing entry queued', async () => {
  globalThis.localStorage = makeLocalStorage();
  const today = localDateKey();
  const yesterday = localYesterday();
  globalThis.localStorage.setItem(FRIEND_QUEUE_KEY, JSON.stringify({
    _v: 1,
    entries: [
      { date: today, slot: 0, locationId: 'today-loc', guess: { lat: 1, lng: 1 }, distanceKm: 10, score: 100 },
      { date: yesterday, slot: 0, locationId: 'yesterday-loc', guess: { lat: 2, lng: 2 }, distanceKm: 20, score: 200 },
      { date: today, slot: 1, locationId: 'still-offline-loc', guess: { lat: 3, lng: 3 }, distanceKm: 30, score: 300 },
    ],
  }));
  signIn();

  const pinEvents = [];
  const awardEvents = [];
  globalThis.window.addEventListener('daily-friend-pins', (e) => pinEvents.push(e.detail));
  globalThis.window.addEventListener('daily-progression-award', (e) => awardEvents.push(e.detail));

  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.date === today && body.slot === 0) {
      return response(200, {
        stored: { date: body.date, locationId: body.locationId, guess: body.guess, submittedAt: 1 },
        friends: [], progressionAward: { total: 15 },
      });
    }
    if (body.date === yesterday && body.slot === 0) {
      return response(200, {
        stored: { date: body.date, locationId: body.locationId, guess: body.guess, submittedAt: 1 }, friends: [],
      });
    }
    if (body.date === today && body.slot === 1) throw new Error('still offline');
    throw new Error(`unexpected request for ${body.date}:${body.slot}`);
  };

  await flushPendingQueue();

  assert.deepEqual(pinEvents.map((d) => d.date), [today], 'only today\'s flushed entry fires the friend-pins event');
  assert.deepEqual(awardEvents.map((d) => d.date), [today], 'only today\'s flushed entry fires a progression award');

  const remaining = readQueue();
  assert.equal(remaining.length, 1, 'the entry whose request still fails stays queued');
  assert.equal(remaining[0].locationId, 'still-offline-loc');
});

test('flush drops an entry the worker rejects as outside the submittable window (INVALID_DAILY_DATE)', async () => {
  globalThis.localStorage = makeLocalStorage();
  globalThis.localStorage.setItem(FRIEND_QUEUE_KEY, JSON.stringify({
    _v: 1,
    entries: [{ date: 'ancient-date', slot: 0, locationId: 'old-loc', guess: { lat: 1, lng: 1 }, distanceKm: 1, score: 1 }],
  }));
  signIn();
  globalThis.fetch = async () => response(400, { code: 'INVALID_DAILY_DATE' });

  await flushPendingQueue();
  assert.deepEqual(readQueue(), []);
});

test('the Daily results screen shows the signed-out note in the friends card\'s place, and hides it when signed in', () => {
  const source = fs.readFileSync(new URL('../src/modes/daily-game.js', import.meta.url), 'utf8');
  const fn = source.match(/async function syncFriendsToday\(total\) \{[\s\S]*?\n}\n/)?.[0] || '';
  assert.ok(fn, 'syncFriendsToday should be found');
  const signedOutBranch = fn.match(/if \(!ACCOUNTS_ENABLED \|\| !isSignedIn\(\)\) \{[\s\S]*?\n {4}\}/)?.[0] || '';
  assert.match(signedOutBranch, /note\.hidden = false/);
  assert.match(signedOutBranch, /card\.hidden = false/);
  assert.match(signedOutBranch, /head\.hidden = true/);
  assert.match(signedOutBranch, /list\.hidden = true/);
  assert.match(fn, /note\.hidden = true;\n {2}head\.hidden = false;/);
});
