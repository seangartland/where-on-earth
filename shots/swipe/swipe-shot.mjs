// Copy of ~/workspace/map-game/shots/passport/swipe-shot.mjs, kept with its
// screenshots. Run it from that directory (playwright is installed there):
//   cd ~/workspace/map-game/shots/passport && node swipe-shot.mjs

// Passport postcard swipe (docs/expeditions-rethink-opus.md, Proposal 1).
// 390px touch viewport, pp-shot pattern. Every entry point is reached with a
// real click from the home screen; swipes are CDP touch events. Screenshots go
// to demo/shots/swipe/. Prints one JSON object with every check.
import { chromium } from 'playwright';
import fs from 'node:fs';
const DEMO = '/home/hatch/workspace/map-game/demo/';
const out = DEMO + 'shots/swipe/';
fs.mkdirSync(out, { recursive: true });
const cities = JSON.parse(fs.readFileSync(DEMO + 'assets/locations.json', 'utf8'));
const expeditions = JSON.parse(fs.readFileSync(DEMO + 'assets/expeditions.json', 'utf8'));
const isCity = new Set(cities.map((x) => x.id));
const landmarkStops = [...new Set(expeditions.flatMap((e) => e.locationIds).filter((id) => !isCity.has(id)))];

const b = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain', svg: 'image/svg+xml' };
await p.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === 'cdn.jsdelivr.net') { try { return r.fulfill({ body: fs.readFileSync('/home/hatch/workspace/map-game/shots/cdn/' + u.pathname.split('/').pop()), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }); } catch { return r.continue(); } }
  if (u.hostname.includes('wikimedia')) return r.fulfill({ body: fs.readFileSync(DEMO + 'assets/og.png'), contentType: 'image/png' });
  if (u.hostname !== 'game.local') return r.fulfill({ status: 404, body: 'offline' });
  const path = u.pathname.replace(/^\//, '') || 'index.html';
  try { r.fulfill({ body: fs.readFileSync(DEMO + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { r.fulfill({ status: 404, body: 'nf' }); }
});
const cdp = await ctx.newCDPSession(p);
const shots = [];
const settled = () => p.waitForFunction(() => document.querySelector('.ppd-card').getAnimations().length === 0, null, { timeout: 30000 });
const shot = async (name) => { await settled(); await wait(1500); const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + name, Buffer.from(r.data, 'base64')); shots.push('shots/swipe/' + name); };
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
const wait = (ms) => p.waitForTimeout(ms);
const checks = {};
const res = {};
process.on('uncaughtException', (e) => { console.log(JSON.stringify({ error: e.message.split('\n')[0], res, checks, errs }, null, 1)); process.exit(1); });

// swiftshader blocks the main thread for seconds per frame, so every CDP step
// carries an explicit timestamp: the page sees a gesture of exactly `ms`.
async function touchSwipe(x0, y0, x1, y1, ms = 220, steps = 8) {
  await settled();
  const t0 = Date.now() / 1000;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }], timestamp: t0 });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }], timestamp: t0 + (ms / 1000) * i / steps });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + ms / 1000 });
  await wait(400);
}
async function mouseSwipe(x0, y0, x1, y1, ms = 220, steps = 6) {
  await settled();
  const t0 = Date.now() / 1000;
  const ev = (type, x, y, t, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, timestamp: t, ...extra });
  await ev('mousePressed', x0, y0, t0);
  for (let i = 1; i <= steps; i++) await ev('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, t0 + (ms / 1000) * i / steps);
  await ev('mouseReleased', x1, y1, t0 + ms / 1000);
  await wait(600);
}
// A point on the card body, clear of every button: the place name.
const bodyPoint = async () => { await settled(); return p.evaluate(() => { const r = document.querySelector('.ppd-body h3').getBoundingClientRect(); return { y: r.top + r.height / 2 }; }); };
const swipeLeft = async () => { const { y } = await bodyPoint(); await touchSwipe(300, y, 120, y + 10); };
const swipeRight = async () => { const { y } = await bodyPoint(); await touchSwipe(120, y, 300, y + 10); };
// The open card's state, the lifted tile, and the shown openable tiles of the list it came from.
const state = () => p.evaluate(() => {
  const strip = (s) => (s || '').replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0020}-\u{E007F}]/gu, '').trim();
  const screen = document.querySelector('.ppd');
  const lifted = document.querySelector('.pp-lifted');
  const tileName = (el) => strip(el?.querySelector('.pp-slot-name, .pp-name, .collection-card-name')?.textContent);
  const root = lifted?.closest('[data-pp-list]');
  const shownTiles = root ? [...root.querySelectorAll('[aria-haspopup="dialog"]')].filter((el) => !el.closest('[hidden]')) : [];
  return {
    open: !screen.hidden,
    name: strip(document.querySelector('#ppd-title').textContent),
    pos: document.querySelector('.ppd-pos').hidden ? null : document.querySelector('.ppd-pos').textContent,
    lifted: tileName(lifted),
    liftedIndex: shownTiles.indexOf(lifted),
    shown: shownTiles.length,
    names: shownTiles.slice(0, 4).map(tileName),
  };
});
// Close, freeze the card's close animation at its last frame, and compare it to the tile it lands on.
async function closeAndLand(label) {
  const before = await state();
  await settled();
  await p.click('.ppd-close');
  const land = await p.evaluate(() => {
    const card = document.querySelector('.ppd-card');
    const anim = card.getAnimations()[0];
    const tile = document.querySelector('.pp-lifted');
    if (!anim || !tile) return { anim: Boolean(anim), tile: Boolean(tile) };
    anim.pause();
    anim.currentTime = anim.effect.getTiming().duration - 0.01;
    const c = card.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    anim.play();
    return { flip: Boolean(anim.effect.getKeyframes().some((k) => /scale/.test(k.transform || ''))), dx: Math.round(c.left - t.left), dy: Math.round(c.top - t.top), dw: Math.round(c.width - t.width), tileInView: t.top >= 0 && t.bottom <= innerHeight };
  });
  await p.waitForFunction(() => document.querySelector('.ppd').hidden, null, { timeout: 30000 });
  const after = await p.evaluate(() => {
    const strip = (s) => (s || '').replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3F4}\u{E0020}-\u{E007F}]/gu, '').trim();
    const a = document.activeElement;
    return { open: !document.querySelector('.ppd').hidden, focused: strip(a?.querySelector('.pp-slot-name, .pp-name, .collection-card-name')?.textContent) };
  });
  res[label + 'Close'] = { before, land, after };
  checks[label + 'CloseLands'] = !after.open && land.flip === true && Math.abs(land.dx) <= 2 && Math.abs(land.dy) <= 2 && Math.abs(land.dw) <= 2 && land.tileInView && after.focused === before.name;
}
// Real tap on the first openable tile of a list, scrolled into view the way a player would.
async function openFirst(rootSel) {
  const tile = p.locator(`${rootSel} [aria-haspopup="dialog"]`).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  await p.waitForFunction(() => !document.querySelector('.ppd').hidden);
  await settled();
}
// Is a control reachable: scrolled to the way a player would, visible, and
// the topmost element at its centre.
const reachable = async (sel) => { await p.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); return p.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return el === hit || el.contains(hit);
}, sel); };

// Seed: 60 visited cities (40 earned), and every landmark stop visited.
await p.goto('https://game.local/index.html');
await p.evaluate(({ cityIds, lmIds }) => {
  const visits = {}, order = [], meta = {};
  cityIds.forEach((id, i) => { visits[id] = 40 + (i * 7) % 60; order.push(id); meta[id] = { b: 40 + (i * 7) % 60, d: 20 + i * 37, f: '2026-10-0' + (1 + i % 5), t: Date.now() - (60 - i) * 1000, ...(i < 40 ? { e: 1 + (i % 3), ea: Date.now() - i * 1000 } : {}) }; });
  lmIds.forEach((id, i) => { visits[id] = 90; order.push(id); meta[id] = { b: 90, d: 30 + i, f: '2026-10-10', t: Date.now(), e: 1, ea: Date.now() }; });
  localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ v: 1, visits, order, meta }));
}, { cityIds: cities.slice(0, 60).map((c) => c.id), lmIds: landmarkStops });
await p.goto('https://game.local/index.html');
await p.waitForFunction(() => window.__game && !document.getElementById('play-button').disabled && !document.querySelector('.passport-entry')?.disabled, null, { timeout: 60000 });
await wait(1500);
res.home = await p.evaluate(() => document.body.className);
checks.homeReachable = /game-start/.test(res.home) && await reachable('#play-button') && await reachable('.passport-entry');
await shot('01-home.png');

// 1. Places dex.
await p.click('.passport-entry');
await wait(1500);
checks.placesTabReachable = await reachable('.pp-tabs [data-view="places"]');
await p.click('.pp-tabs [data-view="places"]');
await wait(500);
await openFirst('[data-pp="dex"]');
res.placesOpen = await state();
await shot('02-places-open.png');
await swipeLeft();
res.placesNext = await state();
await shot('03-places-swiped.png');
await swipeRight();
res.placesBack = await state();
await swipeRight(); // first card: nudge, no wrap
res.placesStart = await state();
await p.keyboard.press('ArrowRight');
await wait(260);
res.placesArrow = await state();
{ const { y } = await bodyPoint(); await touchSwipe(200, y + 100, 240, y - 100); } // vertical drag
res.placesVertical = await state();
{ const { y } = await bodyPoint(); await touchSwipe(10, y, 200, y); } // starts in the 20px edge
res.placesEdge = await state();
await p.click('.ppd-nav[data-dir="1"]');
await wait(260);
res.placesChevron = await state();
// Mouse swipe released over the scrim gutter: must advance, not close.
{ const { y } = await bodyPoint(); await mouseSwipe(300, y, 5, y + 20); }
res.placesScrimRelease = await state();
const placesTotal = res.placesOpen.shown;
checks.placesCounter = res.placesOpen.pos === `1 of ${placesTotal}` && placesTotal > 2;
checks.placesSwipe = res.placesNext.pos === `2 of ${placesTotal}` && res.placesNext.name === res.placesOpen.names[1] && res.placesNext.lifted === res.placesNext.name;
checks.placesBack = res.placesBack.pos === `1 of ${placesTotal}` && res.placesBack.name === res.placesOpen.name;
checks.placesNoWrap = res.placesStart.pos === `1 of ${placesTotal}` && res.placesStart.open;
checks.placesArrowKey = res.placesArrow.pos === `2 of ${placesTotal}`;
checks.placesVerticalIgnored = res.placesVertical.pos === `2 of ${placesTotal}`;
checks.placesEdgeIgnored = res.placesEdge.pos === `2 of ${placesTotal}`;
checks.placesChevron = res.placesChevron.pos === `3 of ${placesTotal}`;
checks.placesScrimSwallowed = res.placesScrimRelease.open && res.placesScrimRelease.pos === `4 of ${placesTotal}`;
// Filter while open. The scrim covers the filter controls, so a player cannot
// reach them with a card open; the change is driven by script here to prove
// the list is read fresh on every swipe.
res.origSort = await p.evaluate(() => document.querySelector('[data-pp="sort"]').value);
await p.evaluate(() => { const s = document.querySelector('[data-pp="band"]'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); });
await wait(300);
res.filterBand = await p.evaluate(() => document.querySelector('[data-pp="band"]').value);
await swipeLeft();
res.placesFiltered = await state();
await shot('04-places-filtered-swipe.png');
checks.placesFilterRespected = res.placesFiltered.shown < placesTotal && res.placesFiltered.liftedIndex >= 0 && res.placesFiltered.pos === `${res.placesFiltered.liftedIndex + 1} of ${res.placesFiltered.shown}`;
// Re-sort while open: tiles are rebuilt; the next swipe and the close must follow the new tiles.
await p.evaluate(() => { const s = document.querySelector('[data-pp="sort"]'); s.value = 'name'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await wait(400);
await swipeLeft();
res.placesResorted = await state();
checks.placesResortRespected = res.placesResorted.liftedIndex >= 0 && res.placesResorted.lifted === res.placesResorted.name && res.placesResorted.pos === `${res.placesResorted.liftedIndex + 1} of ${res.placesResorted.shown}`;
await closeAndLand('places');
await shot('05-places-closed.png');
// Put the filters back the way a player would find them.
await p.evaluate((orig) => { const b = document.querySelector('[data-pp="band"]'); b.value = ''; b.dispatchEvent(new Event('change', { bubbles: true })); const s = document.querySelector('[data-pp="sort"]'); s.value = orig; s.dispatchEvent(new Event('change', { bubbles: true })); }, res.origSort);
await wait(300);

// 2. Country detail: the country with the most places visited.
checks.countriesTabReachable = await reachable('.pp-tabs [data-view="countries"]');
await p.click('.pp-tabs [data-view="countries"]');
await wait(800);
const countryIdx = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.pp-ccard button')];
  let best = 0, bestN = -1;
  cards.forEach((c, i) => { const n = Number(c.querySelector('.pp-ccard-sub').textContent.split('/')[0]); if (n > bestN) { bestN = n; best = i; } });
  return best;
});
const countryBtn = p.locator('.pp-ccard button').nth(countryIdx);
await countryBtn.scrollIntoViewIfNeeded();
await countryBtn.click();
await wait(600);
await openFirst('[data-pp="country-dex"]');
res.countryOpen = await state();
await swipeLeft();
res.countryNext = await state();
await shot('06-country-swiped.png');
checks.countrySwipe = res.countryOpen.shown >= 2 && res.countryOpen.pos === `1 of ${res.countryOpen.shown}` && res.countryNext.pos === `2 of ${res.countryOpen.shown}` && res.countryNext.name === res.countryOpen.names[1];
await closeAndLand('country');

// 3. Landmarks shelf.
checks.landmarksTabReachable = await reachable('.pp-tabs [data-view="landmarks"]');
await p.click('.pp-tabs [data-view="landmarks"]');
await wait(800);
await openFirst('[data-pp="landmark-dex"]');
res.landmarkOpen = await state();
await swipeLeft();
res.landmarkNext = await state();
await shot('07-landmarks-swiped.png');
checks.landmarkSwipe = res.landmarkOpen.shown >= 2 && res.landmarkOpen.pos === `1 of ${res.landmarkOpen.shown}` && res.landmarkNext.pos === `2 of ${res.landmarkOpen.shown}` && res.landmarkNext.name === res.landmarkOpen.names[1];
// Reduced motion: no slide on the card.
await p.emulateMedia({ reducedMotion: 'reduce' });
await swipeLeft();
res.landmarkReduced = await p.evaluate(() => ({ anims: document.querySelector('.ppd-card').getAnimations().length, pos: document.querySelector('.ppd-pos').textContent }));
await p.emulateMedia({ reducedMotion: 'no-preference' });
checks.reducedMotionNoSlide = res.landmarkReduced.anims === 0 && res.landmarkReduced.pos === `3 of ${res.landmarkOpen.shown}`;
await closeAndLand('landmark');
await p.click('.pp-tabs [data-view="places"]'); // leave the saved view on places
await p.click('.passport-screen .stats-close');
await wait(600);
res.backHome = await p.evaluate(() => document.body.className);
checks.backHome = /game-start/.test(res.backHome) && await reachable('#play-button');

// 4. End-of-run haul: play today's Daily, every guess on the answer.
await p.click('#play-button');
await p.waitForFunction(() => document.body.classList.contains('game-round'), null, { timeout: 20000 });
await p.evaluate(() => { window.__travelAnim = false; });
for (let i = 0; i < 5; i++) {
  await p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 15000 });
  const a = await p.evaluate(async () => { const id = window.__game.state.item; const locs = await (await fetch('assets/locations.json')).json(); const it = locs.find((l) => l.id === id); return { lat: it.lat, lng: it.lng }; });
  await p.evaluate(({ lat, lng }) => window.__game.guess(lat + 0.001, lng + 0.001), a);
  await p.waitForFunction(() => !document.getElementById('reveal-card').hidden, null, { timeout: 30000 });
  await wait(3200);
  await p.click('#next-button');
}
await p.waitForFunction(() => !document.getElementById('postcard-summary-screen').hidden, null, { timeout: 15000 });
await wait(800);
await shot('08-haul.png');
await openFirst('#breakdown');
res.haulOpen = await state();
await swipeLeft();
res.haulNext = await state();
await shot('09-haul-swiped.png');
checks.haulSwipe = res.haulOpen.shown >= 2 && res.haulOpen.pos === `1 of ${res.haulOpen.shown}` && res.haulNext.pos === `2 of ${res.haulOpen.shown}` && res.haulNext.name === res.haulOpen.names[1];
await closeAndLand('haul');
checks.haulContinueReachable = await reachable('#postcard-summary-continue');
await p.click('#postcard-summary-continue');
await p.waitForFunction(() => window.__game.state.mode === 'results', null, { timeout: 10000 });
checks.resultsReached = true;

res.errs = errs;
checks.noErrors = errs.length === 0;
res.shots = shots;
res.checks = checks;
res.allPass = Object.values(checks).every(Boolean);
console.log(JSON.stringify(res, null, 1));
await b.close();
process.exit(res.allPass ? 0 : 1);
