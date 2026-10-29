// 390x844 captures of the pack reveal stack on the LOCAL build (pack-tear harness
// pattern: game code served from the demo tree on a fake game.local origin, CDP
// screenshots, GL draws skipped once the pack screen is up).
// usage: node shots/pack-reveal/pack-reveal.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/pack-reveal/`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const b = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function openPage(reducedMotion) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion });
  const p = await ctx.newPage();
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
  const stack = () => p.evaluate(() => {
    const ul = document.querySelector('.pack-slots');
    const cards = [...ul.children];
    return {
      sealedHidden: document.querySelector('.pack-sealed').hidden,
      isStack: ul.classList.contains('is-stack'),
      cards: cards.length,
      interactive: cards.filter((li) => !li.inert).length,
      topCard: cards.at(-1)?.getAttribute('aria-label'),
      line: document.querySelector('.pack-line').textContent,
      panelScrolls: document.querySelector('.pack-panel').scrollHeight > document.querySelector('.pack-panel').clientHeight,
    };
  });
  return { p, ctx, errs, shot, rect, stack };
}

// Trace the tear line from left to right until it opens.
async function traceOpen(p, r) {
  const lineY = r.top + r.height * 0.257;
  await p.mouse.move(r.left - 20, lineY);
  await p.mouse.down();
  for (let i = 1; i <= 24; i++) await p.mouse.move(r.left - 20 + (r.width + 40) * i / 24, lineY);
  await p.mouse.up();
}

const report = {};
{
  const { p, ctx, errs, shot, rect, stack } = await openPage('no-preference');
  const r = await rect();
  report.packRect = r;
  // (a) Fit: everything in the sealed state inside 390x844 with no scrolling.
  report.fit = await p.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel).getBoundingClientRect(); return { top: Math.round(e.top), bottom: Math.round(e.bottom) }; };
    const panel = document.querySelector('.pack-panel');
    const screen = document.getElementById('pack-screen');
    return {
      viewport: [innerWidth, innerHeight],
      panel: box('.pack-panel'), heading: box('#pack-heading'), line: box('.pack-line'), pack: box('.pack-sealed'), hint: box('.pack-sealed-hint'),
      panelScrolls: panel.scrollHeight > panel.clientHeight, screenScrolls: screen.scrollHeight > screen.clientHeight,
    };
  });
  await shot('a-sealed.png');

  // (b) Mid-emergence: the trace opens the pack; once the stack is rising,
  // the stack cards' own animations are paused at 200 ms (top card about half
  // out of the opening) for the capture, then resumed. Only the card
  // animations: the strip's finished CSS flight must not be rewound.
  await traceOpen(p, r);
  await p.waitForSelector('.pack-sealed.opening', { timeout: 5000 });
  report.midEmergence = await p.evaluate(() => {
    const anims = [...document.querySelectorAll('.pack-slots > li')].flatMap((li) => li.getAnimations());
    for (const a of anims) { a.pause(); a.currentTime = 200; }
    const tearY = (() => { const s = document.querySelector('.pack-sealed').getBoundingClientRect(); return s.top + s.height * 0.257; })();
    const top = document.querySelector('.pack-slots').lastElementChild.getBoundingClientRect();
    return { paused: anims.length, tearY: Math.round(tearY), topCardTop: Math.round(top.top), topCardBottom: Math.round(top.bottom) };
  });
  await shot('b-mid-emergence.png');
  await p.evaluate(() => { for (const li of document.querySelectorAll('.pack-slots > li')) for (const a of li.getAnimations()) a.play(); });

  // (c) Settled: wrapper gone, stack centered in the panel.
  await p.waitForFunction(() => document.querySelector('.pack-sealed').hidden, null, { timeout: 15000 });
  await p.waitForTimeout(300);
  report.settled = await stack();
  report.settledCenter = await p.evaluate(() => {
    const panel = document.querySelector('.pack-panel').getBoundingClientRect();
    const top = document.querySelector('.pack-slots').lastElementChild.getBoundingClientRect();
    return { panelCx: Math.round(panel.left + panel.width / 2), topCardCx: Math.round(top.left + top.width / 2) };
  });
  await shot('c-stack-settled.png');

  // A tap on a card under the top one does nothing (they are inert).
  const under = await p.evaluate(() => { const r = document.querySelector('.pack-slots').firstElementChild.getBoundingClientRect(); return { x: r.right - 3, y: r.top + 3 }; });
  await p.mouse.click(under.x, under.y);
  report.underTapFlipped = await p.evaluate(() => document.querySelectorAll('.pack-slots .flipped').length);

  // (d) Tap the top card: it flips to its clue (the shot lands inside the
  // 1400 ms clue hold), then its round starts on its own.
  await p.evaluate(() => document.querySelector('.pack-slots').lastElementChild.click());
  await p.waitForTimeout(450);
  report.flipped = await p.evaluate(() => ({ flipped: document.querySelector('.pack-slots').lastElementChild.classList.contains('flipped'), name: document.querySelector('.pack-slots').lastElementChild.querySelector('.pack-clue-name')?.textContent }));
  await shot('d-top-card-flipped.png');

  // (e) The round: started by the card's own hold timer. The guess goes in
  // through window.__game.guess (the game's test hook, the same revealGuess a
  // confirmed pin calls); Next is the real button click.
  await p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 15000 });
  report.round = await p.evaluate(() => ({ header: document.querySelector('.round-meta')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80), item: window.__game.state.item }));
  await p.evaluate(() => window.__game.guess(48.8566, 2.3522));
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('next-button').click());
  await p.waitForSelector('#pack-screen:not([hidden])', { timeout: 10000 });
  await p.waitForTimeout(900);
  report.afterFirst = await stack();
  await shot('e-stack-after-first.png');

  // Cards 2 and 3 the same way, then the done state: the existing slots.
  for (let n = 0; n < 2; n++) {
    await p.evaluate(() => document.querySelector('.pack-slots').lastElementChild.click());
    await p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 15000 });
    await p.evaluate(() => window.__game.guess(48.8566, 2.3522));
    await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById('next-button').click());
    await p.waitForSelector('#pack-screen:not([hidden])', { timeout: 10000 });
    await p.waitForTimeout(900);
  }
  report.done = await p.evaluate(() => ({
    isStack: document.querySelector('.pack-slots').classList.contains('is-stack'),
    slots: document.querySelectorAll('.pack-slots > .pack-slot').length,
    faceDown: document.querySelectorAll('.pack-slots .pack-flip-slot').length,
    primary: document.querySelector('.pack-primary').hidden ? null : document.querySelector('.pack-primary').textContent,
    line: document.querySelector('.pack-line').textContent,
  }));
  report.errs = errs;
  await ctx.close();
}
{
  // Reduced motion: a plain tap opens the pack; the stack is up at once.
  const { p, ctx, errs, rect, stack } = await openPage('reduce');
  const r = await rect();
  await p.mouse.click(r.left + r.width / 2, r.top + r.height * 0.6);
  await p.waitForTimeout(300);
  report.reduced = await stack();
  await p.evaluate(() => document.querySelector('.pack-slots').lastElementChild.click());
  await p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 10000 });
  report.reducedRoundStarted = true;
  report.reducedErrs = errs;
  await ctx.close();
}
{
  // Keyboard: Enter opens the pack, Enter on the top card flips it.
  const { p, ctx, errs, stack } = await openPage('no-preference');
  await p.focus('.pack-sealed');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.querySelector('.pack-sealed').hidden, null, { timeout: 15000 });
  report.keyboard = await stack();
  await p.focus('.pack-slots > :last-child');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(450);
  report.keyboardFlip = await p.evaluate(() => document.querySelector('.pack-slots').lastElementChild.classList.contains('flipped'));
  report.keyboardErrs = errs;
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await b.close();
