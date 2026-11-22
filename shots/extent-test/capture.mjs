// Extent test mode captures: home panel (param on), one round, its reveal.
// Fake-origin pattern copied from shots/credits-move/capture.mjs.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const TILE = `${ROOT}docs/satellite-review-tiles/alps-z6-eox2017.jpg`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const domainsFile = '/tmp/extent-test-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.addInitScript(() => { window.__travelAnim = false; });
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'tiles.where-on.earth' && url.pathname.includes('/tiles/')) {
    return route.fulfill({ body: fs.readFileSync(TILE), contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  if (url.hostname !== 'game.local') return route.abort();
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
const cdp = await context.newCDPSession(page);
const shot = async (name) => {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'));
};

// Plain home first: no extent panel without the param.
await page.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, null, { timeout: 120000 });
const plain = await page.evaluate(() => ({
  entryHidden: document.getElementById('extent-test-entry').hidden,
}));

// Param home: panel visible with runtime count.
await page.goto('https://game.local/index.html?extents=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, null, { timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('extent-test-entry').hidden, null, { timeout: 60000 });
await page.waitForTimeout(800);
const home = await page.evaluate(() => ({
  entryHidden: document.getElementById('extent-test-entry').hidden,
  entryDisabled: document.getElementById('extent-test-entry').disabled,
  count: document.getElementById('extent-test-count').textContent,
  name: document.querySelector('#extent-test-entry .mode-name').textContent,
}));
await shot('01-home-panel.png');

// Start a round.
await page.click('#extent-test-entry');
await page.waitForFunction(() => window.__game?.state.mode === 'guess', null, { timeout: 60000 });
await page.waitForTimeout(1500);
const round = await page.evaluate(() => ({
  mode: window.__game?.state.mode,
  item: window.__game?.state.item,
  number: document.getElementById('round-number').textContent,
  clue: document.getElementById('clue').textContent,
  quitHidden: document.getElementById('extent-test-quit').hidden,
}));
await shot('02-round.png');

// Guess near the answer (coords read from the bank in-page) and reveal.
const guess = await page.evaluate(async () => {
  const bank = await (await fetch('assets/locations-bank.json')).json();
  const item = bank.find((x) => x.id === window.__game.state.item);
  return { lat: item.lat + 1.5, lng: item.lng + 1.5, id: item.id };
});
await page.evaluate(({ lat, lng }) => window.__game.guess(lat, lng), guess);
await page.waitForFunction(() => window.__game?.state.mode === 'reveal', null, { timeout: 60000 });
await page.waitForTimeout(15000);
const reveal = await page.evaluate(() => ({
  mode: window.__game?.state.mode,
  item: window.__game?.state.item,
  distance: document.getElementById('distance').textContent,
  score: document.getElementById('round-score').textContent,
  revealName: document.getElementById('reveal-name').textContent,
  revealCardHidden: document.getElementById('reveal-card').hidden,
  body: document.body.className,
}));
await shot('03-reveal.png');

const result = { plain, home, round, guess, reveal, errors };
fs.writeFileSync(`${OUT}capture.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
const ok = plain.entryHidden && !home.entryHidden && !home.entryDisabled
  && round.mode === 'guess' && !round.quitHidden && reveal.mode === 'reveal' && !errors.length;
if (!ok) process.exit(1);
