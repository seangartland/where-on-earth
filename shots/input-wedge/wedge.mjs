// 390px check of the phantom-pointer wedge fix (src/globe/pin.js) on the LOCAL build
// (pack-tear pattern: fake game.local origin, cached Playwright Chromium, CDP touch).
// The wedge is reproduced by swallowing one finger's pointerup/pointercancel/
// lostpointercapture at window capture phase, so the canvas never hears it end,
// the way iOS can drop capture mid-pinch.
// usage: node shots/input-wedge/wedge.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT = '/home/hatch/workspace/map-game/demo';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const b = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.addInitScript(() => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
      const orig = C?.prototype[fn];
      if (orig) C.prototype[fn] = function (...a) { if (!window.__skipGL) return orig.apply(this, a); };
    }
  }
  // Record canvas pointer ids in order; swallow the end events of ids in __swallow.
  window.__downs = [];
  window.__swallow = new Set();
  window.addEventListener('pointerdown', (e) => { if (e.target.tagName === 'CANVAS') window.__downs.push(e.pointerId); }, true);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(t, (e) => { if (e.isTrusted && window.__swallow.has(e.pointerId)) e.stopImmediatePropagation(); }, true);
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
await p.goto('https://game.local/index.html?reset=daily', { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => !document.getElementById('play-button')?.disabled, null, { timeout: 90000 });
await p.click('#play-button');
await p.waitForFunction(() => window.__game?.state.mode === 'guess' && window.__canGuess, null, { timeout: 90000 });
await p.evaluate(() => { window.__skipGL = true; });
await p.waitForTimeout(500);

const cdp = await ctx.newCDPSession(p);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
const tap = async (x, y) => { await touch('touchStart', [[x, y, 0]]); await touch('touchEnd', []); await p.waitForTimeout(150); };
const probe = () => p.evaluate(async () => {
  const { state } = await import('/src/core/state.js');
  const { pointers } = await import('/src/globe/scene.js');
  return { pointers: pointers.size, pending: state.pendingGuess && { lat: +state.pendingGuess.lat.toFixed(3), lng: +state.pendingGuess.lng.toFixed(3) }, yaw: +state.yaw.toFixed(4), pitch: +state.pitch.toFixed(4), dragging: document.querySelector('canvas').classList.contains('dragging') };
});
// Two fingers down and pinched apart; finger 0's end is swallowed.
const wedgedPinch = async () => {
  await p.evaluate(() => { window.__downs = []; });
  await touch('touchStart', [[170, 420, 0]]);
  await touch('touchStart', [[170, 420, 0], [230, 420, 1]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[170 - i * 6, 420, 0], [230 + i * 6, 420, 1]]);
  return p.evaluate(() => { window.__swallow = new Set([window.__downs[0]]); return [...window.__downs]; });
};
const moved = (a, z) => !!z.pending && (!a.pending || a.pending.lat !== z.pending.lat || a.pending.lng !== z.pending.lng);
const drag = async () => {
  await touch('touchStart', [[120, 430, 0]]);
  for (let x = 140; x <= 280; x += 20) await touch('touchMove', [[x, 430, 0]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(150);
};

const report = {};
// 1. Normal pin placement.
const s0 = await probe();
await p.evaluate(() => { window.__downs = []; window.__ev = []; for (const t of ['pointerdown', 'pointerup']) window.addEventListener(t, (e) => window.__ev.push([t, e.target.tagName + '.' + e.target.className, Math.round(performance.now())]), true); });
await tap(195, 470);
report.firstTapEvents = await p.evaluate(() => window.__ev);
const s1 = await probe();
report.normalTap = { placed: !!s1.pending && !s0.pending, after: s1 };

// 2. Control: the wedge without lostpointercapture. Expect a stuck phantom and a dead tap.
report.control = { ids: await wedgedPinch() };
await touch('touchEnd', []);
await p.waitForTimeout(150);
report.control.afterRelease = await probe();
await tap(150, 380);
const c2 = await probe();
report.control.tapPlaced = moved(report.control.afterRelease, c2);
// Then a window blur clears it.
await p.evaluate(() => { window.__swallow = new Set(); window.dispatchEvent(new Event('blur')); });
report.control.afterBlur = await probe();
await tap(150, 380);
const c3 = await probe();
report.control.tapAfterBlurPlaced = moved(c2, c3);

// 3. The fix: same wedge, plus a synthetic lostpointercapture for finger 0 without pointerup.
report.fix = { ids: await wedgedPinch() };
await p.evaluate(() => {
  const c = document.querySelector('canvas');
  c.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: window.__downs[0], pointerType: 'touch', clientX: 164, clientY: 420 }));
});
report.fix.afterLost = await probe();
await touch('touchEnd', []); // ends finger 1 normally (finger 0's real end is swallowed)
await p.waitForTimeout(150);
report.fix.afterRelease = await probe();
const f1 = report.fix.afterRelease;
await tap(240, 500);
const f2 = await probe();
report.fix.tapPlaced = moved(f1, f2);
await drag();
const f3 = await probe();
report.fix.drag = { yawDelta: +(f3.yaw - f2.yaw).toFixed(4), pitchDelta: +(f3.pitch - f2.pitch).toFixed(4), pointersAfter: f3.pointers, dragging: f3.dragging };

// 4. visibilitychange to hidden also clears a phantom.
await p.evaluate(() => { window.__swallow = new Set(); });
report.hidden = { ids: await wedgedPinch() };
await touch('touchEnd', []);
await p.waitForTimeout(150);
report.hidden.beforeHide = await probe();
await p.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  window.__swallow = new Set();
});
report.hidden.afterHide = await probe();
await tap(200, 440);
const h2 = await probe();
report.hidden.tapPlaced = moved(report.hidden.afterHide, h2);
report.errs = errs;
console.log(JSON.stringify(report, null, 1));
await b.close();
