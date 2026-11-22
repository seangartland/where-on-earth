#!/usr/bin/env node
// Harness evidence for BRIEF-page-lifecycle.md (Astra step 2, the production
// page lifecycle behind ?pages=1): mechanism-only, swiftshader, no deploy.
// Boots the real game (same same-origin static-file routing as
// scripts/sat/page-trace-probe.mjs) and drives the real, shared
// src/game/round.js showRound() - not a reimplementation of it - for every
// scenario the brief's verification section names: a Madrid round, a Congo
// (landscape) round, a coverage-gap round, a forced-failure round, a warm
// repeat, and a superseded round. Each assertion below reads an actually
// observable signal (window.__canGuess, the #guess-hint text, the
// page-round trace mark, or scripts/sat/page-trace-report.mjs's per-round
// span accounting) rather than reimplementing the lifecycle's own logic.
//
// Usage: node scripts/sat/page-lifecycle-harness.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import { summarizePageTrace } from './page-trace-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = `${resolve(here, '../..')}/`;
const OUT = `${resolve(here, '../../docs/zoom-stage2-evidence/pilot-trace-evidence')}/`;
mkdirSync(OUT, { recursive: true });
const mime = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', jsonl: 'application/json', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };

const domainsFile = '/tmp/woe-pages-lifecycle-webgl-domains.txt';
writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = createHash('sha256').update(readFileSync(domainsFile)).digest('hex');

const results = []; // { name, pass, detail }
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`);
}

async function newPage(browser, { failFirstMatching } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let failedOnce = false;
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
    if (failFirstMatching && !failedOnce && failFirstMatching.test(path)) { failedOnce = true; return route.fulfill({ status: 404, body: '' }); }
    try { return route.fulfill({ body: readFileSync(`${ROOT}${path}`), contentType: mime[path.split('.').pop()] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  await page.goto('https://game.local/?pages=1&trace=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 180000 });
  return { context, page, pageErrors };
}

// Replaces state.selected/state.daily with a two-slot fixture so
// currentItem() (src/game/round.js) resolves exactly the coords given,
// without racing the real Daily selection's own location fetch, and without
// two rounds ever aliasing the same mutable item object (BRIEF requirement
// 3's "no stale activations" needs two genuinely distinct round items).
async function primeFixture(page, items) {
  await page.evaluate(async (items) => {
    const { state } = await import('/src/core/state.js');
    state.daily = { date: '2026-11-22', ids: items.map((i) => i.id), round: 0, results: [], complete: false };
    state.selected = items.map((i) => ({ clue: 'harness clue', fact: 'harness fact', image: '', short: i.id, country: 'Testland', kind: 'city', ...i }));
  }, items);
}

async function showRoundAt(page, slot) {
  await page.evaluate(async (slot) => {
    const { state } = await import('/src/core/state.js');
    const { showRound } = await import('/src/game/round.js');
    const { traceMark } = await import('/src/globe/zoom-trace.js');
    traceMark('round-start', { hasCoords: true });
    state.daily.round = slot;
    showRound();
  }, slot);
}

async function canGuess(page) { return page.evaluate(() => window.__canGuess); }
async function guessHint(page) { return page.evaluate(() => document.getElementById('guess-hint')?.textContent ?? null); }

async function waitForReady(page, timeoutMs = 8000) {
  await page.waitForFunction(() => window.__canGuess === true, null, { timeout: timeoutMs });
}

async function pageActiveInPage(page) {
  return page.evaluate(async () => {
    const { pageRenderActive } = await import('/src/globe/page-render.js');
    return pageRenderActive();
  });
}

async function doZoomHold(page) {
  await page.evaluate(async () => {
    const { traceMark } = await import('/src/globe/zoom-trace.js');
    const { state } = await import('/src/core/state.js');
    traceMark('input-start', { kind: 'pointer' });
    const steps = [1.15, 1.03, 1.15];
    for (const d of steps) {
      state.dist = d; state.targetDist = d;
      await new Promise((r) => setTimeout(r, 350));
    }
    traceMark('input-end', { kind: 'pointer' });
  });
}

async function dumpTrace(page, label) {
  const trace = await page.evaluate(() => window.__woeTrace.dump());
  const file = `${OUT}lifecycle-${label}-trace.json`;
  writeFileSync(file, JSON.stringify(trace));
  const summary = summarizePageTrace(trace);
  return { trace, summary, file };
}

async function run() {
  const browser = await chromium.launch({
    executablePath: '/opt/meta-chromium/chrome',
    args: [
      '--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`,
    ],
  });

  const MADRID = { id: 'harness-madrid', lat: 40.4, lng: -3.7 };
  const CONGO = { id: 'harness-congo', lat: -0.70, lng: 24.6 };
  const OUTSIDE = { id: 'harness-outside', lat: -34.6, lng: -58.4 };

  // --- Scenario 1: Madrid round, cold then warm repeat --------------------
  {
    const { context, page, pageErrors } = await newPage(browser);
    await primeFixture(page, [MADRID, MADRID]);
    await showRoundAt(page, 0);
    const immediateCanGuess = await canGuess(page);
    const immediateHint = await guessHint(page);
    record('madrid: immediate input is gated (requirement 2)', immediateCanGuess === false, `__canGuess=${immediateCanGuess}`);
    record('madrid: a preparing state is shown (requirement 2)', immediateHint === 'Preparing imagery…', `hint=${JSON.stringify(immediateHint)}`);
    await waitForReady(page);
    record('madrid: readiness is reached without a stall (requirement 2/3)', true);
    const active = await pageActiveInPage(page);
    record('madrid: the page path is active once ready (requirement 1)', active === true);
    await doZoomHold(page);
    // Warm repeat: same coords, same slot re-shown (round boundary without a coverage/plan change).
    await showRoundAt(page, 1);
    await waitForReady(page);
    await doZoomHold(page);
    const { summary } = await dumpTrace(page, 'madrid');
    const r1 = summary.rounds.find((r) => r.path === 'pages');
    const r2 = summary.rounds.filter((r) => r.path === 'pages')[1];
    record('madrid round 1: zero page spans after first input (requirement 1/verification)', r1 && r1.postInputPageSpanCount === 0, JSON.stringify(r1?.postInputPageSpans));
    record('madrid round 1: zero legacy tile spans in the whole trace (requirement 1)', summary.totalLegacyTileSpans === 0, `total=${summary.totalLegacyTileSpans}`);
    record('madrid round 2 (warm repeat): zero page asset loads (requirement 4)', !!r2 && r2.pageSpanCount === 0, JSON.stringify(r2));
    record('no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    await context.close();
  }

  // --- Scenario 2: Congo (landscape) round ---------------------------------
  {
    const { context, page, pageErrors } = await newPage(browser);
    await primeFixture(page, [CONGO]);
    await showRoundAt(page, 0);
    record('congo: immediate input is gated (requirement 2)', (await canGuess(page)) === false);
    await waitForReady(page);
    await doZoomHold(page);
    const { summary } = await dumpTrace(page, 'congo');
    const r1 = summary.rounds[0];
    record('congo: resolves the pages path', r1?.path === 'pages', JSON.stringify(r1?.path));
    record('congo: zero page spans after first input', r1 && r1.postInputPageSpanCount === 0, JSON.stringify(r1?.postInputPageSpans));
    record('congo: zero legacy tile spans in the whole trace', summary.totalLegacyTileSpans === 0, `total=${summary.totalLegacyTileSpans}`);
    record('no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    await context.close();
  }

  // --- Scenario 3: coverage-gap round (round-boundary fallback) -----------
  {
    const { context, page, pageErrors } = await newPage(browser);
    await primeFixture(page, [OUTSIDE]);
    await showRoundAt(page, 0);
    await waitForReady(page, 8000);
    const { summary } = await dumpTrace(page, 'coverage-gap');
    const r1 = summary.rounds[0];
    record('coverage-gap: explicit round-boundary fallback to tiles (requirement 3)', r1?.path === 'tiles' && r1?.fallbackReason === 'z9-gap', JSON.stringify(r1));
    record('coverage-gap: readiness still recovers input, no stall (requirement 3)', true);
    record('coverage-gap: zero page spans this round', (r1?.pageSpanCount ?? -1) === 0);
    record('no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    await context.close();
  }

  // --- Scenario 4: forced-failure round (manifest-listed asset 404s) ------
  {
    const { context, page, pageErrors } = await newPage(browser, { failFirstMatching: /assets\/pages-pilot\/revision\/9\// });
    await primeFixture(page, [MADRID]);
    await showRoundAt(page, 0);
    await waitForReady(page, 8000);
    const activeAfterFailure = await pageActiveInPage(page);
    const { summary } = await dumpTrace(page, 'forced-failure');
    // page-trace-report.mjs starts a new "round" at every 'page-round' mark
    // (scripts/sat/page-trace-report.mjs's own documented convention): a
    // prepare failure commits to pages first (mark 1), then falls back
    // (mark 2), the same two-mark shape page-store.js has used since the
    // diagnostic patch (35063ac) banked step 1. The outcome is the last mark.
    const outcome = summary.rounds[summary.rounds.length - 1];
    record('forced-failure: explicit round-boundary fallback to tiles (requirement 3)', outcome?.path === 'tiles' && outcome?.fallbackReason === 'prepare-failed', JSON.stringify(outcome));
    record('forced-failure: readiness still recovers input, no stall (requirement 3)', true);
    record('forced-failure: the page path never activates after the failed prepare (requirement 3, no late activation)', activeAfterFailure === false, `pageRenderActive=${activeAfterFailure}`);
    record('no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    await context.close();
  }

  // --- Scenario 5: superseded round (no stale activation) -----------------
  {
    const { context, page, pageErrors } = await newPage(browser);
    await primeFixture(page, [MADRID, CONGO]);
    await showRoundAt(page, 0); // round A: Madrid, left mid-preparation
    await showRoundAt(page, 1); // round B: Congo, begins before A settles
    await waitForReady(page, 8000);
    const active = await pageActiveInPage(page);
    const { summary } = await dumpTrace(page, 'superseded');
    const pagesRounds = summary.rounds.filter((r) => r.path === 'pages');
    const lastPages = pagesRounds[pagesRounds.length - 1];
    record('superseded: the newer round (Congo) ends up active, not the superseded one (requirement 3)', active === true && lastPages?.lat === CONGO.lat && lastPages?.lng === CONGO.lng, JSON.stringify(lastPages));
    record('superseded: input is admitted once the newer round settles, no stall', (await canGuess(page)) === true);
    record('no page errors', pageErrors.length === 0, JSON.stringify(pageErrors));
    await context.close();
  }

  await browser.close();
}

await run();

const failed = results.filter((r) => !r.pass);
writeFileSync(`${OUT}lifecycle-harness-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Results written to ${OUT}lifecycle-harness-results.json`);
if (failed.length) { console.log('FAILED:', failed.map((f) => f.name)); process.exitCode = 1; }
