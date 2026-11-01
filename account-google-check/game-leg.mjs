// Browser leg of the exchange flow: mint a fresh code through the real
// worker chain (start, email session, land), then land the actual game on
// the exact URL land redirected to and prove the game ends signed in:
// session in localStorage under the frozen account key, the token
// authenticates /v1/me, the fragment is stripped, and the code's row in D1
// is marked used. The worker must already be running locally (wrangler dev).
// Run from the repository root: node account-google-check/game-leg.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8787';
const WORKER_ORIGIN = 'https://woe-account.gartland-79.workers.dev';
const ORIGIN = 'https://game.local';
const EMAIL = 'pilot@example.com';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

let failures = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures += 1;
}

function d1(sql) {
  const script = `
import glob, sqlite3
db = glob.glob('${new URL('../account-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/', import.meta.url).pathname}*.sqlite')[0]
rows = sqlite3.connect(f'file:{db}?mode=ro', uri=True).execute(${JSON.stringify(sql)}).fetchall()
print(repr(rows))
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8' }).trim();
}

// Mint a fresh code through the real chain.
const startResponse = await fetch(`${BASE}/v1/auth/google/start?return=${encodeURIComponent(`${ORIGIN}/?accounts=1`)}`, { redirect: 'manual' });
const attemptCookie = (startResponse.headers.getSetCookie() || []).map((c) => c.split(';')[0]).find((p) => p.startsWith('woe_attempt='));
const attemptId = attemptCookie?.split('=')[1];
await fetch(`${BASE}/v1/auth/email/send`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: EMAIL }),
});
const otp = d1(`SELECT otp FROM mail_sink WHERE email = '${EMAIL}' ORDER BY created_at DESC LIMIT 1`).match(/\('(\d{6})',\)/)?.[1];
const verify = await fetch(`${BASE}/v1/auth/email/verify`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: EMAIL, code: otp }),
});
const sessionCookies = (verify.headers.getSetCookie() || []).map((c) => c.split(';')[0]);
const land = await fetch(`${BASE}/v1/auth/google/land?attempt=${attemptId}`, {
  redirect: 'manual', headers: { cookie: [attemptCookie, ...sessionCookies].join('; ') },
});
const gameUrl = land.headers.get('location') || '';
const code = /#woe_auth=([A-Za-z0-9_-]{43})$/.exec(gameUrl)?.[1];
check('minted a fresh code for the browser leg', Boolean(code), gameUrl.slice(0, 80));

// Boot the real game on that URL, with the worker origin proxied to local.
const domainsFile = '/tmp/hatch-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(() => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
      const original = C?.prototype[name];
      if (original) C.prototype[name] = function (...args) { if (!window.__skipGL) return original.apply(this, args); };
    }
  }
  window.__skipGL = true;
});
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === WORKER_ORIGIN) {
    const request = route.request();
    const upstream = await fetch(BASE + url.pathname + url.search, {
      method: request.method(),
      headers: Object.fromEntries(Object.entries(request.headers()).filter(([key]) => !['host', 'content-length'].includes(key))),
      body: request.method() === 'GET' || request.method() === 'HEAD' ? undefined : request.postData(),
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers = {};
    upstream.headers.forEach((value, key) => {
      if (!['content-length', 'transfer-encoding', 'connection'].includes(key)) headers[key] = value;
    });
    return route.fulfill({ status: upstream.status, headers, body });
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try {
    return route.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch {
    return route.fulfill({ status: 404, body: 'not found' });
  }
});
await page.goto(gameUrl);
let stored = null;
try {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('where-on-earth-account-v1');
    return raw && JSON.parse(raw).sessionToken;
  }, null, { timeout: 60000 });
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('where-on-earth-account-v1')));
} catch { /* asserted below */ }
check('game ends signed in (session in localStorage)', Boolean(stored?.sessionToken));
check('stored session is unexpired', Boolean(stored && stored.expiresAt > Date.now()), stored ? `expiresAt ${stored.expiresAt}` : '');
check('stored email hint is the pilot account', (stored?.emailHint || '').startsWith('p***@'), stored?.emailHint || '');
const signedIn = await page.evaluate(async () => {
  const module = await import('/src/account/session.js');
  return module.isSignedIn();
});
check('isSignedIn() agrees', signedIn === true);
const hash = await page.evaluate(() => window.location.hash);
check('the fragment was stripped from the URL', hash === '', JSON.stringify(hash));
if (stored?.sessionToken) {
  const me = await fetch(`${BASE}/v1/me`, { headers: { authorization: `Bearer ${stored.sessionToken}` } });
  const meBody = await me.json().catch(() => ({}));
  check('the game-stored token authenticates /v1/me', me.ok && meBody.user?.email === EMAIL, `status ${me.status}`);
}
const codeHash = crypto.createHash('sha256').update(code || '').digest('hex');
const usedRow = d1(`SELECT used_at FROM auth_exchange_codes WHERE code_hash = '${codeHash}'`);
check('the code row in D1 is marked used', /\(\d+,\)/.test(usedRow), usedRow);
await browser.close();
console.log(failures === 0 ? 'GAME LEG PASSES' : `${failures} GAME LEG CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
