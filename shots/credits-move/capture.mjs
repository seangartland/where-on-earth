// Credits-move verification: home shows the new "Credits" link; a globe round
// with satellite imagery up shows NO .sat-credit footer element anywhere.
// Fake-origin pattern copied from shots/tile-round2/capture.mjs.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const TILE = `${ROOT}docs/satellite-review-tiles/alps-z6-eox2017.jpg`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const domainsFile = '/tmp/credits-move-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.addInitScript(() => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
      const original = C?.prototype[name];
      if (original) C.prototype[name] = function (...args) { if (!window.__skipGL) return original.apply(this, args); };
    }
  }
});

await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'tiles.where-on.earth' && url.pathname.includes('/tiles/')) {
    await new Promise((resolve) => setTimeout(resolve, 180));
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
await page.goto('https://game.local/index.html?reset=daily', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__sat?.inset && !document.getElementById('play-button')?.disabled, null, { timeout: 120000 });
// The boot overlay fades after the play button enables; wait until it is
// actually gone or the home screenshot shows the loading screen instead.
await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, null, { timeout: 120000 });
await page.waitForTimeout(800);

const cdp = await context.newCDPSession(page);
const shot = async (name) => {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'));
};

// --- Home: Credits link visible, no .sat-credit element ---
const home = await page.evaluate(() => {
  const link = document.querySelector('.home-credits a');
  const rect = link?.getBoundingClientRect();
  return {
    linkText: link?.textContent ?? null,
    linkHref: link?.getAttribute('href') ?? null,
    linkVisible: !!link && rect.width > 0 && rect.height > 0
      && rect.top >= 0 && rect.bottom <= window.innerHeight
      && document.getElementById('boot')?.hidden === true,
    startScreenVisible: !document.getElementById('start-screen').hidden,
    satCreditCount: document.querySelectorAll('.sat-credit').length,
  };
});
await shot('01-home.png');

// --- Round: satellite up (mix > 0), still no .sat-credit element ---
await page.click('#play-button');
await page.waitForFunction(() => window.__game?.state.mode === 'guess', null, { timeout: 60000 });
await page.waitForFunction(() => (window.__sat?.mix ?? 0) > 0.5, null, { timeout: 120000 });
const round = await page.evaluate(() => ({
  mode: window.__game?.state.mode,
  roundScreenVisible: !document.getElementById('round-screen').hidden,
  startScreenHidden: document.getElementById('start-screen').hidden,
  satMix: window.__sat?.mix ?? null,
  provider: window.__sat?.provider ?? null,
  satCreditCount: document.querySelectorAll('.sat-credit').length,
  bodyTextHasEOXLine: document.body.innerText.includes('EOX IT Services GmbH'),
}));
await shot('02-round.png');
await page.evaluate(() => { window.__skipGL = true; });

const result = { home, round, errors };
fs.writeFileSync(`${OUT}capture.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
const ok = home.linkVisible && home.linkHref === './credits.html'
  && home.satCreditCount === 0 && round.satCreditCount === 0
  && round.mode === 'guess' && !round.bodyTextHasEOXLine && !errors.length;
if (!ok) process.exit(1);
