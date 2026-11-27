import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { issueTransferCode, redeemTransferCode } from '../src/transfer.js';

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
}

async function fixture() {
  const DB = new LocalD1();
  await DB.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  await DB.exec(readFileSync(new URL('../migrations/0009_transfer_codes.sql', import.meta.url), 'utf8'));
  return { DB };
}

async function addUser(env, id, name = id) {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO "user"
    (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`)
    .bind(id, name, `${id}@example.test`, now, now).run();
}

function authFor(sessions) {
  return { api: { getSession: async ({ headers }) => sessions[headers.get('x-test-user')] || null } };
}

function sessionFor(userId) {
  return { user: { id: userId }, session: { token: `tok_${userId}`, expiresAt: new Date(Date.now() + 3600000).toISOString() } };
}

function issueRequest(userId) {
  return new Request('https://worker.test/v1/auth/transfer-code', {
    method: 'POST', headers: new Headers({ 'x-test-user': userId }),
  });
}

function redeemRequest(code, ip = '203.0.113.1') {
  return new Request('https://worker.test/v1/auth/transfer', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', 'cf-connecting-ip': ip }),
    body: JSON.stringify({ code }),
  });
}

test('issuing a code then redeeming it returns a session for the right profile', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const issued = await issueTransferCode(issueRequest('alice'), env, auth);
  assert.equal(issued.status, 200);
  const { code, expiresInSeconds } = await issued.json();
  assert.match(code, /^\d{6}$/);
  assert.equal(expiresInSeconds, 600);
  const redeemed = await redeemTransferCode(redeemRequest(code), env);
  assert.equal(redeemed.status, 200);
  const body = await redeemed.json();
  assert.equal(body.user.id, 'alice');
  assert.equal(body.token, 'tok_alice');
  assert.equal(body.session.token, 'tok_alice');
});

test('an expired code is rejected with the generic error', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const issued = await issueTransferCode(issueRequest('alice'), env, auth);
  const { code } = await issued.json();
  await env.DB.prepare('UPDATE auth_transfer_codes SET expires_at = ? WHERE user_id = ?').bind(Date.now() - 1000, 'alice').run();
  const redeemed = await redeemTransferCode(redeemRequest(code), env);
  assert.equal(redeemed.status, 401);
  assert.deepEqual(await redeemed.json(), { code: 'INVALID_CODE' });
});

test('a used code is rejected on a second redemption attempt', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const issued = await issueTransferCode(issueRequest('alice'), env, auth);
  const { code } = await issued.json();
  const first = await redeemTransferCode(redeemRequest(code, '203.0.113.2'), env);
  assert.equal(first.status, 200);
  const second = await redeemTransferCode(redeemRequest(code, '203.0.113.3'), env);
  assert.equal(second.status, 401);
  assert.deepEqual(await second.json(), { code: 'INVALID_CODE' });
});

test('issuing a second code invalidates the profile\'s previous unused code', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const { code: firstCode } = await (await issueTransferCode(issueRequest('alice'), env, auth)).json();
  const { code: secondCode } = await (await issueTransferCode(issueRequest('alice'), env, auth)).json();
  const staleAttempt = await redeemTransferCode(redeemRequest(firstCode, '203.0.113.4'), env);
  assert.equal(staleAttempt.status, 401);
  const freshAttempt = await redeemTransferCode(redeemRequest(secondCode, '203.0.113.5'), env);
  assert.equal(freshAttempt.status, 200);
  assert.equal((await freshAttempt.json()).user.id, 'alice');
});

test('a wrong code gets the same generic error as expired or used codes', async () => {
  const env = await fixture();
  const redeemed = await redeemTransferCode(redeemRequest('000000'), env);
  assert.equal(redeemed.status, 401);
  assert.deepEqual(await redeemed.json(), { code: 'INVALID_CODE' });
});

test('the stored row holds only a hash of the code, never the plain code', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const { code } = await (await issueTransferCode(issueRequest('alice'), env, auth)).json();
  const row = await env.DB.prepare('SELECT * FROM auth_transfer_codes WHERE user_id = ?').bind('alice').first();
  assert.match(row.code_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(row.code_hash, code);
  assert.equal(JSON.stringify(row).includes(code), false);
});

test('issuing requires an authenticated session', async () => {
  const env = await fixture();
  const auth = authFor({});
  const issued = await issueTransferCode(issueRequest('nobody'), env, auth);
  assert.equal(issued.status, 401);
  assert.deepEqual(await issued.json(), { code: 'UNAUTHORIZED' });
});

test('a redeemed row has its session_token blanked so it never retains a live token', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const { code } = await (await issueTransferCode(issueRequest('alice'), env, auth)).json();
  const redeemed = await redeemTransferCode(redeemRequest(code), env);
  assert.equal(redeemed.status, 200);
  const row = await env.DB.prepare('SELECT * FROM auth_transfer_codes WHERE user_id = ?').bind('alice').first();
  assert.equal(row.session_token, '');
});

test('issuing a second code blanks the invalidated prior row\'s session_token too', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  await issueTransferCode(issueRequest('alice'), env, auth);
  const firstHash = (await env.DB.prepare('SELECT code_hash FROM auth_transfer_codes WHERE user_id = ?').bind('alice').first()).code_hash;
  await issueTransferCode(issueRequest('alice'), env, auth);
  const firstRow = await env.DB.prepare('SELECT * FROM auth_transfer_codes WHERE code_hash = ?').bind(firstHash).first();
  assert.equal(firstRow.used_at !== null, true);
  assert.equal(firstRow.session_token, '');
});

test('issuing a new code deletes rows that expired over a day ago but keeps recently expired ones', async () => {
  const env = await fixture();
  await addUser(env, 'alice');
  const auth = authFor({ alice: sessionFor('alice') });
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO auth_transfer_codes
    (code_hash, user_id, session_token, session_expires_at, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind('stale_hash', 'alice', 'tok_old', now, now - 2 * 24 * 60 * 60 * 1000, now - 25 * 60 * 60 * 1000).run();
  await env.DB.prepare(`INSERT INTO auth_transfer_codes
    (code_hash, user_id, session_token, session_expires_at, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind('recent_hash', 'alice', 'tok_recent', now, now - 60 * 60 * 1000, now - 60 * 1000).run();
  const auth2 = authFor({ alice: sessionFor('alice') });
  await issueTransferCode(issueRequest('alice'), env, auth2);
  const stale = await env.DB.prepare('SELECT * FROM auth_transfer_codes WHERE code_hash = ?').bind('stale_hash').first();
  const recent = await env.DB.prepare('SELECT * FROM auth_transfer_codes WHERE code_hash = ?').bind('recent_hash').first();
  assert.equal(stale, null);
  assert.notEqual(recent, null);
});

test('redemption guesses from the same IP are throttled', async () => {
  const env = await fixture();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await redeemTransferCode(redeemRequest('111111', '198.51.100.9'), env);
    assert.equal(response.status, 401);
  }
  const throttled = await redeemTransferCode(redeemRequest('111111', '198.51.100.9'), env);
  assert.equal(throttled.status, 429);
  assert.deepEqual(await throttled.json(), { code: 'RATE_LIMITED' });
  const otherIp = await redeemTransferCode(redeemRequest('111111', '198.51.100.10'), env);
  assert.equal(otherIp.status, 401);
});
