import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/pack-one-open`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.addInitScript(() => {
  localStorage.setItem('where-on-earth-pack-v1', JSON.stringify({
    _v: 1,
    skips: 12,
    stamina: { stored: 1, nextAt: Date.now() + 3_600_000 },
    byType: {
      capitals: { ids: ['kabul-afghanistan', 'tirana-albania', 'algiers-algeria'], results: [null, null, null], torn: true },
      landmarks: null,
      landforms: null,
    },
  }));
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
      const original = C?.prototype[name];
      if (original) C.prototype[name] = function (...args) { if (!window.__skipGL) return original.apply(this, args); };
    }
  }
});
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'game.local') return route.abort();
  const path = url.pathname.replace(/^\//, '') || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try {
    return route.fulfill({ body: fs.readFileSync(`${ROOT}/${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForFunction(() => !document.getElementById('pack-button')?.disabled, null, { timeout: 90_000 });
await page.click('#pack-button');
await page.evaluate(() => { window.__skipGL = true; });
await page.waitForSelector('.pack-choice:disabled');
await page.screenshot({ path: `${OUT}/select-one-open.png` });
console.log(JSON.stringify({ viewport: await page.viewportSize(), errors }, null, 2));
await browser.close();
