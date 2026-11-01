import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = '/tmp/friends-lane3-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.addInitScript(() => {
  localStorage.setItem('where-on-earth-account-v1', JSON.stringify({
    _v: 1, accountId: 'u_me', sessionToken: 'session_test', expiresAt: Date.now() + 86400000,
    emailHint: 'a***@example.com', deviceId: 'dev_test', merged: true,
  }));
});

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev') {
    if (url.pathname === '/v1/friends') return route.fulfill({ json: {
      me: { displayName: 'Maya', sharePins: true },
      friends: [
        { friendId: 'u_ana', displayName: 'Ana', since: 1 },
        { friendId: 'u_jo', displayName: 'Jo', since: 2 },
      ], openInvites: 1,
    } });
    return route.fulfill({ json: {} });
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try {
    return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' });
  } catch {
    return route.fulfill({ status: 404, body: 'not found' });
  }
});

await page.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
await page.evaluate(async () => { const { openAccountSheet } = await import('/src/account/sheet.js'); await openAccountSheet(); });
await page.waitForSelector('.account-friends-list');
const measurements = await page.evaluate(() => {
  const panel = document.querySelector('.account-panel');
  const friends = document.querySelector('.account-friends');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    panel: { width: panel.getBoundingClientRect().width, height: panel.getBoundingClientRect().height },
    friendsVisible: Boolean(friends && friends.getBoundingClientRect().height),
    names: [...document.querySelectorAll('.account-friend > span:first-child')].map((node) => node.textContent),
    overflowX: document.documentElement.scrollWidth > innerWidth,
  };
});
const screenshot = await page.screenshot({ path: `${OUT}signed-in-friends-390.png`, fullPage: false });
if (!screenshot.length || measurements.overflowX || measurements.names.join(',') !== 'Ana,Jo') throw new Error(JSON.stringify(measurements));
fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify({ ...measurements, errors }, null, 2)}\n`);
console.log(JSON.stringify({ ...measurements, errors }));
await browser.close();
