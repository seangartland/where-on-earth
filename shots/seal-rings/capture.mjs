import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('../../docs/seal-rings-evidence/', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'maya', sessionToken: 'seal-rings', expiresAt: Date.now() + 86400000, deviceId: 'dev_test', merged: true };
const achievementDefinitions = [{ id: 'holiday-santa', category: 'seasonal', name: 'Holiday Hat', condition: 'Complete a Daily December 20–26', reward: 'topper:santa-hat' }, { id: 'holiday-antlers', category: 'seasonal', name: 'Holiday Antlers', condition: 'Complete a Daily December 20–26', reward: 'topper:antlers' }];
const profile = { displayName: 'Maya', level: 10, totalXp: 1000, xpIntoLevel: 0, levelSpan: 280, xpToNext: 280, stats: { dailies: 12, averageScore: 910, bestScore: 1300, bullseyes: 3, postcards: 8, bestStreak: 5, countries: 14 }, loadout: { titleId: 'traveler', cardId: 'blue-horizon', avatar: { v: 2, initials: 'MY', disc: 'navy', motif: 'globe', ring: 'gold', topper: 'santa-hat' } }, achievements: [{ id: 'holiday-santa', earnedAt: Date.UTC(2026, 11, 21) }, { id: 'holiday-antlers', earnedAt: Date.UTC(2026, 11, 21) }], achievementDefinitions };
const friends = [{ friendId: 'antler-friend', displayName: 'Robin', level: 10, loadout: { titleId: 'traveler', cardId: 'blue-horizon', avatar: { v: 2, initials: 'RO', disc: 'forest', motif: 'globe', ring: 'gold', topper: 'antlers' } } }];
fs.mkdirSync(OUT, { recursive: true });
const domainFile = '/tmp/seal-rings-webgl-domains.txt'; fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
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
await page.screenshot({ path: `${OUT}own-santa-full-390x844.png` });
await page.click('.account-customize'); await page.waitForSelector('.customizer'); await page.screenshot({ path: `${OUT}seal-customizer-390x844.png` });
await page.click('.account-customize-back'); await page.waitForSelector('.account-open-friends'); await page.click('.account-open-friends'); await page.waitForSelector('.friends-page'); await page.screenshot({ path: `${OUT}friends-compact-topper-390x844.png` });
const result = await page.evaluate(() => ({ compactHasTopperGeometry: document.querySelector('.friend-page-seal').innerHTML.includes('M42 28V11'), requests }));
if (result.compactHasTopperGeometry) throw new Error('compact friend seal rendered topper');
fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(result, null, 2)}\n`);
await context.close(); await browser.close(); console.log(JSON.stringify(result));
