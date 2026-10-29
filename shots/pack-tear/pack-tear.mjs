// 390px captures of the pack tear on the LOCAL build (zoom-floor / pp-shot pattern:
// game code served from the demo tree on a fake game.local origin, CDP screenshots).
// Uses the cached Playwright Chromium 1234: /opt/meta-chromium refuses to start without
// the image-owned WebGL policy from browser-daemon.
// usage: node shots/pack-tear/pack-tear.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/pack-tear/`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const b = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function openPage(reducedMotion) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion });
  const p = await ctx.newPage();
  // Software WebGL renders the globe at about 2 s a frame here, which starves
  // the pack animations. Once the pack screen is up, skip GL draws so the DOM
  // runs faster. Blind spot: the globe behind the panel freezes on its last frame.
  await p.addInitScript(() => {
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
    if (u.hostname === 'tiles.where-on.earth' || u.hostname.includes('wikimedia')) return r.abort();
    return r.continue();
  });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => { const e = document.getElementById('pack-button'); return e && !e.disabled; }, null, { timeout: 90000 });
  await p.evaluate(() => document.getElementById('pack-button').click());
  await p.waitForSelector('.pack-sealed:not([hidden])', { timeout: 10000 });
  await p.evaluate(() => { window.__skipGL = true; });
  await p.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(p);
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(r.data, 'base64')); };
  const rect = () => p.evaluate(() => { const r = document.querySelector('.pack-sealed').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  const tear = () => p.evaluate(() => document.querySelector('.pack-sealed').style.getPropertyValue('--tear'));
  const frameMs = await p.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { if (++n < 10) requestAnimationFrame(f); else res(Math.round((performance.now() - s) / 10)); }; requestAnimationFrame(f); }));
  return { p, ctx, errs, shot, rect, tear, frameMs };
}

const report = {};
{
  const { p, ctx, errs, shot, rect, tear, frameMs } = await openPage('no-preference');
  const r = await rect();
  report.frameMs = frameMs;
  report.packRect = r;
  const lineY = r.top + r.height * 0.257;
  await shot('a-sealed.png');

  // Tap: one teaching glint, pack stays sealed.
  await p.mouse.click(r.left + r.width / 2, r.top + r.height * 0.6);
  report.tapTeach = await p.evaluate(() => document.querySelector('.pack-sealed').classList.contains('teach'));
  await p.waitForTimeout(1100);
  report.teachCleared = await p.evaluate(() => !document.querySelector('.pack-sealed').classList.contains('teach'));

  // Off the line: moving 120px below the line must not cut.
  await p.mouse.move(r.left - 20, lineY + 120);
  await p.mouse.down();
  for (let i = 1; i <= 20; i++) await p.mouse.move(r.left - 20 + (r.width + 40) * i / 20, lineY + 120);
  report.offLineTear = await tear();
  await p.mouse.up();
  await p.waitForTimeout(400);

  // Mid-trace: pointer along the line to about 50 percent, held.
  await p.mouse.move(r.left - 20, lineY);
  await p.mouse.down();
  const steps = 24;
  for (let i = 1; i <= steps; i++) await p.mouse.move(r.left - 20 + (20 + r.width * 0.5) * i / steps, lineY + (i % 2 ? 6 : -6));
  report.midTear = await tear();
  await p.waitForTimeout(120);
  await shot('b-mid-trace.png');

  // Stray off the band then come back: progress pauses, does not reset.
  await p.mouse.move(r.left + r.width * 0.6, lineY + 140);
  report.afterStray = await tear();
  await p.mouse.move(r.left + r.width * 0.5, lineY);

  // Finish the trace: opens at 0.9.
  for (let i = 1; i <= 16; i++) await p.mouse.move(r.left + r.width * 0.5 + r.width * 0.55 * i / 16, lineY);
  report.tornClass = await p.evaluate(() => document.querySelector('.pack-sealed').classList.contains('torn'));
  await p.waitForTimeout(200);
  await shot('c-tear-strip-flight.png');
  await p.mouse.up();
  await p.waitForTimeout(3000);
  await shot('d-dealt-slots.png');
  report.dealt = await p.evaluate(() => ({ sealedHidden: document.querySelector('.pack-sealed').hidden, slots: document.querySelectorAll('.pack-slots .pack-flip-slot').length, slotsHidden: document.querySelector('.pack-slots').hidden }));
  report.errs = errs;
  await ctx.close();
}
{
  // Reduced motion: a plain tap on the packet opens it.
  const { p, ctx, errs, rect } = await openPage('reduce');
  const r = await rect();
  await p.mouse.click(r.left + r.width / 2, r.top + r.height * 0.6);
  await p.waitForTimeout(300);
  report.reducedTap = await p.evaluate(() => ({ sealedHidden: document.querySelector('.pack-sealed').hidden, slots: document.querySelectorAll('.pack-slots .pack-flip-slot').length }));
  report.reducedErrs = errs;
  await ctx.close();
}
{
  // Keyboard: Enter on the focused packet opens it.
  const { p, ctx, errs } = await openPage('no-preference');
  await p.focus('.pack-sealed');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(3000);
  report.keyboard = await p.evaluate(() => ({ sealedHidden: document.querySelector('.pack-sealed').hidden, slots: document.querySelectorAll('.pack-slots .pack-flip-slot').length }));
  report.keyboardErrs = errs;
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await b.close();
