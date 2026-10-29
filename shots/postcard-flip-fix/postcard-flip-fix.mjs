// 390px captures of the flippable Passport postcard detail on the LOCAL build
// (pack-tear pattern: game code served from the demo tree on a fake game.local
// origin, CDP screenshots). The passport is seeded through the game's own
// storage key (PASSPORT_KEY, where-on-earth-passport-v1) in the store's v2 shape.
// usage: node shots/postcard-flip-fix/postcard-flip-fix.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = '/home/hatch/workspace/map-game/demo';
const OUT = `${ROOT}/shots/postcard-flip-fix/`;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = '/tmp/postcard-flip-fix-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const b = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hatch-webgl-allowed-domains-file=' + domainsFile, '--hatch-webgl-allowed-domains-sha256=' + domainsSha256] });

const DAY = (s) => new Date(`${s}T12:00:00`).getTime();
// Earned: Santorini, pinpoint (d 3 km < 5), tier history Oct 2 / 14 / 29.
// Unearned: Kyoto, visited but 640 km off, so it stays seen (no e, no ea).
const SEED = {
  v: 2,
  visits: { 'kyoto-japan': 310, 'santorini-gr': 996 },
  order: ['kyoto-japan', 'santorini-gr'],
  meta: {
    'santorini-gr': { b: 996, d: 3, f: '2026-10-02', t: DAY('2026-10-29'), e: 3, ea: DAY('2026-10-02'), eb1: DAY('2026-10-02'), eb2: DAY('2026-10-14'), eb3: DAY('2026-10-29') },
    'kyoto-japan': { b: 310, d: 640, f: '2026-10-20', t: DAY('2026-10-20') },
  },
};
// Headless Chromium here cannot reach Wikimedia, so the two seeded places'
// thumbnails are served from local copies of the same files: Santorini from
// the mockup folder, Kyoto downloaded with curl from its locations.json URL.
const LOCAL_PHOTOS = {
  'Santorini_Fira3_tango7174.jpg': `${ROOT}/shots/postcard-flip/santorini.jpg`,
  'Kyoto%2C_Japan_%2849667780482%29.jpg': `${ROOT}/shots/postcard-detail/kyoto.jpg`,
};

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
  await p.addInitScript((seed) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('where-on-earth-passport-v1', JSON.stringify(seed));
      sessionStorage.setItem('seeded', '1');
    }
  }, SEED);
  const net = { local: [], images: [] };
  await p.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === 'game.local') {
      const path = u.pathname.replace(/^\//, '') || 'index.html';
      if (path === 'assets/version.txt') return r.fulfill({ status: 404, body: '' });
      try { return r.fulfill({ body: fs.readFileSync(`${ROOT}/${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } }); }
      catch { return r.fulfill({ status: 404, body: 'nf' }); }
    }
    const local = u.hostname.includes('wikimedia') && Object.keys(LOCAL_PHOTOS).find((f) => u.pathname.endsWith(f));
    if (local) {
      net.local.push(local);
      return r.fulfill({ body: fs.readFileSync(LOCAL_PHOTOS[local]), contentType: 'image/jpeg' });
    }
    if (u.hostname === 'tiles.where-on.earth') return r.abort();
    return r.continue();
  });
  p.on('requestfinished', async (req) => { if (req.resourceType() === 'image' && req.url().includes('wikimedia')) net.images.push(`${(await req.response())?.status()} ${req.url().split('/').pop()}`); });
  p.on('requestfailed', (req) => { if (req.url().includes('wikimedia')) net.images.push(`FAILED ${req.url().split('/').pop()}`); });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('https://game.local/index.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  // The home Passport summary card is the Passport button (passportEntry stays unappended).
  await p.waitForFunction(() => window.__game && !document.getElementById('play-button').disabled && !document.querySelector('.passport-entry')?.disabled, null, { timeout: 90000 });
  await p.waitForFunction(() => { const e = document.querySelector('.passport'); return e && !e.hidden && e.getBoundingClientRect().height > 0; }, null, { timeout: 30000 });
  await p.evaluate(() => { window.__skipGL = true; });
  await p.evaluate(() => document.querySelector('.passport').click());
  await p.waitForSelector('.passport-screen:not([hidden]) .pp-slot[role="button"]', { state: 'attached', timeout: 15000 });
  await p.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(p);
  const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(r.data, 'base64')); };
  const settle = async () => {
    await p.waitForTimeout(150);
    await p.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect?.target?.closest?.('.ppd')), null, { timeout: 15000, polling: 100 });
    await p.waitForTimeout(750); // CSS flip transition (.6s) is not a WAAPI animation
  };
  const open = async (name) => {
    await p.evaluate((n) => {
      const slot = [...document.querySelectorAll('.pp-slot[role="button"]')].find((el) => el.querySelector('.pp-slot-name')?.textContent === n);
      slot.scrollIntoView({ block: 'center' });
      slot.click();
    }, name);
    await settle();
    await p.waitForFunction(() => [...document.querySelectorAll('.ppd img')].every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(200);
  };
  const state = () => p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const flip = q('.ppd-flip');
    const r = flip.getBoundingClientRect();
    const shown = (el) => el && !el.hidden && getComputedStyle(el).display !== 'none';
    return {
      flipped: flip.classList.contains('is-flipped'),
      rect: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
      innerTransform: getComputedStyle(q('.ppd-flip-inner')).transform,
      frontVisibility: getComputedStyle(q('.ppd-face-front')).visibility,
      backVisibility: getComputedStyle(q('.ppd-face-back')).visibility,
      earn: q('.ppd-card').dataset.earn,
      caption: [q('#ppd-title').textContent, q('[data-ppd="country"]').textContent],
      fact: q('.ppd-fact').textContent,
      addr: [q('.ppd-addr-name').textContent, q('.ppd-addr-country').textContent],
      postmark: shown(q('.ppd-postmark')) ? q('.ppd-postmark').innerText.replace(/\n/g, ' ') : null,
      history: shown(q('.ppd-history')) ? [...document.querySelectorAll('.ppd-history-row')].map((d) => d.innerText.replace(/\n/g, ' ')) : [],
      stats: q('.ppd-stats').innerText.replace(/\n/g, ' '),
      factOverflow: q('.ppd-fact').scrollHeight > q('.ppd-fact').clientHeight,
      rightOverflow: q('.ppd-right').scrollHeight > q('.ppd-right').clientHeight + 1,
      docScrollW: document.documentElement.scrollWidth,
      ppdScrollW: q('.ppd').scrollWidth,
      ppdClientW: q('.ppd').clientWidth,
      focus: document.activeElement?.className,
    };
  });
  return { p, ctx, errs, net, shot, settle, open, state };
}

const report = {};
{
  const { p, ctx, errs, net, shot, settle, open, state } = await openPage('no-preference');
  report.storedSeed = await p.evaluate(() => JSON.parse(localStorage.getItem('where-on-earth-passport-v1')));
  await open('Santorini');
  report.earnedFront = await state();
  await shot('a-earned-front.png');
  // Tap the card: 3D flip to the back.
  const fr = await p.evaluate(() => { const r = document.querySelector('.ppd-flip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(fr.x, fr.y);
  await p.waitForTimeout(150);
  report.beforeMidpoint = await state();
  await p.waitForTimeout(100);
  report.afterMidpoint = await state();
  await settle();
  report.earnedBack = await state();
  await shot('b-earned-back.png');
  // Tap again flips back to the front.
  await p.mouse.click(fr.x, fr.y);
  await settle();
  report.tapBackToFront = (await state()).flipped === false;
  // Keyboard: Tab from close lands on the card; Enter and Space flip it.
  await p.focus('.ppd-close');
  await p.keyboard.press('Tab');
  report.tabFocus = await p.evaluate(() => document.activeElement.className);
  await p.keyboard.press('Enter'); await settle();
  report.enterFlipped = (await state()).flipped;
  await p.keyboard.press(' '); await settle();
  report.spaceFlippedBack = !(await state()).flipped;
  // Close behaviour unchanged: Escape closes the detail, passport stays open.
  await p.keyboard.press('Escape'); await settle();
  report.afterEscape = await p.evaluate(() => ({ ppdHidden: document.querySelector('.ppd').hidden, passportOpen: !document.querySelector('.passport-screen')?.hidden, lifted: document.querySelectorAll('.pp-lifted').length }));
  await open('Kyoto');
  await p.evaluate(() => document.querySelector('.ppd-flip').click());
  await settle();
  report.unearnedBack = await state();
  await shot('c-unearned-back.png');
  // Seen front keeps its grayscale treatment.
  await p.evaluate(() => document.querySelector('.ppd-flip').click());
  await settle();
  report.unearnedFrontFilter = await p.evaluate(() => getComputedStyle(document.querySelector('.ppd-face-front .pp-photo img')).filter);
  await shot('e-unearned-front.png');
  await p.evaluate(() => document.querySelector('.ppd-flip').click());
  await settle();
  // Left on its back, closed by the scrim, then reopened: it opens on the front.
  await p.evaluate(() => document.querySelector('.ppd-flip').click());
  await settle();
  await p.evaluate(() => document.querySelector('.ppd-scrim').click()); await settle();
  report.afterScrim = await p.evaluate(() => document.querySelector('.ppd').hidden);
  await open('Kyoto');
  report.reopened = await state();
  await p.keyboard.press('Escape'); await settle();
  report.net = net;
  report.errs = errs;
  await ctx.close();
}
{
  // Reduced motion: no 3D rotation, and the faces swap immediately.
  const { p, ctx, errs, settle, open, state, shot } = await openPage('reduce');
  await open('Santorini');
  await p.evaluate(() => document.querySelector('.ppd-flip').click());
  await settle();
  report.reduced = { ...(await state()), backOpacity: await p.evaluate(() => getComputedStyle(document.querySelector('.ppd-face-back')).opacity), frontOpacity: await p.evaluate(() => getComputedStyle(document.querySelector('.ppd-face-front')).opacity) };
  await shot('d-reduced-motion-back.png');
  report.reducedErrs = errs;
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
