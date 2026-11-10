import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = '/home/hatch/workspace/map-game/shots/home-mock/';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = `${OUT}.webgl-domains.txt`;
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  localStorage.setItem('where-on-earth-account-v1', JSON.stringify({
    _v: 1, accountId: 'test-acct', sessionToken: 'test-token', expiresAt: Date.now() + 86400000,
    displayName: 'Sean', emailHint: '', deviceId: 'dev_test', lastSyncAt: 0, merged: true,
  }));
});
const seenIds = new Set();
const tilePaths = [];
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'api.where-on.earth') {
    const p = url.pathname;
    let body = {};
    if (p === '/v1/daily/guesses') {
      try { seenIds.add(JSON.parse(route.request().postData() || '{}').locationId); } catch { /* ignore */ }
      body = { stored: { guess: { lat: 28.61, lng: 77.2 } }, friends: [{ friendId: 'f1', displayName: 'Gabe', guess: { lat: 31.55, lng: 74.34 } }] };
    } else if (p === '/v1/friends') {
      body = { friends: [{ friendId: 'f1', displayName: 'Gabe' }], me: { displayName: 'Sean', sharePins: true } };
    } else if (p === '/v1/daily/friends') {
      const locations = {};
      for (const id of seenIds) if (id) locations[id] = { friends: [{ friendId: 'f1', displayName: 'Gabe', guess: { lat: 31.55, lng: 74.34 } }] };
      body = { date: url.searchParams.get('date'), locations };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  if (url.hostname === 'tiles.where-on.earth') { tilePaths.push(url.pathname.split('/').slice(0, 2).join('/')); return route.abort(); }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.goto('https://game.local/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));
// The sim clock is frame-clamped (dt <= 1/20s), so the animated flight takes
// minutes of wall time under swiftshader; the instant path exercises the same
// reveal code minus the flight itself.
await page.evaluate(() => { window.__travelAnim = false; });
await page.waitForSelector("#play-button", { state: "visible", timeout: 30000 }); await page.click("#play-button");
await new Promise((r) => setTimeout(r, 2200));
await page.mouse.click(195, 380);
await new Promise((r) => setTimeout(r, 700));
await page.waitForSelector('#lock-button:not([hidden])', { timeout: 20000 });
await page.click('#lock-button');
await page.waitForSelector('#next-button', { state: 'visible', timeout: 30000 });
await new Promise((r) => setTimeout(r, 4000));
const reveal = await page.evaluate(() => {
  const sheet = document.querySelector('#reveal-card');
  const band = sheet.querySelector('.reveal-band');
  const strip = sheet.querySelector('.friends-strip');
  const board = sheet.querySelector('.friends-board');
  return {
    bandH: Math.round(band.getBoundingClientRect().height),
    bandTag: sheet.querySelector('#reveal-band-tag')?.textContent,
    name: sheet.querySelector('#peek-name')?.textContent,
    score: sheet.querySelector('#round-score')?.textContent,
    scoreMath: !!sheet.querySelector('.score-math'),
    postcardVisible: !!document.querySelector('.postcard:not([hidden])'),
    earnToast: !!document.querySelector('.earn-toast'),
    stripChips: [...(strip?.querySelectorAll('.friend-chip') || [])].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
    boardRowsBefore: board ? [...board.querySelectorAll('.friend-board-row')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) : null,
  };
});
console.log('reveal collapsed:', JSON.stringify(reveal));
await page.screenshot({ path: `${OUT}reveal-collapsed.png` });
await page.click('.reveal-band');
await new Promise((r) => setTimeout(r, 1500));
const expanded = await page.evaluate(() => {
  const sheet = document.querySelector('#reveal-card');
  const board = sheet.querySelector('.friends-board');
  return {
    expanded: sheet.classList.contains('expanded'),
    factLines: Math.round(document.querySelector('#fact').getBoundingClientRect().height / (15 * 1.45)),
    boardRows: board ? [...board.querySelectorAll('.friend-board-row')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) : null,
  };
});
console.log('reveal expanded:', JSON.stringify(expanded));
await page.screenshot({ path: `${OUT}reveal-expanded.png` });
await page.click('#next-button');
for (let round = 1; round < 5; round++) {
  await new Promise((r) => setTimeout(r, 2200));
  await page.mouse.click(195, 380);
  await new Promise((r) => setTimeout(r, 700));
  await page.waitForSelector('#lock-button:not([hidden])', { timeout: 20000 });
  await page.click('#lock-button');
  await page.waitForSelector('#next-button', { state: 'visible', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  console.log('round', round, 'locked');
  await page.click('#next-button');
}
await new Promise((r) => setTimeout(r, 1400));
const dbg = await page.evaluate(() => [...document.querySelectorAll('section.screen, .screen')].filter((el) => !el.hidden && getComputedStyle(el).display !== 'none').map((el) => el.id || el.className));
console.log('visible screens:', JSON.stringify(dbg));
const filing = await page.evaluate(() => ({
  cards: document.querySelectorAll('.filing-card').length,
  rows: [...document.querySelectorAll('.postcard-summary-entry')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()),
  counts: document.querySelector('.postcard-summary-counts')?.textContent,
}));
console.log('summary filing:', JSON.stringify(filing));
await page.screenshot({ path: `${OUT}summary-filing.png` });
await page.click('#postcard-summary-continue');
await new Promise((r) => setTimeout(r, 2500));
const ft = await page.evaluate(() => {
  const card = document.querySelector('.friends-today');
  return { hidden: card?.hidden, rows: [...(card?.querySelectorAll('.friend-total-row') || [])].map((li) => li.textContent.replace(/\s+/g, ' ').trim()), count: card?.querySelector('.friends-today-count')?.textContent };
});
console.log('friends-today:', JSON.stringify(ft));
const layout = await page.evaluate(() => {
  const share = document.querySelector('#share-button').getBoundingClientRect();
  const breakdown = document.querySelector('#results-breakdown').getBoundingClientRect();
  const globe = document.querySelector('.results-globe');
  const list = document.querySelector('.friends-today-list');
  const cs = getComputedStyle(list);
  const liH = document.querySelector('#results-breakdown li').getBoundingClientRect().height;
  const ftCard = document.querySelector('.friends-today').getBoundingClientRect();
  const shareGap = share.top - ftCard.bottom;
  const nextGame = document.querySelector('.next-game').getBoundingClientRect();
  return { shareAboveBreakdown: share.bottom <= breakdown.top + 1, globeHidden: globe?.hidden, listMaxH: cs.maxHeight, listOverflowY: cs.overflowY, countdownBelowBreakdown: nextGame.top >= breakdown.bottom - 1, breakdownRowH: Math.round(liH), shareGap: Math.round(shareGap) };
});
console.log('results layout:', JSON.stringify(layout));
await page.screenshot({ path: `${OUT}results-friends.png` });
await page.click('.friends-today-link');
await new Promise((r) => setTimeout(r, 3500));
const measure = await page.evaluate(() => {
  const card = document.querySelector('.recap-card');
  const r = card.getBoundingClientRect();
  return {
    cardH: Math.round(r.height),
    hasPagerDots: !!card.querySelector('.pager-dots'),
    scoreText: card.querySelector('.score-line')?.textContent.replace(/\s+/g, ' ').trim(),
    prevDisabled: card.querySelector('[data-act="prev"]')?.disabled,
    prevVisible: (() => { const b = card.querySelector('[data-act="prev"]'); return b ? getComputedStyle(b).display !== 'none' : null; })(),
    nextVisible: (() => { const b = card.querySelector('[data-act="next"]'); return b ? getComputedStyle(b).display !== 'none' : null; })(),
  };
});
console.log(JSON.stringify(measure));
await page.screenshot({ path: `${OUT}recap-tall-1.png` });
await page.click('.recap-card [data-act="next"]');
await new Promise((r) => setTimeout(r, 2500));
const nav2 = await page.evaluate(() => {
  const card = document.querySelector('.recap-card');
  const vis = (sel) => { const b = card.querySelector(sel); return b ? getComputedStyle(b).display !== 'none' : null; };
  return { tag: card.querySelector('.recap-tag')?.textContent, prevVisible: vis('[data-act="prev"]'), nextVisible: vis('[data-act="next"]'), cardH: Math.round(card.getBoundingClientRect().height) };
});
console.log(JSON.stringify(nav2));
await page.screenshot({ path: `${OUT}recap-tall-2.png` });
await page.click('.recap-card .recap-expand');
await new Promise((r) => setTimeout(r, 900));
const exp = await page.evaluate(() => {
  const card = document.querySelector('.recap-card');
  const fact = card.querySelector('.recap-fact');
  return { expanded: card.classList.contains('expanded'), cardH: Math.round(card.getBoundingClientRect().height),
    factLines: Math.round(fact.getBoundingClientRect().height / (15 * 1.45)), aria: card.querySelector('.recap-expand')?.getAttribute('aria-expanded') };
});
console.log('expanded:', JSON.stringify(exp));
await page.screenshot({ path: `${OUT}recap-tall-3-expanded.png` });
await page.click('.recap-card .recap-expand');
await new Promise((r) => setTimeout(r, 900));
const col = await page.evaluate(() => ({ expanded: document.querySelector('.recap-card').classList.contains('expanded'), cardH: Math.round(document.querySelector('.recap-card').getBoundingClientRect().height) }));
console.log('collapsed again:', JSON.stringify(col));
console.log('tile prefixes requested:', JSON.stringify([...new Set(tilePaths)]));
await browser.close();
