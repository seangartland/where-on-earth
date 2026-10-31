import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const ROOT = '/home/hatch/workspace/map-game/woe-home-bundle/';
const OUT = ROOT + 'shots-home-bundle/';
const SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2' };

const b = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks', '--hatch-webgl-allowed-domains-file=/tmp/woe-webgl/domains.txt', `--hatch-webgl-allowed-domains-sha256=${SHA}`] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === 'cdn.jsdelivr.net') { try { return r.fulfill({ body: fs.readFileSync('/home/hatch/workspace/map-game/shots/cdn/' + u.pathname.split('/').pop()), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }); } catch { return r.continue(); } }
  if (u.hostname.includes('wikimedia')) return r.fulfill({ body: fs.readFileSync('/home/hatch/workspace/map-game/demo/assets/og.png'), contentType: 'image/png' });
  if (u.hostname !== 'game.local') return r.continue();
  const path = u.pathname.replace(/^\//, '') || 'index.html';
  if (path.includes('version.txt')) return r.fulfill({ status: 404, body: 'nf' });
  try { r.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { r.fulfill({ status: 404, body: 'nf' }); }
});
const cdp = await p.context().newCDPSession(p);
const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(r.data, 'base64')); };
const errs = []; p.on('pageerror', (e) => errs.push(e.message));

const ready = async () => {
  await p.waitForFunction(() => {
    const play = document.getElementById('play-button');
    const pack = document.getElementById('pack-button');
    return play && !play.disabled && pack && !pack.disabled;
  }, null, { timeout: 45000 });
  await p.waitForTimeout(1200);
};

// (b) first run: nothing seeded.
await p.goto('https://game.local/index.html');
await ready();
await shot('home-first-run.png');
const firstRun = await p.evaluate(() => ({
  passportHidden: document.querySelector('.passport')?.hidden,
  titleH: document.querySelector('h1').getBoundingClientRect().height,
  dailyDesc: document.querySelector('#play-button .mode-desc').textContent,
  playGold: document.getElementById('play-button').classList.contains('is-gold'),
  packGold: document.getElementById('pack-button').classList.contains('is-gold'),
  expName: document.querySelector('#expeditions-button .mode-name').textContent,
  expPending: document.getElementById('expeditions-button').classList.contains('entry-pending'),
  credits: Boolean(document.querySelector('.home-credits')),
  pvpHidden: document.getElementById('pvp-button').hidden,
}));

// Seed a returning player: passport with postcards + a 20 day streak.
await p.evaluate(async () => {
  const locs = await (await fetch('assets/locations.json')).json();
  const visits = {}, order = [], meta = {};
  locs.slice(0, 30).forEach((l, i) => { visits[l.id] = 500 + i * 10; order.push(l.id); if (i < 12) meta[l.id] = { e: 2, b: 800, f: '2026-10-20' }; });
  localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ v: 1, visits, order, meta }));
  localStorage.setItem('where-on-earth-streak-v1', JSON.stringify({ count: 20, last: new Date().toISOString().slice(0, 10) }));
});

// (a)+(c) returning: Daily played, 1 pack available. Packs should be gold,
// Daily the slim done row, Passport below the buttons.
await p.evaluate(async () => {
  const locs = await (await fetch('assets/locations.json')).json();
  const today = new Date(); const key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const ids = locs.slice(0, 5).map((l) => l.id);
  localStorage.setItem('where-on-earth-v1', JSON.stringify({ date: key, ids, round: 4, results: ids.map(() => ({ score: 900 })), complete: true }));
  localStorage.setItem('where-on-earth-pack-v1', JSON.stringify({ skips: 23, skipCredit: 0, stamina: { stored: 1, nextAt: Date.now() + (7 * 3600 + 23 * 60) * 1000 }, byType: { capitals: null, landmarks: null, landforms: null } }));
});
await p.goto('https://game.local/index.html');
await ready();
await shot('home-returning-gold.png');
const returning = await p.evaluate(() => {
  const order = [...document.querySelectorAll('#start-screen > *')].map((e) => e.className || e.id || e.tagName);
  return {
    order,
    playGold: document.getElementById('play-button').classList.contains('is-gold'),
    packGold: document.getElementById('pack-button').classList.contains('is-gold'),
    dailyDone: document.getElementById('play-button').classList.contains('daily-done'),
    dailyName: document.querySelector('#play-button .mode-name').textContent,
    dailyDesc: document.querySelector('#play-button .mode-desc').textContent,
    dailyH: document.getElementById('play-button').getBoundingClientRect().height,
    packH: document.getElementById('pack-button').getBoundingClientRect().height,
    packDesc: document.querySelector('#pack-button .mode-desc').textContent,
    packBarW: document.querySelector('.pack-home-bar i').style.width,
    count: document.querySelector('.passport-count').textContent.trim(),
    postmark: document.querySelector('[data-passport="postmark"]').textContent,
    cue: document.querySelector('.passport-cue').textContent,
    titleH: document.querySelector('h1').getBoundingClientRect().height,
    passportW: document.querySelector('.passport').getBoundingClientRect().width,
    gridW: document.querySelector('.mode-buttons').getBoundingClientRect().width,
  };
});

// Extra state: Daily played, no pack available. Nothing should be gold.
await p.evaluate(() => {
  localStorage.setItem('where-on-earth-pack-v1', JSON.stringify({ skips: 3, skipCredit: 0, stamina: { stored: 0, nextAt: Date.now() + 5 * 3600 * 1000 }, byType: { capitals: null, landmarks: null, landforms: null } }));
});
await p.goto('https://game.local/index.html');
await ready();
await shot('home-played-nopack.png');
const noPack = await p.evaluate(() => ({
  playGold: document.getElementById('play-button').classList.contains('is-gold'),
  packGold: document.getElementById('pack-button').classList.contains('is-gold'),
  packDesc: document.querySelector('#pack-button .mode-desc').textContent,
  packBarW: document.querySelector('.pack-home-bar i').style.width,
}));

console.log(JSON.stringify({ firstRun, returning, noPack, errs }, null, 1));
await b.close();
