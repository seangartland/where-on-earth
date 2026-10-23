// Blackout fill/outline alignment capture. Run from the demo root:
//   node shots/blackout/blackout-spill-capture.mjs
// Uses request-time source transforms for the "before" page only, so one run
// measures the shipped legacy behavior and the working tree's fixed behavior.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'shots/blackout/spill-proof');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', jpg: 'image/jpeg', png: 'image/png' };
const DEG = Math.PI / 180;
const FOV = 36;
const VIEW = 900;

function decode(topoPath, key) {
  const topo = JSON.parse(fs.readFileSync(topoPath));
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0; let y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]);
  });
  const ids = new Set(topo.keys[key]);
  const segments = [];
  for (const geom of topo.objects.data.geometries.filter((g) => ids.has(g.id))) {
    const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
    for (const poly of polys) for (const refs of poly) {
      const points = [];
      for (const ref of refs) {
        const arc = ref >= 0 ? arcs[ref] : arcs[~ref].slice().reverse();
        points.push(...arc.slice(points.length ? 1 : 0));
      }
      for (let i = 1; i < points.length; i++) segments.push([points[i - 1], points[i]]);
    }
  }
  return segments;
}

function distanceKm(a, b) {
  const p1 = a[1] * DEG; const p2 = b[1] * DEG;
  const dp = (b[1] - a[1]) * DEG; const dl = (b[0] - a[0]) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function longestSegment(file, key) {
  return decode(path.join(ROOT, file), key).sort((a, b) => distanceKm(...b) - distanceKm(...a))[0];
}

const cases = [
  { id: 'canada', key: 'Canada', file: 'assets/country-outlines.topo.json', segment: [[-95.1771, 48.9927], [-122.753, 48.9925]], dist: 1.70 },
  { id: 'france-control', key: 'France', file: 'assets/country-outlines.topo.json', segment: longestSegment('assets/country-outlines.topo.json', 'France'), dist: 1.32 },
  { id: 'colorado-state', key: 'US-CO', file: 'assets/us-states.topo.json', segment: longestSegment('assets/us-states.topo.json', 'US-CO'), dist: 1.34 },
];

function testSource(relative, variant) {
  let source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  if (relative === 'src/globe/outlines.js') {
    if (variant === 'before') source = source.replace('const line = densifyOutlineLine(sourceLine);', 'const line = sourceLine;');
    source += '\nwindow.__outlineSpillTest = { show: (key) => showCountryOutline(key, null, false), clear: clearCountryOutline };\n';
  }
  if (relative === 'src/modes/blackout.js') {
    if (variant === 'before') source = source.replace("ctx.fill(path, 'evenodd');", `ctx.fill(path, 'evenodd');
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  const dilation = Math.min(host.ISLAND_BLOB_TEXELS, geom.diagKm / 1000);
  ctx.lineWidth = dilation * (cv.width / 4096);
  ctx.stroke(path);`);
    source += '\nwindow.__blackoutSpillTest = { reset: resetBlackout, fill: blackoutFill };\n';
  }
  return source;
}

const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'],
});

async function openPage(variant) {
  const page = await browser.newPage({ viewport: { width: VIEW, height: VIEW }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'game.local') return route.abort();
    const relative = url.pathname.replace(/^\//, '') || 'index.html';
    try {
      const body = ['src/globe/outlines.js', 'src/modes/blackout.js'].includes(relative)
        ? testSource(relative, variant) : fs.readFileSync(path.join(ROOT, relative));
      return route.fulfill({ body, contentType: MIME[relative.split('.').pop()] || 'application/octet-stream' });
    } catch { return route.fulfill({ status: 404, body: 'nf' }); }
  });
  await page.goto('https://game.local/index.html');
  await page.waitForSelector('#survival-hub-button:not([disabled])', { timeout: 60000 });
  await page.waitForFunction(() => window.__outlineSpillTest && window.__blackoutSpillTest, null, { timeout: 60000 });
  await page.click('#survival-hub-button');
  await page.click('#blackout-button');
  await page.click('[data-blackout-scope="world"]');
  await page.evaluate(() => { document.getElementById('game').style.display = 'none'; });
  return { page, errors };
}

async function imageDataUrl(page) {
  const cdp = await page.context().newCDPSession(page);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  return `data:image/png;base64,${shot.data}`;
}

async function setupCase(page, item, layer) {
  await page.evaluate(({ key, segment, dist, layer }) => {
    const [a, b] = segment;
    const lng = (a[0] + b[0]) / 2; const lat = (a[1] + b[1]) / 2;
    const la = lat * Math.PI / 180; const lo = lng * Math.PI / 180;
    const x = Math.cos(la) * Math.cos(lo); const y = Math.sin(la); const z = -Math.cos(la) * Math.sin(lo);
    const yaw = Math.atan2(-x, z);
    const zy = -Math.sin(yaw) * x + Math.cos(yaw) * z;
    const pitch = Math.atan2(y, zy);
    window.__view.set(yaw, pitch); window.__view.zoom(dist);
    window.__blackoutSpillTest.reset(); window.__outlineSpillTest.clear();
    if (layer === 'fill' || layer === 'combined') window.__blackoutSpillTest.fill(key);
    if (layer === 'outline' || layer === 'combined') window.__outlineSpillTest.show(key);
  }, { key: item.key, segment: item.segment, dist: item.dist, layer });
  await page.waitForTimeout(800);
}

async function analyze(page, images, item) {
  return page.evaluate(async ({ images, segment, dist }) => {
    const load = (src) => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
    const loaded = await Promise.all([images.base, images.fill, images.outline].map(load));
    const pixels = loaded.map((im) => { const c = new OffscreenCanvas(im.width, im.height); const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; });
    const [base, fill, outline] = pixels; const W = loaded[0].width; const H = loaded[0].height;
    const samples = [];
    for (let k = 0; k <= 100; k++) {
      const t = k / 100; const lng = segment[0][0] + (segment[1][0] - segment[0][0]) * t; const lat = segment[0][1] + (segment[1][1] - segment[0][1]) * t;
      const la = lat * Math.PI / 180; const lo = (lng + 180) * Math.PI / 180;
      samples.push(window.__view.project([-Math.cos(lo) * Math.cos(la), Math.sin(la), Math.sin(lo) * Math.cos(la)]));
    }
    samples.sort((a, b) => a[0] - b[0]);
    const separations = [];
    for (let si = 5; si < samples.length - 5; si++) {
      const [xf, expectedY] = samples[si]; const x = Math.round(xf);
      if (x < 2 || x >= W - 2) continue;
      let outlineY = expectedY; let outlineScore = -1;
      let fillY = expectedY; let edgeScore = -1;
      for (let y = Math.max(5, Math.round(expectedY - 70)); y <= Math.min(H - 6, Math.round(expectedY + 70)); y++) {
        const i = (y * W + x) * 4;
        const od = Math.abs(outline[i] - base[i]) + Math.abs(outline[i + 1] - base[i + 1]) + Math.abs(outline[i + 2] - base[i + 2]);
        const cyan = (outline[i + 1] + outline[i + 2] - 2 * outline[i]) + od;
        if (cyan > outlineScore) { outlineScore = cyan; outlineY = y; }
        const diff = (yy) => { const j = (yy * W + x) * 4; return Math.abs(fill[j] - base[j]) + Math.abs(fill[j + 1] - base[j + 1]) + Math.abs(fill[j + 2] - base[j + 2]); };
        const edge = Math.abs((diff(y + 3) + diff(y + 2)) - (diff(y - 3) + diff(y - 2)));
        if (edge > edgeScore) { edgeScore = edge; fillY = y; }
      }
      if (outlineScore > 80 && edgeScore > 30) separations.push(Math.abs(fillY - outlineY));
    }
    separations.sort((a, b) => a - b);
    const p95 = separations[Math.floor((separations.length - 1) * 0.95)] ?? null;
    const kmPerPx = (2 * (dist - 1) * Math.tan((36 / 2) * Math.PI / 180) * 6371.0088) / H;
    return { samples: separations.length, maxPx: p95, maxDefinition: '95th percentile of per-sample separation', kmPerPx, maxKm: p95 == null ? null : p95 * kmPerPx };
  }, { images, segment: item.segment, dist: item.dist });
}

const results = {};
for (const variant of ['before', 'after']) {
  const { page, errors } = await openPage(variant);
  results[variant] = {};
  for (const item of cases) {
    const images = {};
    for (const layer of ['base', 'fill', 'outline']) {
      await setupCase(page, item, layer);
      images[layer] = await imageDataUrl(page);
    }
    await setupCase(page, item, 'combined');
    await page.screenshot({ path: path.join(OUT, `${variant}-${item.id}.png`) });
    results[variant][item.id] = await analyze(page, images, item);
  }
  results[variant].errors = errors;
  await page.close();
}

fs.writeFileSync(path.join(OUT, 'measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
await browser.close();
