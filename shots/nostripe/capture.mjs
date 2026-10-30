// Visual verification for the decorative border removal. The build sandbox cannot
// launch Chromium; run this from the repository root in the capture orchestrator.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'shots/nostripe');
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
fs.mkdirSync(OUT, { recursive: true });

const domainsFile = '/tmp/nostripe-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`],
});

async function pageForCapture() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear']) {
        const original = C?.prototype[name];
        if (original) C.prototype[name] = function (...args) { if (!window.__skipGL) return original.apply(this, args); };
      }
    }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'game.local') return route.abort();
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(`${ROOT}${path.sep}`) && target !== path.join(ROOT, 'index.html')) return route.abort();
    try {
      return route.fulfill({ body: fs.readFileSync(target), contentType: MIME[path.extname(target).slice(1)] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch {
      return route.fulfill({ status: 404, body: 'not found' });
    }
  });
  await page.goto('https://game.local/index.html?home=recs', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('.passport', { timeout: 90_000 });
  await page.evaluate(() => { window.__skipGL = true; });
  const cdp = await context.newCDPSession(page);
  return { context, page, shot: async (name) => {
    const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(result.data, 'base64'));
  } };
}

async function mountFixture(page, title, html) {
  await page.evaluate(({ title, html }) => {
    document.body.className = '';
    document.body.innerHTML = `<main class="nostripe-fixture"><h1>${title}</h1>${html}</main>`;
    const style = document.createElement('style');
    style.textContent = `.nostripe-fixture{box-sizing:border-box;min-height:100vh;padding:70px 18px;background:radial-gradient(circle at 50% 15%,#18294d,#050c1d 70%);color:#eef6ff}.nostripe-fixture h1{margin:0 0 24px;font-size:22px}.nostripe-fixture .specimen{margin:0 auto 24px}.nostripe-fixture .pack-flip-slot{width:300px;margin:auto}.nostripe-fixture .pack-flip{height:200px}.nostripe-fixture .postcard-summary-list{min-height:190px}.nostripe-fixture .reveal-sheet{position:relative;margin-top:180px;border:1px solid rgba(157,211,255,.22);background:rgba(5,12,29,.92)}.nostripe-fixture .expedition-list{display:grid}.nostripe-fixture .pvp-lists{max-width:354px;margin:auto}`;
    document.head.append(style);
  }, { title, html });
}

const captures = [];
{
  const { context, page, shot } = await pageForCapture();
  await page.click('.passport');
  await page.waitForSelector('.pp-pack-head', { state: 'attached', timeout: 90_000 });
  await page.waitForTimeout(800);
  await page.click('.pp-pack-head');
  await page.waitForTimeout(600);
  await shot('01-passport-dex.png'); captures.push('01-passport-dex.png');
  await context.close();
}
{
  const { context, page, shot } = await pageForCapture();
  await mountFixture(page, 'Pack message view', `<div class="pack-flip-slot specimen"><div class="pack-flip"><div class="pack-flip-face pack-flip-back"><span class="pack-stamp-outline"></span><span class="pack-postmark-ring"></span><span class="pack-message-lines"></span><span class="pack-address-lines"></span></div></div></div>`);
  await shot('02-pack-message.png'); captures.push('02-pack-message.png');
  await context.close();
}
{
  const { context, page, shot } = await pageForCapture();
  await mountFixture(page, 'Daily postcard summary', `<section class="postcard-summary-list specimen"><article class="postcard-summary-entry pp-post"><b class="pp-name">Kyoto, Japan</b><small class="pp-meta">1,240 km away</small><strong class="postcard-summary-score">4,210</strong></article><article class="postcard-summary-entry pp-post"><b class="pp-name">Lisbon, Portugal</b><small class="pp-meta">680 km away</small><strong class="postcard-summary-score">4,650</strong></article><div class="postcard-summary-postmark">DAILY<br>MAIL</div></section>`);
  await shot('03-daily-summary.png'); captures.push('03-daily-summary.png');
  await context.close();
}
{
  const { context, page, shot } = await pageForCapture();
  await mountFixture(page, 'Expedition picker', `<section class="expedition-picker specimen"><h2 id="expedition-heading">Choose an expedition</h2><div class="expedition-list"><button class="expedition-choice"><span class="emoji">✉️</span><span><strong>World Capitals</strong><small>Five stops · best 18,420</small></span><span class="badge">3/5</span></button><button class="expedition-choice"><span class="emoji">✉️</span><span><strong>Landforms</strong><small>Five stops · new route</small></span><span class="badge">NEW</span></button></div></section>`);
  await shot('04-expedition-picker.png'); captures.push('04-expedition-picker.png');
  await context.close();
}
{
  const { context, page, shot } = await pageForCapture();
  await mountFixture(page, 'PvP challenge list', `<section class="pvp-lists specimen"><div class="expedition-list"><button class="expedition-choice challenge-envelope"><span class="challenge-stamp">VS</span><span><strong>Sean’s challenge</strong><small>Round 2 of 5</small></span><span class="pvp-progress">2/5</span><span class="badge">PLAY</span></button><button class="expedition-choice challenge-envelope"><span class="challenge-stamp">VS</span><span><strong>Daily rivals</strong><small>Waiting for you</small></span><span class="pvp-progress">0/5</span><span class="badge">OPEN</span></button></div></section>`);
  await shot('05-pvp-challenges.png'); captures.push('05-pvp-challenges.png');
  await context.close();
}
{
  const { context, page, shot } = await pageForCapture();
  await mountFixture(page, 'Daily reveal peek', `<section class="reveal-sheet specimen"><div class="peek-bar"><div class="peek-slot"><div id="peek-thumb" style="background:linear-gradient(145deg,#9bc7e8,#4f8058)"></div></div><div class="peek-text"><b class="peek-name">Banff National Park</b><div class="peek-stats"><strong class="peek-score">4,720</strong><span class="peek-distance">184 km</span></div></div><button class="primary peek-next">Next</button></div></section>`);
  await shot('06-daily-reveal-peek.png'); captures.push('06-daily-reveal-peek.png');
  await context.close();
}

console.log(JSON.stringify({ viewport: '390x844', captures }, null, 2));
await browser.close();
