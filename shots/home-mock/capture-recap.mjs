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
await page.evaluate(() => { window.__travelAnim = false; });
await page.waitForSelector("#play-button", { state: "visible", timeout: 30000 }); await page.click("#play-button");
for (let round = 0; round < 5; round++) {
  await new Promise((r) => setTimeout(r, 2200));
  await page.mouse.click(195, 380);
  await new Promise((r) => setTimeout(r, 700));
  await page.waitForSelector('#lock-button:not([hidden])', { timeout: 20000 });
  await page.click('#lock-button');
  await page.waitForSelector('#next-button', { state: 'visible', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  console.log('round', round, 'locked');
  await page.click('#next-button');
}
await new Promise((r) => setTimeout(r, 3000));
await new Promise((r) => setTimeout(r, 2000));
const dbg = await page.evaluate(() => [...document.querySelectorAll('section.screen, .screen')].filter((el) => !el.hidden && getComputedStyle(el).display !== 'none').map((el) => el.id || el.className));
console.log('visible screens:', JSON.stringify(dbg));
await page.screenshot({ path: `${OUT}recap-debug.png` });
await page.evaluate(() => document.querySelector('.results-globe')?.click());
await new Promise((r) => setTimeout(r, 3500));
const measure = await page.evaluate(() => {
  const card = document.querySelector('.recap-card');
  const r = card.getBoundingClientRect();
  return {
    cardH: Math.round(r.height),
    hasPagerDots: !!card.querySelector('.pager-dots'),
    scoreText: card.querySelector('.score-line')?.textContent.replace(/\s+/g, ' ').trim(),
    prevDisabled: card.querySelector('[data-act="prev"]')?.disabled,
    prevVisible: (() => { const b = card.querySelector('[data-act="prev"]'); return b ? getComputedStyle(b).display !== 'none' : null; })(),
    nextVisible: (() => { const b = card.querySelector('[data-act="next"]'); return b ? getComputedStyle(b).display !== 'none' : null; })(),
  };
});
console.log(JSON.stringify(measure));
await page.screenshot({ path: `${OUT}recap-band-1.png` });
await page.click('.recap-card [data-act="next"]');
await new Promise((r) => setTimeout(r, 2500));
const nav2 = await page.evaluate(() => {
  const card = document.querySelector('.recap-card');
  const vis = (sel) => { const b = card.querySelector(sel); return b ? getComputedStyle(b).display !== 'none' : null; };
  return { tag: card.querySelector('.recap-tag')?.textContent, prevVisible: vis('[data-act="prev"]'), nextVisible: vis('[data-act="next"]'), cardH: Math.round(card.getBoundingClientRect().height) };
});
console.log(JSON.stringify(nav2));
await page.screenshot({ path: `${OUT}recap-band-2.png` });
await page.click('.recap-card .recap-expand');
await new Promise((r) => setTimeout(r, 900));
const exp = await page.evaluate(() => {
  const card = document.querySelector('.recap-card');
  const fact = card.querySelector('.recap-fact');
  return { expanded: card.classList.contains('expanded'), cardH: Math.round(card.getBoundingClientRect().height),
    factLines: Math.round(fact.getBoundingClientRect().height / (15 * 1.45)), aria: card.querySelector('.recap-expand')?.getAttribute('aria-expanded') };
});
console.log('expanded:', JSON.stringify(exp));
await page.screenshot({ path: `${OUT}recap-band-3-expanded.png` });
await page.click('.recap-card .recap-expand');
await new Promise((r) => setTimeout(r, 900));
const col = await page.evaluate(() => ({ expanded: document.querySelector('.recap-card').classList.contains('expanded'), cardH: Math.round(document.querySelector('.recap-card').getBoundingClientRect().height) }));
console.log('collapsed again:', JSON.stringify(col));
await browser.close();
