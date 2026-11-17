import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = new URL(process.env.PROG_SHOTS ? '../shots-prog/' : process.env.DARK_SHOTS ? '../shots-dark/' : process.env.SEAL_SHOTS ? '../shots-seal/' : './', import.meta.url).pathname;
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
const ownProfile = { displayName: 'Maya', level: 8, totalXp: 900, xpIntoLevel: 88, levelSpan: 240, xpToNext: 152, stats: { dailies: 34, averageScore: 18420, bestScore: 24780, bullseyes: 11, postcards: 7, bestStreak: 9, countries: 28 }, loadout: { titleId: 'sharp-eye', cardId: 'airmail', avatar, levelTwoTitle: 'window-seat' }, achievements, achievementDefinitions: definitions };
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
const handleRoute = async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
    if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Maya', sharePins: true }, friends: [{ friendId: 'u_ana', displayName: 'Ana', since: 1 }, { friendId: 'u_jo', displayName: 'Jo', since: 2 }] } });
    if (url.pathname === '/v1/progression/friend') return route.fulfill({ json: friendProfile });
    if (url.pathname === '/v1/progression') return route.fulfill({ json: ownProfile });
    if (url.pathname === '/v1/daily/guesses') {
      const body = route.request().postDataJSON();
      const crossing = body.locationId === 'levelup';
      return route.fulfill({ json: { stored: { date: body.date, slot: body.slot, locationId: body.locationId, guess: body.guess, submittedAt: 1 }, friends: [], progressionAward: crossing
        ? { base: 100, score: 50, postcards: 10, bullseyes: 6, total: 166, xpBefore: 790, xpAfter: 956, levelBefore: 7, levelAfter: 8 }
        : { base: 100, score: 40, postcards: 5, bullseyes: 0, total: 145, xpBefore: 755, xpAfter: 900, levelBefore: 7, levelAfter: 7 } } });
    }
    return route.fulfill({ json: {} });
  }
  if (url.hostname !== 'game.local') return route.abort();
  const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
  if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
  try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: mime[path.split('.').pop()] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404, body: 'not found' }); }
};
await page.route('**/*', handleRoute);

await page.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__booted, null, { timeout: 180000 });
if (process.env.PROG_SHOTS) {
  // The Passport summary card stays hidden until the player has found a
  // place (syncPassport in src/meta/passport.js), so seed visits first.
  await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    for (const id of ['aberdeen-scotland', 'abidjan-ivory-coast', 'abu-dhabi-ae', 'abuja-ng', 'acapulco-de-juarez-mx', 'accra']) { state.passport.visits[id] = 42; state.passport.order.push(id); }
    const { syncPassport } = await import('/src/meta/passport.js');
    syncPassport();
  });
  await page.waitForSelector('.passport:not([hidden]) .xp-bar', { timeout: 30000 });
  await page.locator('.passport').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}${variant}-home-passport-bar.png`, fullPage: false });
}
if (process.env.PROG_SHOTS) {
  await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    state.daily = { date: '2026-11-16', ids: ['award'], results: Array.from({ length: 5 }, () => ({ guess: { lat: 1, lng: 2 }, distance: 12, score: 900 })), complete: false };
    state.selected = Array.from({ length: 5 }, (_, index) => ({ short: `Place ${index + 1}`, country: 'Test' }));
    const { submitDailyGuess } = await import('/src/account/friends.js');
    await submitDailyGuess(state.daily.results[0], 0);
    const { showResults } = await import('/src/modes/daily-game.js');
    showResults();
  });
  await page.waitForSelector('.xp-award');
  await page.screenshot({ path: `${OUT}${variant}-results-award.png`, fullPage: false });
  // The level-up state needs a fresh page: the real game never submits
  // guesses after the results screen opens, and a submission made after
  // showResults() returns null in this flow.
  const page2 = await context.newPage();
  page2.on('pageerror', (error) => errors.push(error.message));
  await page2.addInitScript(() => localStorage.setItem('where-on-earth-account-v1', JSON.stringify({ _v: 1, accountId: 'u_me', sessionToken: 'session_test', expiresAt: Date.now() + 86400000, emailHint: 'm***@example.com', deviceId: 'dev_test', merged: true })));
  await page2.route('**/*', handleRoute);
  await page2.goto('https://game.local/?accounts=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page2.waitForFunction(() => window.__booted, null, { timeout: 180000 });
  await page2.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    state.daily = { date: '2026-11-16', ids: ['p1', 'p2', 'p3', 'p4', 'levelup'], results: Array.from({ length: 5 }, () => ({ guess: { lat: 1, lng: 2 }, distance: 12, score: 900 })), complete: false };
    state.selected = Array.from({ length: 5 }, (_, index) => ({ short: `Place ${index + 1}`, country: 'Test' }));
    const { submitDailyGuess } = await import('/src/account/friends.js');
    for (let slot = 0; slot < 5; slot += 1) await submitDailyGuess(state.daily.results[slot], slot);
    const { showResults } = await import('/src/modes/daily-game.js');
    showResults();
  });
  await page2.waitForSelector('.level-up-card');
  await page2.screenshot({ path: `${OUT}${variant}-results-levelup.png`, fullPage: false });
  await page2.close();
}
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
if (process.env.PROG_SHOTS) await capture('profile-block');
await page.click('.account-open-cabinet');
await page.waitForSelector('.traveler-profile.cabinet');
await capture('cabinet');
if (process.env.PROG_SHOTS) await capture('cabinet-friendly-labels');
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
