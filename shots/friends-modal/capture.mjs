import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const session = { _v: 1, accountId: 'u_me', sessionToken: 'session_test', expiresAt: Date.now() + 86400000, emailHint: 'm***@example.test', deviceId: 'dev_test', merged: true };
const friends = [
  { friendId: 'u_ana', displayName: 'Ana', since: 1, level: 2, loadout: { titleId: 'window-seat', cardId: 'airmail', avatar: { v: 2, initials: 'AN', disc: 'burgundy', motif: 'globe' } } },
  { friendId: 'u_bo', displayName: 'Bo', since: 2, level: 5, loadout: { titleId: 'day-tripper', cardId: 'return-ticket', avatar: { v: 2, initials: 'BO', disc: 'forest', motif: 'plane' } } },
];
const profile = { displayName: 'Maya', level: 4, totalXp: 440, xpIntoLevel: 80, levelSpan: 160, stats: { dailies: 4, averageScore: 900, bestScore: 1200, bullseyes: 1, postcards: 0, bestStreak: 2, countries: 4 }, loadout: { titleId: 'traveler', cardId: 'blue-horizon', avatar: { v: 2, initials: 'MY', disc: 'navy', motif: 'globe' } }, achievements: [], achievementDefinitions: [] };
fs.mkdirSync(OUT, { recursive: true });
const domainFile = '/tmp/friends-modal-webgl-domains.txt';
fs.writeFileSync(domainFile, 'hatch-webgl-all-origins-v1\n');
const domainHash = crypto.createHash('sha256').update(fs.readFileSync(domainFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainFile}`, `--hatch-webgl-allowed-domains-sha256=${domainHash}`] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const requests = [];
await page.addInitScript((saved) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(saved)), session);
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === 'woe-account.gartland-79.workers.dev' || url.hostname === 'api.where-on.earth') {
    requests.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Maya', sharePins: true }, friends, openInvites: 0 } });
    if (url.pathname === '/v1/progression') return route.fulfill({ json: profile });
    if (url.pathname === '/v1/friends/profile' && route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ json: { me: { displayName: body.displayName ?? 'Maya', sharePins: body.sharePins ?? true } } });
    }
    if (url.pathname === '/v1/friends/invites') return route.fulfill({ json: { token: 'tok_test123' } });
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
await page.waitForSelector('.traveler-friends');

// Shot 1: own profile with the list and the Add friend button, no inline form.
await page.screenshot({ path: `${OUT}own-profile-with-add-button-390x844.png`, fullPage: false });
const beforeOpen = await page.evaluate(() => ({
  hasOldDoorRow: !!document.querySelector('.account-open-friends'),
  hasOldFriendsPage: !!document.querySelector('.friends-page'),
  hasInlineFriendsAdd: !!document.querySelector('.friends-add'),
  rows: document.querySelectorAll('.friend-page-row').length,
  hasAddFriendButton: !!document.querySelector('.account-add-friend'),
  modalHiddenBeforeOpen: document.querySelector('.account-add-friend-modal')?.hidden,
  overflowX: document.documentElement.scrollWidth > innerWidth,
}));
if (beforeOpen.rows !== friends.length || beforeOpen.hasOldDoorRow || beforeOpen.hasOldFriendsPage || beforeOpen.hasInlineFriendsAdd || !beforeOpen.hasAddFriendButton || beforeOpen.modalHiddenBeforeOpen !== true || beforeOpen.overflowX) {
  throw new Error(`before-open evidence failed: ${JSON.stringify(beforeOpen)}`);
}

// Open the modal.
await page.click('.account-add-friend');
await page.waitForSelector('.account-add-friend-modal:not([hidden])');
await page.screenshot({ path: `${OUT}add-friend-modal-open-390x844.png`, fullPage: false });
const afterOpen = await page.evaluate(() => ({
  modalHidden: document.querySelector('.account-add-friend-modal')?.hidden,
  hasNameForm: !!document.querySelector('.account-add-friend-modal .account-name-form'),
  hasNameInput: !!document.querySelector('.account-add-friend-modal #account-friend-name'),
  hasInviteButton: !!document.querySelector('.account-add-friend-modal .account-invite'),
  modalTitle: document.querySelector('.account-add-friend-modal h3')?.textContent.trim(),
  overflowX: document.documentElement.scrollWidth > innerWidth,
}));
if (afterOpen.modalHidden !== false || !afterOpen.hasNameForm || !afterOpen.hasNameInput || !afterOpen.hasInviteButton || afterOpen.modalTitle !== 'Add friends' || afterOpen.overflowX) {
  throw new Error(`after-open evidence failed: ${JSON.stringify(afterOpen)}`);
}

// End-to-end: save name, create invite, link appears, status updates.
await page.fill('#account-friend-name', 'Maya T');
await page.click('.account-name-form button[type="submit"]');
await page.waitForFunction(() => document.querySelector('.account-add-friend-modal .account-status')?.textContent.includes('Name saved'));
await page.click('.account-invite');
await page.waitForSelector('.account-invite-link:not([hidden])');
const flowEvidence = await page.evaluate(() => ({
  linkValue: document.querySelector('.account-invite-link-input')?.value,
  status: document.querySelector('.account-add-friend-modal .account-status')?.textContent,
}));
if (!flowEvidence.linkValue?.includes('/friend-invite/') || !flowEvidence.status) {
  throw new Error(`invite-flow evidence failed: ${JSON.stringify(flowEvidence)}`);
}

// Close via the close control, then confirm the modal is closed and the own profile is what's shown.
await page.click('.account-modal-close');
await page.waitForFunction(() => document.querySelector('.account-add-friend-modal')?.hidden === true);
const afterCloseButton = await page.evaluate(() => ({
  modalHidden: document.querySelector('.account-add-friend-modal')?.hidden,
  onOwnProfile: !!document.querySelector('.traveler-friends'),
}));

// Re-open, then close via backdrop click (sheet's usual backdrop behavior).
await page.click('.account-add-friend');
await page.waitForSelector('.account-add-friend-modal:not([hidden])');
await page.mouse.click(5, 5);
await page.waitForFunction(() => document.querySelector('.account-add-friend-modal')?.hidden === true);
const afterBackdropClose = await page.evaluate(() => ({
  modalHidden: document.querySelector('.account-add-friend-modal')?.hidden,
  onOwnProfile: !!document.querySelector('.traveler-friends'),
}));

if (!afterCloseButton.modalHidden || !afterCloseButton.onOwnProfile || !afterBackdropClose.modalHidden || !afterBackdropClose.onOwnProfile) {
  throw new Error(`close evidence failed: ${JSON.stringify({ afterCloseButton, afterBackdropClose })}`);
}

const evidence = { beforeOpen, afterOpen, flowEvidence, afterCloseButton, afterBackdropClose };
fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify({ evidence, requests }, null, 2)}\n`);
console.log(JSON.stringify({ evidence, requests }));
await context.close();
await browser.close();
