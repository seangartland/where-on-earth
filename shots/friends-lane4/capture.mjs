// Friends on the Daily lane 4: 390 px captures against stubbed account
// responses (no live worker), following shots/friends-lane3/capture.mjs.
// Flows: A reveal with friends (strip, chip and pin popovers, +N, slow and
// GUESS_LOCKED rounds), B review recap, C no friends (results button),
// D accounts=0 network log.
import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = new URL('./', import.meta.url).pathname;
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
const ACCOUNT_HOSTS = new Set(['api.where-on.earth', 'woe-account.gartland-79.workers.dev']);
const domainsFile = `${OUT}.webgl-domains.txt`;
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });

const SESSION = { _v: 1, accountId: 'u_me', sessionToken: 'session_test', expiresAt: Date.now() + 86400000, emailHint: 'a***@example.com', deviceId: 'dev_test', merged: true };
const FRIENDS = ['Ana', 'Bea', 'Cal', 'Dev', 'Eve'].map((name, i) => ({ friendId: `u_${name.toLowerCase()}`, displayName: name, since: i + 1 }));
// Friends' guesses, as offsets in degrees from each answer.
const OFFSETS = [[1.2, 0.8], [-3.5, 2.5], [6, -5], [-0.5, -9], [11, 12]];
const results = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Wait for n rendered frames (swiftshader runs at a few fps; pin fades are
// frame-clocked with dt capped at 1/20 s). Returns the measured fps.
const frames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const t0 = performance.now();
  let left = n;
  const step = () => (--left > 0 ? requestAnimationFrame(step) : resolve(Math.round((n * 10000) / (performance.now() - t0)) / 10));
  requestAnimationFrame(step);
}), n);

async function open(name, { url = 'https://game.local/', signedIn = true, friends = FRIENDS, post = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const log = { account: [], errors: [], answers: {} };
  page.on('pageerror', (error) => log.errors.push(error.message));
  if (signedIn) {
    await page.addInitScript((session) => localStorage.setItem('where-on-earth-account-v1', JSON.stringify(session)), SESSION);
  }
  const friendGuesses = (answer) => friends.map((friend, i) => ({
    friendId: friend.friendId, displayName: friend.displayName,
    guess: { lat: answer.lat + OFFSETS[i % OFFSETS.length][0], lng: answer.lng + OFFSETS[i % OFFSETS.length][1] }, submittedAt: 1793530000000 + i,
  }));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (ACCOUNT_HOSTS.has(url.hostname)) {
      log.account.push({ at: Date.now(), method: request.method(), path: `${url.pathname}${url.search}` });
      if (url.pathname === '/v1/friends') return route.fulfill({ json: { me: { displayName: 'Maya', sharePins: true }, friends, openInvites: 0 } });
      if (url.pathname === '/v1/daily/guesses') {
        const body = request.postDataJSON();
        const answer = log.answers[body.locationId];
        const reply = post ? await post(body, answer) : null;
        if (reply?.delay) await sleep(reply.delay);
        const stored = { date: body.date, slot: body.slot, locationId: body.locationId, guess: reply?.stored || body.guess, submittedAt: 1793541600000 };
        const payload = { stored, friends: answer ? friendGuesses(answer) : [] };
        if (reply?.locked) return route.fulfill({ status: 409, json: { code: 'GUESS_LOCKED', ...payload } });
        return route.fulfill({ json: payload });
      }
      if (url.pathname === '/v1/daily/friends') {
        const locations = {};
        for (const [id, answer] of Object.entries(log.answers)) locations[id] = { mine: answer.guess, friends: friendGuesses(answer) };
        return route.fulfill({ json: { date: url.searchParams.get('date'), locations } });
      }
      return route.fulfill({ json: {} });
    }
    if (url.hostname !== 'game.local') return route.abort();
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    if (path === 'assets/version.txt') return route.fulfill({ status: 404, body: '' });
    try {
      return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' });
    } catch {
      return route.fulfill({ status: 404, body: 'not found' });
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__booted, null, { timeout: 90000 });
  await sleep(1500);
  const cdp = await context.newCDPSession(page);
  page.shot = async (path) => fs.writeFileSync(path, Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  return { context, page, log, name };
}

// The current round's answer, recorded so the stubs can place friends near it.
async function answerFor(page, log) {
  const answer = await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    const item = state.selected[state.daily.round];
    return { id: state.daily.ids[state.daily.round], lat: item.lat, lng: item.lng, round: state.daily.round };
  });
  answer.guess = { lat: answer.lat + 2.1, lng: answer.lng - 1.7 };
  log.answers[answer.id] = answer;
  return answer;
}

async function lockIn(page, guess) {
  await page.evaluate((g) => window.dispatchEvent(new CustomEvent('pin', { detail: { ...g, confirmed: true } })), guess);
}

// What the strip shows against what friend-rows-independent math expects.
async function stripCheck(page, scope, answer) {
  return page.evaluate(async ({ scope, answer, offsets, names }) => {
    const { formatKm } = await import('/src/core/format.js');
    const { distanceScore, scoringDistanceKm } = await import('/src/game/scoring.js');
    const { state } = await import('/src/core/state.js');
    const item = state.selected[answer.round];
    const expected = names.map((name, i) => {
      const guess = { lat: answer.lat + offsets[i][0], lng: answer.lng + offsets[i][1] };
      const km = scoringDistanceKm(guess, item);
      return { name, km, text: `${name} ${formatKm(Math.round(km))}`, pop: `${name} · ${formatKm(Math.round(km))} · ${Math.round(distanceScore(km))}` };
    }).sort((a, b) => a.km - b.km);
    const strip = document.querySelector(`${scope} .friends-strip`);
    return {
      strip: Boolean(strip),
      chips: strip ? [...strip.querySelectorAll('.friend-chip')].map((chip) => chip.textContent) : [],
      empty: strip?.querySelector('.friends-empty')?.textContent || null,
      note: strip?.querySelector('.friends-note')?.textContent || null,
      expectedChips: expected.slice(0, 3).map((e) => e.text),
      expectedPops: expected.map((e) => e.pop),
    };
  }, { scope, answer, offsets: OFFSETS, names: FRIENDS.map((f) => f.displayName) });
}

// Visible friend pins on the globe (warm off-white cap colour).
async function friendPinCount(page) {
  await frames(page, 24);
  return page.evaluate(() => window.__view.globe.children.filter((child) => child.visible && child.children.some((c) => c.material?.uniforms?.uColor?.value?.getHexString?.() === 'f3e7d3')).length);
}

// ---------------------------------------------------------------- A: reveal
{
  let round = 0;
  const { context, page, log } = await open('reveal', {
    post: async (body) => {
      round = body.slot;
      if (body.slot === 1) return { locked: true, stored: { lat: body.guess.lat - 4, lng: body.guess.lng + 6 } };
      if (body.slot === 2) return { delay: 5200 };
      return null;
    },
  });
  await page.click('#play-button');
  await page.waitForSelector('#round-screen:not([hidden])');
  const a1 = await answerFor(page, log);
  const lockAt = Date.now();
  const before = log.account.filter((r) => r.path.startsWith('/v1/daily')).length;
  // Record, in page time, when the POST's event, the sheet and the strip land.
  await page.evaluate(() => {
    const t0 = performance.now();
    const order = window.__lane4Order = { eventAt: null, sheetAt: null, stripAt: null };
    window.addEventListener('daily-friend-pins', () => { order.eventAt ??= Math.round(performance.now() - t0); });
    const seen = () => {
      if (order.sheetAt == null && !document.getElementById('reveal-card').hidden) order.sheetAt = Math.round(performance.now() - t0);
      if (order.stripAt == null && document.querySelector('#reveal-card .friends-strip')) order.stripAt = Math.round(performance.now() - t0);
    };
    new MutationObserver(seen).observe(document.getElementById('round-screen'), { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  });
  await lockIn(page, a1.guess);
  await page.waitForSelector('#reveal-card .friends-strip', { timeout: 400000 });
  const timing = await page.evaluate(() => window.__lane4Order);
  const post = log.account.find((r) => r.path === '/v1/daily/guesses');
  const fps = await frames(page, 30);
  const r1 = await stripCheck(page, '#reveal-card', a1);
  const pins1 = await friendPinCount(page);
  await page.shot(`${OUT}a1-reveal-strip-390.png`);
  await page.click('#reveal-card .friend-chip >> nth=0');
  await sleep(250);
  const chipPop = await page.textContent('#reveal-card .friend-pop');
  await page.shot(`${OUT}a2-reveal-chip-popover-390.png`);
  // Tap the nearest friend's pin on the globe itself.
  const nearest = await page.evaluate(async ({ answer, offsets }) => {
    const { latLngToVec3 } = await import('/src/globe/scene.js');
    const pop = document.querySelector('#reveal-card .friend-pop');
    pop.hidden = true;
    const p = latLngToVec3(answer.lat + offsets[0][0], answer.lng + offsets[0][1]);
    return window.__view.project(p.toArray());
  }, { answer: a1, offsets: OFFSETS });
  await page.mouse.click(nearest[0], nearest[1] - 14);
  await sleep(250);
  const pinPop = await page.evaluate(() => {
    const pop = document.querySelector('#reveal-card .friend-pop');
    return pop.hidden ? null : pop.textContent;
  });
  await page.shot(`${OUT}a3-reveal-pin-popover-390.png`);
  await page.click('#reveal-card .friend-chip >> text=/^\\+/');
  const expandedChips = await page.$$eval('#reveal-card .friend-chip', (chips) => chips.map((c) => c.textContent));
  await page.shot(`${OUT}a4-reveal-expanded-390.png`);
  results.revealRound1 = {
    lockToPostMs: post ? post.at - lockAt : null, dailyRequestsBeforeLockIn: before, timing, stripAfterSheet: timing.stripAt >= timing.sheetAt, fps, ...r1,
    chipsMatch: JSON.stringify(r1.chips) === JSON.stringify([...r1.expectedChips, '+2']),
    friendPinsVisible: pins1, chipPop, chipPopMatch: chipPop === r1.expectedPops[0], pinPop, pinPopMatch: pinPop === r1.expectedPops[0],
    expandedChips, expandedCount: expandedChips.length,
  };

  // Round 2: GUESS_LOCKED from another device (no flyover from here on).
  await page.evaluate(() => { window.__travelAnim = false; });
  await page.click('#next-button');
  await page.waitForSelector('#round-screen:not([hidden])');
  await sleep(500);
  const a2 = await answerFor(page, log);
  await lockIn(page, a2.guess);
  await page.waitForSelector('#reveal-card .friends-strip', { timeout: 45000 });
  await frames(page, 30);
  const r2 = await stripCheck(page, '#reveal-card', a2);
  const local2 = await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    return state.daily.results[1].guess;
  });
  await page.shot(`${OUT}a5-reveal-other-device-390.png`);
  results.revealRound2Locked = { note: r2.note, localResultUntouched: Math.abs(local2.lat - a2.guess.lat) < 1e-9 && Math.abs(local2.lng - a2.guess.lng) < 1e-9, chips: r2.chips };

  // Round 3: the response takes 5.2 s: nothing is shown, nothing waits.
  await page.click('#next-button');
  await page.waitForSelector('#round-screen:not([hidden])');
  await sleep(500);
  const a3 = await answerFor(page, log);
  await lockIn(page, a3.guess);
  await page.waitForSelector('#reveal-card:not([hidden])', { timeout: 45000 });
  const sheetUp = Date.now();
  await sleep(8000);
  const r3 = await stripCheck(page, '#reveal-card', a3);
  results.revealRound3Slow = { strip: r3.strip, friendPinsVisible: await friendPinCount(page), errorText: await page.evaluate(() => document.querySelector('#reveal-card').textContent.match(/error|failed|offline/i)?.[0] || null), waitedAfterSheetMs: Date.now() - sheetUp };
  await page.shot(`${OUT}a6-reveal-slow-nothing-390.png`);
  results.revealErrors = log.errors;
  results.revealAccountRequests = log.account.map((r) => `${r.method} ${r.path}`);
  await context.close();
  fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(results, null, 2)}\n`);
}

// ---------------------------------------------------------------- B: review
{
  const { context, page, log } = await open('review');
  // A finished Daily: fill all five results locally, then open the review.
  const answers = await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    return state.daily.ids.map((id, i) => ({ id, lat: state.selected[i].lat, lng: state.selected[i].lng, round: i }));
  });
  for (const answer of answers) {
    answer.guess = { lat: answer.lat + 2.1, lng: answer.lng - 1.7 };
    log.answers[answer.id] = answer;
  }
  await page.evaluate(async (answers) => {
    const { state } = await import('/src/core/state.js');
    const { distanceScore, scoringDistanceKm } = await import('/src/game/scoring.js');
    state.daily.results = answers.map((a, i) => {
      const km = scoringDistanceKm(a.guess, state.selected[i]);
      return { guess: a.guess, distance: Math.round(km), distanceExact: km, base: Math.round(distanceScore(km)), score: Math.round(distanceScore(km)), postcard: { kind: 'miss' } };
    });
    state.daily.round = 4;
    state.daily.complete = true;
    const { enterReview } = await import('/src/modes/daily-game.js');
    enterReview();
  }, answers);
  await sleep(2500);
  const closed = { strip: await page.$('.recap-card .friends-strip') !== null, friendPinsVisible: await friendPinCount(page) };
  const reviewRequests = log.account.map((r) => `${r.method} ${r.path}`);
  await page.evaluate(async () => { const { openRecap } = await import('/src/modes/daily-game.js'); openRecap(2); });
  await page.waitForSelector('.recap-card .friends-strip', { timeout: 15000 });
  await frames(page, 30);
  const r = await stripCheck(page, '.recap-card', answers[2]);
  const openPins = await friendPinCount(page);
  await page.shot(`${OUT}b1-review-recap-390.png`);
  await page.click('.recap-card .friend-chip >> nth=1');
  await sleep(250);
  const pop = await page.textContent('.recap-card .friend-pop');
  await page.shot(`${OUT}b2-review-recap-popover-390.png`);
  await page.click('.recap-card .icon-close');
  await sleep(800);
  results.review = {
    recapClosed: closed, requestsOnOpen: reviewRequests, ...r,
    chipsMatch: JSON.stringify(r.chips) === JSON.stringify([...r.expectedChips, '+2']),
    friendPinsWithRecap: openPins, pop, popMatch: pop === r.expectedPops[1],
    afterClose: { strip: await page.$('.recap-card .friends-strip') !== null, friendPinsVisible: await friendPinCount(page) },
    errors: log.errors,
  };
  await context.close();
  fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(results, null, 2)}\n`);
}

// ------------------------------------------------------- C: no friends yet
{
  const { context, page, log } = await open('no-friends', { friends: [] });
  await page.evaluate(() => { window.__travelAnim = false; });
  await page.click('#play-button');
  await page.waitForSelector('#round-screen:not([hidden])');
  const a = await answerFor(page, log);
  await lockIn(page, a.guess);
  await page.waitForSelector('#reveal-card:not([hidden])', { timeout: 45000 });
  await sleep(6000);
  const reveal = { strip: await page.$('#reveal-card .friends-strip') !== null };
  await page.evaluate(async () => {
    const { state } = await import('/src/core/state.js');
    const first = state.daily.results[0];
    state.daily.results = [0, 1, 2, 3, 4].map(() => ({ ...first }));
    state.daily.round = 4;
    const { showResults } = await import('/src/modes/daily-game.js');
    showResults();
  });
  await page.waitForSelector('.friends-compare:not([hidden])', { timeout: 15000 });
  const button = await page.textContent('.friends-compare');
  await page.shot(`${OUT}c1-results-compare-button-390.png`);
  await page.click('.friends-compare');
  await page.waitForSelector('.account-friends', { timeout: 15000 });
  await sleep(400);
  await page.shot(`${OUT}c2-compare-opens-sheet-390.png`);
  results.noFriends = { reveal, button, sheetFriendsSection: Boolean(await page.$('.account-friends')), errors: log.errors };
  await context.close();
  fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(results, null, 2)}\n`);
}

// ----------------------------------------------- D: accounts=0, still signed in
{
  const { context, page, log } = await open('accounts-off', { url: 'https://game.local/?accounts=0' });
  await page.evaluate(() => { window.__travelAnim = false; });
  await page.click('#play-button');
  await page.waitForSelector('#round-screen:not([hidden])');
  const a = await answerFor(page, log);
  await lockIn(page, a.guess);
  await page.waitForSelector('#reveal-card:not([hidden])', { timeout: 45000 });
  await sleep(6000);
  await page.shot(`${OUT}d1-accounts-off-reveal-390.png`);
  const dom = await page.evaluate(() => ({
    strip: Boolean(document.querySelector('.friends-strip')),
    distance: document.getElementById('distance').textContent,
    score: document.getElementById('round-score').textContent,
  }));
  results.accountsOff = { accountRequests: log.account.length, ...dom, friendPinsVisible: await friendPinCount(page), errors: log.errors };
  await context.close();
  fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(results, null, 2)}\n`);
}

await browser.close();
fs.rmSync(domainsFile, { force: true });
fs.writeFileSync(`${OUT}capture-result.json`, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
