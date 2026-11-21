import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('../../docs/friends-page-evidence/', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'u_me', sessionToken: 'session_test', expiresAt: Date.now() + 86400000, emailHint: 'm***@example.test', deviceId: 'dev_test', merged: true };
const friends = [
  { friendId: 'u_ana', displayName: 'Ana', since: 1, level: 2, loadout: { titleId: 'window-seat', cardId: 'airmail', avatar: { v: 2, initials: 'AN', disc: 'burgundy', motif: 'globe' } } },
  { friendId: 'u_bo', displayName: 'Bo', since: 2, level: 5, loadout: { titleId: 'day-tripper', cardId: 'return-ticket', avatar: { v: 2, initials: 'BO', disc: 'forest', motif: 'plane' } } },
  { friendId: 'u_cy', displayName: 'Cy', since: 3, level: 10, loadout: { titleId: 'sharp-eye', cardId: 'around-the-world', avatar: { v: 2, initials: 'CY', disc: 'charcoal', motif: 'compass' } } },
];
fs.mkdirSync(OUT, { recursive: true });
const domainFile = '/tmp/friends-page-webgl-domains.txt';
fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
const domainHash = crypto.createHash('sha256').update(fs.readFileSync(domainFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainFile}`, `--hatch-webgl-allowed-domains-sha256=${domainHash}`] });

async function capture(name, listed) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage(); const requests = [];
  await page.addInitScript((saved) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(saved)), session);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
      requests.push(`${route.request().method()} ${url.pathname}`);
      if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Maya', sharePins: true }, friends: listed, openInvites: 0 } });
      if (url.pathname === '/v1/progression') return route.fulfill({ json: { displayName: 'Maya', level: 4, totalXp: 440, xpIntoLevel: 80, levelSpan: 160, stats: { dailies: 4, averageScore: 900, bestScore: 1200, bullseyes: 1, postcards: 0, bestStreak: 2, countries: 4 }, loadout: { titleId: 'traveler', cardId: 'blue-horizon', avatar: { v: 2, initials: 'MY', disc: 'navy', motif: 'globe' } }, achievements: [], achievementDefinitions: [] } });
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
  await page.click('.account-open-friends');
  await page.waitForSelector('.friends-page');
  await page.screenshot({ path: `${OUT}${name}`, fullPage: false });
  const evidence = await page.evaluate(() => ({ rows: document.querySelectorAll('.friend-page-row').length, labels: [...document.querySelectorAll('.friend-page-row')].map((row) => row.textContent.trim()), overflowX: document.documentElement.scrollWidth > innerWidth }));
  if (evidence.rows !== listed.length || evidence.overflowX) throw new Error(JSON.stringify(evidence));
  await context.close();
  return { ...evidence, requests };
}

const result = { seeded: await capture('friends-seeded-390x844.png', friends), empty: await capture('friends-empty-390x844.png', []) };
fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
await browser.close();
