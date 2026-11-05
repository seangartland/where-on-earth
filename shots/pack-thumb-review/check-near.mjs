// Focused check for the closest-guess headline on the postcard back
// (tier treatment build, 2026-11-03). Same seeding and routing as capture.mjs,
// one card (Apia, pinpoint), patient waits, DOM proof plus a screenshot.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PACK_CAPITAL_IDS } from '../../src/meta/pack-capitals.js';

const ROOT = '/home/hatch/workspace/map-game/demo/';
const OUT = `${ROOT}shots/pack-thumb-review/`;
const CACHE = `${OUT}.img-cache/`;
const cities = JSON.parse(fs.readFileSync(`${ROOT}assets/locations.json`, 'utf8'));
const capitals = cities.filter((item) => PACK_CAPITAL_IDS.has(item.id) && item.image);
const PLAN = [
  ['seen', 0, 420], ['near', 1, 87], ['bullseye', 2, 12], ['pinpoint', 3, 2.4],
  ['seen', 0, 1260], ['near', 1, 141], ['bullseye', 2, 21], ['pinpoint', 3, 0.6],
];
const seeds = PLAN.map(([state, e, d], i) => ({ id: capitals[i * 3].id, short: capitals[i * 3].short, state, e, d }));

const domainsFile = `${CACHE}webgl-domains.txt`;
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'cdn.jsdelivr.net') {
    const cached = `/home/hatch/workspace/map-game/shots/cdn/${url.pathname.split('/').pop()}`;
    return fs.existsSync(cached) ? route.fulfill({ body: fs.readFileSync(cached), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }) : route.abort();
  }
  if (url.hostname.includes('wikimedia')) {
    const file = CACHE + crypto.createHash('sha1').update(url.href).digest('hex');
    try {
      if (!fs.existsSync(file)) execFileSync('curl', ['-sfL', '--max-time', '20', '-A', 'Mozilla/5.0', '-o', file, url.href.replace('thumb.wikimedia.org', 'upload.wikimedia.org')]);
      return route.fulfill({ body: fs.readFileSync(file), contentType: 'image/jpeg' });
    } catch { return route.abort(); }
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = url.pathname.replace(/^\//, '') || 'index.html';
  try { return route.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.addInitScript((list) => {
  const visits = {}; const meta = {}; const order = [];
  const day = 86400000; const now = Date.now();
  list.forEach(({ id, e, d }, i) => {
    visits[id] = 900 - i * 20;
    const m = { b: visits[id], d, f: '2026-10-1' + (i % 9), t: now - i * 1000 };
    if (e) { m.e = e; m.ea = now - 9 * day; m.eb1 = now - 9 * day; }
    if (e >= 2) m.eb2 = now - 4 * day;
    if (e >= 3) m.eb3 = now - day;
    meta[id] = m;
    order.push(id);
  });
  localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ v: 2, visits, meta, order }));
}, seeds);
await page.goto('https://game.local/index.html?home=recs');
await page.waitForFunction(() => !document.querySelector('.passport')?.hidden && !document.getElementById('pack-button')?.disabled, null, { timeout: 45000 });
await page.click('.passport');
await page.waitForSelector('.pp-pack-section');
await page.click('[data-pack="capitals"] .pp-pack-head');
await page.waitForTimeout(800);
const slot = page.locator('[data-pack="capitals"] .pp-slot', { has: page.locator('.pp-slot-name', { hasText: 'Addis Ababa' }) }).first();
await slot.scrollIntoViewIfNeeded();
await slot.click();
await page.waitForSelector('.ppd:not([hidden])');
await page.waitForTimeout(4500);
await page.click('[data-ppd="flip"]');
await page.waitForTimeout(4500);
const proof = await page.evaluate(() => {
  const stats = document.querySelector('[data-ppd="stats"]');
  const num = stats.querySelector('.ppd-closest-num');
  const hist = document.querySelector('[data-ppd="history"]');
  const card = document.querySelector('[data-ppd="card"]');
  return {
    statsText: stats.textContent.replace(/\s+/g, ' ').trim(),
    statsTier: stats.dataset.tier || null,
    numFont: num ? getComputedStyle(num).fontSize : null,
    numColor: num ? getComputedStyle(num).color : null,
    historyFits: hist.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1,
    flipped: document.querySelector('[data-ppd="flip"]').classList.contains('is-flipped'),
  };
});
console.log(JSON.stringify(proof, null, 2));
await page.screenshot({ path: `${OUT}06-near-back-check.png` });
await browser.close();
