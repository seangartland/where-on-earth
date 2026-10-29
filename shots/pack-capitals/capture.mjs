import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/pack-capitals`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function openPage(height = 844) {
  const context = await browser.newContext({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
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
    if (url.hostname === 'game.local') {
      const path = url.pathname.replace(/^\//, '') || 'index.html';
      if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
      try {
        return route.fulfill({
          body: fs.readFileSync(`${ROOT}/${path}`),
          contentType: MIME[path.split('.').pop()] || 'application/octet-stream',
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      } catch {
        return route.fulfill({ status: 404, body: 'not found' });
      }
    }
    return route.abort();
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const button = document.getElementById('pack-button');
    return button && !button.disabled;
  }, null, { timeout: 90000 });
  await page.click('#pack-button');
  await page.waitForSelector('.pack-sealed:not([hidden])');
  await page.evaluate(() => { window.__skipGL = true; });
  await page.waitForTimeout(600);
  const cdp = await context.newCDPSession(page);
  const shot = async (name) => {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}/${name}`, Buffer.from(result.data, 'base64'));
  };
  return { context, page, errors, shot };
}

const report = { errors: [] };
{
  const run = await openPage();
  const { page, context, shot, errors } = run;
  report.fit844 = await page.evaluate(() => {
    const pack = document.querySelector('.pack-sealed').getBoundingClientRect();
    const panel = document.querySelector('.pack-panel').getBoundingClientRect();
    return { pack: { x: pack.x, y: pack.y, width: pack.width, height: pack.height, bottom: pack.bottom }, panel: { top: panel.top, bottom: panel.bottom }, scrollHeight: document.querySelector('.pack-screen').scrollHeight, innerHeight };
  });
  report.ids = await page.evaluate(() => JSON.parse(localStorage.getItem('where-on-earth-pack-v1')).packs[0].ids);
  await shot('a-sealed-390x844.png');
  const rect = await page.locator('.pack-sealed').boundingBox();
  const lineY = rect.y + rect.height * 0.086;
  await page.mouse.move(rect.x - 10, lineY);
  await page.mouse.down();
  for (let i = 1; i <= 18; i++) await page.mouse.move(rect.x - 10 + rect.width * 0.55 * i / 18, lineY);
  await shot('c-mid-trace.png');
  for (let i = 1; i <= 18; i++) await page.mouse.move(rect.x + rect.width * 0.5 + rect.width * 0.52 * i / 18, lineY);
  await page.waitForTimeout(190);
  await shot('d-seal-strip-mid-flight.png');
  await page.waitForTimeout(720);
  await shot('e-postcards-mid-emergence-turned.png');
  await page.waitForTimeout(700);
  await shot('f-postcards-settled.png');
  await page.mouse.up();
  await page.click('.pack-slots.is-stack > .pack-slot:last-child');
  await page.waitForTimeout(430);
  await shot('g-top-card-flipped-clue.png');
  report.errors.push(...errors);
  await context.close();
}
{
  const run = await openPage(700);
  const { page, context, shot, errors } = run;
  report.fit700 = await page.evaluate(() => {
    const pack = document.querySelector('.pack-sealed').getBoundingClientRect();
    const panel = document.querySelector('.pack-panel').getBoundingClientRect();
    return { pack: { x: pack.x, y: pack.y, width: pack.width, height: pack.height, bottom: pack.bottom }, panel: { top: panel.top, bottom: panel.bottom }, scrollHeight: document.querySelector('.pack-screen').scrollHeight, innerHeight };
  });
  await shot('b-sealed-390x700.png');
  report.errors.push(...errors);
  await context.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
