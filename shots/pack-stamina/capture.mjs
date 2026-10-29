import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/pack-stamina`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });
const domainsFile = '/tmp/pack-stamina-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');

const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});

async function openPage(seed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.addInitScript((value) => {
    if (value) localStorage.setItem('where-on-earth-pack-v1', JSON.stringify(value));
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
        const original = C?.prototype[name];
        if (original) C.prototype[name] = function (...args) { if (!window.__skipGL) return original.apply(this, args); };
      }
    }
  }, seed);
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
  await page.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById('pack-button')?.disabled, null, { timeout: 90000 });
  await page.click('#pack-button');
  await page.evaluate(() => { window.__skipGL = true; });
  await page.waitForTimeout(500);
  const cdp = await context.newCDPSession(page);
  const shot = async (name) => {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}/${name}`, Buffer.from(result.data, 'base64'));
  };
  return { context, page, errors, shot };
}

const blankTypes = () => ({ capitals: null, landmarks: null, landforms: null });
const report = { errors: [], geometry: {} };

{
  const run = await openPage(null);
  await run.shot('a-select-full.png');
  report.errors.push(...run.errors);
  await run.context.close();
}
{
  const run = await openPage({ _v: 1, stamina: { stored: 0, nextAt: Date.now() + 3_600_000 }, byType: blankTypes() });
  await run.shot('b-select-countdown.png');
  report.errors.push(...run.errors);
  await run.context.close();
}
for (const [type, name] of [['landmarks', 'c-landmarks-sealed.png'], ['landforms', 'd-landforms-sealed.png']]) {
  const run = await openPage(null);
  await run.page.getByRole('button', { name: new RegExp(type, 'i') }).click();
  await run.page.waitForSelector('.pack-sealed:not([hidden])');
  report.geometry[type] = await run.page.locator('.pack-sealed').evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  await run.shot(name);
  report.errors.push(...run.errors);
  await run.context.close();
}
{
  const ids = ['kabul-afghanistan', 'tirana-albania', 'algiers-algeria'];
  const byType = blankTypes();
  byType.capitals = { ids, results: [null, null, null], torn: true };
  const run = await openPage({ _v: 1, stamina: { stored: 0, nextAt: Date.now() + 3_600_000 }, byType });
  await run.shot('e-select-capitals-progress.png');
  report.errors.push(...run.errors);
  await run.context.close();
}
{
  const run = await openPage({ _v: 1, skips: 12, stamina: { stored: 0, nextAt: Date.now() + 4.25 * 3_600_000 }, byType: blankTypes() });
  await run.shot('f-select-skip-actions.png');
  report.errors.push(...run.errors);
  await run.context.close();
}
{
  const run = await openPage({ _v: 1, skips: 12, stamina: { stored: 0, nextAt: Date.now() + 4.25 * 3_600_000 }, byType: blankTypes() });
  await run.page.getByRole('button', { name: /Open a pack now/ }).click();
  await run.shot('g-select-after-open-now.png');
  report.errors.push(...run.errors);
  await run.context.close();
}
{
  const ids = ['kabul-afghanistan', 'tirana-albania', 'algiers-algeria'];
  const byType = blankTypes();
  byType.capitals = {
    ids,
    torn: true,
    results: ids.map((id, index) => ({
      name: id,
      distance: 120 + index * 80,
      postcard: { kind: index ? 'repeat' : 'new', tier: index ? undefined : 1 },
    })),
  };
  const run = await openPage({ _v: 1, stamina: { stored: 0, nextAt: Date.now() + 3_600_000 }, byType });
  await run.page.getByRole('button', { name: /World Capitals/i }).click();
  await run.page.waitForSelector('.pack-actions:not([hidden])');
  report.geometry.doneActions = await run.page.locator('.pack-actions').evaluate((node) => {
    const buttons = [...node.querySelectorAll('button')].map((button) => {
      const r = button.getBoundingClientRect();
      return { label: button.textContent.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    const menu = document.querySelector('#pack-screen .home-nav-btn').getBoundingClientRect();
    return { buttons, menu: { left: menu.left, right: menu.right, top: menu.top, bottom: menu.bottom } };
  });
  await run.shot('h-capitals-done-actions-390x844.png');
  report.errors.push(...run.errors);
  await run.context.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
