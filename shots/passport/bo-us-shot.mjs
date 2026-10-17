// Blackout "United States" scope smoke check at 390px, in the pattern of
// shots/passport/mock-shot2.mjs and shots/passport/bo-shot.mjs: picker
// order, a partial run with a state hit and a miss, a completed run, world
// scope untouched. Serves this tree directly (vendors three.js locally, no
// CDN needed).
import { chromium } from 'playwright';
import fs from 'node:fs';
const ROOT = '/home/hatch/workspace/map-game/blackout-work/';
const out = ROOT + 'shots/blackout/';
fs.mkdirSync(out, { recursive: true });

// An interior point per key, from the shipped geometry (node side).
function interiorPoints(topoPath) {
  const topo = JSON.parse(fs.readFileSync(topoPath));
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]); });
  const ring = (refs) => refs.flatMap((i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse()));
  const inRing = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const geoms = topo.objects.data.geometries.map((g) => ({ id: g.id, polys: (g.type === 'Polygon' ? [g.arcs] : g.arcs).map((p) => p.map(ring)) }));
  const inGeom = (g, x, y) => g.polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
  const nameOf = Object.fromEntries(topo.objects.data.geometries.map((g) => [g.id, g.properties.name]));
  const inside = {};
  for (const [key, ids] of Object.entries(topo.keys)) {
    // index by the clue's display name: country keys already are their name;
    // state keys ('US-CA') show the unit's own name ('California') instead.
    const displayName = nameOf[ids[0]] && ids.length === 1 && key !== nameOf[ids[0]] ? nameOf[ids[0]] : key;
    const own = geoms.filter((g) => ids.includes(g.id));
    const polys = own.flatMap((g) => g.polys).sort((a, b) => b[0].length - a[0].length);
    search: for (const p of polys) {
      const xs = p[0].map((q) => q[0]), ys = p[0].map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      for (let n = 4; n <= 64; n *= 2) for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
        const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n;
        if (own.some((g) => inGeom(g, x, y)) && !geoms.some((g) => !ids.includes(g.id) && inGeom(g, x, y))) { inside[displayName] = { lat: y, lng: x }; break search; }
      }
    }
  }
  return inside;
}
const insideCountries = interiorPoints(ROOT + 'assets/country-outlines.topo.json');
const insideStates = interiorPoints(ROOT + 'assets/us-states.topo.json');
const inside = { ...insideCountries, ...insideStates };

const b = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', jpg: 'image/jpeg', png: 'image/png' };
await p.route('**/*', (r) => { const u = new URL(r.request().url());
  if (u.hostname !== 'game.local') return r.abort();
  const path = u.pathname.replace(/^\//, '') || 'index.html';
  try { r.fulfill({ body: fs.readFileSync(ROOT + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { r.fulfill({ status: 404, body: 'nf' }); } });
const cdp = await p.context().newCDPSession(p);
const shot = async (name) => { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + name, Buffer.from(r.data, 'base64')); };
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const log = (...a) => console.log(...a);

await p.goto('https://game.local/index.html');
await p.waitForSelector('#survival-hub-button:not([disabled])', { timeout: 60000 });
await p.waitForFunction(() => window.__sat && window.__sat.mix === 1, null, { timeout: 30000 }).catch(() => log('satellite mix never reached 1'));
await p.waitForTimeout(800); await shot('us-1-home.png');

const tap = (pt) => p.evaluate((d) => window.dispatchEvent(new CustomEvent('pin', { detail: d })), pt);
const next = () => p.evaluate(() => document.getElementById('next-button').click());
const state = () => p.evaluate(() => ({ body: document.body.className, key: document.querySelector('#clue strong')?.textContent, num: document.getElementById('round-number').textContent, pill: document.getElementById('reveal-pill').textContent, fact: document.getElementById('reveal-fact')?.textContent, next: document.getElementById('next-button').textContent }));
async function openPicker() {
  await p.click('#survival-hub-button'); await p.waitForTimeout(200);
  await p.click('#blackout-button'); await p.waitForTimeout(300);
  return p.$$eval('[data-blackout-scope]', (els) => els.map((e) => ({ id: e.dataset.blackoutScope, label: e.querySelector('strong').textContent, small: e.querySelector('small').textContent })));
}
async function pick(id) {
  const choices = await openPicker();
  await p.click(`[data-blackout-scope="${id}"]`); await p.waitForTimeout(300);
  return choices;
}

// (1) picker shows United States right after Full World
const choices = await openPicker();
log('picker order', JSON.stringify(choices.map((c) => c.id)));
if (choices[0].id !== 'world' || choices[1].id !== 'united-states') log('FAIL: United States is not right after Full World');
await shot('us-2-picker.png');

// (2)+(3) a US run: a correct tap fills the state and increments found
await p.click('[data-blackout-scope="united-states"]'); await p.waitForTimeout(300);
await shot('us-3-round1.png');
let s = await state();
log('round1', JSON.stringify(s));
if (!inside[s.key]) log('FAIL: no interior point for ' + s.key);
await tap(inside[s.key]); await p.waitForTimeout(150);
let r = await state();
log('reveal1', JSON.stringify(r));
await shot('us-4-reveal1.png');
await next(); await p.waitForTimeout(150);

// a second hit, then a deliberate miss (mid-Pacific) to end the run
s = await state();
log('round2', JSON.stringify(s));
await tap(inside[s.key]); await p.waitForTimeout(150);
log('reveal2', JSON.stringify(await state()));
await next(); await p.waitForTimeout(150);
await tap({ lat: 10, lng: -150 }); await p.waitForTimeout(2500); // mid-Pacific: a miss
const missState = await state();
log('miss', JSON.stringify(missState));
await shot('us-5-miss.png');
await next(); await p.waitForTimeout(800);
const res = () => p.evaluate(() => ({ eyebrow: document.getElementById('survival-result-eyebrow').textContent, title: document.getElementById('survival-result-title').textContent, summary: document.getElementById('survival-result-summary').textContent, final: document.getElementById('survival-final-streak').textContent, best: document.getElementById('survival-best-streak').textContent, body: document.body.className }));
log('result', JSON.stringify(await res())); await shot('us-6-result.png');
log('store', JSON.stringify(await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /blackout/.test(k)).map((k) => [k, localStorage.getItem(k)])))));

// World scope still plays as before
await p.evaluate(() => document.getElementById('survival-home').click()); await p.waitForTimeout(400);
await pick('world');
log('world round1', JSON.stringify(await state())); await p.waitForTimeout(800); await shot('us-7-world.png');

log('errs', JSON.stringify(errs));
await b.close();
