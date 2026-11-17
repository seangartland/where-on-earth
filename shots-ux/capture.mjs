import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = new URL(process.env.SEAL_SHOTS ? '../shots-seal/' : './', import.meta.url).pathname;
const variant = process.argv[2];
if (!['before', 'after'].includes(variant)) throw new Error('Pass before or after');

const avatar = { v: 2, initials: 'M', disc: 'navy', motif: 'globe' };
const definitions = [
  ['first-departure', 'consistency', 'First Departure', 'Play your first Daily', 'title:day-tripper'],
  ['one-week-abroad', 'consistency', 'One Week Abroad', 'Play 7 Dailies', 'title:weekender'],
  ['regular-route', 'consistency', 'Regular Route', 'Reach a 7-day streak', 'card:regular-route'],
  ['return-ticket', 'consistency', 'Return Ticket', 'Play 25 Dailies', 'card:return-ticket'],
  ['seasoned-traveler', 'consistency', 'Seasoned Traveler', 'Play 50 Dailies', 'card:seasoned-traveler'],
  ['no-fixed-address', 'consistency', 'No Fixed Address', 'Play 100 Dailies', 'title:globetrotter'],
  ['postmarked', 'precision', 'Postmarked', 'Earn your first postcard', 'title:postmarked'],
  ['sharp-eye', 'precision', 'Sharp Eye', 'Land 5 bullseyes', 'title:sharp-eye'],
  ['right-on-the-map', 'precision', 'Right on the Map', 'Land 10 bullseyes', 'card:right-on-the-map'],
  ['perfect-itinerary', 'precision', 'Perfect Itinerary', 'Score 25,000 in a Daily', 'title:dead-reckoner'],
  ['five-star-landing', 'precision', 'Five-Star Landing', 'Earn 5 postcards', 'card:five-star-landing'],
  ['high-flyer', 'precision', 'High-Flyer', 'Average 4,000 over 10 Dailies', 'card:high-flyer'],
  ['border-crosser', 'breadth', 'Border Crosser', 'Visit 10 countries', 'title:border-crosser'],
  ['continental-breakfast', 'breadth', 'Continental Breakfast', 'Visit 3 continents', 'title:early-explorer'],
  ['frequent-flyer', 'breadth', 'Frequent Flyer', 'Visit 25 countries', 'title:frequent-flyer'],
  ['worldly', 'breadth', 'Worldly', 'Visit 50 countries', 'card:worldly'],
  ['around-the-world', 'breadth', 'Around the World', 'Visit every continent', 'card:around-the-world'],
  ['atlas-complete', 'breadth', 'Atlas Complete', 'Visit 100 countries', 'card:blue-horizon'],
].map(([id, category, name, condition, reward], index) => ({ id, category, name, condition, reward, progress: { label: index % 2 ? 'Progress' : 'Dailies', current: index + 2, target: (index + 1) * 10 }, ...(index < 12 ? { communityPercentage: `${14 + index * 3}%` } : {}) }));
const achievements = ['first-departure', 'one-week-abroad', 'postmarked', 'sharp-eye', 'border-crosser'].map((id, index) => ({ id, earnedAt: Date.UTC(2026, 10, 15 - index) }));
const ownProfile = { displayName: 'Maya', level: 8, xpToNext: 72, stats: { dailies: 34, averageScore: 18420, bestScore: 24780, bullseyes: 11, postcards: 7, bestStreak: 9, countries: 28 }, loadout: { titleId: 'sharp-eye', cardId: 'airmail', avatar, levelTwoTitle: 'window-seat' }, achievements, achievementDefinitions: definitions };
const friendProfile = { displayName: 'Ana', level: 6, stats: { dailies: 21, averageScore: 17205, bestScore: 23890, bullseyes: 8, postcards: 4, bestStreak: 6, countries: 19 }, loadout: { titleId: 'day-tripper', cardId: 'return-ticket', avatar }, achievements: achievements.slice(0, 3), achievementDefinitions: definitions.filter((item) => achievements.slice(0, 3).some((earned) => earned.id === item.id)) };
const mime = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const domainsFile = '/tmp/woe-ux-webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem('where-on-earth-account-v1', JSON.stringify({ _v: 1, accountId: 'u_me', sessionToken: 'session_test', expiresAt: Date.now() + 86400000, emailHint: 'm***@example.com', deviceId: 'dev_test', merged: true })));
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
    if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Maya', sharePins: true }, friends: [{ friendId: 'u_ana', displayName: 'Ana', since: 1 }, { friendId: 'u_jo', displayName: 'Jo', since: 2 }] } });
    if (url.pathname === '/v1/progression/friend') return route.fulfill({ json: friendProfile });
    if (url.pathname === '/v1/progression') return route.fulfill({ json: ownProfile });
    return route.fulfill({ json: {} });
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: mime[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
});

await page.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__booted, null, { timeout: 180000 });
await page.evaluate(async () => { const { openAccountSheet } = await import('/src/account/sheet.js'); await openAccountSheet(); });
await page.waitForSelector('.account-friends-list');
const capture = async (name) => {
  await page.evaluate(() => { const sheet = document.querySelector('.account-sheet'); if (sheet) sheet.scrollTop = 0; });
  await page.screenshot({ path: `${OUT}${variant}-${name}.png`, fullPage: false });
};
await capture('account');
await page.click('.account-open-profile');
await page.waitForSelector('.traveler-profile.own');
await capture('profile');
await page.click('.account-open-cabinet');
await page.waitForSelector('.traveler-profile.cabinet');
await capture('cabinet');
await page.click('.account-cabinet-back');
await page.waitForSelector('.traveler-profile.own');
await page.click('.account-customize');
await page.waitForSelector('.traveler-profile.customizer');
await capture('customize-seal');
await page.getByRole('button', { name: 'Titles', exact: true }).click();
await capture('customize-titles');
await page.click('.account-customize-back');
await page.click('.account-profile-back');
await page.waitForSelector('.account-friends-list');
await page.click('.account-friend-profile');
await page.waitForSelector('.traveler-profile.friend');
await capture('friend-profile');

const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
fs.writeFileSync(`${OUT}${variant}-result.json`, `${JSON.stringify({ errors, overflow }, null, 2)}\n`);
if (errors.length || overflow) throw new Error(JSON.stringify({ errors, overflow }));
await browser.close();
