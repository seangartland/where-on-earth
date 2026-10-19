// Daily postcard pack, headless verification (docs/daily-pack-spec.md section 5,
// build steps 2 and 3). Serves DEMO_DIR (default: this repo) at https://game.local.
//   Flow A, fresh profile: tap the row, generation saved before the first clue,
//   card 1 hit inside 150 km (meta.e set), card 2 miss (seen-only + grey toast),
//   reload during card 3 resumes the same card, done screen totals, a flipped
//   slot opens the postcard detail, home row done state, then a Survival hit
//   on the grey pack card colours it.
//   Flow B, seeded: a repeat shows "Already in your Passport" and no toast; a
//   round finishing after midnight returns to a stale pack screen.
// Prints a JSON summary; writes shots/pack/out/pack-verify.json; exit 1 on any failed check.
//   node shots/pack/pack-verify.mjs
import { chromium } from '/home/hatch/workspace/map-game/shots/passport/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const HERE = new URL('.', import.meta.url).pathname;
const DEMO = process.env.DEMO_DIR || new URL('../../', import.meta.url).pathname;
const OUT = `${HERE}out/`;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'] });
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain' };
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); };

async function page(height = 844) {
  const ctx = await b.newContext({ viewport: { width: 390, height }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'game.local') return r.fulfill({ status: 404, body: '' });
    const path = decodeURIComponent(u.pathname.replace(/^\//, '')) || 'index.html';
    try { r.fulfill({ body: fs.readFileSync(DEMO + path), contentType: MIME[path.split('.').pop()] || 'application/octet-stream' }); } catch { r.fulfill({ status: 404, body: 'nf' }); }
  });
  await p.addInitScript(() => { window.__travelAnim = false; });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  return p;
}
const ready = (p) => p.waitForFunction(() => window.__game && !document.getElementById('pack-button').disabled, null, { timeout: 60000 });
const pack = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('where-on-earth-pack-v1')));
const passport = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('where-on-earth-passport-v1') || 'null'));
const item = (p, id) => p.evaluate(async (id) => {
  const all = [...await (await fetch('assets/locations.json')).json(), ...await (await fetch('assets/locations-landmarks-sol.json')).json()];
  return all.find((l) => l.id === id);
}, id);
const screen = (p) => p.evaluate(() => {
  const s = document.getElementById('pack-screen');
  return {
    visible: !s.hidden,
    slots: s.querySelectorAll('.pack-slot').length,
    mystery: s.querySelectorAll('.pack-slot.is-mystery').length,
    flipped: s.querySelectorAll('.pack-slot[role="button"]').length,
    seen: s.querySelectorAll('.pack-slot[data-earn="seen"]').length,
    bases: [...s.querySelectorAll('.pack-slot-base')].map((e) => e.textContent),
    line: s.querySelector('.pack-line').textContent,
    score: s.querySelector('.pack-score').hidden ? null : s.querySelector('.pack-score').textContent,
    ready: !s.querySelector('.pack-ready').hidden,
    primary: s.querySelector('.pack-primary').textContent,
  };
});
const round = (p) => p.evaluate(() => ({
  mode: window.__game.state.mode, item: window.__game.state.item, body: document.body.className,
  number: document.getElementById('round-number').textContent,
  weightShown: getComputedStyle(document.getElementById('round-weight')).display !== 'none',
  dateShown: !document.getElementById('daily-date').hidden,
  clue: document.getElementById('clue').textContent,
}));
const reveal = (p) => p.evaluate(() => ({
  mode: window.__game.state.mode, body: document.body.className,
  name: document.getElementById('reveal-name').textContent,
  repeat: document.querySelector('#reveal-name .reveal-repeat')?.textContent || null,
  pill: document.getElementById('reveal-pill').textContent,
  multShown: getComputedStyle(document.getElementById('score-mult')).display !== 'none',
  next: document.getElementById('next-button').textContent,
}));
const toast = (p) => p.evaluate(() => { const t = document.querySelector('.earn-toast'); return t ? { seen: t.classList.contains('seen'), text: t.innerText.replace(/\s+/g, ' ').trim() } : null; });
const guessAt = async (p, at, miss) => {
  const target = miss ? { lat: -at.lat, lng: at.lng > 0 ? at.lng - 180 : at.lng + 180 } : { lat: at.lat + (at.lat > 80 ? -0.5 : 0.5), lng: at.lng };
  await p.evaluate(({ lat, lng }) => window.__game.guess(lat, lng), target);
  await p.waitForFunction(() => window.__game.state.mode === 'reveal');
  await p.waitForTimeout(400);
};
const shot = async (p, name) => {
  const cdp = await p.context().newCDPSession(p);
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}.png`, Buffer.from(r.data, 'base64'));
};
const out = {};

// ---------------------------------------------------------------- Flow A
{
  const p = await page();
  await p.goto('https://game.local/index.html');
  await ready(p);
  await p.waitForTimeout(800);
  out.rowFresh = await p.evaluate(() => document.querySelector('#pack-button').innerText.replace(/\s+/g, ' ').trim());
  check('home row fresh label', out.rowFresh === 'Daily postcard pack 3 cards today', out.rowFresh);
  check('no pack saved before the first tap', (await pack(p)) === null);

  await p.click('#pack-button');
  const fresh = await screen(p);
  const record = await pack(p);
  out.fresh = fresh;
  out.generated = record;
  check('fresh screen: 3 face-down slots', fresh.visible && fresh.slots === 3 && fresh.mystery === 3 && fresh.flipped === 0, fresh);
  check('fresh copy', fresh.line === 'Three postcards. Pin each one.' && fresh.primary === 'Open card 1' && fresh.score === null);
  check('generated and saved before the first clue: 3 distinct ids, no results',
    record?.packs?.[0]?.ids.length === 3 && new Set(record.packs[0].ids).size === 3 && record.packs[0].results.every((r) => r === null) && record._v === 1);
  await shot(p, 'pack-1-fresh');

  const ids = record.packs[0].ids;
  // Card 1: a hit inside 150 km.
  await p.click('.pack-primary');
  const r1 = await round(p);
  out.round1 = r1;
  const it1 = await item(p, ids[0]);
  check('card 1 header: clue-only, no weight or date', r1.mode === 'guess' && r1.number === 'Card 1 of 3' && !r1.weightShown && !r1.dateShown && r1.item === ids[0] && r1.clue === it1.clue && /\bpack\b/.test(r1.body) && !/pvp/.test(r1.body), r1);
  await shot(p, 'pack-2-card1-guess');
  await guessAt(p, it1, false);
  const v1 = await reveal(p);
  const pp1 = await passport(p);
  const rec1 = await pack(p);
  out.reveal1 = v1;
  out.toast1 = await toast(p);
  check('hit inside 150 km sets meta.e', pp1.meta[ids[0]]?.e >= 1, pp1.meta[ids[0]]);
  check('card 1 result saved on reveal as new', rec1.packs[0].results[0]?.postcard?.kind === 'new' && rec1.packs[0].results[0].distance < 150, rec1.packs[0].results[0]);
  check('reveal shows +base, no multiplier, Next card', v1.pill === `+${rec1.packs[0].results[0].base}` && !v1.multShown && v1.next === 'Next card' && /game-reveal pack/.test(v1.body), v1);
  check('earn toast on a new postcard', out.toast1 && !out.toast1.seen, out.toast1);
  await p.waitForTimeout(2500); // the reveal beat: header name and sheet settle
  await shot(p, 'pack-3-card1-reveal');

  await p.click('#next-button');
  const mid = await screen(p);
  out.mid = mid;
  check('mid-pack screen: 1 flipped, 2 face-down', mid.visible && mid.flipped === 1 && mid.mystery === 2 && mid.line === '1 of 3 opened' && mid.primary === 'Open card 2' && mid.bases[0] === `+${rec1.packs[0].results[0].base.toLocaleString()}`, mid);
  await shot(p, 'pack-4-mid');

  // Card 2: a miss.
  await p.click('.pack-primary');
  const it2 = await item(p, ids[1]);
  check('card 2 header', (await round(p)).number === 'Card 2 of 3');
  await guessAt(p, it2, true);
  const pp2 = await passport(p);
  const rec2 = await pack(p);
  out.toast2 = await toast(p);
  check('miss leaves a seen-only entry', Object.hasOwn(pp2.visits, ids[1]) && !pp2.meta[ids[1]]?.e, pp2.meta[ids[1]]);
  check('miss saved as visited', rec2.packs[0].results[1]?.postcard?.kind === 'visited' && rec2.packs[0].results[1].distance > 150);
  check('grey-card toast on a first visit', out.toast2?.seen && /Visited · added to your Passport/.test(out.toast2.text) && /Land within 150 km anywhere to colour it/.test(out.toast2.text), out.toast2);
  await shot(p, 'pack-5-card2-miss');
  await p.click('#next-button');

  // Card 3: open it, then reload before guessing.
  await p.click('.pack-primary');
  const before = (await round(p)).item;
  await p.reload();
  await ready(p);
  out.rowMid = await p.evaluate(() => document.querySelector('#pack-button .mode-desc').textContent);
  check('home row mid-pack', out.rowMid === '2 of 3 opened', out.rowMid);
  await p.click('#pack-button');
  const resumed = await screen(p);
  check('reload keeps the pack: card 3 next', resumed.flipped === 2 && resumed.primary === 'Open card 3' && JSON.stringify((await pack(p)).packs[0].ids) === JSON.stringify(ids), resumed);
  await p.click('.pack-primary');
  const after = (await round(p)).item;
  check('reload mid-pack resumes the same card', before === ids[2] && after === ids[2], { before, after });
  const it3 = await item(p, ids[2]);
  await guessAt(p, it3, true);
  const v3 = await reveal(p);
  check('last card button says Done', v3.next === 'Done', v3.next);
  await p.click('#next-button');

  const done = await screen(p);
  const rec3 = await pack(p);
  const total = rec3.packs[0].results.reduce((s, r) => s + r.base, 0);
  out.done = done;
  out.total = total;
  check('done screen: 3 flipped, none face-down', done.flipped === 3 && done.mystery === 0 && done.primary === 'Done', done);
  check('pack score total out of 3,000', done.score === `Pack score ${total.toLocaleString()} / 3,000`, { score: done.score, total });
  check('per-card +base shown', JSON.stringify(done.bases) === JSON.stringify(rec3.packs[0].results.map((r) => `+${r.base.toLocaleString()}`)), done.bases);
  check('done line names the outcomes', /^1 new postcard · /.test(done.line), done.line);
  await shot(p, 'pack-6-done');

  // A flipped slot opens the postcard detail.
  await p.click('.pack-slot[role="button"] >> nth=1');
  await p.waitForTimeout(700);
  const detail = await p.evaluate(() => { const s = document.querySelector('.screen.ppd'); return { open: !s.hidden, name: s.querySelector('#ppd-title').textContent, share: s.querySelector('.ppd-share')?.textContent }; });
  out.detail = detail;
  check('flipped slot opens the postcard detail', detail.open && detail.name.includes(it2.short), detail);
  await shot(p, 'pack-7-detail');
  await p.click('.ppd-close');
  await p.waitForTimeout(700);

  await p.click('.pack-primary'); // Done -> home
  await p.waitForTimeout(300);
  out.rowDone = await p.evaluate(() => ({ text: document.querySelector('#pack-button .mode-desc').textContent, played: document.querySelector('#pack-button').classList.contains('played'), home: !document.getElementById('start-screen').hidden }));
  check('home row done state', out.rowDone.home && out.rowDone.played && out.rowDone.text === '✓ Opened · new pack at midnight', out.rowDone);

  // A Survival hit on the grey pack card colours it.
  await p.evaluate(() => window.__game.survival());
  await p.waitForFunction(() => window.__game.state.mode === 'guess');
  await p.evaluate(async (grey) => { const { survival } = await import('/src/modes/survival.js'); survival.item = grey; }, it2);
  await guessAt(p, it2, false);
  const pp4 = await passport(p);
  check('pack miss then Survival hit colours the card', pp4.meta[ids[1]]?.e >= 1, pp4.meta[ids[1]]);
  await p.goto('https://game.local/index.html');
  await ready(p);
  await p.click('#pack-button');
  const recolour = await screen(p);
  const greyLeft = rec3.packs[0].results.filter((r, i) => i !== 1 && r.postcard.kind === 'visited').length;
  check('pack screen shows the coloured card', recolour.seen === greyLeft, { recolour, greyLeft });
  out.errsA = p.errs;
  check('flow A: zero page errors', p.errs.length === 0, p.errs);
  await p.context().close();
}

// ---------------------------------------------------------------- Flow B
{
  const p = await page();
  await p.goto('https://game.local/index.html');
  await ready(p);
  const ids = await p.evaluate(async () => {
    const locs = (await (await fetch('assets/locations.json')).json()).filter((l) => l.image && !l.image.includes('No_image_available'));
    const ids = [locs[10].id, locs[20].id, locs[30].id];
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('where-on-earth-pack-v1', JSON.stringify({ _v: 1, date, packs: [{ ids, results: [null, null, null] }] }));
    localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({ _v: 1, v: 2, visits: { [ids[0]]: 100 }, order: [ids[0]], meta: { [ids[0]]: { b: 100, d: 5000, f: '2026-10-01', t: Date.now() } } }));
    return ids;
  });
  await p.reload();
  await ready(p);
  await p.click('#pack-button');
  check('seeded pack is used as saved (no reroll)', JSON.stringify((await pack(p)).packs[0].ids) === JSON.stringify(ids));
  await p.click('.pack-primary');
  const it = await item(p, ids[0]);
  await guessAt(p, it, true);
  const v = await reveal(p);
  const rec = await pack(p);
  out.repeat = { reveal: v, toast: await toast(p), result: rec.packs[0].results[0] };
  check('repeat: "Already in your Passport" on the reveal', v.repeat === 'Already in your Passport' && v.name.startsWith(it.clue), v);
  check('repeat: no toast', out.repeat.toast === null, out.repeat.toast);
  check('repeat saved as repeat', rec.packs[0].results[0].postcard.kind === 'repeat');
  await p.waitForTimeout(2500); // the reveal beat: header name and sheet settle
  await shot(p, 'pack-8-repeat');
  await p.click('#next-button');

  // Midnight with a card on screen: it banks under its own date, Next shows the stale screen.
  await p.click('.pack-primary');
  // The clock passes midnight: the record in play (and on disk) is now yesterday's.
  await p.evaluate(async () => {
    const { pack } = await import('/src/modes/pack.js');
    pack.record.date = '2000-01-01';
    const saved = JSON.parse(localStorage.getItem('where-on-earth-pack-v1'));
    localStorage.setItem('where-on-earth-pack-v1', JSON.stringify({ ...saved, date: '2000-01-01' }));
  });
  const it2 = await item(p, ids[1]);
  await guessAt(p, it2, false);
  const banked = await pack(p);
  check('round finishing after midnight banks under its own date', banked.date === '2000-01-01' && banked.packs[0].results[1]?.postcard?.kind === 'new', banked);
  await p.click('#next-button');
  const stale = await screen(p);
  out.stale = stale;
  check('after midnight: pack screen offers today\'s pack', stale.ready && stale.primary === 'Open today’s pack' && stale.flipped === 2, stale);
  await shot(p, 'pack-9-stale');
  await p.click('.pack-primary');
  const fresh = await screen(p);
  check('today\'s pack opens fresh', fresh.mystery === 3 && fresh.primary === 'Open card 1' && !fresh.ready, fresh);
  out.errsB = p.errs;
  check('flow B: zero page errors', p.errs.length === 0, p.errs);
  await p.context().close();
}

// ---------------------------------------------------------------- Flow C
// Home placement and cleanup at the two approved phone sizes.
for (const height of [844, 664]) {
  const p = await page(height);
  await p.addInitScript(() => {
    localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({
      _v: 1, v: 2, visits: { 'london-uk': 900 }, order: ['london-uk'],
      meta: { 'london-uk': { b: 900, d: 20, e: 1, f: '2026-10-18', t: Date.now() } },
    }));
  });
  await p.goto('https://game.local/index.html');
  await ready(p);
  await p.waitForTimeout(500);
  const layout = await p.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const start = document.getElementById('start-screen');
    const daily = box('#play-button');
    const packRow = box('#pack-button');
    const survival = box('#survival-hub-button');
    const expeditions = box('#expeditions-button');
    const challenge = box('#pvp-button');
    const more = box('#more-modes-button');
    const gear = document.querySelector('.settings-entry');
    const gr = gear.getBoundingClientRect();
    return {
      overflow: start.scrollHeight - start.clientHeight,
      dailyWidth: daily.width,
      gridWidth: document.querySelector('.mode-buttons').getBoundingClientRect().width,
      packBelowDaily: packRow.top >= daily.bottom && packRow.width === daily.width,
      pairs: Math.abs(survival.top - expeditions.top) < 1 && Math.abs(challenge.top - more.top) < 1,
      gearHit: document.elementFromPoint(gr.left + gr.width / 2, gr.top + gr.height / 2) === gear,
      homeMute: Boolean(start.querySelector('.mute-toggle')),
      continentChips: start.querySelectorAll('.passport-continents').length,
      moreLabel: document.querySelector('#more-modes-button .mode-desc').textContent,
      expeditionLabel: document.querySelector('#expeditions-button .mode-desc').textContent,
      endless: Boolean(document.getElementById('endless-button')),
    };
  });
  out[`layout${height}`] = layout;
  check(`${height}: home has no overflow`, layout.overflow <= 0, layout);
  check(`${height}: Daily and pack stay full width; mode pairs stay intact`,
    layout.dailyWidth === layout.gridWidth && layout.packBelowDaily && layout.pairs, layout);
  check(`${height}: settings gear owns its hit target`, layout.gearHit, layout);
  check(`${height}: home cleanup C1/C4/C5`, !layout.homeMute && !layout.endless && layout.continentChips === 0, layout);
  check(`${height}: dynamic and More modes labels`,
    layout.moreLabel === 'Landmarks and trivia' && /^(This week: .+|Themed journeys)$/.test(layout.expeditionLabel), layout);
  await p.context().close();
}

await b.close();
const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ passed: checks.length - failed.length, total: checks.length, failed }, null, 1));
fs.writeFileSync(`${OUT}pack-verify.json`, JSON.stringify({ checks, out }, null, 1));
process.exit(failed.length ? 1 : 0);
