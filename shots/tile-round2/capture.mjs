import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const TILE = `${ROOT}docs/satellite-review-tiles/alps-z6-eox2017.jpg`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const domainsFile = '/tmp/tile-round2-webgl-domains.txt';
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
  window.__tileFetchLog = [];
  window.__tileRound2Log = (entry) => window.__tileFetchLog.push({ ...entry, at: Math.round(performance.now()) });
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
await page.waitForFunction(() => window.__sat?.inset && !document.getElementById('play-button')?.disabled, null, { timeout: 90000 });
await page.click('#play-button');
await page.waitForFunction(() => window.__game?.state.mode === 'guess');
// The detail inset builds only once the player zooms (orchestrator fix to the
// lane harness: the original waited for inset.ready before any zoom, which
// can never happen; ready timeout raised for SwiftShader on a 2-core VM).
await page.mouse.move(195, 430);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -600); await page.waitForTimeout(700); }
await page.waitForFunction(() => window.__sat.inset.ready && window.__sat.inset.inflight === 0, null, { timeout: 300000 });

const cdp = await context.newCDPSession(page);
const shot = async (name) => {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'));
};
await shot('01-settled.png');

await page.evaluate(() => { window.__tileFetchLog.push({ event: 'phase', name: 'fast-pan', at: Math.round(performance.now()) }); });
await page.mouse.move(80, 430);
await page.mouse.down();
for (let x = 100; x <= 360; x += 20) await page.mouse.move(x, 430);
await page.mouse.up();
await page.waitForTimeout(900);
await shot('02-after-fast-pan.png');

await page.evaluate(() => { window.__tileFetchLog.push({ event: 'phase', name: 'zoom-in', at: Math.round(performance.now()) }); });
await page.mouse.move(230, 420);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(1200);
await shot('03-after-zoom.png');
await page.evaluate(() => { window.__skipGL = true; });

const result = await page.evaluate(() => {
  const log = window.__tileFetchLog;
  const starts = log.filter((entry) => entry.event === 'start');
  const aborts = log.filter((entry) => entry.event === 'abort');
  return {
    inset: window.__sat.inset,
    counts: {
      starts: starts.length,
      offViewStarts: starts.filter((entry) => !entry.wanted && !entry.prefetch).length,
      neededStarts: starts.filter((entry) => entry.wanted).length,
      prefetchStarts: starts.filter((entry) => entry.prefetch).length,
      aborts: aborts.length,
      prefetchAborts: aborts.filter((entry) => entry.prefetch).length,
    },
    log,
  };
});
result.errors = errors;
fs.writeFileSync(`${OUT}capture.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.counts));
await browser.close();
if (errors.length || result.counts.offViewStarts) process.exit(1);
