#!/usr/bin/env node
// Harness evidence for the renderer pilot (BRIEF-renderer-pilot.md): boots
// the game with ?pages=1&trace=1, calls preparePageRound() directly for a
// Madrid window, a Congo (landscape) window, and a location outside the
// staged pilot coverage, exercises a zoom in/out over each, and writes the
// raw trace plus a page-trace-report.mjs summary. Pattern follows
// scripts/sat/zoom-trace-probe.mjs: this repo served locally as
// https://game.local/, assets/docs read straight off disk (no tile network
// needed for pages, since the page assets are same-origin static files).
//
// Usage: node scripts/sat/page-trace-probe.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = `${resolve(here, '../..')}/`;
const OUT = `${resolve(here, '../../docs/zoom-stage2-evidence/pilot-trace-evidence')}/`;
mkdirSync(OUT, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', jsonl: 'application/json', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };

const domainsFile = '/tmp/woe-pages-pilot-webgl-domains.txt';
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
    if (url.hostname === 'tiles.where-on.earth') return route.fulfill({ status: 404, body: '' }); // pages never touch the tile host
    if (['woe-account.gartland-79.workers.dev', 'api.where-on.earth', 'woe-pvp.gartland-79.workers.dev'].includes(url.hostname)) {
      return route.fulfill({ json: {} });
    }
    if (url.hostname !== 'game.local') return route.abort();
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
    try { return route.fulfill({ body: readFileSync(`${ROOT}${path}`), contentType: mime[path.split('.').pop()] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  await page.goto('https://game.local/?pages=1&trace=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 180000 });

  const result = await page.evaluate(async ({ lat, lng }) => {
    const { preparePageRound } = await import('/src/globe/page-render.js');
    const { state } = await import('/src/core/state.js');
    const { latLngToVec3 } = await import('/src/globe/scene.js');
    const { traceMark } = await import('/src/globe/zoom-trace.js');
    traceMark('round-start', { hasCoords: true }); // same shared mark round.js emits
    const prepStarted = performance.now();
    await preparePageRound({ lat, lng });
    const prepMs = performance.now() - prepStarted;
    const v = latLngToVec3(lat, lng, 1);
    const yaw = Math.atan2(-v.x, v.z);
    window.__pin = setInterval(() => {
      state.vYaw = 0; state.vPitch = 0; state.autoSpin = 0;
      state.yaw = yaw; state.pitch = lat * Math.PI / 180;
    }, 50);
    // Zoom chain: settle wide, dive to max depth (z9), hold, climb back out
    // through z7/z5 (congo/outside never reach z9 pages, so the ladder here
    // is harmless for them too) - each step lets updatePageRender() pick a
    // level purely from already-resident groups.
    const steps = [
      { dist: 1.4, holdMs: 400 },
      { dist: 1.15, holdMs: 400 },
      { dist: 1.03, holdMs: 600 },
      { dist: 1.15, holdMs: 400 },
      { dist: 1.4, holdMs: 400 },
    ];
    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 30));
      traceMark('input-start', { kind: 'pointer' });
      state.dist = step.dist; state.targetDist = step.dist;
      await new Promise((r) => setTimeout(r, step.holdMs));
      traceMark('input-end', { kind: 'pointer' });
    }
    clearInterval(window.__pin);
    return { prepMs, trace: window.__woeTrace.dump() };
  }, { lat, lng });

  const traceFile = `${OUT}${label}-trace.json`;
  writeFileSync(traceFile, JSON.stringify(result.trace));
  console.log(`${label}: prepMs=${result.prepMs.toFixed(1)} wrote ${result.trace.length} trace events to ${traceFile} (page errors: ${errors.length})`);
  if (errors.length) console.log(`${label} page errors:`, errors);
  await context.close();
  return traceFile;
}

const madridTrace = await probe(40.4, -3.7, 'pages-madrid');
const congoTrace = await probe(-0.70, 24.6, 'pages-congo-landscape');
const outsideTrace = await probe(-34.6, -58.4, 'pages-outside-coverage');
await browser.close();

for (const [label, file] of [['pages-madrid', madridTrace], ['pages-congo-landscape', congoTrace], ['pages-outside-coverage', outsideTrace]]) {
  const report = execFileSync(process.execPath, [resolve(here, 'page-trace-report.mjs'), file], { encoding: 'utf8' });
  writeFileSync(`${OUT}${label}-report.txt`, report);
  console.log(`${label}: wrote report to ${OUT}${label}-report.txt`);
}
console.log('DONE');
