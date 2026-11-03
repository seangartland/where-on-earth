// Verify the satmap production default (variant B, no ?sat) against a local
// production build, logging every tile request (sf1b vs eox, host, status) per
// view. Adapted from shots/satmap-preview/capture.mjs. Fake origin: the page
// runs at https://where-on.earth, same-origin files are served from the local
// build dir (GET /api/* passes through to production, other API methods are
// aborted), and tiles are fetched from tiles.where-on.earth with that Origin,
// so the real CORS allowlist answers. Tiles are not substituted.
// usage: node capture.mjs <build-dir> <query or ''> <views.json> <outdir>
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const [buildDir, query, viewsFile, outDir] = process.argv.slice(2);
const base = 'https://where-on.earth';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const allUrls = [];
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--disable-crashpad', '--disable-crash-reporter', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const p = await ctx.newPage();
const cache = new Map();
let tileLog = [];
await p.route('**/*', async (r) => {
  const url = r.request().url();
  if (!url.startsWith('http')) return r.continue();
  allUrls.push(url);
  try {
    const u = new URL(url);
    if (u.host === 'where-on.earth' && !u.pathname.startsWith('/api/')) {
      const f = path.join(buildDir, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(f);
      // Harness-only patch: never enter the slow-network mode (route
      // round-trips are slow here, a player's network is not).
      if (/\/src\/globe\/surface\.js$/.test(u.pathname)) body = Buffer.from(body.toString().replace('if (med > 1500) inset.slow = true;', 'if (false) inset.slow = true;'));
      return r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body });
    }
    if (u.host === 'where-on.earth' && r.request().method() !== 'GET') return r.abort();
    let hit = cache.get(url);
    if (!hit) {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 satmap-prod-default-check', origin: base } });
      hit = { status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) };
      delete hit.headers['content-encoding']; delete hit.headers['content-length'];
      if (res.status === 200) cache.set(url, hit);
    }
    const m = url.match(/\/(s2gm2025-sf1b|tiles|s2gm2025)\/(\d+)\/(\d+)\/(\d+)\.jpg/);
    if (m) tileLog.push({ src: m[1], z: +m[2], x: +m[3], y: +m[4], status: hit.status, host: new URL(url).host, path: new URL(url).pathname.split('/')[1] });
    await r.fulfill(hit);
  } catch (e) { await r.abort(); }
});
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const consoleErrs = []; p.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
await p.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForFunction(() => window.__booted && window.__view && window.__sat, null, { timeout: 90000 });
await p.waitForTimeout(8000);
const boot = await p.evaluate(() => ({
  bootDone: document.getElementById('boot')?.classList.contains('done') ?? null,
  bootVisible: !!document.getElementById('boot') && getComputedStyle(document.getElementById('boot')).display !== 'none' && getComputedStyle(document.getElementById('boot')).opacity !== '0',
  homeText: (document.getElementById('game')?.innerText || '').slice(0, 120),
  provider: window.__sat.provider, mix: window.__sat.mix, search: location.search,
}));
const cdp = await ctx.newCDPSession(p);
fs.writeFileSync(`${outDir}/00-home.png`, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(JSON.stringify({ boot }));
const center = (y, pt) => p.evaluate(([y, pt]) => { window.__view.set(y, pt); return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const v = window.__view.pick(195, 422); if (!v) return res(null);
  const [x, yy, z] = v; const lat = Math.asin(Math.max(-1, Math.min(1, yy))) * 180 / Math.PI; let lon = Math.atan2(z, -x) * 180 / Math.PI - 180; if (lon < -180) lon += 360;
  res([lat, lon]); }))); }, [y, pt]);
await p.evaluate(() => window.__view.zoom(3));
const c0 = await center(0, 0), c1 = await center(0.5, 0), c2 = await center(0, 0.3);
const log = { base, query, boot, calib: { c0, c1, c2 }, shots: [] };
const dLon = (a, b) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
const lonPerYaw = dLon(c0[1], c1[1]) / 0.5, latPerPitch = (c2[0] - c0[0]) / 0.3;
await p.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });
for (const v of views) {
  tileLog = [];
  const yaw = dLon(c0[1], v.lon) / lonPerYaw, pitch = (v.lat - c0[0]) / latPerPitch;
  let dist = v.dist, got, s;
  for (let attempt = 0; attempt < 6; attempt++) {
    await p.evaluate(([d]) => window.__view.zoom(d), [dist]);
    got = await center(yaw, pitch);
    const t0 = Date.now();
    await p.waitForTimeout(1500);
    for (;;) { s = await p.evaluate(() => window.__sat.inset); if ((s.ready && !s.inflight && !s.queued) || Date.now() - t0 > 90000) break; await p.waitForTimeout(500); }
    if ((s.z ?? 0) >= v.wantZ || dist <= 1.03) break;
    dist = 1 + (dist - 1) * 0.72;
  }
  await p.waitForTimeout(1200);
  s = await p.evaluate(() => window.__sat.inset);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${outDir}/${v.name}.png`, Buffer.from(r.data, 'base64'));
  const at = (src, st) => tileLog.filter((t) => t.src === src && (st == null || t.status === st)).length;
  log.shots.push({ name: v.name, want: [v.lat, v.lon], got, dist, wantZ: v.wantZ, insetZ: s.z, ready: s.ready, tiles: s.tiles, fallback: s.fallback, visLeft: s.visLeft,
    inflight: s.inflight, queued: s.queued, pausedFor: s.pausedFor, lru: s.lru,
    req: { sf1b200: at('s2gm2025-sf1b', 200), sf1b404: at('s2gm2025-sf1b', 404), eox200: at('tiles', 200), eox404: at('tiles', 404), other: tileLog.filter((t) => ![200, 404].includes(t.status)).length,
      hosts: [...new Set(tileLog.map((t) => t.host))], sf1bZ: [...new Set(tileLog.filter((t) => t.src === 's2gm2025-sf1b').map((t) => t.z))].sort(),
      viaProxy: tileLog.some((t) => t.path === 'tiles-proxy') } });
  console.log(JSON.stringify(log.shots.at(-1)));
}
log.errs = errs; log.consoleErrs = consoleErrs; log.tilesProxyUrls = allUrls.filter((u) => u.includes('tiles-proxy')).length;
console.log(JSON.stringify({ errs, consoleErrs, tilesProxyUrls: log.tilesProxyUrls }));
fs.writeFileSync(`${outDir}/capture-log.json`, JSON.stringify(log, null, 2));
await b.close();
