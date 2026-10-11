// Live repro: real network via relay, sample inset state every 500ms through zoom
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.env.OUT || '/home/hatch/workspace/map-game/demo/docs/tile-teardown/';
const url = process.env.URL || 'https://www.where-on.earth/';
const tag = process.env.TAG || 'live';
const b = await chromium.launch({ proxy: { server: 'http://127.0.0.1:18888' }, executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'] });
const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const cdp = await p.context().newCDPSession(p);
const shot = async (n) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + `${tag}-${n}.png`, Buffer.from(r.data, 'base64')); };
const log = []; const t0 = Date.now(); const T = () => Date.now() - t0;
let ok = 0, nf = 0, corsFail = 0;
p.on('response', (r) => { if (r.url().includes('tiles.where-on.earth')) { const a = r.headers()['access-control-allow-origin']; if (r.status() === 404) nf++; log.push(`${T()} RES ${r.status()} acao=${a} ${r.url()}`); } });
p.on('requestfailed', (r) => { if (r.url().includes('tiles.where-on.earth')) { if (!/ABORTED/.test(r.failure()?.errorText)) corsFail++; log.push(`${T()} FAIL ${r.failure()?.errorText} ${r.url()}`); } });
p.on('console', (m) => { if (/CORS|error/i.test(m.text())) { log.push(`${T()} CONSOLE ${m.text().slice(0, 160)}`); } });
if (process.env.LOCAL) {
  // serve the patched local build at the real origin; tiles stay on the real network (real CORS)
  const root = process.env.LOCAL;
  await p.route('https://www.where-on.earth/**', async (route) => {
    if (route.request().url().includes('/assets/version.txt')) return route.fulfill({ status: 404, body: '' }); // stop the live-version reload loop
    const u = new URL(route.request().url());
    let f = root + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = f.split('.').pop();
      const ct = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', webmanifest: 'application/manifest+json' }[ext] || 'application/octet-stream';
      return route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': ct } });
    }
    return route.continue();
  });
}
if (process.env.FLAKY) {
  // force real fetch failures on every 3rd tile column (abort = network error, no CORS injection)
  await p.route('https://tiles.where-on.earth/**', (route) => {
    const m = route.request().url().match(/tiles\/(\d+)\/(\d+)\/(\d+)/);
    return m && +m[2] % (+process.env.FLAKY) === 0 ? route.abort('failed') : route.continue();
  });
}
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__sat && window.__sat.mix > 0.99, null, { timeout: 60000 }).catch(() => log.push('sat mix never 1'));
await shot('pre-click'); log.push('mix ' + await p.evaluate(() => window.__sat && window.__sat.mix)); await p.getByText('Endless', { exact: true }).click({ timeout: 15000 });
await p.waitForTimeout(3000);
const states = [];
const watch = async (label, ms) => { for (let t = 0; t < ms; t += 500) { const s = await p.evaluate(() => window.__sat.inset); const line = `${T()} ${label} gen=${s.gen} z=${s.z} vis=${s.visLeft} all=${s.allLeft} ready=${s.ready} infl=${s.inflight} q=${s.queued} lru=${s.lru} paused=${s.pausedFor} mixA=${s.mixA.toFixed(2)} mixB=${s.mixB.toFixed(2)}`; log.push(line); states.push({ label, ...s }); await p.waitForTimeout(500); } };
await p.mouse.move(195, 422);
await watch('initial', 2000); await shot('0-initial');
for (let i = 1; i <= 5; i++) {
  for (let k = 0; k < 2; k++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(80); }
  await watch(`in${i}`, 2000); await shot(`in${i}-2s`);
  await watch(`in${i}`, 6000); await shot(`in${i}-8s`);
}
await watch('hold', 15000); await shot('hold-23s');
fs.writeFileSync(out + `${tag}-log.txt`, log.join('\n'));
console.log(log.filter(l => / (initial|in\d|hold) /.test(l)).filter((_, i) => i % 2 === 0).join('\n'));
console.log('404', nf, 'corsFail', corsFail, 'RES', log.filter(l => l.includes(' RES ')).length);
await b.close();
