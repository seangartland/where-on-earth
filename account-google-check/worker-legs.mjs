// Worker-side legs of the Google handoff, driven against a locally running
// worker (wrangler dev, local D1, sink email sender, dummy Google client).
// Proves: start redirects to a real Google auth URL and plants the attempt;
// land mints a one-time code only for a request carrying both the attempt
// cookie and a live better-auth session; exchange trades the code exactly
// once for a session the game can use. The Google consent + callback leg
// itself needs a real Google client and is not exercised here.
// Run from the repository root: node account-google-check/worker-legs.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const ORIGIN = 'https://game.local';
const EMAIL = 'pilot@example.com';
const OUT = new URL('./e2e-state.json', import.meta.url);

let failures = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures += 1;
}

function cookiePairs(response) {
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  return raw.map((cookie) => cookie.split(';')[0]).filter((pair) => pair.includes('='));
}

async function startAttempt() {
  const response = await fetch(`${BASE}/v1/auth/google/start?return=${encodeURIComponent(`${ORIGIN}/?accounts=1`)}`, {
    redirect: 'manual',
  });
  const pairs = cookiePairs(response);
  const attemptPair = pairs.find((pair) => pair.startsWith('woe_attempt='));
  return { response, attemptId: attemptPair?.split('=')[1], attemptCookie: attemptPair };
}

// Leg 1: start sends the browser to Google and plants the attempt.
const start = await startAttempt();
check('start returns 302', start.response.status === 302, `status ${start.response.status}`);
const googleUrl = new URL(start.response.headers.get('location') || '');
check('start redirects to accounts.google.com', googleUrl.hostname === 'accounts.google.com', googleUrl.hostname);
check('google url carries the dummy client id', googleUrl.searchParams.get('client_id') === 'dummy-client-id-for-local-verification');
check('google redirect_uri is the worker callback', googleUrl.searchParams.get('redirect_uri') === `${BASE}/api/auth/callback/google`, googleUrl.searchParams.get('redirect_uri') || '');
check('google url carries an oauth state', Boolean(googleUrl.searchParams.get('state')));
check('start sets the attempt cookie', Boolean(start.attemptCookie));

// Leg 2: a real session, via the email code path against the sink sender.
const send = await fetch(`${BASE}/v1/auth/email/send`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify({ email: EMAIL }),
});
check('email send accepted', send.ok, `status ${send.status}`);
// Read the OTP straight out of the local D1 sqlite file (read-only), which
// avoids running the wrangler CLI against the same state the dev server is
// serving from.
const otpLookup = `
import glob, sqlite3, sys
db = glob.glob('${new URL('../account-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/', import.meta.url).pathname}*.sqlite')[0]
row = sqlite3.connect(f'file:{db}?mode=ro', uri=True).execute(
  "SELECT otp FROM mail_sink WHERE email = ? ORDER BY created_at DESC LIMIT 1", ('${EMAIL}',)).fetchone()
print(row[0] if row else '')
`;
const otp = execFileSync('python3', ['-c', otpLookup], { encoding: 'utf8' }).trim();
check('otp read from the local sink', /^\d{6}$/.test(otp));
let verify;
for (let attempt = 0; attempt < 3; attempt += 1) {
  try {
    verify = await fetch(`${BASE}/v1/auth/email/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email: EMAIL, code: otp }),
    });
    break;
  } catch (error) {
    if (attempt === 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}
const verifyBody = await verify.json().catch(() => ({}));
check('email verify returns a user', verify.ok && verifyBody.user?.email === EMAIL, `status ${verify.status}`);
const sessionCookies = cookiePairs(verify);
check('email verify sets a session cookie', sessionCookies.some((pair) => pair.includes('session_token')), sessionCookies.join(', '));

// Leg 3: land with attempt cookie + session cookie mints the code.
const land = await fetch(`${BASE}/v1/auth/google/land?attempt=${start.attemptId}`, {
  redirect: 'manual',
  headers: { cookie: [start.attemptCookie, ...sessionCookies].join('; ') },
});
check('land returns 302', land.status === 302, `status ${land.status}`);
const landUrl = land.headers.get('location') || '';
const codeMatch = /^https:\/\/game\.local\/\?accounts=1#woe_auth=([A-Za-z0-9_-]{43})$/.exec(landUrl);
check('land redirects to the game with a fragment code', Boolean(codeMatch), landUrl.slice(0, 80));
const code = codeMatch?.[1];

// Leg 4a: the same attempt cannot mint twice.
const landAgain = await fetch(`${BASE}/v1/auth/google/land?attempt=${start.attemptId}`, {
  redirect: 'manual',
  headers: { cookie: [start.attemptCookie, ...sessionCookies].join('; ') },
});
check('a used attempt mints nothing', (landAgain.headers.get('location') || '').includes('#woe_auth_error=1'), landAgain.headers.get('location') || '');

// Leg 4b: a fresh attempt without a session mints nothing.
const start2 = await startAttempt();
const landNoSession = await fetch(`${BASE}/v1/auth/google/land?attempt=${start2.attemptId}`, {
  redirect: 'manual',
  headers: { cookie: start2.attemptCookie },
});
check('land without a session mints nothing', (landNoSession.headers.get('location') || '').includes('#woe_auth_error=1'));

// Leg 4c: an attempt id presented with a different attempt cookie mints nothing.
const start3 = await startAttempt();
const landMismatch = await fetch(`${BASE}/v1/auth/google/land?attempt=${start2.attemptId}`, {
  redirect: 'manual',
  headers: { cookie: [start3.attemptCookie, ...sessionCookies].join('; ') },
});
check('land with a mismatched attempt cookie mints nothing', (landMismatch.headers.get('location') || '').includes('#woe_auth_error=1'));

// Leg 5: exchange trades the code exactly once for a working session.
const exchange = await fetch(`${BASE}/v1/auth/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify({ code }),
});
const exchangeBody = await exchange.json().catch(() => ({}));
check('exchange returns a session', exchange.ok && typeof exchangeBody.session?.token === 'string', `status ${exchange.status}`);
check('exchange returns the signed-in user', exchangeBody.user?.email === EMAIL);
const me = await fetch(`${BASE}/v1/me`, { headers: { authorization: `Bearer ${exchangeBody.session?.token}` } });
const meBody = await me.json().catch(() => ({}));
check('the exchanged token authenticates /v1/me', me.ok && meBody.user?.email === EMAIL, `status ${me.status}`);
const replay = await fetch(`${BASE}/v1/auth/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify({ code }),
});
check('the same code cannot be exchanged twice', replay.status === 401, `status ${replay.status}`);
const garbage = await fetch(`${BASE}/v1/auth/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify({ code: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
});
check('an unknown code is rejected', garbage.status === 401, `status ${garbage.status}`);

fs.writeFileSync(OUT, JSON.stringify({
  gameUrl: landUrl, code, token: exchangeBody.session?.token, email: EMAIL,
}, null, 2));
console.log(failures === 0 ? 'ALL WORKER LEGS PASS' : `${failures} WORKER LEG(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
