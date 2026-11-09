import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = '/home/hatch/workspace/map-game/shots/home-mock/';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = `${OUT}.webgl-domains.txt`;
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  localStorage.setItem('where-on-earth-account-v1', JSON.stringify({
    _v: 1, accountId: 'test-acct', sessionToken: 'test-token', expiresAt: Date.now() + 86400000,
    displayName: 'Sean', emailHint: '', deviceId: 'dev_test', lastSyncAt: 0, merged: true,
  }));
});
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'api.where-on.earth') {
    const p = url.pathname;
    let body = {};
    if (p === '/v1/daily/guesses') {
      body = { stored: { guess: { lat: 28.61, lng: 77.2 } }, friends: [{ friendId: 'f1', displayName: 'Gabe', guess: { lat: 31.55, lng: 74.34 } }] };
    } else if (p === '/v1/friends') {
      body = { friends: [{ friendId: 'f1', displayName: 'Gabe' }], me: { displayName: 'Sean', sharePins: true } };
    } else if (p === '/v1/daily/friends') {
      body = { date: url.searchParams.get('date'), locations: {} };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.goto('https://game.local/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));
await page.click('#play-button');
await new Promise((r) => setTimeout(r, 2500));
// Drop a pin at the centre of the globe view, then lock in.
await page.mouse.click(195, 380);
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.__travelAnim = false; });
await page.click('#lock-button');
await new Promise((r) => setTimeout(r, 9000));
await page.screenshot({ path: `${OUT}friendpin-reveal.png` });
// Back out to home: the friend pin must be gone there.
await page.evaluate(() => { location.hash = ''; });
await page.keyboard.press('Escape').catch(() => {});
console.log('reveal captured');
await browser.close();
