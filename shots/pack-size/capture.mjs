// Pack select screen layout: measure the content block against the viewport
// and capture the select screen + the single-pack tear stage.
// Usage: node shots/pack-size/capture.mjs <before|after>
// Fake-origin pattern copied from shots/credits-move/capture.mjs.
// Seeded pack state mirrors Sean's phone: 1 pack banked, 15 skip tokens,
// next pack in 12h (so "Open a pack now (12)" shows), Landforms Complete.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const label = process.argv[2] || 'before';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const TILE = `${ROOT}docs/satellite-review-tiles/alps-z6-eox2017.jpg`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const domainsFile = '/tmp/pack-size-webgl-domains.txt';
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
  const result = { base: 900, postcard: { kind: 'new' } };
  const record = {
    skips: 15,
    skipCredit: 0,
    stamina: { stored: 1, nextAt: Date.now() + 12 * 60 * 60 * 1000 },
    byType: {
      capitals: null,
      landmarks: null,
      landforms: { ids: ['seed-a', 'seed-b', 'seed-c'], results: [result, result, result], torn: true },
    },
  };
  localStorage.setItem('where-on-earth-pack-v1', JSON.stringify(record));
});

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
await page.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__sat?.inset && !document.getElementById('play-button')?.disabled, null, { timeout: 120000 });
await page.waitForFunction(() => document.getElementById('boot')?.hidden === true, null, { timeout: 120000 });

const cdp = await context.newCDPSession(page);
const shot = async (name) => {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}`, Buffer.from(result.data, 'base64'));
};

// --- Pack select screen ---
await page.click('#pack-button');
await page.waitForFunction(() => {
  const screen = document.getElementById('pack-screen');
  const imgs = [...document.querySelectorAll('.pack-choice img')];
  return screen && !screen.hidden && imgs.length === 3 && imgs.every((img) => img.complete && img.naturalWidth > 0);
}, null, { timeout: 60000 });
await page.waitForTimeout(600);

const select = await page.evaluate(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  };
  const screen = document.getElementById('pack-screen');
  const panel = screen.querySelector('.pack-panel');
  const heading = document.getElementById('pack-heading');
  const selectBox = screen.querySelector('.pack-select');
  const choices = screen.querySelector('.pack-choices');
  // The visible content block: heading through the pack row.
  const top = Math.min(rect(heading).y, rect(selectBox).y);
  const bottom = Math.max(rect(heading).bottom, rect(selectBox).bottom);
  const block = { top, bottom, height: bottom - top, cy: (top + bottom) / 2 };
  const children = [...panel.children].map((el) => ({
    cls: el.className, hidden: el.hidden, display: getComputedStyle(el).display,
    position: getComputedStyle(el).position, rect: rect(el),
  }));
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, cx: window.innerWidth / 2, cy: window.innerHeight / 2 },
    screen: { ...rect(screen), scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight, scrollTop: screen.scrollTop },
    panel: rect(panel),
    block,
    offsetX: block ? rect(choices).cx - window.innerWidth / 2 : null,
    choicesCx: rect(choices).cx,
    blockOffsetY: block.cy - window.innerHeight / 2,
    blockOffsetX: rect(panel).cx - window.innerWidth / 2,
    choices: rect(choices),
    choiceImgs: [...document.querySelectorAll('.pack-choice img')].map(rect),
    choiceCards: [...document.querySelectorAll('.pack-choice')].map(rect),
    children,
  };
});
await shot(`${label}-select.png`);
fs.writeFileSync(`${OUT}${label}-select.json`, `${JSON.stringify({ label, select, errors }, null, 2)}\n`);

// --- Tear stage: open World Capitals (first choice) ---
// The select screen re-renders its choices on a 1s tick, which detaches the
// button mid-click for Playwright; dispatch the click directly instead.
await page.evaluate(() => document.querySelector('.pack-choice').click());
await page.waitForFunction(() => {
  const sealed = document.querySelector('.pack-sealed');
  return sealed && !sealed.hidden && sealed.getBoundingClientRect().width > 0;
}, null, { timeout: 60000 });
await page.waitForTimeout(600);
const tear = await page.evaluate(() => {
  const sealed = document.querySelector('.pack-sealed');
  const r = sealed.getBoundingClientRect();
  const panel = document.querySelector('.pack-panel');
  const pr = panel.getBoundingClientRect();
  return {
    sealed: { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 },
    panel: { x: pr.x, y: pr.y, width: pr.width, height: pr.height, cx: pr.x + pr.width / 2, cy: pr.y + pr.height / 2 },
    offsetX: r.x + r.width / 2 - window.innerWidth / 2,
    offsetY: r.y + r.height / 2 - window.innerHeight / 2,
  };
});
await shot(`${label}-tear.png`);
await page.evaluate(() => { window.__skipGL = true; });

const result = { label, select, tear, errors };
fs.writeFileSync(`${OUT}${label}.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (errors.length) process.exit(1);
