// Passport dex numbering: capture the pack dex with a seeded partial
// collection, BEFORE (base tree) and AFTER (numbered empty slots).
// Usage: node shots/dex-numbering/capture.mjs <before|after>
// Fake-origin pattern copied from shots/pack-size/capture.mjs.
// Seed: World Capitals visited at pool positions 001 (Abu Dhabi), 003
// (Accra), 008 (Amsterdam); Landmarks at 003 (Acropolis), 010 (Angkor Wat);
// Landforms untouched. Visited slots render as postcards, the rest are the
// unvisited slots under test, interleaved in pool order.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const label = process.argv[2] || 'after';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const TILE = `${ROOT}docs/satellite-review-tiles/alps-z6-eox2017.jpg`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const domainsFile = '/tmp/dexnum-webgl-domains.txt';
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
  const visitedIds = ['abu-dhabi-ae', 'accra', 'amsterdam-netherlands', 'acropolis-athens-gr', 'angkor-wat'];
  const visits = {};
  const meta = {};
  for (const id of visitedIds) {
    visits[id] = 900;
    meta[id] = { e: 2, d: 14.2, b: 900, f: '2026-10-01', t: Date.now() };
  }
  localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ v: 1, visits, order: visitedIds, meta }));
});

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'game.local') {
    // Photos and tiles: stand in the local review tile so visited postcards
    // render with an image; everything else external is aborted.
    if (/\.(jpe?g|png|webp)$/i.test(url.pathname) || url.hostname === 'tiles.where-on.earth') {
      return route.fulfill({ body: fs.readFileSync(TILE), contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.abort();
  }
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try {
    return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch {
    return route.fulfill({ status: 404, body: 'not found' });
  }
});

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('https://game.local/index.html?home=recs', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('.passport', { timeout: 90000 });
await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, null, { timeout: 120000 });
await page.evaluate(() => { window.__skipGL = true; });

const cdp = await context.newCDPSession(page);
const shot = async (name) => {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'));
};

await page.click('.passport');
await page.waitForSelector('.pp-pack-head', { state: 'attached', timeout: 90000 });
await page.waitForTimeout(800);

// Open World Capitals (first section) and capture.
await page.click('.pp-pack-section[data-pack="capitals"] .pp-pack-head');
await page.waitForTimeout(900);
await shot(`${label}-01-capitals.png`);

const dump = await page.evaluate(() => {
  const read = (pack) => [...document.querySelectorAll(`.pp-pack-section[data-pack="${pack}"] .pp-slot`)].slice(0, 10)
    .map((li) => ({ text: li.textContent.replace(/\s+/g, ' ').trim(), aria: li.getAttribute('aria-label') }));
  return { capitals: read('capitals'), landmarks: read('landmarks') };
});

// Open Landmarks too, scroll it into view, capture.
await page.click('.pp-pack-section[data-pack="landmarks"] .pp-pack-head');
await page.waitForTimeout(900);
await page.evaluate(() => {
  document.querySelector('.pp-pack-section[data-pack="landmarks"]')?.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(500);
await shot(`${label}-02-landmarks.png`);

fs.writeFileSync(`${OUT}${label}.json`, JSON.stringify({ viewport: '390x844', errors, dump }, null, 2));
console.log(JSON.stringify({ label, errors, capitalsFirst3: dump.capitals.slice(0, 3) }, null, 2));
await browser.close();
