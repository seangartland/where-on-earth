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
  ? (() => { const u = new URL(proxyUrl); return { server: `${u.protocol}//${u.host}` }; })()
  : undefined;
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', ...(proxy ? { proxy } : {}), args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const SW_HEADERS = { 'Service-Worker-Allowed': '/' };
// The worker script is staged from the CURRENT source before launch, not
// from the page server: this sandbox's Chromium refuses the script as
// served by the harness (failed integrity check), while a staged copy via
// header-annotated fulfillment registers fine. Must run before any page
// boots so the first navigation is already covered.
const SW_PATH = `${ROOT}.build-tmp/sw-under-test.js`;
fs.copyFileSync(`${ROOT}sw.js`, SW_PATH);
let serveSwStaged = false;
const swBody = fs.readFileSync(SW_PATH, 'utf8');

const LOCATIONS = new Map(JSON.parse(fs.readFileSync(`${ROOT}assets/locations.json`, 'utf8')).map((item) => [item.id, item]));

async function measureVisit(context, tileNet) {
  const page = await context.newPage();
  lastPage = page;
  const bootLogStart = globalBootLog.length;
  // Per-visit tile accounting reads the shared route counter (tileNet)
  // and the shared request log (globalBootLog): both are fed by the route
  // handler, which is the only layer that sees every tile request. (An
  // earlier per-page request listener undercounted badly: duplicate
  // listeners on one page do not all fire for routed requests.)
  const pageTileNet = tileNet;
  page.on('request', (r) => { if (r.url().includes('tiles.where-on.earth')) globalBootLog.push({ at: Date.now(), url: r.url(), type: 'request' }); });
  page.on('requestfailed', (r) => { if (r.url().includes('tiles.where-on.earth')) globalBootLog.push({ at: Date.now(), url: r.url(), type: 'failed', error: r.failure()?.errorText }); });
  page.on('response', (r) => { if (r.url().includes('tiles.where-on.earth')) globalBootLog.push({ at: Date.now(), url: r.url(), type: 'response', status: r.status() }); });
  page.on('console', (m) => { if (/tile|prefetch|sat/i.test(m.text())) globalBootLog.push({ at: Date.now(), type: 'console', text: m.text().slice(0, 200) }); });
  const seenIds = new Set();
  await page.addInitScript(() => {
    // Fresh daily every visit: clearing the saved game key means each
    // visit boots a clean daily, so the boot prefetch actually fires
    // (a saved daily with results would skip the prefetch date guard
    // only via loadDaily, which still runs; the real hazard was replay
    // of saved results hijacking the measured round) and the measured
    // round is always the first one. The in-memory LRU starts empty per
    // page regardless; only the SW and HTTP caches persist across visits.
    localStorage.removeItem('where-on-earth-v1');
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
    if (url.hostname === 'tiles.where-on.earth') { tileNet.count++; return route.continue(); }
    if (url.hostname === 'game.local' && url.pathname === '/sw.js') return route.fulfill({ body: swBody, contentType: 'text/javascript', headers: serveSwStaged ? SW_HEADERS : { 'Cache-Control': 'no-store' } });
    if (url.hostname !== 'game.local') return route.abort();
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
    try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });

  // Boot markers bracket the whole boot: the prefetch burst fires during
  // page load (loadDaily runs before __booted is set), so the counts must
  // be captured before navigation and read after the boot settles.
  const netAtBoot = pageTileNet.count;
  const logAtBoot = globalBootLog.length - bootLogStart;
  await page.goto('https://game.local/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
  // Let the boot-time tile work settle: the route-layer tile request
  // count for this page going quiet is the settle signal. (Playwright
  // response events for tile requests never fire through this sandbox's
  // proxy, and the in-page LRU fill is not observable when responses
  // stall, so neither is a usable signal here.)
  let lastNet = -1;
  let quietStreak = 0;
  for (let i = 0; i < 60 && quietStreak < 4; i++) {
    if (pageTileNet.count === lastNet) quietStreak++; else { quietStreak = 0; lastNet = pageTileNet.count; }
    if (quietStreak < 4) await new Promise((r) => setTimeout(r, 500));
  }
  const bootTileRequests = null; // replaced at return by bootReqCount total
  // Distinguish the prefetch burst from window fetches by zoom read off
  // the request URLs: the prefetch is the 3x3 blocks at z7, z8 and z9
  // around the five daily locations; the boot window fetches z5.
  // NOTE: the classification counts below are computed at return time,
  // not here: the shared request log fills during the page's life, and
  // reading it at this point (right after the boot quiet-wait) races the
  // route handler's pushes. bootReqCount() reads it when the visit ends.
  const zoomSeg = (u) => { const parts = String(u).split('/'); const i = parts.findIndex((p) => p === 's2gm2025' || p === 'eox2025'); return i >= 0 ? Number(parts[i + 1]) : -1; };
  const bootReqCount = (pred) => (pageTileLog.get(page) || []).filter((u) => pred(zoomSeg(u))).length;
  const home = await page.evaluate(async () => {
    const diag = { lruKeysSample: [], prefetchProbe: null };
    try {
      const sat = window.__sat;
      diag.insetKeys = sat ? Object.keys(sat.inset || {}) : [];
    } catch (e) { diag.err = String(e); }
    let sw = 'unsupported';
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        sw = reg ? (reg.active ? reg.active.state : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'registered') : 'none';
      }
    } catch { sw = 'error'; }
    return { homeFill: window.__satHomeFill ?? null, lru: window.__sat?.inset?.lru ?? 0, sw, diag };
  });
  await page.evaluate(() => { window.__travelAnim = false; });
  // The round this visit plays: the saved daily's first round with no
  // recorded guess. Captured before entering the game, because once rounds
  // complete the current item walks forward to the next unplayed one.
  let targetItemId = await page.evaluate(() => {
    const d = window.__game?.state?.daily;
    const ids = d?.ids || [];
    const results = d?.results || [];
    // startGame presents the round at daily.round (its saved result, if
    // any, replays as a reveal); only a finished daily shows results.
    if (d?.round != null && ids[d.round]) return ids[d.round];
    const first = ids.find((id, i) => !results[i]);
    return first || ids[ids.length - 1] || null;
  });
  await page.waitForSelector('#play-button', { state: 'visible', timeout: 30000 });
  const netBefore = pageTileNet.count;
  const started = await page.evaluate(() => performance.now());
  await page.click('#play-button');
  // Under SwiftShader the round-start flight into the guess state can take
  // a long wall-clock while; wait for the game to actually expect a guess
  // (state.item set, gameMode 'guess') instead of a fixed delay, which
  // races it whenever the VM is loaded. Because the saved daily records
  // progress per round, the wait targets the first unplayed round's item.
  await (async () => {
    const pre = await page.evaluate(() => {
      const d = window.__game?.state?.daily;
      return !!(d && d.results && d.round != null && d.results[d.round]);
    });
    if (!pre) {
      await page.waitForFunction((id) => window.__game?.state?.mode === 'guess' && window.__game?.state?.item === id, targetItemId, { timeout: 120000 });
      return;
    }
    // Replay path: the saved reveal plays out, then Next moves to the
    // first unplayed round. Clicking Next advances daily.round, which
    // also changes the round the measured guess belongs to, so recompute
    // the measured item id afterwards from the new round.
    await page.waitForSelector('#next-button', { state: 'visible', timeout: 180000 });
    await page.click('#next-button');
    await page.waitForFunction(() => window.__game?.state?.mode === 'guess', null, { timeout: 120000 });
    targetItemId = await page.evaluate(() => {
      const d = window.__game?.state?.daily;
      return d?.ids?.[d.round] ?? null;
    });
  })();
  const itemId = targetItemId ?? await page.evaluate(() => window.__game?.state?.item);
  const item = LOCATIONS.get(itemId);
  if (!item) throw new Error(`no location for round item ${itemId}`);
  await page.evaluate(([lat, lng]) => window.__game.guess(lat, lng), [item.lat + 3, item.lng + 3]);
  // The reveal flight is wall-clock (up to ~4 s of game time, stretched
  // under SwiftShader); the next button appears when it completes.
  await page.waitForSelector('#next-button', { state: 'visible', timeout: 120000 });
  // The reveal camera is damped in frame time and SwiftShader frames are
  // slow, so the settle that triggers the inset build can take a minute or
  // more of wall time. Honest wait: poll once a second and finish as soon
  // as the CURRENT window (window.__sat.inset) reports ready AND its tile
  // grid covers the item's tile, or when the tile circuit breaker has
  // clearly engaged twice (the window recorded its first failure pause,
  // retried after it, and paused again), in which case flag the stall
  // instead of hanging a full timeout. Coverage uses the game's own test
  // hook: the point under the screen centre is the window centre, and
  // tile maths follow the game's own slippy formulas.
  const roundWait = async () => {
    const t0 = Date.now();
    let firstPauseSeen = false;
    while (Date.now() - t0 < 420000) {
      const s = await page.evaluate(([la, ln]) => {
        const sat = window.__sat;
        const wb = sat?.inset;
        if (!wb) return { st: 'nowin' };
        if (wb.pausedFor > 0) return { st: 'paused', pausedFor: wb.pausedFor, gen: wb.gen, ready: wb.ready };
        const view = window.__view;
        if (!view?.pick) return { st: 'noview', gen: wb.gen, ready: wb.ready };
        const centreLocal = view.pick(195, 422);
        if (!centreLocal) return { st: 'nocentre', gen: wb.gen, ready: wb.ready };
        if (!wb.ready || wb.gen == null || wb.gen <= 0) return { st: 'loading', gen: wb.gen, ready: wb.ready, allLeft: wb.allLeft };
        const centreLat = Math.asin(Math.max(-1, Math.min(1, centreLocal[2])));
        const centreLng = Math.atan2(-centreLocal[0], centreLocal[1]);
        const z = wb.z;
        const n = 1 << z;
        const tileF = (a, b) => [
          Math.floor(((b + 180) / 360) * n),
          Math.floor((0.5 - Math.log(Math.tan(Math.PI / 4 + a / 2)) / (2 * Math.PI)) * n),
        ];
        const [tx, ty] = tileF(la * Math.PI / 180, ln);
        const [cx, cy] = tileF(centreLat, centreLng * 180 / Math.PI);
        let dx = tx - (cx - Math.floor(wb.cols / 2));
        dx = ((dx % n) + n) % n;
        const dy = ty - (cy - Math.floor(wb.rows / 2));
        const covered = dx >= 0 && dx < wb.cols && dy >= 0 && dy < wb.rows;
        return { st: covered ? 'ready' : 'other', gen: wb.gen, ready: wb.ready, z: wb.z };
      }, [item.lat, item.lng]).catch(() => ({ st: 'evalfail' }));
      if (s.st === 'ready') return { outcome: 'ready' };
      if (s.st === 'paused') {
        if (firstPauseSeen) return { outcome: 'stalled-breaker' };
        firstPauseSeen = true;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { outcome: 'timeout' };
  };
  const waited = await roundWait();
  // Round-window network fetches: everything this page requested after
  // the boot burst finished. The boot total (prefetch + home window) is
  // bootReqCount over all zooms, read from the shared log at this point.
  const bootTotal = bootReqCount(() => true);
  const tileDuringRound = Math.max(0, (pageTileLog.get(page) || []).length - bootTotal);
  if (waited.outcome === 'timeout') throw new Error('round window never ready and never breaker-stalled in 420 s');
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
  return { ...home, ...result, roundStalled: waited.outcome === 'stalled-breaker', tileNetDuringRound: tileDuringRound, bootTileRequests: bootReqCount(() => true), prefetchUrls: bootReqCount((z) => z >= 7), bootWindowUrls: bootReqCount((z) => z === 5), bootTileLog: globalBootLog.slice(bootLogStart, bootLogStart + 12), bootTileLogTotal: globalBootLog.length - bootLogStart };
}

serveSwStaged = true;
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'allow' });
context.on('request', (r) => {
  if (!r.url().includes('tiles.where-on.earth')) return;
  const p = r.frame()?.page?.();
  if (!p) return;
  if (!pageTileLog.has(p)) pageTileLog.set(p, []);
  pageTileLog.get(p).push(r.url());
});
const tileNet = { count: 0 };
const pageTileLog = new Map(); // page -> [urls requested while it lived]
const globalBootLog = [];
let lastPage = null;
try {
  const first = await measureVisit(context, tileNet);
  await new Promise((r) => setTimeout(r, 1000));
  const netBeforeRepeat = tileNet.count;
  const repeat = await measureVisit(context, tileNet);
  console.log(JSON.stringify({ first, repeat, tileNetTotal: tileNet.count, tileNetBeforeRepeat: netBeforeRepeat }, null, 2));
} finally {
  if (lastPage) {
    const diag = await lastPage.evaluate(() => {
      const view = window.__view;
      const centreLocal = view?.pick ? view.pick(state_viewW() / 2, state_viewH() / 2) : null;
      function state_viewW() { return 390; }
      function state_viewH() { return 844; }
      return {
        booted: window.__booted ?? null,
        homeFill: window.__satHomeFill ?? null,
        sat: window.__sat ? { inset: window.__sat.inset, mix: window.__sat.mix, provider: window.__sat.provider } : null,
        viewState: view ? { yaw: view.yaw, pitch: view.pitch, dist: view.dist } : null,
        centreLocal,
        centreLatLng: centreLocal ? [Math.asin(Math.max(-1, Math.min(1, centreLocal[2]))) * 180 / Math.PI, Math.atan2(-centreLocal[0], centreLocal[1]) * 180 / Math.PI] : null,
        item: window.__game?.state?.item ?? null,
        events: (window.__tileRound2Events || []).length,
        eventsTail: (window.__tileRound2Events || []).slice(-5),
        swReady: 'serviceWorker' in navigator ? navigator.serviceWorker.ready.then(() => 'ready').catch(() => 'rejected') : 'unsupported',
      };
    }).catch((e) => ({ diagError: String(e) }));
    console.error('DIAG ' + JSON.stringify(diag, null, 2));
  }
  await browser.close();
}
