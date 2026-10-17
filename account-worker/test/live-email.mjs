import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = process.env.ACCOUNT_URL;
if (!base) throw new Error('ACCOUNT_URL is required');
const email = `phase1-${Date.now()}@example.com`;
const headers = { origin: base, 'content-type': 'application/json' };

const send = await fetch(`${base}/v1/auth/email/send`, {
  method: 'POST', headers, body: JSON.stringify({ email }),
});
assert.equal(send.ok, true, `send returned ${send.status}: ${await send.text()}`);

const query = (sql) => JSON.parse(execFileSync('python3', ['deploy.py', 'query', sql], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
}));
const mailRows = query(`SELECT otp FROM mail_sink WHERE email = '${email}' ORDER BY created_at DESC LIMIT 1`);
const code = mailRows[0]?.results?.[0]?.otp;
assert.match(code || '', /^\d{6}$/);
const verificationRows = query(`SELECT value FROM verification WHERE identifier LIKE '%${email}%' ORDER BY createdAt DESC LIMIT 1`);
const stored = verificationRows[0]?.results?.[0]?.value || '';
assert.equal(stored.includes(code), false, 'verification storage exposed the live code');

const verify = await fetch(`${base}/v1/auth/email/verify`, {
  method: 'POST', headers, body: JSON.stringify({ email, code }),
});
const signedIn = await verify.json();
assert.equal(verify.ok, true, `verify returned ${verify.status}: ${JSON.stringify(signedIn)}`);
assert.ok(signedIn.token);

const session = await fetch(`${base}/v1/me`, {
  headers: { origin: base, authorization: `Bearer ${signedIn.token}` },
});
const sessionBody = await session.json();
assert.equal(session.ok, true);
assert.equal(sessionBody.user.email, email);
console.log('PASS send');
console.log('PASS mail sink read');
console.log('PASS hashed verification storage contains no live code');
console.log('PASS verify');
console.log('PASS get-session');
