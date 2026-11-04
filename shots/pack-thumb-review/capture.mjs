// Pack-thumbnail tier review capture (read-only review, 2026-11-03).
// Seeds the capitals dex with two cards per state (seen / near / bullseye /
// pinpoint), captures the grid at 390px, measures the km stamp, and captures
// a pinpoint and a near postcard back. Run from the demo root:
//   node shots/pack-thumb-review/capture.mjs
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PACK_CAPITAL_IDS } from '../../src/meta/pack-capitals.js';

const ROOT = '/home/hatch/workspace/map-game/demo/';
const OUT = `${ROOT}shots/pack-thumb-review/`;
const CACHE = `${OUT}.img-cache/`;
fs.mkdirSync(CACHE, { recursive: true });
const cities = JSON.parse(fs.readFileSync(`${ROOT}assets/locations.json`, 'utf8'));
const capitals = cities.filter((item) => PACK_CAPITAL_IDS.has(item.id) && item.image);

// state -> [earned, km]
const PLAN = [
  ['seen', 0, 420], ['near', 1, 87], ['bullseye', 2, 12], ['pinpoint', 3, 2.4],
  ['seen', 0, 1260], ['near', 1, 141], ['bullseye', 2, 21], ['pinpoint', 3, 0.6],
];
const seeds = PLAN.map(([state, e, d], i) => ({ id: capitals[i * 3].id, short: capitals[i * 3].short, state, e, d }));

const domainsFile = `${CACHE}webgl-domains.txt`;
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await context.newPage();
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'cdn.jsdelivr.net') {
    const cached = `/home/hatch/workspace/map-game/shots/cdn/${url.pathname.split('/').pop()}`;
    return fs.existsSync(cached) ? route.fulfill({ body: fs.readFileSync(cached), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }) : route.abort();
  }
  if (url.hostname.includes('wikimedia')) {
    const file = CACHE + crypto.createHash('sha1').update(url.href).digest('hex');
    try {
      if (!fs.existsSync(file)) execFileSync('curl', ['-sfL', '--max-time', '20', '-A', 'Mozilla/5.0', '-o', file, url.href.replace('thumb.wikimedia.org', 'upload.wikimedia.org')]);
      return route.fulfill({ body: fs.readFileSync(file), contentType: 'image/jpeg' });
    } catch { return route.abort(); }
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = url.pathname.replace(/^\//, '') || 'index.html';
  try { return route.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.addInitScript((list) => {
  const visits = {}; const meta = {}; const order = [];
  const day = 86400000; const now = Date.now();
  list.forEach(({ id, e, d }, i) => {
    visits[id] = 900 - i * 20;
    const m = { b: visits[id], d, f: '2026-10-1' + (i % 9), t: now - i * 1000 };
    if (e) { m.e = e; m.ea = now - 9 * day; m.eb1 = now - 9 * day; }
    if (e >= 2) m.eb2 = now - 4 * day;
    if (e >= 3) m.eb3 = now - day;
    meta[id] = m;
    order.push(id);
  });
  localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ v: 2, visits, meta, order }));
}, seeds);

await page.goto('https://game.local/index.html?home=recs');
await page.waitForFunction(() => !document.querySelector('.passport')?.hidden && !document.getElementById('pack-button')?.disabled, null, { timeout: 45000 });
await page.click('.passport');
await page.waitForSelector('.pp-pack-section');
await page.click('[data-pack="capitals"] .pp-pack-head');
await page.waitForTimeout(800);

// Scroll so the first seeded card is near the top, then let images settle.
await page.evaluate(() => {
  const first = document.querySelector('[data-pack="capitals"] .pp-slot:not(.pp-unvisited)');
  first?.scrollIntoView({ block: 'start' });
  window.scrollBy?.(0, -60);
});
await page.waitForTimeout(2500);

const measure = await page.evaluate((list) => {
  const px = (n) => Math.round(n * 10) / 10;
  const out = [];
  for (const slot of document.querySelectorAll('[data-pack="capitals"] .pp-slot:not(.pp-unvisited)')) {
    const name = slot.querySelector('.pp-slot-name')?.textContent;
    const seed = list.find((s) => s.short === name);
    const score = slot.querySelector('.pp-slot-score');
    const photo = slot.querySelector('.pp-slot-photo');
    const cs = score ? getComputedStyle(score) : null;
    const range = document.createRange();
    if (score) range.selectNodeContents(score);
    const tr = score ? range.getBoundingClientRect() : null;
    const slotCs = getComputedStyle(slot);
    out.push({
      name, state: seed?.state, km: seed?.d,
      classes: slot.className, dataEarn: slot.dataset.earn,
      slot: px(slot.getBoundingClientRect().width) + 'x' + px(slot.getBoundingClientRect().height),
      photo: px(photo.getBoundingClientRect().width) + 'x' + px(photo.getBoundingClientRect().height),
      slotBorder: slotCs.border, slotShadow: slotCs.boxShadow, slotBg: slotCs.backgroundImage.slice(0, 60),
      photoBorder: getComputedStyle(photo).border, imgFilter: slot.querySelector('img') ? getComputedStyle(slot.querySelector('img')).filter : 'no img',
      stamp: score ? { text: score.textContent, tier: score.dataset.tier, box: px(score.getBoundingClientRect().width) + 'x' + px(score.getBoundingClientRect().height), fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, border: cs.borderColor, bg: cs.backgroundColor, textBox: px(tr.width) + 'x' + px(tr.height) } : null,
    });
  }
  return out;
}, seeds);
fs.writeFileSync(`${OUT}measurements.json`, JSON.stringify({ seeds, measure }, null, 2));

const grid = page.locator('[data-pack="capitals"] .pp-pack-grid');
await page.screenshot({ path: `${OUT}01-dex-grid-390.png` });
// Element crop of just the seeded rows, for a closer look at thumbnail scale.
const box = await page.evaluate(() => {
  const slots = [...document.querySelectorAll('[data-pack="capitals"] .pp-slot:not(.pp-unvisited)')];
  const rs = slots.map((s) => s.getBoundingClientRect());
  const top = Math.min(...rs.map((r) => r.top)); const bottom = Math.max(...rs.map((r) => r.bottom));
  return { x: 0, y: Math.max(0, top - 10), width: 390, height: Math.min(844, bottom - top + 20) };
});
await page.screenshot({ path: `${OUT}02-dex-seeded-rows-390.png`, clip: box });

async function openBack(state, file) {
  const seed = seeds.find((s) => s.state === state);
  const slot = page.locator('[data-pack="capitals"] .pp-slot', { has: page.locator('.pp-slot-name', { hasText: seed.short }) }).first();
  await slot.scrollIntoViewIfNeeded();
  await slot.click();
  await page.waitForSelector('.ppd:not([hidden])');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${file}-front.png` });
  await page.click('[data-ppd="flip"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${file}-back.png` });
  const back = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const pm = q('[data-ppd="postmark"]'); const st = q('[data-ppd="stats"]');
    const num = st.querySelector('.ppd-stat-num');
    return {
      postmark: { text: pm.innerText, hidden: pm.hidden, tier: pm.dataset.tier, fontSize: getComputedStyle(pm).fontSize, box: pm.getBoundingClientRect().width },
      stats: { text: st.innerText, fontSize: getComputedStyle(st).fontSize, numFontSize: num ? getComputedStyle(num).fontSize : null },
      history: q('[data-ppd="history"]').innerText,
      card: q('[data-ppd="card"]').className,
    };
  });
  await page.click('[data-ppd="close"]');
  await page.waitForTimeout(900);
  return back;
}
const backs = { pinpoint: await openBack('pinpoint', '03-pinpoint'), near: await openBack('near', '04-near') };
fs.writeFileSync(`${OUT}measurements.json`, JSON.stringify({ seeds, measure, backs }, null, 2));
console.log(JSON.stringify({ measure, backs }, null, 2));
await browser.close();
