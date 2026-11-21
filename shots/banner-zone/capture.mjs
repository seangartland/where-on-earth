import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('../../docs/banner-zone-evidence/', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'maya', sessionToken: 'banner-zone', expiresAt: Date.now() + 86400000, deviceId: 'dev_test', merged: true };
const profile = { displayName: 'Maya', level: 10, totalXp: 1000, xpIntoLevel: 0, levelSpan: 280, xpToNext: 280, stats: { dailies: 12, averageScore: 910, bestScore: 1300, bullseyes: 3, postcards: 8, bestStreak: 5, countries: 14 }, loadout: { titleId: 'traveler', cardId: 'blue-horizon', avatar: { v: 2, initials: 'MY', disc: 'navy', motif: 'globe', ring: 'gold', topper: null } }, achievements: [], achievementDefinitions: [] };
const CARDS = ['blue-horizon', 'airmail', 'return-ticket', 'regular-route', 'seasoned-traveler', 'right-on-the-map', 'five-star-landing', 'high-flyer', 'worldly', 'around-the-world', 'harvest', 'winter-post'];
const friends = CARDS.map((cardId, i) => ({ friendId: `f-${cardId}`, displayName: `Friend ${cardId}`, level: 3 + i, loadout: { titleId: 'traveler', cardId, avatar: { v: 2, initials: 'FR', disc: 'navy', motif: 'globe', ring: 'level', topper: null } } }));
fs.mkdirSync(OUT, { recursive: true });
const domainFile = '/tmp/banner-zone-webgl-domains.txt'; fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
const domainHash = crypto.createHash('sha256').update(fs.readFileSync(domainFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainFile}`, `--hatch-webgl-allowed-domains-sha256=${domainHash}`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await context.newPage();
await page.addInitScript((saved) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(saved)), session);
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
    if (url.pathname === '/v1/progression') return route.fulfill({ json: profile });
    if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Maya', sharePins: true }, friends, openInvites: 0 } });
    return route.fulfill({ json: {} });
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'not found' }); }
});
await page.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
await page.evaluate(async () => { const { openProfileSheet } = await import('/src/account/sheet.js'); await openProfileSheet(); }); await page.waitForSelector('.traveler-profile.own');
await page.screenshot({ path: `${OUT}own-blue-horizon-header-390x844.png` });
await page.click('.account-open-friends'); await page.waitForSelector('.friends-page');
const rows = page.locator('[data-friend-id]');
const count = await rows.count();
console.log('friend rows found:', count);
for (let i = 0; i < count; i++) {
  const card = await rows.nth(i).evaluate((el) => el.getAttribute('data-card') || el.querySelector('[data-card]')?.getAttribute('data-card') || `row-${i}`);
  await rows.nth(i).screenshot({ path: `${OUT}row-${card}.png` });
  console.log('captured row', card);
}
await browser.close();
console.log('done');
