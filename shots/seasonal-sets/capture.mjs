import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('../../docs/seasonal-sets-evidence/', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'maya', sessionToken: 'seasonal-sets', expiresAt: Date.now() + 86400000, deviceId: 'dev_test', merged: true };
const definitions = [
  ['holiday-santa', 'Holiday Hat', 'topper:santa-hat'], ['holiday-antlers', 'Holiday Antlers', 'topper:antlers'],
  ['thanksgiving-2026-leaf-cluster', 'Thanksgiving 2026: Leaf Cluster', 'topper:leaf-cluster'], ['thanksgiving-2026-harvest', 'Thanksgiving 2026: Harvest', 'card:harvest'], ['thanksgiving-2026-grateful-traveler', 'Thanksgiving 2026: Grateful Traveler', 'title:grateful-traveler'], ['christmas-2026-winter-post', 'Christmas 2026: Winter Post', 'card:winter-post'], ['christmas-2026-sleigh-captain', 'Christmas 2026: Sleigh Captain', 'title:sleigh-captain'],
].map(([id, name, reward]) => ({ id, category: 'seasonal', name, condition: 'Complete a seasonal Daily', reward }));
const profile = { displayName: 'Maya', level: 10, totalXp: 1000, xpIntoLevel: 0, levelSpan: 280, xpToNext: 280, stats: { dailies: 12, averageScore: 910, bestScore: 1300, bullseyes: 3, postcards: 8, bestStreak: 5, countries: 14 }, loadout: { titleId: 'grateful-traveler', cardId: 'harvest', avatar: { v: 2, initials: 'MY', disc: 'navy', motif: 'globe', ring: 'gold', topper: 'leaf-cluster' } }, achievements: definitions.map(({ id }) => ({ id, earnedAt: Date.UTC(2026, 10, 26) })), achievementDefinitions: definitions };
const friends = [{ friendId: 'harvest-friend', displayName: 'Robin', level: 10, loadout: { titleId: 'grateful-traveler', cardId: 'harvest', avatar: { v: 2, initials: 'RO', disc: 'forest', motif: 'globe', ring: 'gold', topper: 'leaf-cluster' } } }];
fs.mkdirSync(OUT, { recursive: true });
const domainFile = '/tmp/seasonal-sets-webgl-domains.txt'; fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
const domainHash = crypto.createHash('sha256').update(fs.readFileSync(domainFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainFile}`, `--hatch-webgl-allowed-domains-sha256=${domainHash}`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await context.newPage(); const requests = [];
await page.addInitScript((saved) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(saved)), session);
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
    requests.push(`${url.hostname}${url.pathname}`);
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
await page.screenshot({ path: `${OUT}own-harvest-leaf-cluster-390x844.png` });
await page.click('.account-customize'); await page.waitForSelector('.customizer'); await page.click('[data-kind="Banners"]'); await page.screenshot({ path: `${OUT}customizer-banners-390x844.png` });
await page.click('[data-kind="Titles"]'); await page.screenshot({ path: `${OUT}customizer-titles-390x844.png` });
await page.click('.account-customize-back'); await page.waitForSelector('.account-open-friends'); await page.click('.account-open-friends'); await page.waitForSelector('.friends-page'); await page.screenshot({ path: `${OUT}friends-harvest-compact-390x844.png` });
const result = await page.evaluate(() => ({ compactHasTopperGeometry: document.querySelector('.friend-page-seal').innerHTML.includes('M30 29c-8-8'), requests }));
if (result.compactHasTopperGeometry) throw new Error('compact friend seal rendered topper');
fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(result, null, 2)}\n`);
await context.close(); await browser.close(); console.log(JSON.stringify(result));
