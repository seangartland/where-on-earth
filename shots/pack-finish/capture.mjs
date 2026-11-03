// Stepped-animation captures of the pack opening on the LOCAL build (review
// Section 2 method): the opening's Web Animations are paused and stepped in
// 33 ms increments, CDP screenshot per step, so frames are independent of
// SwiftShader speed. Long timers (>= 900 ms: the end of the opening, the clue
// hold) are held by the harness and released by hand, so stepping cannot be
// cut short by the wall clock.
// usage: node shots/pack-finish/capture.mjs <tag> [height=844] [--frames]
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT = process.env.ROOT || '/home/hatch/workspace/map-game/demo';
const SHOTS = '/home/hatch/workspace/map-game/demo';
const TAG = process.argv[2] || 'run';
const H = Number(process.argv[3] || 844);
const FRAMES = process.argv.includes('--frames');
const OUT = `${SHOTS}/shots/pack-finish/${TAG}-${H}/`;
fs.mkdirSync(OUT, { recursive: true });
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const b = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: H }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
const p = await ctx.newPage();
if (process.env.NO_VT) await p.addInitScript(() => { delete Document.prototype.startViewTransition; });
await p.addInitScript(() => {
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
      const orig = C?.prototype[fn];
      if (orig) C.prototype[fn] = function (...a) { if (!window.__skipGL) return orig.apply(this, a); };
    }
  }
  // Long-timer hold.
  const set = window.setTimeout.bind(window);
  const clear = window.clearTimeout.bind(window);
  window.__held = new Map();
  let fake = 1e9;
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (window.__hold && ms >= 900) { const id = fake++; window.__held.set(id, () => fn(...args)); return id; }
    return set(fn, ms, ...args);
  };
  window.clearTimeout = (id) => { if (window.__held.has(id)) window.__held.delete(id); else clear(id); };
  window.__release = () => { const fns = [...window.__held.values()]; window.__held.clear(); for (const fn of fns) fn(); return fns.length; };
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
await p.waitForSelector('.pack-choice', { timeout: 15000 });
await p.waitForTimeout(600);
await p.evaluate(() => document.querySelector('.pack-choice[aria-label="Capitals"]').click());
await p.waitForSelector('.pack-sealed:not([hidden])', { timeout: 15000 });
await p.evaluate(() => { window.__skipGL = true; });
await p.waitForTimeout(800);
const cdp = await ctx.newCDPSession(p);
const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(r.data, 'base64')); };
const report = { viewport: [390, H], errs };

const box = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), opacity: getComputedStyle(e).opacity }; }, sel);
report.sealed = { heading: await box('#pack-heading'), line: await box('.pack-line'), pack: await box('.pack-sealed'), panel: await box('.pack-panel') };
await shot('00-sealed.png');
const pack = report.sealed.pack;
const tearLine = await p.evaluate(() => Number(document.querySelector('.pack-sealed').style.getPropertyValue('--line')));
const tearY = pack.top + (pack.bottom - pack.top) * tearLine;
report.tearY = +tearY.toFixed(1);

// The trace.
await p.evaluate(() => { window.__hold = true; });
await p.mouse.move(pack.left - 20, tearY);
await p.mouse.down();
for (let i = 1; i <= 24; i++) await p.mouse.move(pack.left - 20 + (pack.right - pack.left + 40) * i / 24, tearY);
await p.mouse.up();
await p.waitForSelector('.pack-sealed.opening', { timeout: 5000 });
// Pause every script-made animation of the opening (not the strip's finished
// CSS flight or the flap's CSS transition) at the opening's t=0.
const meta = await p.evaluate(() => {
  const anims = document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition));
  for (const a of anims) a.pause();
  window.__open = anims;
  const ends = anims.map((a) => { const t = a.effect.getComputedTiming(); return t.endTime; });
  const cards = [...document.querySelectorAll('.pack-slots > li')].reverse();
  return { count: anims.length, end: Math.max(...ends), cards: cards.length };
});
report.openingAnims = meta;
const STEP = 33;
const frames = [];
const violations = [];
for (let t = 0; t <= meta.end + STEP; t += STEP) {
  const m = await p.evaluate(({ t, pack, tearY }) => {
    for (const a of window.__open) a.currentTime = t;
    const cards = [...document.querySelectorAll('.pack-slots > li')].reverse().map((li, order) => {
      const r = li.getBoundingClientRect();
      return { order, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), z: getComputedStyle(li).zIndex };
    });
    const s = document.querySelector('.pack-sealed');
    const h = document.getElementById('pack-heading').getBoundingClientRect();
    const l = document.querySelector('.pack-line');
    return {
      t, cards,
      wrapper: { opacity: +getComputedStyle(s).opacity, transform: getComputedStyle(s).transform },
      heading: { top: +h.top.toFixed(1), opacity: +getComputedStyle(document.getElementById('pack-heading')).opacity },
      line: { top: +l.getBoundingClientRect().top.toFixed(1), opacity: +getComputedStyle(l).opacity, text: l.textContent },
    };
  }, { t, pack, tearY });
  // Believability: a card still under the wrapper (z 1, i.e. not yet clear
  // of the lip) with any part below the tear line must sit inside the pack's
  // left/right edges. The bounding box of the rotated card is a superset of
  // its pixels, so this is conservative.
  for (const c of m.cards) {
    if (c.z === '1' && c.bottom > tearY && (c.left < pack.left - 0.5 || c.right > pack.right + 0.5)) violations.push({ t, ...c });
  }
  frames.push(m);
  if (FRAMES) await shot(`rise-${String(t).padStart(4, '0')}.png`);
}
report.riseFrames = frames.length;
report.violations = violations;
report.frames = frames.map((f) => ({ t: f.t, wrap: f.wrapper.opacity, wrapT: f.wrapper.transform, head: f.heading, line: f.line, cards: f.cards.map((c) => `${c.order}:${c.top}-${c.bottom} ${c.left}-${c.right} z${c.z}`).join(' | ') }));
// Settle: release the held end-of-opening timer, then step the release beats.
await p.evaluate(() => { for (const a of window.__open) a.finish?.(); });
report.released = await p.evaluate(() => window.__release());
const settle = await p.evaluate(() => {
  const anims = document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.playState !== 'finished');
  for (const a of anims) a.pause();
  window.__settle = anims;
  return { count: anims.length, end: anims.length ? Math.max(...anims.map((a) => a.effect.getComputedTiming().endTime)) : 0 };
});
report.settleAnims = settle;
report.settleFrames = [];
for (let t = 0; t <= settle.end + STEP; t += STEP) {
  const m = await p.evaluate((t) => {
    for (const a of window.__settle) a.currentTime = t;
    const h = document.getElementById('pack-heading');
    const l = document.querySelector('.pack-line');
    const top = document.querySelector('.pack-slots').lastElementChild.getBoundingClientRect();
    return { t, headTop: +h.getBoundingClientRect().top.toFixed(1), headOp: +getComputedStyle(h).opacity, lineOp: +getComputedStyle(l).opacity, line: l.textContent, panelH: +document.querySelector('.pack-panel').getBoundingClientRect().height.toFixed(1), topCard: +top.top.toFixed(1) };
  }, t);
  report.settleFrames.push(m);
  if (FRAMES) await shot(`settle-${String(t).padStart(4, '0')}.png`);
}
await p.evaluate(() => { for (const a of window.__settle) a.finish?.(); });
await p.waitForTimeout(200);
report.settled = { heading: await box('#pack-heading'), line: await box('.pack-line'), stack: await box('.pack-slots') };
await shot('20-settled.png');

// The flip and clue face.
const slot = await p.evaluate(() => { const r = document.querySelector('.pack-slots').lastElementChild.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.click(slot.x, slot.y);
await p.waitForTimeout(700);
report.flipLine = await p.evaluate(() => { const l = document.querySelector('.pack-line'); return { text: l.textContent, hidden: l.hidden, opacity: getComputedStyle(l).opacity }; });
const prog = await p.evaluate(() => {
  const anims = document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.playState !== 'finished');
  for (const a of anims) a.pause();
  window.__hold2 = anims;
  return anims.map((a) => ({ target: a.effect.target?.className, end: a.effect.getComputedTiming().endTime }));
});
report.holdAnims = prog;
for (const frac of [0, 0.5, 1]) {
  await p.evaluate((frac) => { for (const a of window.__hold2) a.currentTime = a.effect.getComputedTiming().endTime * frac; }, frac);
  await shot(`30-clue-${frac * 100}.png`);
}
report.clueFace = await p.evaluate(() => {
  const f = document.querySelector('.pack-slots .flipped .pack-flip-front');
  return f ? f.outerHTML.replace(/\s+/g, ' ').slice(0, 900) : null;
});

// The handoff to the round.
await p.evaluate(() => { window.__skipGL = false; window.__hold = false; for (const a of window.__hold2) a.finish?.(); });
report.vtSupported = await p.evaluate(() => typeof document.startViewTransition === 'function');
await p.evaluate(() => { window.__release(); });
const vt = await p.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    const anims = document.getAnimations().filter((a) => String(a.effect?.pseudoElement || '').startsWith('::view-transition'));
    if (anims.length) {
      for (const a of anims) a.pause();
      window.__vt = anims;
      return { count: anims.length, end: Math.max(...anims.map((a) => a.effect.getComputedTiming().endTime)), names: [...new Set(anims.map((a) => a.effect.pseudoElement))] };
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  return null;
});
report.viewTransition = vt;
if (vt) {
  for (let t = 0; t <= vt.end; t += STEP) {
    await p.evaluate((t) => { for (const a of window.__vt) a.currentTime = t; }, t);
    await shot(`40-handoff-${String(t).padStart(4, '0')}.png`);
  }
  await p.evaluate(() => { for (const a of window.__vt) a.finish(); });
}
await p.waitForTimeout(400);
await shot('50-round.png');
report.round = await p.evaluate(() => ({ clue: document.getElementById('clue').textContent, roundVisible: !document.getElementById('round-screen').hidden, vtName: document.getElementById('clue').style.viewTransitionName }));
fs.writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ out: OUT, riseFrames: report.riseFrames, violations: violations.length, sealed: report.sealed, settled: report.settled, flipLine: report.flipLine, vt: report.viewTransition, round: report.round, errs }, null, 1));
await ctx.close();
await b.close();
