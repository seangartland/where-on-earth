// Loading-pass measurement probe (LOADING-PASS-DESIGN.md, Measurement).
// Based on capture-reveal.mjs, with one routing change: tiles.where-on.earth
// requests go through to the real CDN instead of being aborted, so tile
// timing is real. Per visit it plays one Daily round (pin, lock, reveal) and
// reports: ms from round start to the reveal inset window ready, tile fetch
// starts issued in that span (from window.__tileRound2Log), the home-view
// detail fill branch (window.__satHomeFill, set by the part 3 boot pass;
// absent before it lands), the service worker registration state, and how
// many tile requests reached the network layer at all. Visit 2 replays the
// same round in a fresh page of the same browser context, so the service
// worker cache and the HTTP cache persist while the in-memory tile LRU does
// not. SwiftShader timings are relative only: compare visits and builds,
// never absolutes.
//
// The guess is placed through the window.__game test hook, 3 degrees off the
// round's answer (read from assets/locations.json by the round's item id).
// A fixed screen-centre pin frames the reveal too wide for any inset window
// to fit (verified on the unchanged tree: no window was ever built and zero
// tile fetches were issued), so it cannot measure the reveal path at all; a
// close guess frames at the ladder zooms the prefetch warms. The reveal code
// path after the guess is the same one the lock button runs.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = '/home/hatch/workspace/map-game/shots/home-mock/';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = `${OUT}.webgl-domains.txt`;
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
// This sandbox reaches the internet through an authenticated egress proxy
// named by the https_proxy env var. curl picks the credentials up from the
// URL; Chromium does not, and its tile CONNECT tunnels fail without them, so
// hand the parsed proxy to the launch explicitly. Nothing is stored here:
// the value is read from the environment at run time, and the probe still
// works unchanged anywhere with direct egress (no env var, no proxy).
const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
const proxy = proxyUrl
  ? (() => { const u = new URL(proxyUrl); return { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }; })()
  : undefined;
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', ...(proxy ? { proxy } : {}), args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const LOCATIONS = new Map(JSON.parse(fs.readFileSync(`${ROOT}assets/locations.json`, 'utf8')).map((item) => [item.id, item]));

async function measureVisit(context, tileNet) {
  const page = await context.newPage();
  const seenIds = new Set();
  await page.addInitScript(() => {
    localStorage.setItem('where-on-earth-account-v1', JSON.stringify({
      _v: 1, accountId: 'test-acct', sessionToken: 'test-token', expiresAt: Date.now() + 86400000,
      displayName: 'Sean', emailHint: '', deviceId: 'dev_test', lastSyncAt: 0, merged: true,
    }));
    window.__tileRound2Events = [];
    window.__tileRound2Log = (event) => window.__tileRound2Events.push({ ...event, at: performance.now() });
  });
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
    if (url.hostname === "tiles.where-on.earth") { tileNet.count++; return route.continue(); }
    if (url.hostname !== 'game.local') return route.abort();
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
    try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });

  await page.goto('https://game.local/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
  // Let the boot-time tile work (prefetch, home fill) finish: poll the
  // in-memory LRU size until it holds still, capped at ~20 s.
  let lastLru = -1;
  let stable = 0;
  for (let i = 0; i < 40 && stable < 3; i++) {
    const n = await page.evaluate(() => window.__sat?.inset?.lru ?? 0).catch(() => 0);
    if (n === lastLru) stable++; else { stable = 0; lastLru = n; }
    if (stable < 3) await new Promise((r) => setTimeout(r, 500));
  }
  const home = await page.evaluate(async () => {
    let sw = 'unsupported';
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        sw = reg ? (reg.active ? reg.active.state : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'registered') : 'none';
      }
    } catch { sw = 'error'; }
    return { homeFill: window.__satHomeFill ?? null, lru: window.__sat?.inset?.lru ?? 0, sw };
  });
  await page.evaluate(() => { window.__travelAnim = false; });
  await page.waitForSelector('#play-button', { state: 'visible', timeout: 30000 });
  const netBefore = tileNet.count;
  const started = await page.evaluate(() => performance.now());
  await page.click('#play-button');
  await new Promise((r) => setTimeout(r, 1500));
  const itemId = await page.evaluate(() => window.__game?.state?.item);
  const item = LOCATIONS.get(itemId);
  if (!item) throw new Error(`no location for round item ${itemId}`);
  await page.evaluate(([lat, lng]) => window.__game.guess(lat, lng), [item.lat + 3, item.lng + 3]);
  await page.waitForSelector('#next-button', { state: 'visible', timeout: 30000 });
  // The reveal camera is damped in frame time and SwiftShader frames are
  // slow, so the settle that triggers the inset build can take a minute or
  // more of wall time. Wait for the reveal window to actually build (its
  // generation goes non-null), then for it to finish.
  await page.waitForFunction(() => window.__sat?.inset?.gen != null, null, { timeout: 240000 });
  await page.waitForFunction(() => window.__sat?.inset?.ready, null, { timeout: 240000 });
  const result = await page.evaluate((start) => {
    const ready = performance.now();
    const events = (window.__tileRound2Events || []).filter((e) => e.at >= start && e.event === 'start');
    return {
      readyMs: Math.round(ready - start),
      fetches: events.length,
      fetchesWanted: events.filter((e) => e.wanted).length,
      fetchesPrefetch: events.filter((e) => e.prefetch).length,
      insetZ: window.__sat?.inset?.z ?? null,
      insetGen: window.__sat?.inset?.gen ?? null,
    };
  }, started);
  await page.close();
  return { ...home, ...result, tileNetDuringRound: tileNet.count - netBefore };
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const tileNet = { count: 0 };
const first = await measureVisit(context, tileNet);
await new Promise((r) => setTimeout(r, 1000));
const netBeforeRepeat = tileNet.count;
const repeat = await measureVisit(context, tileNet);
console.log(JSON.stringify({ first, repeat, tileNetTotal: tileNet.count, tileNetBeforeRepeat: netBeforeRepeat }, null, 2));
await browser.close();
