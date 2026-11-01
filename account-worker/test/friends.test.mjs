import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleFriends } from '../src/friends.js';

class D1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) { return new D1Statement(this.database, this.sql, values); }
  first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  all() { return { results: this.database.prepare(this.sql).all(...this.values) }; }
  run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

class LocalD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql) { return new D1Statement(this.database, sql); }
  async exec(sql) { this.database.exec(sql); }
  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const auth = {
  api: { getSession: async ({ headers }) => {
    const id = headers.get('x-test-user');
    return id ? { user: { id } } : null;
  } },
};

async function fixture(t) {
  const DB = new LocalD1();
  await DB.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0002_auth_exchange.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0003_friends.sql', import.meta.url), 'utf8'));
  return { DB };
}

async function addUser(env, id, name = id) {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO "user"
    (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`)
    .bind(id, name, `${id}@example.test`, now, now).run();
}

async function call(env, id, method, path, input) {
  const headers = new Headers();
  if (id) headers.set('x-test-user', id);
  if (input !== undefined) headers.set('content-type', 'application/json');
  const request = new Request(`https://worker.test${path}`, {
    method, headers, body: method === 'GET' || input === undefined ? undefined : JSON.stringify(input),
  });
  const response = await handleFriends(request, env, auth);
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}

const post = (env, id, path, input = {}) => call(env, id, 'POST', path, input);
const get = (env, id, path) => call(env, id, 'GET', path);

async function name(env, id, displayName = id.toUpperCase()) {
  return post(env, id, '/v1/friends/profile', { displayName });
}

async function invite(env, inviter, invitee) {
  const created = await post(env, inviter, '/v1/friends/invites');
  assert.equal(created.status, 200);
  const accepted = await post(env, invitee, '/v1/friends/invites/accept', { token: created.body.token });
  assert.equal(accepted.status, 200);
  return created.body.token;
}

function guess(date, slot, locationId, lat = 1, lng = 2) {
  return {
    date, slot, locationId, guess: { lat, lng }, distanceKm: 12,
    score: 900, deviceId: 'dev_test',
  };
}

function dateOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

test('all friends and daily routes require authentication', async (t) => {
  const env = await fixture(t);
  const routes = [
    ['GET', '/v1/friends'],
    ['POST', '/v1/friends/profile'],
    ['POST', '/v1/friends/invites'],
    ['POST', '/v1/friends/invites/preview'],
    ['POST', '/v1/friends/invites/accept'],
    ['POST', '/v1/friends/remove'],
    ['POST', '/v1/daily/guesses'],
    ['GET', `/v1/daily/friends?date=${dateOffset(0)}`],
  ];
  for (const [method, path] of routes) {
    const result = await call(env, null, method, path, method === 'GET' ? undefined : {});
    assert.deepEqual(result, { status: 401, body: { code: 'UNAUTHORIZED' } });
  }
});

test('invite lifecycle, names, limits, unified invalid response, and mutual removal', async (t) => {
  const env = await fixture(t);
  for (const id of ['a', 'b', 'c']) await addUser(env, id);
  assert.deepEqual(await post(env, 'a', '/v1/friends/invites'), {
    status: 409, body: { code: 'NAME_REQUIRED' },
  });
  assert.equal((await post(env, 'a', '/v1/friends/profile', { displayName: ' bad' })).body.code, 'INVALID_NAME');
  await name(env, 'a', 'Ana');
  const created = await post(env, 'a', '/v1/friends/invites');
  assert.match(created.body.token, /^[A-Za-z0-9_-]{22}$/);
  const storedInvite = await env.DB.prepare(
    'SELECT token_hash FROM friend_invites WHERE inviter_id = ?',
  ).bind('a').first();
  assert.notEqual(storedInvite.token_hash, created.body.token);
  assert.equal((await post(env, 'b', '/v1/friends/invites/preview', { token: created.body.token })).body.inviterName, 'Ana');
  assert.deepEqual(await post(env, 'b', '/v1/friends/invites/accept', { token: created.body.token }), {
    status: 409, body: { code: 'NAME_REQUIRED' },
  });
  await name(env, 'b', 'Bo');
  assert.deepEqual(await post(env, 'a', '/v1/friends/invites/accept', { token: created.body.token }), {
    status: 400, body: { code: 'SELF_INVITE' },
  });
  const accepted = await post(env, 'b', '/v1/friends/invites/accept', { token: created.body.token });
  assert.equal(accepted.status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM friendships').first()).n, 2);
  const invalid = { status: 404, body: { code: 'INVITE_INVALID' } };
  assert.deepEqual(await post(env, 'b', '/v1/friends/invites/accept', { token: created.body.token }), invalid);
  assert.deepEqual(await post(env, 'b', '/v1/friends/invites/preview', { token: 'AAAAAAAAAAAAAAAAAAAAAA' }), invalid);
  const expired = await post(env, 'a', '/v1/friends/invites');
  await env.DB.prepare('UPDATE friend_invites SET expires_at = ? WHERE inviter_id = ? AND used_at IS NULL')
    .bind(Date.now() - 1, 'a').run();
  assert.deepEqual(await post(env, 'b', '/v1/friends/invites/preview', { token: expired.body.token }), invalid);
  const listed = await get(env, 'a', '/v1/friends');
  assert.deepEqual(Object.keys(listed.body).sort(), ['friends', 'me', 'openInvites']);
  assert.deepEqual(Object.keys(listed.body.friends[0]).sort(), ['displayName', 'friendId', 'since']);
  assert.equal((await post(env, 'a', '/v1/friends/remove', { friendId: 'b' })).status, 204);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM friendships').first()).n, 0);

  await name(env, 'c', 'Cy');
  const singleUse = await post(env, 'a', '/v1/friends/invites');
  const competing = await Promise.all([
    post(env, 'b', '/v1/friends/invites/accept', { token: singleUse.body.token }),
    post(env, 'c', '/v1/friends/invites/accept', { token: singleUse.body.token }),
  ]);
  assert.deepEqual(competing.map((result) => result.status).sort(), [200, 404]);
  const winner = competing[0].status === 200 ? 'b' : 'c';
  await post(env, 'a', '/v1/friends/remove', { friendId: winner });

  for (let index = 0; index < 10; index += 1) {
    assert.equal((await post(env, 'a', '/v1/friends/invites')).status, 200);
  }
  assert.deepEqual(await post(env, 'a', '/v1/friends/invites'), {
    status: 429, body: { code: 'INVITE_LIMIT' },
  });
});

test('invite attempt rate limit, existing friendship idempotency, and friend cap', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a'); await addUser(env, 'b');
  await name(env, 'a', 'Ana'); await name(env, 'b', 'Bo');
  await invite(env, 'a', 'b');
  const again = await post(env, 'a', '/v1/friends/invites');
  assert.equal((await post(env, 'b', '/v1/friends/invites/accept', { token: again.body.token })).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM friendships').first()).n, 2);

  for (let index = 0; index < 28; index += 1) {
    await post(env, 'b', '/v1/friends/invites/preview', { token: 'AAAAAAAAAAAAAAAAAAAAAA' });
  }
  assert.deepEqual(await post(env, 'b', '/v1/friends/invites/preview', { token: 'AAAAAAAAAAAAAAAAAAAAAA' }), {
    status: 429, body: { code: 'RATE_LIMITED' },
  });

  const capped = await fixture(t);
  await addUser(capped, 'host'); await addUser(capped, 'full');
  await name(capped, 'host', 'Host'); await name(capped, 'full', 'Full');
  const now = Date.now();
  for (let index = 0; index < 50; index += 1) {
    const id = `f${index}`;
    await addUser(capped, id);
    await capped.DB.prepare(
      'INSERT INTO friendships (account_id, friend_id, created_at) VALUES (?, ?, ?)',
    ).bind('full', id, now).run();
  }
  const token = (await post(capped, 'host', '/v1/friends/invites')).body.token;
  assert.deepEqual(await post(capped, 'full', '/v1/friends/invites/accept', { token }), {
    status: 409, body: { code: 'FRIEND_LIMIT' },
  });
});

test('guess locking, validation, integrity gates, opt-out, and retroactive removal', async (t) => {
  const env = await fixture(t);
  for (const id of ['a', 'b', 'c']) { await addUser(env, id); await name(env, id, id.toUpperCase()); }
  await invite(env, 'a', 'b');
  const today = dateOffset(0);
  const yesterday = dateOffset(-1);
  await post(env, 'b', '/v1/daily/guesses', guess(today, 0, 'london', 5, 6));
  await post(env, 'c', '/v1/daily/guesses', guess(today, 0, 'london', 7, 8));
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations, {});
  const other = await post(env, 'a', '/v1/daily/guesses', guess(today, 1, 'paris', 1, 2));
  assert.deepEqual(other.body.friends, []);
  assert.deepEqual(Object.keys((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations), ['paris']);
  const first = await post(env, 'a', '/v1/daily/guesses', guess(today, 0, 'london', 1.23456, 2.34567));
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.stored.guess, { lat: 1.2346, lng: 2.3457 });
  assert.deepEqual(first.body.friends.map((friend) => friend.friendId), ['b']);
  const replay = await post(env, 'a', '/v1/daily/guesses', guess(today, 0, 'london', 1.23456, 2.34567));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.stored.submittedAt, first.body.stored.submittedAt);
  const locked = await post(env, 'a', '/v1/daily/guesses', guess(today, 0, 'london', 10, 11));
  assert.equal(locked.status, 409);
  assert.equal(locked.body.code, 'GUESS_LOCKED');
  assert.deepEqual(locked.body.stored.guess, first.body.stored.guess);
  const slot = await post(env, 'a', '/v1/daily/guesses', guess(today, 1, 'rome', 3, 4));
  assert.deepEqual(slot, { status: 409, body: { code: 'SLOT_CONFLICT' } });
  await post(env, 'b', '/v1/daily/guesses', guess(yesterday, 0, 'london', 5, 6));
  await post(env, 'a', '/v1/daily/guesses', guess(yesterday, 0, 'london', 1, 2));
  await post(env, 'b', '/v1/friends/profile', { sharePins: false });
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations.london.friends, []);
  await post(env, 'b', '/v1/friends/profile', { sharePins: true });
  await post(env, 'a', '/v1/friends/profile', { sharePins: false });
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations.london.friends, []);
  await post(env, 'a', '/v1/friends/profile', { sharePins: true });
  await post(env, 'a', '/v1/friends/remove', { friendId: 'b' });
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations.london.friends, []);
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${yesterday}`)).body.locations.london.friends, []);
  assert.deepEqual((await get(env, 'b', `/v1/daily/friends?date=${today}`)).body.locations.london.friends, []);

  assert.equal((await post(env, 'a', '/v1/daily/guesses', guess(dateOffset(-3), 2, 'x'))).body.code, 'INVALID_DAILY_DATE');
  assert.equal((await get(env, 'a', `/v1/daily/friends?date=${dateOffset(-3)}`)).body.code, 'INVALID_DAILY_DATE');
  assert.equal((await post(env, 'a', '/v1/daily/guesses', { ...guess(today, 2, 'BAD'), score: 1001 })).body.code, 'INVALID_GUESS');
});

test('user deletion cascades profile, invites, guesses, and both friendship edges', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a'); await addUser(env, 'b');
  await name(env, 'a', 'Ana'); await name(env, 'b', 'Bo');
  await invite(env, 'a', 'b');
  await post(env, 'a', '/v1/friends/invites');
  await post(env, 'a', '/v1/daily/guesses', guess(dateOffset(0), 0, 'london'));
  await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind('a').run();
  for (const table of ['profiles', 'friendships', 'friend_invites', 'daily_guesses']) {
    const values = table === 'friendships' ? ['a', 'a'] : ['a'];
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${
      table === 'friendships' ? 'account_id = ? OR friend_id = ?' :
      table === 'friend_invites' ? 'inviter_id = ?' : 'account_id = ?'
    }`).bind(...values).first();
    assert.equal(row.n, 0);
  }
});
