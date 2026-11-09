import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = '/home/hatch/workspace/map-game/shots/home-mock/';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = `${OUT}.webgl-domains.txt`;
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const TINY_JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwEf/9k=', 'base64');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  localStorage.setItem('where-on-earth-account-v1', JSON.stringify({
    _v: 1, accountId: 'test-acct', sessionToken: 'test-token', expiresAt: Date.now() + 86400000,
    displayName: 'Sean', emailHint: '', deviceId: 'dev_test', lastSyncAt: 0, merged: true,
  }));
});
const seenIds = new Set();
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'api.where-on.earth') {
    const p = url.pathname;
    let body = {};
    if (p === '/v1/daily/guesses') {
      try { seenIds.add(JSON.parse(route.request().postData() || '{}').locationId); } catch { /* ignore */ }
      body = { stored: { guess: { lat: 28.61, lng: 77.2 } }, friends: [{ friendId: 'f1', displayName: 'Gabe', guess: { lat: 31.55, lng: 74.34 } }] };
    } else if (p === '/v1/friends') {
      body = { friends: [{ friendId: 'f1', displayName: 'Gabe' }], me: { displayName: 'Sean', sharePins: true } };
    } else if (p === '/v1/daily/friends') {
      const locations = {};
      for (const id of seenIds) if (id) locations[id] = { friends: [{ friendId: 'f1', displayName: 'Gabe', guess: { lat: 31.55, lng: 74.34 } }] };
      body = { date: url.searchParams.get('date'), locations };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  if (url.hostname.endsWith('wikimedia.org')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_JPEG });
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGEERROR', (e.stack || String(e)).slice(0, 900)));
await page.goto('https://game.local/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));
// The sim clock is frame-clamped (dt <= 1/20s), so the animated flight takes
// minutes of wall time under swiftshader; the instant path exercises the same
// reveal code minus the flight itself.
await page.evaluate(() => { window.__travelAnim = false; });
await page.waitForSelector("#play-button", { state: "visible", timeout: 30000 }); await page.click("#play-button");
await new Promise((r) => setTimeout(r, 2200));
await page.mouse.click(195, 380);
await new Promise((r) => setTimeout(r, 700));
await page.waitForSelector('#lock-button:not([hidden])', { timeout: 20000 });
await page.click('#lock-button');
await page.waitForSelector('#next-button', { state: 'visible', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));
const reveal = await page.evaluate(() => {
  const sheet = document.querySelector('#reveal-card');
  const band = sheet.querySelector('.reveal-band');
  const strip = sheet.querySelector('.friends-strip');
  const board = sheet.querySelector('.friends-board');
  return {
    bandH: Math.round(band.getBoundingClientRect().height),
    bandTag: sheet.querySelector('#reveal-band-tag')?.textContent,
    name: sheet.querySelector('#peek-name')?.textContent,
    score: sheet.querySelector('#round-score')?.textContent,
    scoreMath: !!sheet.querySelector('.score-math'),
    postcardVisible: !!document.querySelector('.postcard:not([hidden])'),
    earnToast: !!document.querySelector('.earn-toast'),
    stripChips: [...(strip?.querySelectorAll('.friend-chip') || [])].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
    boardRowsBefore: board ? [...board.querySelectorAll('.friend-board-row')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) : null,
  };
});
console.log('reveal collapsed:', JSON.stringify(reveal));
await page.screenshot({ path: `${OUT}reveal-collapsed.png` });
await browser.close();
