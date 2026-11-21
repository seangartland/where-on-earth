import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('../../docs/ring-palette-evidence/', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'maya', sessionToken: 'ring-palette', expiresAt: Date.now() + 86400000, deviceId: 'dev_test', merged: true };
fs.mkdirSync(OUT, { recursive: true });
const domainFile = '/tmp/ring-palette-webgl-domains.txt'; fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
const domainHash = crypto.createHash('sha256').update(fs.readFileSync(domainFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainFile}`, `--hatch-webgl-allowed-domains-sha256=${domainHash}`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await context.newPage();
await page.addInitScript((saved) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(saved)), session);
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') return route.fulfill({ json: {} });
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
await page.evaluate(async () => {
  const { renderAvatar } = await import('/src/account/avatar.js');
  const strip = document.createElement('div');
  strip.id = 'ring-strip';
  strip.style.cssText = 'position:fixed;inset:auto 0 0 0;top:120px;z-index:9999;display:flex;justify-content:space-around;align-items:flex-start;background:#0a1128;padding:28px 10px 20px;font-family:sans-serif;';
  for (const [ring, label] of [['bronze', 'Bronze (new)'], ['silver', 'Silver'], ['gold', 'Gold']]) {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;color:#f6edd8;font-size:13px;';
    cell.append(renderAvatar({ v: 2, initials: 'SG', disc: 'navy', motif: 'globe', ring }, 118, { level: 10, name: 'Sean G' }));
    const cap = document.createElement('div'); cap.textContent = label; cell.append(cap);
    strip.append(cell);
  }
  document.body.append(strip);
});
await page.waitForSelector('#ring-strip .paper-atlas-avatar svg');
const strip = page.locator('#ring-strip');
await strip.screenshot({ path: `${OUT}rings-bronze-silver-gold.png` });
await browser.close();
console.log('done');
