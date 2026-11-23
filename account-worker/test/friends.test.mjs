import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleFriends, inviteLandingPage } from '../src/friends.js';
import { manifestIds } from '../src/daily.js';

const canonicalLocations = JSON.parse(readFileSync(new URL('../data/daily-locations.json', import.meta.url), 'utf8')).locations
  .map((location) => ({ location_id: location.locationId, country: location.country }));

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
  await DB.exec(readFileSync(new URL('../migrations/0004_daily_trust.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0005_traveler_progression.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0006_achievement_community.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0007_progression_integrity.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0008_referral_credits.sql', import.meta.url), 'utf8'));
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

async function completeDaily(env, id, date) {
  const ids = manifestIds(date, canonicalLocations);
  let final;
  for (let slot = 0; slot < 5; slot += 1) {
    final = await post(env, id, '/v1/daily/guesses', {
      ...guess(date, slot, ids[slot], 0, 0), distanceKm: 0, score: 1000,
    });
    assert.equal(final.status, 200);
  }
  return final;
}

async function xpTotal(env, id) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_ledger WHERE account_id = ?',
  ).bind(id).first();
  return Number(row.xp);
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
  await env.DB.prepare(`INSERT INTO xp_ledger (account_id, source_type, source_key, amount, created_at)
    VALUES (?, ?, ?, ?, ?)`).bind('b', 'daily', 'daily:test', 100, Date.now()).run();
  await env.DB.prepare(`INSERT INTO user_achievements (account_id, achievement_id, earned_at, qualifying_key)
    VALUES (?, ?, ?, ?)`).bind('b', 'frequent-flyer', Date.now(), 'daily:test').run();
  await env.DB.prepare(`INSERT INTO profile_loadouts (account_id, title_id, card_id, avatar_json, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind('b', 'window-seat', 'airmail', JSON.stringify({ v: 2, initials: 'bo', disc: 'forest', motif: 'plane' }), Date.now()).run();
  const listed = await get(env, 'a', '/v1/friends');
  assert.deepEqual(Object.keys(listed.body).sort(), ['friends', 'me', 'openInvites']);
  assert.deepEqual(Object.keys(listed.body.friends[0]).sort(), ['displayName', 'friendId', 'level', 'loadout', 'since']);
  assert.deepEqual(listed.body.friends[0], {
    friendId: 'b', displayName: 'Bo', since: listed.body.friends[0].since, level: 2,
    loadout: { titleId: 'window-seat', cardId: 'true-navy', avatar: { v: 2, initials: 'BO', disc: 'forest', motif: 'plane', ring: 'level', topper: null } },
  });
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

test('invite landing page carries the inviter name in OG tags and falls back for invalid tokens', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a');
  await name(env, 'a', 'Ana');
  const created = await post(env, 'a', '/v1/friends/invites');

  const validResponse = await inviteLandingPage(env, created.body.token);
  assert.equal(validResponse.status, 200);
  assert.equal(validResponse.headers.get('content-type'), 'text/html; charset=utf-8');
  const validHtml = await validResponse.text();
  assert.match(validHtml, /<meta property="og:title" content="Friend invite · Where on Earth">/);
  assert.match(validHtml, /Ana invited you to be friends on Where on Earth\. Play the Daily and compare pins\./);
  assert.match(validHtml, /<meta property="og:image" content="https:\/\/where-on\.earth\/assets\/og-v3\.png">/);
  assert.match(validHtml, new RegExp(`friend=${created.body.token}`));
  assert.doesNotMatch(validHtml, /no longer valid/);

  const invalidResponse = await inviteLandingPage(env, 'AAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(invalidResponse.status, 200);
  const invalidHtml = await invalidResponse.text();
  assert.match(invalidHtml, /This invite link is no longer valid/);
  assert.doesNotMatch(invalidHtml, /Ana/);
  assert.doesNotMatch(invalidHtml, /friend=/);
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
  assert.deepEqual(first.body.friends[0].seal, { disc: 'navy', initials: null });
  await env.DB.prepare(`INSERT INTO profile_loadouts (account_id, title_id, card_id, avatar_json, updated_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind('b', 'traveler', 'blue-horizon', JSON.stringify({ v: 2, initials: 'bo', disc: 'forest', motif: 'globe' }), Date.now()).run();
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations.london.friends[0].seal, { disc: 'forest', initials: 'BO' });
  await env.DB.prepare('UPDATE profile_loadouts SET avatar_json = ? WHERE account_id = ?')
    .bind(JSON.stringify({ backdrop: 'legacy' }), 'b').run();
  assert.deepEqual((await get(env, 'a', `/v1/daily/friends?date=${today}`)).body.locations.london.friends[0].seal, { disc: 'navy', initials: null });
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

test('daily date validation accepts real UTC+14 and UTC-12 local dates', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a');
  const cases = [
    ['UTC+14', '2026-03-08T10:30:00.000Z', '2026-03-09'],
    ['UTC+14', '2026-11-17T12:30:00.000Z', '2026-11-18'],
    ['UTC-12', '2026-03-08T00:30:00.000Z', '2026-03-07'],
    ['UTC-12', '2026-11-17T01:30:00.000Z', '2026-11-16'],
  ];
  const originalNow = Date.now;
  try {
    for (const [zone, instant, date] of cases) {
      Date.now = () => Date.parse(instant);
      assert.equal((await get(env, 'a', `/v1/daily/friends?date=${date}`)).status, 200, `${zone} at ${instant}`);
    }
  } finally {
    Date.now = originalNow;
  }
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

test('canonical rounds ignore client totals and complete once five manifest slots exist', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a');
  const date = dateOffset(0);
  const ids = manifestIds(date, canonicalLocations);
  let final;
  for (let slot = 0; slot < 5; slot += 1) {
    const result = await post(env, 'a', '/v1/daily/guesses', {
      ...guess(date, slot, ids[slot], 0, 0), distanceKm: 0, score: 1000,
    });
    assert.equal(result.status, 200);
    if (slot === 4) final = result;
  }
  const rounds = await env.DB.prepare(`SELECT slot, location_id, distance_km, score
    FROM canonical_daily_rounds WHERE account_id = ? AND daily_date = ? ORDER BY slot`).bind('a', date).all();
  assert.equal(rounds.results.length, 5);
  assert.notEqual(rounds.results[0].score, 1000);
  const completion = await env.DB.prepare(`SELECT total_score FROM canonical_daily_completions
    WHERE account_id = ? AND daily_date = ?`).bind('a', date).first();
  assert.equal(completion.total_score, rounds.results.reduce((total, round) => total + round.score, 0));
  assert.deepEqual(Object.keys(final.body.progressionAward).sort(), ['base', 'bullseyes', 'levelAfter', 'levelBefore', 'postcards', 'score', 'total', 'xpAfter', 'xpBefore']);
  const award = final.body.progressionAward;
  assert.equal(award.total, award.base + award.score + award.postcards + award.bullseyes);
  assert.equal(award.total, award.xpAfter - award.xpBefore);
  const profile = await get(env, 'a', '/v1/progression');
  assert.equal(profile.body.totalXp, award.xpAfter);
  assert.equal(profile.body.xpIntoLevel + profile.body.xpToNext, profile.body.levelSpan);
  await post(env, 'a', '/v1/daily/guesses', guess(date, 0, ids[0], 80, 80));
  assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM canonical_daily_completions
    WHERE account_id = ? AND daily_date = ?`).bind('a', date).first()).n, 1);
});

test('friend progression allowlists earned labels without unearned counters', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a'); await addUser(env, 'b');
  await name(env, 'a', 'Ana'); await name(env, 'b', 'Bo');
  await invite(env, 'a', 'b');
  await env.DB.prepare(`INSERT INTO user_achievements
    (account_id, achievement_id, earned_at, qualifying_key) VALUES (?, ?, ?, ?)`)
    .bind('b', 'first-departure', 1, 'daily:2026-10-01').run();
  const result = await get(env, 'a', '/v1/progression/friend?friendId=b');
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['achievementDefinitions', 'achievements', 'displayName', 'level', 'loadout', 'stats']);
  assert.deepEqual(result.body.achievementDefinitions.map((item) => item.id), ['first-departure']);
  assert.equal(JSON.stringify(result.body).includes('progress'), false);
  assert.equal(JSON.stringify(result.body).includes('xpToNext'), false);
});

test('level-two title choice persists until both titles unlock at level five', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a');
  await env.DB.prepare(`INSERT INTO xp_ledger
    (account_id, source_type, source_key, amount, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind('a', 'test', 'level-two', 100, 1).run();
  assert.equal((await post(env, 'a', '/v1/progression/loadout', { titleId: 'window-seat' })).status, 200);
  assert.equal((await post(env, 'a', '/v1/progression/loadout', { titleId: 'aisle-seat' })).status, 403);
  await env.DB.prepare('UPDATE xp_ledger SET amount = 520 WHERE account_id = ?').bind('a').run();
  assert.equal((await post(env, 'a', '/v1/progression/loadout', { titleId: 'aisle-seat' })).status, 200);
});

test('removed banner selections return and save as True Navy', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a');
  await name(env, 'a', 'Ana');
  await env.DB.prepare(`INSERT INTO profile_loadouts (account_id, title_id, card_id, avatar_json, updated_at)
    VALUES (?, ?, ?, ?, ?)`).bind('a', 'traveler', 'blue-horizon', JSON.stringify({ v: 2 }), Date.now()).run();
  assert.equal((await get(env, 'a', '/v1/progression')).body.loadout.cardId, 'true-navy');
  const updated = await post(env, 'a', '/v1/progression/loadout', { cardId: 'airmail' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.loadout.cardId, 'true-navy');
  assert.equal((await env.DB.prepare('SELECT card_id FROM profile_loadouts WHERE account_id = ?').bind('a').first()).card_id, 'true-navy');
});

test('open-field remains a selectable banner', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a');
  await name(env, 'a', 'Ana');
  const updated = await post(env, 'a', '/v1/progression/loadout', { cardId: 'open-field' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.loadout.cardId, 'open-field');
});

test('referral payout: pending on accept, 25 XP on the invitee\'s first canonical Daily, nothing on the second', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a'); await addUser(env, 'b');
  await name(env, 'a', 'Ana'); await name(env, 'b', 'Bo');
  await invite(env, 'a', 'b');
  assert.deepEqual(
    { ...(await env.DB.prepare('SELECT inviter_id, status FROM referral_credits WHERE invitee_id = ?').bind('b').first()) },
    { inviter_id: 'a', status: 'pending' },
  );
  assert.equal(await xpTotal(env, 'a'), 0);

  await completeDaily(env, 'b', dateOffset(0));
  assert.equal((await env.DB.prepare('SELECT status FROM referral_credits WHERE invitee_id = ?').bind('b').first()).status, 'paid');
  assert.equal(await xpTotal(env, 'a'), 25);
  const profile = await get(env, 'a', '/v1/progression');
  assert.equal(profile.body.totalXp, 25);
  assert.equal(profile.body.xpIntoLevel + profile.body.xpToNext, profile.body.levelSpan);

  await completeDaily(env, 'b', dateOffset(-1));
  assert.equal(await xpTotal(env, 'a'), 25);
});

test('an invitee with two accepted invites pays only the first inviter', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a'); await addUser(env, 'c'); await addUser(env, 'b');
  await name(env, 'a', 'Ana'); await name(env, 'c', 'Cy'); await name(env, 'b', 'Bo');
  await invite(env, 'a', 'b');
  await invite(env, 'c', 'b');
  assert.deepEqual(
    (await env.DB.prepare('SELECT invitee_id, inviter_id, status FROM referral_credits').all()).results.map((row) => ({ ...row })),
    [{ invitee_id: 'b', inviter_id: 'a', status: 'pending' }],
  );

  await completeDaily(env, 'b', dateOffset(0));
  assert.equal(await xpTotal(env, 'a'), 25);
  assert.equal(await xpTotal(env, 'c'), 0);
});

test('a sixth pending referral never pays once the inviter has five paid', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'inviter'); await name(env, 'inviter', 'Ivy');
  const invitees = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'];
  for (const id of invitees) {
    await addUser(env, id); await name(env, id, id.toUpperCase());
    await invite(env, 'inviter', id);
  }
  const date = dateOffset(0);
  for (let index = 0; index < 5; index += 1) await completeDaily(env, invitees[index], date);
  assert.equal(
    (await env.DB.prepare(`SELECT COUNT(*) AS n FROM referral_credits WHERE inviter_id = 'inviter' AND status = 'paid'`).first()).n,
    5,
  );
  assert.equal(await xpTotal(env, 'inviter'), 125);

  await completeDaily(env, 'i6', date);
  assert.equal((await env.DB.prepare(`SELECT status FROM referral_credits WHERE invitee_id = 'i6'`).first()).status, 'pending');
  assert.equal(await xpTotal(env, 'inviter'), 125);
});

test('self-invite stays rejected and creates no referral credit', async (t) => {
  const env = await fixture(t);
  await addUser(env, 'a'); await name(env, 'a', 'Ana');
  const created = await post(env, 'a', '/v1/friends/invites');
  assert.deepEqual(await post(env, 'a', '/v1/friends/invites/accept', { token: created.body.token }), {
    status: 400, body: { code: 'SELF_INVITE' },
  });
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM referral_credits').first()).n, 0);
});
