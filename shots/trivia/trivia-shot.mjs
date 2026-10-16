// Copy of ~/workspace/map-game/shots/passport/trivia-shot.mjs, kept with its
// screenshots. Run it from that directory (playwright is installed there):
//   cd ~/workspace/map-game/shots/passport && node trivia-shot.mjs

// Trivia clues mode (docs/expeditions-rethink-opus.md, Proposal 2 follow-on).
// 390px touch viewport, hub-landmarks-shot pattern: the hub, the Trivia row,
// Lock in, Next, the results actions and the Passport are reached with real
// taps; entry visibility is asserted by a hit test, never forced. Round 1 is
// placed with a real globe tap; rounds 2 to 5 drop pins via
// window.__game.guess at chosen offsets. Prints one JSON object.
import { chromium } from 'playwright';
import fs from 'node:fs';
const DEMO = '/home/hatch/workspace/map-game/demo/';
const out = DEMO + 'shots/trivia/';
fs.mkdirSync(out, { recursive: true });
const bankAll = JSON.parse(fs.readFileSync(DEMO + 'assets/trivia-bank.json', 'utf8'));
const bankById = new Map(bankAll.map((x) => [x.id, x]));
// Playable rule, restated from src/modes/trivia.js.
const playable = bankAll.filter((x) => Number.isInteger(x.difficulty) && x.difficulty >= 1 && x.difficulty <= 10 && x.image && x.photo === 'verified');
const BANDS = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];
const bankImages = new Set(bankAll.map((x) => x.image).filter(Boolean));

const b = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const p = await ctx.newPage();
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain', svg: 'image/svg+xml' };
await p.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === 'cdn.jsdelivr.net') { try { return r.fulfill({ body: fs.readFileSync('/home/hatch/workspace/map-game/shots/cdn/' + u.pathname.split('/').pop()), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }); } catch { return r.continue(); } }
  if (u.hostname.includes('wikimedia')) return r.fulfill({ body: fs.readFileSync(DEMO + 'assets/og.png'), contentType: 'image/png' });
  if (u.hostname !== 'game.local') return r.fulfill({ status: 404, body: 'offline' });
  const path = u.pathname.replace(/^\//, '') || 'index.html';
  try { r.fulfill({ body: fs.readFileSync(DEMO + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { r.fulfill({ status: 404, body: 'nf' }); }
});
await ctx.addInitScript(() => {
  window.__shared = [];
  Object.defineProperty(navigator, 'share', { value: async ({ text }) => { window.__shared.push(text); }, configurable: true });
});
const cdp = await ctx.newCDPSession(p);
const shots = [];
const wait = (ms) => p.waitForTimeout(ms);
const shot = async (name) => { await wait(1500); const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(out + name, Buffer.from(r.data, 'base64')); shots.push('shots/trivia/' + name); };
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
const checks = {};
const res = { bankEntries: bankAll.length, playable: playable.length };

// True when a real tap at the element's centre would land on it.
const hittable = (sel) => p.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el || !el.checkVisibility()) return false;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return Boolean(hit && el.contains(hit));
}, sel);
const tapVisible = async (sel) => {
  await p.waitForFunction((s) => {
    const el = document.querySelector(s);
    if (!el || !el.checkVisibility() || el.disabled) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return Boolean(hit && el.contains(hit));
  }, sel, { timeout: 20000 });
  await p.tap(sel);
};
const passportView = async (view) => {
  await tapVisible('.passport-entry');
  await p.waitForSelector('.passport-screen:not([hidden])');
  await p.tap(`.pp-tabs [data-view="${view}"]`);
  await wait(400);
};
const closePassport = async () => { await p.evaluate(() => document.querySelector('.passport-screen .stats-close').click()); await wait(300); };
const passportTotals = async () => {
  await passportView('places');
  const r = await p.evaluate(() => ({
    found: document.querySelector('[data-pp="found"]').textContent,
    total: document.querySelector('[data-pp="total"]').textContent,
    placesSlots: document.querySelectorAll('[data-pp="dex"] .pp-slot').length,
    placesOpen: document.querySelectorAll('[data-pp="dex"] .pp-slot:not(.is-mystery)').length,
  }));
  await p.tap('.pp-tabs [data-view="landmarks"]');
  await wait(400);
  Object.assign(r, await p.evaluate(() => ({
    landmarkSummary: document.querySelector('[data-pp="landmark-summary"]').textContent,
    landmarkSlots: document.querySelectorAll('[data-pp="landmark-dex"] .pp-slot').length,
    landmarkOpen: document.querySelectorAll('[data-pp="landmark-dex"] .pp-slot:not(.is-mystery)').length,
  })));
  await closePassport();
  return r;
};
const storedPassport = () => p.evaluate(() => localStorage.getItem('where-on-earth-passport-v1'));
const storageKeys = () => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('where-on-earth-')).sort());
const openHub = async () => {
  await tapVisible('#more-modes-button');
  await p.waitForSelector('#more-modes-hub:not([hidden])');
  await wait(300);
};

await p.goto('https://game.local/index.html');
await p.waitForFunction(() => window.__game && !document.getElementById('trivia-button').disabled
  && !document.getElementById('landmarks-button').disabled && !document.querySelector('.passport-entry').disabled, null, { timeout: 60000 });
await p.evaluate(() => { window.__travelAnim = false; });
await p.waitForFunction(() => {
  const mm = document.getElementById('more-modes-button');
  const r = mm.getBoundingClientRect();
  return mm.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
}, null, { timeout: 15000 }).catch(() => {});

// 1. Passport totals before any trivia game.
res.before = await passportTotals();
res.passportBefore = await storedPassport();
res.keysBefore = await storageKeys();

// 2. Hub: the Trivia row is live and shows the clue count; Photo stays Coming soon.
await openHub();
res.hub = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#more-modes-hub .expedition-choice')];
  return rows.map((row) => ({ id: row.id, text: row.innerText.replace(/\n/g, ' / '), disabled: row.disabled }));
});
res.hub.triviaSub = await p.evaluate(() => document.querySelector('[data-hub-best="trivia"]').textContent);
res.hub.triviaHittable = await hittable('#trivia-button');
res.hub.scrollW = await p.evaluate(() => document.documentElement.scrollWidth);
await shot('01-hub.png');
checks.hubTriviaLive = res.hub.triviaHittable && res.hub.some((r) => r.id === 'trivia-button' && !r.disabled)
  && res.hub.triviaSub === `${playable.length.toLocaleString()} clues`;
checks.hubPhotoComingSoon = res.hub.some((r) => /Photo mode/.test(r.text) && /Coming soon/.test(r.text) && r.disabled);
checks.hubOrder = res.hub.map((r) => r.text.split(' / ')[0]).join('|') === 'Landmarks|Trivia clues|Photo mode';

// 3. A full five-round game.
await tapVisible('#trivia-button');
const OFFSETS = [null, [0.3, 0.3], [3, 3], [-10, 12], [25, -30]];
const rounds = [];
for (let i = 0; i < 5; i += 1) {
  await p.waitForFunction(() => window.__game.state.mode === 'guess' && window.__canGuess, null, { timeout: 30000 });
  await wait(300);
  const st = await p.evaluate((imgs) => {
    const visibleImgs = [...document.querySelectorAll('img')].filter((img) => img.checkVisibility() && img.getAttribute('src'));
    return {
      id: window.__game.state.item,
      header: document.getElementById('round-number').textContent,
      clue: document.getElementById('clue').textContent,
      clueVisible: document.getElementById('clue').checkVisibility(),
      revealHidden: !document.getElementById('reveal-card').checkVisibility(),
      nameBeforeGuess: document.getElementById('reveal-name').checkVisibility() ? document.getElementById('reveal-name').textContent : null,
      bankPhotoVisible: visibleImgs.filter((img) => imgs.includes(img.getAttribute('src'))).length,
      bodyText: document.getElementById('round-screen').innerText,
    };
  }, [...bankImages]);
  const entry = bankById.get(st.id);
  st.inBank = Boolean(entry);
  st.difficulty = entry?.difficulty;
  st.clueMatches = Boolean(entry) && st.clue === entry.clue;
  // The place name may only appear where the clue itself contains it.
  st.nameShown = Boolean(entry) && st.bodyText.replace(entry.clue, '').toLowerCase().includes(entry.short.toLowerCase());
  delete st.bodyText;
  if (i === 0) await shot('02-clue-round.png');
  if (i === 0) {
    // Real tap on the globe, then a real tap on Lock in.
    await p.touchscreen.tap(195, 520);
    await wait(500);
    await tapVisible('#lock-button');
  } else {
    const [dLat, dLng] = OFFSETS[i];
    await p.evaluate(([lat, lng]) => window.__game.guess(lat, lng), [entry.lat + dLat, Math.max(-179, Math.min(179, entry.lng + dLng))]);
  }
  await p.waitForFunction(() => document.getElementById('reveal-card').checkVisibility(), null, { timeout: 30000 });
  await wait(600);
  const rv = await p.evaluate(() => {
    const thumb = document.getElementById('place-thumb');
    const peek = document.getElementById('peek-thumb');
    return {
      revealName: document.getElementById('reveal-name').textContent,
      distance: document.getElementById('distance').textContent,
      pill: document.getElementById('reveal-pill').textContent,
      next: document.getElementById('next-button').textContent,
      thumbSrc: thumb.getAttribute('src'),
      photoShown: (thumb.checkVisibility() && !thumb.hidden) || (peek.checkVisibility() && !peek.hidden),
      peekSrc: peek.getAttribute('src'),
    };
  });
  rv.photoIsEntry = Boolean(entry) && rv.thumbSrc === entry.image && rv.peekSrc === entry.image;
  rv.nameIsShort = Boolean(entry) && rv.revealName === entry.short;
  if (i === 0) await shot('03-clue-reveal.png');
  rounds.push({ ...st, ...rv });
  await tapVisible('#next-button');
}
res.rounds = rounds;
checks.fiveRounds = rounds.length === 5 && rounds.every((r, i) => r.header === `Round ${i + 1} of 5`);
checks.everyRoundClue = rounds.every((r) => r.clueVisible && r.clueMatches);
checks.noNameBeforeGuess = rounds.every((r) => r.revealHidden && r.nameBeforeGuess === null && !r.nameShown);
checks.noPhotoBeforeGuess = rounds.every((r) => r.bankPhotoVisible === 0);
checks.photoAtReveal = rounds.every((r) => r.photoShown && r.photoIsEntry);
checks.revealNamesPlace = rounds.every((r) => r.nameIsShort);
checks.targetsInBank = rounds.every((r) => r.inBank);
// Only photo-verified entries may be drawn (docs/trivia-bank-repair-report.md).
checks.targetsVerified = rounds.every((r) => bankById.get(r.id)?.photo === 'verified');
checks.noRepeatTarget = new Set(rounds.map((r) => r.id)).size === 5;
checks.bandSpread = rounds.every((r, i) => r.difficulty >= BANDS[i][0] && r.difficulty <= BANDS[i][1]);
checks.lastNextIsResults = rounds[4].next === 'Results' && rounds.slice(0, 4).every((r) => r.next === 'Next');

// 4. Results.
await p.waitForSelector('#survival-results-screen:not([hidden])', { timeout: 30000 });
await wait(400);
res.results = await p.evaluate(() => ({
  eyebrow: document.getElementById('survival-result-eyebrow').textContent,
  title: document.getElementById('survival-result-title').textContent,
  summary: document.getElementById('survival-result-summary').textContent,
  final: document.getElementById('survival-final-streak').textContent,
  finalLabel: document.getElementById('survival-final-label').textContent,
  best: document.getElementById('survival-best-streak').textContent,
  bestLabel: document.getElementById('survival-best-label').textContent,
  lines: [...document.querySelectorAll('#run-results-breakdown li')].map((li) => li.innerText.replace(/\n/g, ' ')),
  linePoints: [...document.querySelectorAll('#run-results-breakdown .points')].map((x) => Number(x.textContent.replace(/,/g, ''))),
  breakdownVisible: document.getElementById('run-breakdown').checkVisibility(),
  bestKey: localStorage.getItem('where-on-earth-best-trivia'),
  scrollW: document.documentElement.scrollWidth,
}));
const total = res.results.linePoints.reduce((a, c) => a + c, 0);
res.results.total = total;
const pillPoints = rounds.map((r) => Number(r.pill.replace(/[+,]/g, '')));
await shot('04-results.png');
checks.resultsTotal = res.results.title === `${total.toLocaleString()} / 5,000` && res.results.final === total.toLocaleString()
  && JSON.stringify(pillPoints) === JSON.stringify(res.results.linePoints);
checks.resultsLines = res.results.breakdownVisible && res.results.lines.length === 5
  && res.results.lines.every((line, i) => line.includes(bankById.get(rounds[i].id).short) && line.includes(rounds[i].distance));
checks.bestKeyHolds = res.results.bestKey === String(total) && res.results.best === total.toLocaleString() && res.results.bestLabel === 'Best';

// Share text: the new builder.
await tapVisible('#survival-share');
await wait(400);
res.share = await p.evaluate(() => window.__shared.at(-1) || null);
checks.shareTrivia = Boolean(res.share) && res.share.startsWith('Where on Earth? · Trivia\n')
  && res.share.includes(`${total.toLocaleString()} / 5,000`) && !res.share.includes('\u2014') && !/places visited/.test(res.share);

// 5. Home, then the Passport is unchanged; the hub shows the best.
await tapVisible('#survival-home');
await p.waitForSelector('#start-screen:not([hidden])');
res.after = await passportTotals();
res.passportAfter = await storedPassport();
res.keysAfter = await storageKeys();
checks.passportUnchanged = JSON.stringify(res.before) === JSON.stringify(res.after) && res.passportBefore === res.passportAfter;
checks.onlyNewKey = JSON.stringify(res.keysAfter.filter((k) => !res.keysBefore.includes(k))) === JSON.stringify(['where-on-earth-best-trivia']);
await openHub();
res.hubAfter = await p.evaluate(() => document.querySelector('[data-hub-best="trivia"]').textContent);
checks.hubShowsBest = res.hubAfter === `${playable.length.toLocaleString()} clues · Best ${total.toLocaleString()}`;
await shot('05-hub-best.png');

// 6. Play again starts a fresh trivia game.
await tapVisible('#trivia-button');
await p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 30000 });
const again1 = await p.evaluate(() => ({ id: window.__game.state.item, header: document.getElementById('round-number').textContent }));
for (let i = 0; i < 5; i += 1) {
  await p.waitForFunction(() => window.__game.state.mode === 'guess' && window.__canGuess, null, { timeout: 30000 });
  const id = await p.evaluate(() => window.__game.state.item);
  const e = bankById.get(id);
  await p.evaluate(([lat, lng]) => window.__game.guess(lat, lng), [e.lat + 40 > 85 ? e.lat - 40 : e.lat + 40, e.lng]);
  await p.waitForFunction(() => document.getElementById('reveal-card').checkVisibility(), null, { timeout: 30000 });
  await tapVisible('#next-button');
}
await p.waitForSelector('#survival-results-screen:not([hidden])', { timeout: 30000 });
await tapVisible('#survival-again');
await p.waitForFunction(() => window.__game.state.mode === 'guess', null, { timeout: 30000 });
res.playAgain = await p.evaluate(() => ({ id: window.__game.state.item, header: document.getElementById('round-number').textContent, clue: document.getElementById('clue').textContent }));
checks.playAgain = again1.header === 'Round 1 of 5' && res.playAgain.header === 'Round 1 of 5' && bankById.has(res.playAgain.id)
  && res.playAgain.clue === bankById.get(res.playAgain.id).clue;
res.bestAfterLowGame = await p.evaluate(() => localStorage.getItem('where-on-earth-best-trivia'));
checks.bestIsMax = Number(res.bestAfterLowGame) >= total;

// 7. Leaving mid-game asks first (game in progress), then home.
await tapVisible('#round-screen .home-nav-btn');
await p.waitForSelector('.confirm-modal__confirm', { state: 'visible' });
res.leaveMessage = await p.evaluate(() => document.querySelector('.confirm-modal__message').textContent);
await p.tap('.confirm-modal__confirm');
await p.waitForSelector('#start-screen:not([hidden])');
checks.leaveConfirm = /progress will be lost/.test(res.leaveMessage);

// 8. The shared run-over screen still reads right for Landmarks after Trivia.
await openHub();
await tapVisible('#landmarks-button');
await p.waitForFunction(() => window.__game.state.mode === 'guess' && window.__canGuess, null, { timeout: 30000 });
res.landmarkRound = await p.evaluate(() => ({ survival: window.__game.state.survival.active, header: document.getElementById('round-number').textContent }));
await p.evaluate(() => { const s = window.__game.state; window.__game.guess(0, 0); return s; });
await p.waitForFunction(() => document.getElementById('reveal-card').checkVisibility(), null, { timeout: 30000 });
const lmNext = await p.evaluate(() => document.getElementById('next-button').textContent);
await tapVisible('#next-button');
if (lmNext !== 'See run') {
  res.landmarkNote = 'first landmark guess at 0,0 survived; skipped';
} else {
  await p.waitForSelector('#postcard-summary-screen:not([hidden]), #survival-results-screen:not([hidden])', { timeout: 30000 });
  if (await p.isVisible('#postcard-summary-screen')) await tapVisible('#postcard-summary-continue');
  await p.waitForSelector('#survival-results-screen:not([hidden])', { timeout: 30000 });
  res.landmarkResults = await p.evaluate(() => ({
    eyebrow: document.getElementById('survival-result-eyebrow').textContent,
    bestLabel: document.getElementById('survival-best-label').textContent,
    breakdownVisible: document.getElementById('run-breakdown').checkVisibility(),
  }));
}
checks.landmarksScreenRestored = res.landmarkRound.survival && res.landmarkResults?.eyebrow === 'Landmark Survival run over'
  && res.landmarkResults.bestLabel === 'Best streak' && !res.landmarkResults.breakdownVisible;

// 9. Code level: trivia.js imports no target source but its bank.
const triviaSrc = fs.readFileSync(DEMO + 'src/modes/trivia.js', 'utf8');
const mainSrc = fs.readFileSync(DEMO + 'src/main.js', 'utf8');
res.code = {
  triviaImports: triviaSrc.match(/^import .*$/gm),
  triviaRefs: ['findLocation', 'landmarks', 'locations', 'getJSON', 'fetch('].filter((w) => triviaSrc.includes(w)),
  bankLoad: mainSrc.match(/^.*triviaBankLoaded.*$/gm),
};
checks.codeBankOnly = res.code.triviaRefs.length === 0
  && res.code.triviaImports.every((line) => /'\.\/survival\.js'|'\.\.\/core\/format\.js'/.test(line))
  && res.code.bankLoad.some((line) => line.includes("getJSON('assets/trivia-bank.json').then(triviaBankLoaded)"));

checks.noPageErrors = errs.length === 0;
checks.noHorizontalScroll = res.hub.scrollW <= 390 && res.results.scrollW <= 390;
res.errs = errs;
res.shots = shots;
const passed = Object.values(checks).filter(Boolean).length;
console.log(JSON.stringify({ passed, of: Object.keys(checks).length, checks, ...res }, null, 2));
await b.close();
