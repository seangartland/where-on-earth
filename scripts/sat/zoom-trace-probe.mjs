#!/usr/bin/env node
// Harness evidence for zoom Stage 1 (BRIEF-zoom-stage1.md, docs/zoom-diagnosis-astra.md
// §6): boots the game with ?trace=1, pins Tokyo and Madrid at max zoom over
// the real tile network, exports window.__woeTrace.dump() for each, and
// writes both the raw trace and the zoom-trace-report.mjs summary under
// docs/zoom-stage1-evidence/. Pattern follows shots-ux/capture.mjs in this
// repo and ~/workspace/map-game/woe-zoom-live-shots/probe-timing.mjs
// (outside this repo, not importable from here): real tiles.where-on.earth
// network, this repo served locally as https://game.local/.
//
// Usage: node scripts/sat/zoom-trace-probe.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = `${resolve(here, '../..')}/`;
const OUT = `${resolve(here, '../../docs/zoom-stage1-evidence')}/`;
mkdirSync(OUT, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };

const domainsFile = '/tmp/woe-zoom-stage1-webgl-domains.txt';
writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = createHash('sha256').update(readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: [
    '--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`,
  ],
});

async function probe(lat, lng, label) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === 'tiles.where-on.earth') {
      try {
        const init = { headers: { Origin: 'https://www.where-on.earth' } };
        if (req.method() === 'POST') {
          init.method = 'POST';
          init.body = req.postData();
          init.headers['content-type'] = 'application/json';
        }
        const res = await fetch(url.href, init);
        const body = Buffer.from(await res.arrayBuffer());
        return route.fulfill({ status: res.status, contentType: res.headers.get('content-type') || 'application/octet-stream', body });
      } catch { return route.fulfill({ status: 502, body: '' }); }
    }
    if (['woe-account.gartland-79.workers.dev', 'api.where-on.earth', 'woe-pvp.gartland-79.workers.dev'].includes(url.hostname)) {
      return route.fulfill({ json: {} });
    }
    if (url.hostname !== 'game.local') return route.abort();
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
    try { return route.fulfill({ body: readFileSync(`${ROOT}${path}`), contentType: mime[path.split('.').pop()] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  await page.goto('https://game.local/?trace=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 180000 });
  await page.evaluate(async ({ lat, lng }) => {
    const { state } = await import('/src/core/state.js');
    const { latLngToVec3 } = await import('/src/globe/scene.js');
    const v = latLngToVec3(lat, lng, 1);
    const yaw = Math.atan2(-v.x, v.z);
    // Re-assert every 50ms: the idle auto-spin and zoom easing would
    // otherwise drift the view before the ladder settles (same approach
    // as the outside-repo probe-timing.mjs this pattern follows).
    window.__pin = setInterval(() => {
      state.vYaw = 0; state.vPitch = 0; state.autoSpin = 0;
      state.yaw = yaw; state.pitch = lat * Math.PI / 180;
      state.dist = 1.05; state.targetDist = 1.05;
    }, 50);
  }, { lat, lng });
  await page.waitForTimeout(25000); // let the ladder climb to the deepest rung
  const trace = await page.evaluate(() => { clearInterval(window.__pin); return window.__woeTrace.dump(); });
  const traceFile = `${OUT}${label}-trace.json`;
  writeFileSync(traceFile, JSON.stringify(trace));
  console.log(`${label}: wrote ${trace.length} trace events to ${traceFile} (page errors: ${errors.length})`);
  await context.close();
  return traceFile;
}

const tokyoTrace = await probe(35.7, 139.7, 'tokyo');
const madridTrace = await probe(40.4, -3.7, 'madrid');
await browser.close();

for (const [label, file] of [['tokyo', tokyoTrace], ['madrid', madridTrace]]) {
  const report = execFileSync(process.execPath, [resolve(here, 'zoom-trace-report.mjs'), file], { encoding: 'utf8' });
  writeFileSync(`${OUT}${label}-report.txt`, report);
  console.log(`${label}: wrote report to ${OUT}${label}-report.txt`);
}
console.log('DONE');
