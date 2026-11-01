// Sheet behavior when the account worker misbehaves. The first two Google
// fixes shipped because their harnesses ABORTED requests; Sean's phone
// HANGS them. This harness never answers /health at all in the hang
// scenario and proves the sheet still reaches an enabled, actionable
// Google button inside the ~7s budget, then that the click starts the
// full-page redirect to the worker's Google start endpoint.
// Run from the repository root: node account-google-check/hang-check.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const WORKER = 'https://woe-account.gartland-79.workers.dev';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
const HARNESS_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>sheet harness</title></head>
<body><div id="game"></div><script type="module">
import { openAccountSheet } from '/src/account/sheet.js';
window.__openSheet = openAccountSheet;
</script></body></html>`;

let failures = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures += 1;
}

const domainsFile = '/tmp/hatch-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});

async function runScenario(name, healthBehavior) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const startRequests = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === WORKER) {
      if (url.pathname === '/health') return healthBehavior(route);
      if (url.pathname === '/v1/auth/google/start') {
        startRequests.push(route.request().url());
        return route.abort();
      }
      return route.abort();
    }
    if (url.hostname !== 'game.local') return route.abort();
    if (url.pathname === '/sheet-harness.html') {
      return route.fulfill({ body: HARNESS_PAGE, contentType: 'text/html' });
    }
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    try {
      return route.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' });
    } catch {
      return route.fulfill({ status: 404, body: 'not found' });
    }
  });
  await page.goto('https://game.local/sheet-harness.html?accounts=1');
  const t0 = Date.now();
  await page.evaluate(() => window.__openSheet());
  let enabledMs = null;
  try {
    await page.waitForFunction(() => !document.querySelector('.account-google')?.disabled, null, { timeout: 9000 });
    enabledMs = Date.now() - t0;
  } catch { /* asserted below */ }
  const note = await page.evaluate(() => document.querySelector('.account-google-note')?.textContent || '');
  const result = { enabledMs, note, startRequests, page };
  console.log(`scenario ${name}: enabledMs=${enabledMs} note=${JSON.stringify(note)}`);
  return result;
}

// Hang: /health is never answered. The 6s accountApi timeout must free the
// button, enabled, with the redirect as its action.
const hang = await runScenario('hang', () => new Promise(() => {}));
check('hang: button becomes enabled', hang.enabledMs !== null);
check('hang: enabled within ~7s', hang.enabledMs !== null && hang.enabledMs < 7000, `${hang.enabledMs}ms`);
check('hang: note explains the fallback honestly', /Couldn't check/.test(hang.note), hang.note);
await hang.page.click('.account-google');
await hang.page.waitForTimeout(300);
check('hang: click starts the redirect flow', hang.startRequests.length === 1
  && hang.startRequests[0].startsWith(`${WORKER}/v1/auth/google/start?`)
  && hang.startRequests[0].includes(`return=${encodeURIComponent('https://game.local/?accounts=1')}`),
  hang.startRequests[0] || 'no request');
await hang.page.context().close();

// Refuse: /health dies instantly. Same end state, fast.
const refuse = await runScenario('refuse', (route) => route.abort());
check('refuse: button becomes enabled fast', refuse.enabledMs !== null && refuse.enabledMs < 3000, `${refuse.enabledMs}ms`);
check('refuse: note explains the fallback honestly', /Couldn't check/.test(refuse.note), refuse.note);
await refuse.page.context().close();

// Healthy: /health answers after a beat and Google is on.
const healthy = await runScenario('healthy', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, googleAvailable: true, googleClientId: 'dummy' }),
  });
});
check('healthy: button becomes enabled', healthy.enabledMs !== null && healthy.enabledMs < 3000, `${healthy.enabledMs}ms`);
check('healthy: note is cleared', healthy.note === '', JSON.stringify(healthy.note));
await healthy.page.click('.account-google');
await healthy.page.waitForTimeout(300);
check('healthy: click starts the redirect flow', healthy.startRequests.length === 1, healthy.startRequests[0] || 'no request');
await healthy.page.context().close();

// Off: /health answers and Google is not configured. Honest terminal state.
const off = await runScenario('off', (route) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, googleAvailable: false, googleClientId: null }),
}));
check('off: button stays disabled', off.enabledMs === null);
check('off: note says Google is turned off', /turned off/.test(off.note), off.note);
await off.page.context().close();

await browser.close();
console.log(failures === 0 ? 'ALL HANG CHECKS PASS' : `${failures} HANG CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
