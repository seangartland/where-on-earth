// Phone-width smoke capture for one real extent reveal on the local build.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const MIME = { html: 'text/html', js: 'text/javascript', json: 'application/json', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: [
  '--hatch-webgl-allowed-domains-file=/home/hatch/workspace/map-game/demo/.build-tmp/webgl-policy.txt',
  '--hatch-webgl-allowed-domains-sha256=dde4cfa7edfd98ff0ce4922757aa41141e7124f71c90c44b9ce4d1f2fab3baa5',
  '--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(() => { window.__travelAnim = false; });
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  try { return route.fulfill({ body: readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('https://game.local/index.html?extent=grand-canyon', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.state.item === 'grand-canyon');
await page.evaluate(() => window.__game.guess(36.3, -112.7));
await page.waitForFunction(() => window.__game.state.mode === 'reveal');
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + 'grand-canyon-390x844.png' });
const result = await page.evaluate(() => ({
  viewport: [innerWidth, innerHeight],
  distance: document.getElementById('distance').textContent,
  reveal: document.getElementById('reveal-name').textContent,
  body: document.body.className,
}));
result.errors = errors;
writeFileSync(OUT + 'capture.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
await browser.close();
if (errors.length || result.viewport[0] !== 390 || result.viewport[1] !== 844 || !result.distance.includes('nearest point')) process.exit(1);
