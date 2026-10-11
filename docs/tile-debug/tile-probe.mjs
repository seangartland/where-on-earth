import { chromium } from 'playwright';
import fs from 'node:fs';
const out = '/home/hatch/workspace/map-game/demo/docs/tile-debug/';
const _px = new URL(process.env.HTTPS_PROXY);
const b = await chromium.launch({ proxy: { server: `http://${_px.host}`, username: decodeURIComponent(_px.username), password: decodeURIComponent(_px.password) }, executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'] });
const p = await b.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await p.route('**/*', async (r) => {
  const req = r.request();
  if (!/^https?:/.test(req.url())) return r.continue();
  try {
    const h = { ...req.headers() };
    const res = await fetch(req.url(), { method: req.method(), headers: h, body: req.postDataBuffer() || undefined, redirect: 'manual' });
    const headers = {}; res.headers.forEach((v, k) => { if (!['content-encoding','content-length','transfer-encoding'].includes(k)) headers[k] = v; });
    await r.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  } catch (e) { await r.abort(); }
});
const cdp = await p.context().newCDPSession(p);
const shot = async (n) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + n, Buffer.from(r.data, 'base64')); };
const log = [];
const t0 = Date.now();
p.on('request', (r) => { if (r.url().includes('tiles.where-on.earth')) log.push(`${Date.now()-t0}ms REQ ${r.url()}`); });
p.on('response', (r) => { if (r.url().includes('tiles.where-on.earth')) log.push(`${Date.now()-t0}ms RES ${r.status()} ${r.url()} acao=${r.headers()['access-control-allow-origin']}`); });
p.on('requestfailed', (r) => { if (r.url().includes('tiles.where-on.earth')) log.push(`${Date.now()-t0}ms FAIL ${r.failure()?.errorText} ${r.url()}`); });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${Date.now()-t0}ms CONSOLE ${m.type()}: ${m.text().slice(0,200)}`); });
await p.goto('https://www.where-on.earth/', { waitUntil: 'load' });
await p.waitForFunction(() => window.__sat && window.__sat.mix > 0.99, null, { timeout: 60000 }).catch(() => log.push('sat mix never reached 1'));
const states = [];
const sample = async (label) => { await p.waitForTimeout(4000); const s = await p.evaluate(() => window.__sat.inset); states.push({ label, ...s }); log.push(`STATE ${label} ${JSON.stringify(s)}`); await shot(`zoom-${label}.png`); };
await sample('home');
await p.getByText('Endless', { exact: true }).click();
await p.waitForTimeout(3000);
await sample('initial');
await p.mouse.move(195, 422);
for (let i = 1; i <= 6; i++) {
  for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(80); }
  await sample(`in${i}`);
}
fs.writeFileSync(out + 'network-log.txt', log.join('\n'));
console.log(log.filter(l => !l.includes(' REQ ')).slice(0, 80).join('\n'));
console.log('total REQ', log.filter(l => l.includes(' REQ ')).length, 'FAIL', log.filter(l => l.includes(' FAIL ')).length, 'RES', log.filter(l => l.includes(' RES ')).length);
await b.close();
