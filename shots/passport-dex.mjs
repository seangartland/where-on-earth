// Passport pack-dex capture harness. The sandbox cannot launch Chromium.
// Run from the repository root: node shots/passport-dex.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { PACK_CAPITAL_IDS } from '../src/meta/pack-capitals.js';
import { PACK_LANDFORM_IDS } from '../src/meta/pack-landforms.js';

const ROOT = '/home/hatch/workspace/map-game/demo/';
const OUT = `${ROOT}shots/passport-dex/`;
const cities = JSON.parse(fs.readFileSync(`${ROOT}assets/locations.json`, 'utf8'));
const landmarks = JSON.parse(fs.readFileSync(`${ROOT}assets/locations-landmarks-sol.json`, 'utf8'));
const capitals = cities.filter((item) => PACK_CAPITAL_IDS.has(item.id));
const landmarkPool = landmarks.filter((item) => !PACK_LANDFORM_IDS.has(item.id));
const dailyOnly = cities.filter((item) => !PACK_CAPITAL_IDS.has(item.id));
const seedIds = [...capitals.slice(0, 5), ...landmarkPool.slice(0, 4), ...dailyOnly.slice(0, 2)].map((item) => item.id);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'cdn.jsdelivr.net') {
    const cached = `/home/hatch/workspace/map-game/shots/cdn/${url.pathname.split('/').pop()}`;
    return fs.existsSync(cached) ? route.fulfill({ body: fs.readFileSync(cached), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }) : route.abort();
  }
  if (url.hostname.includes('wikimedia') || url.hostname.includes('wikipedia')) return route.abort();
  if (url.hostname !== 'game.local') return route.abort();
  const path = url.pathname.replace(/^\//, '') || 'index.html';
  try { return route.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.addInitScript((ids) => {
  const visits = {}; const meta = {}; const order = [];
  ids.forEach((id, index) => {
    visits[id] = 900 - index * 20;
    meta[id] = { b: visits[id], d: 30 + index, e: 1, t: Date.now() - index * 1000 };
    order.push(id);
  });
  localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ v: 2, visits, meta, order }));
}, seedIds);
await page.goto('https://game.local/index.html?home=recs');
await page.waitForFunction(() => !document.querySelector('.passport')?.hidden && !document.getElementById('pack-button')?.disabled, null, { timeout: 45000 });
await page.click('.passport');
await page.waitForSelector('.pp-pack-section');
await page.screenshot({ path: `${OUT}01-passport-sections.png` });

await page.click('[data-pack="capitals"] .pp-pack-head');
await page.locator('[data-pack="capitals"] .pp-pack-grid').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}02-capitals-expanded.png` });

const unvisited = page.locator('[data-pack="capitals"] .pp-unvisited').first();
await unvisited.click();
await unvisited.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}03-unvisited-capital.png` });
await browser.close();
