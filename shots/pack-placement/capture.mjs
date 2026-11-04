// Stepped captures of the pack placement (PACK-PLACEMENT-BRIEF.md) on the
// LOCAL build, modeled on shots/pack-finish/capture.mjs: every placement Web
// Animation is paused at creation and stepped by hand, CDP screenshot per
// frame. The three rounds of a Capitals pack are recorded through the game's
// own modules (recordVisit, packRecordGuess, packNext) instead of the globe:
// card A new, card B an upgrade from Near to Pinpoint, card C new.
// Run 2 turns the setting off through the Settings UI, reloads, and checks
// the finish screen stays as it is.
// usage: node shots/pack-placement/capture.mjs <tag> [height=844]
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ROOT = process.env.ROOT || '/home/hatch/workspace/map-game/demo';
const TAG = process.argv[2] || 'run';
const H = Number(process.argv[3] || 844);
const OUT = `${ROOT}/shots/pack-placement/${TAG}-${H}/`;
fs.mkdirSync(OUT, { recursive: true });
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const b = await chromium.launch({ executablePath: '/home/hatch/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { viewport: [390, H] };

async function page(reducedMotion = 'no-preference') {
  const ctx = await b.newContext({ viewport: { width: 390, height: H }, deviceScaleFactor: 2, reducedMotion });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
        const orig = C?.prototype[fn];
        if (orig) C.prototype[fn] = function (...a) { if (!window.__skipGL) return orig.apply(this, a); };
      }
    }
    // Long-timer hold (the 1600 ms placement delay).
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
    // Pause each placement animation as it is made.
    window.__anims = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...a) {
      const anim = animate.apply(this, a);
      if (window.__pausePlace && this.closest?.('.passport-screen')) { anim.pause(); window.__anims.push(anim); }
      return anim;
    };
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
  const load = async () => {
    await p.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForFunction(() => { const e = document.getElementById('pack-button'); return e && !e.disabled; }, null, { timeout: 90000 });
  };
  await load();
  const cdp = await ctx.newCDPSession(p);
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(r.data, 'base64')); };
  return { ctx, p, errs, shot, load };
}

// Opens a Capitals pack and records its three cards. Card B is first seeded
// as a Near visit so its pack round is an upgrade. Holds long timers before
// the last card so the placement waits for the harness.
async function playPack(p, hold) {
  await p.evaluate(() => document.getElementById('pack-button').click());
  await p.waitForSelector('.pack-choice', { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('.pack-choice[aria-label="Capitals"]').click());
  await p.waitForSelector('.pack-sealed:not([hidden])', { timeout: 15000 });
  await p.evaluate(() => { window.__skipGL = true; });
  return p.evaluate(async (hold) => {
    const { pack, packRecordGuess, packNext } = await import('/src/modes/pack.js');
    const { recordVisit, findLocation, isVisited } = await import('/src/meta/passport-store.js');
    const { state } = await import('/src/core/state.js');
    const ids = pack.record.byType.capitals.ids;
    const km = [60, 1, 90]; // A new (Near), B upgrade to Pinpoint, C new (Near)
    recordVisit(ids[1], 300, 120);
    await new Promise((r) => setTimeout(r, 20));
    const out = [];
    for (let i = 0; i < 3; i++) {
      if (i === 2 && hold) window.__hold = true;
      pack.card = i;
      pack.item = findLocation(ids[i]);
      pack.active = true;
      const wasVisited = isVisited(ids[i]);
      const previousEarn = state.passport.meta[ids[i]]?.e || 0;
      const base = Math.round(1000 - km[i]);
      const newly = recordVisit(ids[i], base, km[i]);
      const postcard = packRecordGuess({ lat: 0, lng: 0 }, km[i], km[i], base, wasVisited, previousEarn, newly);
      out.push({ id: ids[i], name: pack.item.short, ...postcard });
      packNext();
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  }, hold);
}

const STEP = 33;

// ---- Run 1: placement on.
{
  const { ctx, p, errs, shot } = await page();
  const cards = await playPack(p, true);
  report.cards = cards;
  await p.waitForTimeout(700);
  report.finish = await p.evaluate(() => ({ line: document.querySelector('.pack-line').textContent, held: window.__held.size }));
  await shot('00-finish.png');
  await p.evaluate(() => { window.__pausePlace = true; window.__release(); });
  await p.waitForSelector('.pp-place-layer', { timeout: 5000 });
  const steps = [];
  const violations = [];
  let n = 0;
  for (let guard = 0; guard < 40; guard++) {
    const live = await p.evaluate(async () => {
      for (let i = 0; i < 30; i++) {
        const anims = window.__anims.filter((a) => a.playState === 'paused');
        if (anims.length) return true;
        if (!document.querySelector('.pp-place-layer')) return false;
        await new Promise((r) => requestAnimationFrame(r));
      }
      return !!document.querySelector('.pp-place-layer');
    });
    if (!live) break;
    const meta = await p.evaluate(() => {
      const anims = window.__anims.filter((a) => a.playState === 'paused');
      window.__step = anims;
      return { end: Math.max(...anims.map((a) => a.effect.getComputedTiming().endTime)) };
    });
    const kinds = await p.evaluate(() => window.__step.map((a) => {
      const t = a.effect.target; const cls = t?.className || '';
      return { cls: String(cls), first: a.effect.getKeyframes()[0] };
    }));
    const kind = kinds.map(({ cls, first }) => cls.includes('pp-place-flight') ? 'scroll' : cls.includes('pp-place-glint') ? 'glint' : cls.includes('pp-slot-score') ? 'stamp' : cls.includes('pp-place-card') ? (Number(first.opacity) === 0 ? 'appear' : 'descend') : 'land').join('+');
    const frames = [];
    for (let t = 0; t <= meta.end + STEP; t += STEP) {
      const m = await p.evaluate(async (t) => {
        for (const a of window.__step) a.currentTime = Math.min(t, a.effect.getComputedTiming().endTime);
        await new Promise((r) => requestAnimationFrame(r));
        const flyer = document.querySelector('.pp-place-card');
        const target = document.querySelector('.pp-place-target');
        const fr = flyer?.getBoundingClientRect();
        const tr = target?.getBoundingClientRect();
        const r = (x) => x && { top: +x.top.toFixed(1), left: +x.left.toFixed(1), w: +x.width.toFixed(1), h: +x.height.toFixed(1) };
        return { t, scrollTop: Math.round(document.querySelector('.passport-screen').scrollTop), flyer: r(fr), target: r(tr), targetNumber: target?.querySelector('.pp-unvisited-number')?.textContent ?? null, targetEarn: target?.dataset.earn ?? null };
      }, t);
      if (m.flyer && (m.flyer.left < -0.5 || m.flyer.left + m.flyer.w > 390.5 || m.flyer.top < -0.5 || m.flyer.top + m.flyer.h > H + 0.5)) violations.push({ step: n, kind, ...m });
      frames.push(m);
    }
    // Stepped stills: start, middle and end of each phase.
    for (const frac of [0, 0.5, 1]) {
      await p.evaluate((frac) => {
        const end = Math.max(...window.__step.map((a) => a.effect.getComputedTiming().endTime));
        for (const a of window.__step) a.currentTime = Math.min(end * frac, a.effect.getComputedTiming().endTime);
        return end * frac;
      }, frac);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await shot(`${String(10 + n).padStart(2, '0')}-${kind}-${Math.round(frac * 100)}.png`);
    }
    steps.push({ n, kind, end: meta.end, first: frames[0], mid: frames[Math.floor(frames.length / 2)], last: frames[frames.length - 1] });
    await p.evaluate(() => { for (const a of window.__step) a.finish(); });
    n++;
  }
  report.steps = steps;
  report.violations = violations;
  await p.waitForTimeout(300);
  await shot('90-placed.png');
  report.placed = await p.evaluate((cards) => {
    const screen = document.querySelector('.passport-screen');
    const open = [...document.querySelectorAll('.pp-pack-head')].map((h) => ({ name: h.textContent.trim().slice(0, 40), expanded: h.getAttribute('aria-expanded') }));
    const slots = cards.map((c) => {
      const all = [...screen.querySelectorAll('.pp-pack-grid .pp-slot')];
      const hit = all.find((li) => (li.getAttribute('aria-label') || '').includes(c.name));
      return { name: c.name, found: !!hit, earn: hit?.dataset.earn, stamp: hit?.querySelector('.pp-slot-score')?.dataset.tier, index: hit ? all.indexOf(hit) + 1 : null };
    });
    return { passportOpen: !screen.hidden, layerGone: !document.querySelector('.pp-place-layer'), open, slots };
  }, cards);
  report.errs1 = errs;
  await ctx.close();
}

// ---- Run 2: setting off, through the Settings UI, persisted across reload.
{
  const { ctx, p, errs, shot, load } = await page();
  await p.evaluate(() => document.querySelector('.settings-entry').click());
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('[data-pack-placement="off"]').click());
  await p.evaluate(() => document.querySelector('[data-pack-placement="off"]').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(200);
  await shot('95-settings-off.png');
  report.settingStored = await p.evaluate(() => localStorage.getItem('where-on-earth-pack-placement'));
  await load();
  report.settingAfterReload = await p.evaluate(() => ({
    on: document.querySelector('[data-pack-placement="on"]').getAttribute('aria-pressed'),
    off: document.querySelector('[data-pack-placement="off"]').getAttribute('aria-pressed'),
  }));
  const cards = await playPack(p, false);
  await p.waitForTimeout(2600);
  report.off = await p.evaluate(() => ({
    cards: undefined,
    passportOpen: !document.querySelector('.passport-screen').hidden,
    layer: !!document.querySelector('.pp-place-layer'),
    packScreen: !document.querySelector('.pack-screen').hidden,
    line: document.querySelector('.pack-line').textContent,
    primary: document.querySelector('.pack-actions')?.hidden === false,
  }));
  report.off.cards = cards.map((c) => c.kind);
  await shot('96-off-finish.png');
  report.errs2 = errs;
  await ctx.close();
}

// ---- Run 3: two taps end the sequence; run 4: reduced motion lands at once.
for (const [name, motion] of [['tapSkip', 'no-preference'], ['reduced', 'reduce']]) {
  const { ctx, p, errs } = await page(motion);
  await playPack(p, true);
  await p.evaluate(() => window.__release());
  const t0 = Date.now();
  if (name === 'tapSkip') {
    await p.waitForSelector('.pp-place-layer', { timeout: 5000 });
    await p.waitForTimeout(150);
    await p.mouse.click(195, 600);
    await p.waitForTimeout(60);
    await p.mouse.click(195, 600);
  }
  await p.waitForFunction(() => !document.querySelector('.pp-place-layer') && !document.querySelector('.passport-screen').hidden, null, { timeout: 8000 });
  report[name] = { ms: Date.now() - t0, errs, ...await p.evaluate(() => ({
    placed: [...document.querySelectorAll('.pp-pack-grid .pp-slot:not(.pp-unvisited)')].map((li) => li.dataset.earn),
    leftovers: document.querySelectorAll('.pp-place-card, .pp-place-target, .pp-place-glint').length,
  })) };
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ out: OUT, cards: report.cards, finish: report.finish, steps: report.steps?.map((s) => ({ n: s.n, kind: s.kind, end: s.end, first: s.first, last: s.last })), violations: report.violations?.length, placed: report.placed, settingStored: report.settingStored, settingAfterReload: report.settingAfterReload, off: report.off, errs1: report.errs1, errs2: report.errs2, tapSkip: report.tapSkip, reduced: report.reduced }, null, 1));
