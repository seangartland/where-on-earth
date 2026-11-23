import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'banner-build', sessionToken: 'banner-build', expiresAt: Date.now() + 86400000, deviceId: 'dev_test', merged: true };
const definitions = [];
const errors = [];
const requests = [];
fs.mkdirSync(OUT, { recursive: true });

const domainFile = '/tmp/banner-build-webgl-domains.txt';
fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
const domainHash = crypto.createHash('sha256').update(fs.readFileSync(domainFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainFile}`, `--hatch-webgl-allowed-domains-sha256=${domainHash}`] });

async function capture(id) {
  const profile = { displayName: 'Sean', level: 7, totalXp: 700, xpIntoLevel: 0, levelSpan: 220, xpToNext: 220, stats: { dailies: 7, averageScore: 900, bestScore: 1200, bullseyes: 2, postcards: 4, bestStreak: 4, countries: 8, referrals: 0 }, loadout: { titleId: 'day-tripper', cardId: id, avatar: { v: 2, initials: 'SG', disc: 'navy', motif: 'globe', ring: 'silver', topper: null } }, achievements: [], achievementDefinitions: definitions };
  const friends = [{ friendId: `${id}-friend`, displayName: 'Robin', level: 7, loadout: { titleId: 'day-tripper', cardId: id, avatar: { v: 2, initials: 'RO', disc: 'forest', motif: 'globe', ring: 'silver', topper: null } } }];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((saved) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(saved)), session);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
      requests.push(`${url.hostname}${url.pathname}`);
      if (url.pathname === '/v1/progression') return route.fulfill({ json: profile });
      if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Sean', sharePins: true }, friends, openInvites: 0 } });
      return route.fulfill({ json: {} });
    }
    if (url.hostname !== 'game.local') return route.abort();
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
    try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  await page.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
  await page.evaluate(async () => { const { openProfileSheet } = await import('/src/account/sheet.js'); await openProfileSheet(); });
  await page.waitForSelector('.traveler-profile.own');
  await page.locator('.traveler-profile.own > .traveler-card').screenshot({ path: `${OUT}${id}-profile-header.png` });
  await page.locator('.friend-page-row').screenshot({ path: `${OUT}${id}-friends-row.png` });
  await context.close();
}

await capture('open-field');
await capture('low-tide');
const result = { errors, overflow: false, requests };
fs.writeFileSync(`${OUT}result.json`, `${JSON.stringify(result, null, 2)}\n`);
await browser.close();
if (errors.length) throw new Error(JSON.stringify(result));
