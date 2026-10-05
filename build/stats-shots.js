// Renders the stats page at 390px and captures it. Run with the demo served on :8130.
// Screenshots are slow (~1 min each) because .glass backdrop-filter over a live WebGL
// canvas starves the software compositor, so the render loop is frozen after boot: the
// canvas keeps its last rendered frame while the DOM stays fully interactive.
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
const fs = require('fs');

const URL = 'http://127.0.0.1:8130/';
const OUT = __dirname + '/stats-shots';
const HISTORY_KEY = 'where-on-earth-history-v1';

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// 34 days of deterministic, realistically spread daily results (today excluded).
function makeHistory(days) {
  const out = [];
  const today = new Date();
  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const kms = [400, 900, 1500, 2600, 5200].map((k, r) => Math.round(k * (0.6 + ((i * 7 + r * 13) % 100) / 100)));
    const rounds = kms.map((km, r) => ({
      base: Math.round(100 * Math.exp(-km / 4650)),
      score: Math.round(100 * Math.exp(-km / 4650)) * [1, 1, 2, 3, 3][r],
      distance: km,
    }));
    out.push({ date: key(d), total: rounds.reduce((s, r) => s + r.score, 0), rounds });
  }
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled', caret: 'hide' });
    console.log('shot', name);
  };
  const boot = async (freeze = true) => {
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(
      () => window.__booted === true && document.getElementById('play-button') && !document.getElementById('play-button').disabled,
      null, { timeout: 30000 },
    );
    await page.waitForTimeout(1200);
    if (freeze) await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  };
  const openStats = async () => {
    await page.click('.stats-entry');
    await page.waitForSelector('.stats-screen:not([hidden])');
  };
  const tiles = () => page.$$eval('.stat', (els) => els.map((s) => `${s.querySelector('span').textContent}=${s.querySelector('b').textContent}`));

  // A: brand new player, nothing logged
  await page.addInitScript(() => localStorage.clear());
  await boot();
  await shot('1-start-with-entry');
  await openStats();
  await shot('2-stats-empty');
  console.log('EMPTY tiles:', await tiles());
  console.log('EMPTY note:', await page.$eval('[data-stats="note"]', (e) => e.textContent));
  await page.click('.stats-close');
  await page.waitForSelector('.stats-screen', { state: 'hidden' });
  console.log('close -> start visible:', await page.isVisible('#start-screen'), '| body:', await page.evaluate(() => document.body.className));

  // B: a month of history
  const history = makeHistory(34);
  await page.addInitScript(([h]) => {
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.clear();
    localStorage.setItem('where-on-earth-history-v1', JSON.stringify(h));
    localStorage.setItem('where-on-earth-streak-v1', JSON.stringify({ last: key(new Date(Date.now() - 86400000)), count: 6 }));
  }, [history]);
  await boot();
  await openStats();
  await shot('3-stats-34-days');
  console.log(JSON.stringify(await page.evaluate(() => ({
    tiles: [...document.querySelectorAll('.stat')].map((s) => `${s.querySelector('span').textContent}=${s.querySelector('b').textContent}`),
    bars: [...document.querySelectorAll('.stats-dist li')].map((li) => ({
      band: li.querySelector('.stats-band').textContent,
      n: li.querySelector('.stats-count').textContent,
      w: li.querySelector('.stats-fill').style.width,
      today: li.classList.contains('today'),
    })),
    best: document.querySelector('[data-stats="best-round"]').textContent,
    note: document.querySelector('[data-stats="note"]').textContent,
    overflow: { doc: document.documentElement.scrollWidth, win: innerWidth, card: document.querySelector('.stats-card').scrollWidth },
  })), null, 1));
  console.log('B tiles:', await tiles());

  // C: today finished, so today's band is highlighted
  const todayIds = await page.evaluate(() => window.__game.state.daily.ids);
  await page.addInitScript(([h, ids]) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const rounds = [80, 260, 900, 2400, 6400].map((km, r) => ({
      base: Math.round(100 * Math.exp(-km / 4650)),
      score: Math.round(100 * Math.exp(-km / 4650)) * [1, 1, 2, 3, 3][r],
      distance: km,
    }));
    h.push({ date: today, total: rounds.reduce((s, r) => s + r.score, 0), rounds });
    localStorage.clear();
    localStorage.setItem('where-on-earth-history-v1', JSON.stringify(h));
    localStorage.setItem('where-on-earth-streak-v1', JSON.stringify({ last: today, count: 7 }));
    localStorage.setItem('where-on-earth-v1', JSON.stringify({
      date: today, ids, round: 4, complete: true,
      results: rounds.map((r) => ({ guess: { lat: 0, lng: 0 }, distance: r.distance, score: r.score })),
    }));
  }, [history, todayIds]);
  await boot();
  await openStats();
  await shot('4-stats-today-highlight');
  console.log('today bands:', JSON.stringify(await page.evaluate(() =>
    [...document.querySelectorAll('.stats-dist li')].map((li) => [li.querySelector('.stats-band').textContent, li.querySelector('.stats-count').textContent, li.classList.contains('today')]),
  )));
  console.log('C tiles:', await tiles());

  // D: escape + tap-outside close it; the daily game's own routing is untouched
  await page.keyboard.press('Escape');
  console.log('escape closes:', await page.evaluate(() => document.querySelector('.stats-screen').hidden));
  await openStats();
  await page.mouse.click(6, 400);
  console.log('tap-outside closes:', await page.evaluate(() => document.querySelector('.stats-screen').hidden), '| focus:', await page.evaluate(() => document.activeElement.className));
  // seeded daily is complete, so Play must still land on results (resume path intact)
  await page.click('#play-button');
  await page.waitForSelector('#results-screen:not([hidden])');
  console.log('completed daily -> results:', await page.evaluate(() => document.body.className), '| total:', await page.$eval('#total-score', (e) => e.textContent));
  await page.click('.results-close');
  await page.waitForSelector('.review-screen:not([hidden])');
  console.log('review still opens:', await page.evaluate(() => document.querySelector('.review-hint').textContent));

  // unfinished daily must still start round 1
  await page.addInitScript(() => localStorage.removeItem('where-on-earth-v1'));
  await boot();
  await page.click('#play-button');
  await page.waitForSelector('#round-screen:not([hidden])');
  console.log('fresh daily -> round:', await page.evaluate(() => document.body.className), '|', await page.$eval('#round-number', (e) => e.textContent));

  // endless mode: unscored, no history entry, still navigable
  await boot();
  await page.click('.endless-entry');
  await page.waitForFunction(() => document.body.classList.contains('endless'));
  const endlessFirst = await page.$eval('#round-number', (e) => e.textContent);
  await page.evaluate(() => window.__game.guess(20, 30));
  await page.waitForSelector('[data-endless="next"]:visible');
  await page.click('[data-endless="next"]');
  await page.waitForTimeout(300);
  console.log('endless runs:', await page.evaluate(() => document.body.className), '|', endlessFirst, '->', await page.$eval('#round-number', (e) => e.textContent));
  await page.click('[data-endless="home"]');
  console.log('endless home:', await page.evaluate(() => document.body.className), '| stats entry visible:', await page.isVisible('.stats-entry'));
  console.log('games logged after endless (must stay 35):', await page.evaluate(() => JSON.parse(localStorage.getItem('where-on-earth-history-v1')).length));
  await openStats();
  await page.evaluate(() => document.getElementById('globe').style.visibility = 'hidden');
  await shot('5-stats-after-endless');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console/page errors');
  await browser.close();
})();