// 390px check that Country Blackout and Survival runs survive a page reload
// (LOCAL build, fake game.local origin, cached Playwright Chromium; the
// pack-tear harness pattern). Guesses go through window.__game.guess.
// usage: node shots/run-persist/resume.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/run-persist/`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const b = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__travelAnim = false; // static reveals keep the run moving on software GL
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
      const orig = C?.prototype[fn];
      if (orig) C.prototype[fn] = function (...a) { if (!window.__skipGL) return orig.apply(this, a); };
    }
  }
});
await p.route('**/*', async (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === 'game.local') {
    const path = u.pathname.replace(/^\//, '') || 'index.html';
    if (path === 'assets/version.txt') return r.fulfill({ status: 404, body: '' });
    try { return r.fulfill({ body: fs.readFileSync(`${ROOT}/${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } }); }
    catch { return r.fulfill({ status: 404, body: 'nf' }); }
  }
  return r.abort();
});
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const boot = async () => {
  await p.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => !document.getElementById('blackout-button')?.disabled && !document.getElementById('survival-button')?.disabled && window.__game, null, { timeout: 120000 });
  await p.evaluate(() => { window.__skipGL = true; });
};
const guessMode = () => p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 30000 });
const run = (key) => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
// A location inside the target country, so the tap is a hit.
const guessIn = (key) => p.evaluate(async (k) => {
  const { state } = await import('/src/core/state.js');
  const loc = state.locations.find((x) => x.country === k);
  window.__game.guess(loc.lat, loc.lng);
  return loc.id;
}, key);
const shot = async (name) => { const cdp = await ctx.newCDPSession(p); const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(r.data, 'base64')); };
const report = { blackout: {}, survival: {} };

// Country Blackout: Europe, one find, next target drawn, reload, resume, then a miss.
await boot();
await p.evaluate(() => document.getElementById('blackout-button').click());
await p.click('[data-blackout-scope="europe"]');
await guessMode();
const k1 = (await p.evaluate(() => window.__game.state.borders.key));
await guessIn(k1);
report.blackout.afterHit = await p.evaluate(() => ({ found: window.__game.state.borders.found, missed: window.__game.state.borders.missed }));
await p.click('#next-button');
await guessMode();
const k2 = await p.evaluate(() => window.__game.state.borders.key);
await p.waitForTimeout(1500);
report.blackout.savedBeforeReload = await run('where-on-earth-blackout-run-v1');
await boot();
await p.evaluate(() => document.getElementById('blackout-button').click());
report.blackout.pickerRow = await p.evaluate(() => document.querySelector('[data-blackout-scope="europe"] small').textContent);
await p.click('[data-blackout-scope="europe"]');
await guessMode();
const s = await p.evaluate(() => ({ ...window.__game.state.borders, hud: document.getElementById('round-number')?.textContent || document.querySelector('.round-header')?.textContent.trim().slice(0, 80) }));
report.blackout.resumed = { found: s.found, round: s.round, key: s.key, sameKey: s.key === k2, firstFoundKey: k1, hud: s.hud };
await shot('blackout-resumed.png');
await p.evaluate(() => window.__game.guess(0, -160)); // mid-Pacific: a miss
report.blackout.afterMiss = { missed: (await p.evaluate(() => window.__game.state.borders.missed)), save: await run('where-on-earth-blackout-run-v1') };

// Survival: one survived round, next target drawn, reload, resume on that target.
await boot();
await p.evaluate(() => document.getElementById('survival-button').click());
await guessMode();
const first = await p.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const id = window.__game.state.survival.item;
  const item = [...state.locations, ...(state.landmarks || [])].find((x) => x.id === id);
  window.__game.guess(item.lat, item.lng);
  return id;
});
report.survival.afterGuess = await p.evaluate(() => ({ survived: window.__game.state.survival.survived, missed: window.__game.state.survival.missed }));
await p.click('#next-button');
await guessMode();
const second = await p.evaluate(() => window.__game.state.survival.item);
report.survival.savedBeforeReload = await run('where-on-earth-survival-run-v1');
await boot();
await p.evaluate(() => document.getElementById('survival-button').click());
await guessMode();
const sv = await p.evaluate(() => window.__game.state.survival);
report.survival.resumed = { round: sv.round, survived: sv.survived, item: sv.item, sameItem: sv.item === second, resultIds: sv.results.map((r) => r.item.id), firstItem: first };
await shot('survival-resumed.png');
await p.evaluate(() => window.__game.guess(0, -160)).catch(() => {}); // a miss, unless the target sits in the mid-Pacific
report.survival.afterMiss = { missed: await p.evaluate(() => window.__game.state.survival.missed), save: await run('where-on-earth-survival-run-v1') };
report.errs = errs;
console.log(JSON.stringify(report, null, 1));
await b.close();
