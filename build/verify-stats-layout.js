// Numeric layout audit at phone widths: overflow, truncation, touch targets, and the
// start screen's vertical fit. Screenshots can't be eyeballed here, so measure instead.
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');

const URL = 'http://127.0.0.1:8130/';
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function makeHistory(days) {
  if (days <= 0) return [];
  const out = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const kms = [200, 700, 1400, 3000, 7000].map((k, r) => Math.round(k * (0.6 + ((i * 11 + r * 7) % 100) / 100)));
    const rounds = kms.map((km, r) => ({
      base: Math.round(100 * Math.exp(-km / 4650)),
      score: Math.round(100 * Math.exp(-km / 4650)) * [1, 1, 2, 3, 3][r],
      distance: km,
    }));
    out.push({ date: key(d), total: rounds.reduce((s, r) => s + r.score, 0), rounds });
  }
  return out;
}

const VIEWPORTS = [
  { name: 'iPhone 14/15 390x844', width: 390, height: 844 },
  { name: 'iPhone SE 375x667', width: 375, height: 667 },
  { name: 'iPhone 14 Pro Max 430x932', width: 430, height: 932 },
  { name: 'narrow 320x568', width: 320, height: 568 },
];

const audit = () => {
  const problems = [];
  const docW = document.documentElement.scrollWidth;
  if (docW > innerWidth + 0.5) problems.push(`horizontal overflow: doc ${docW} > win ${innerWidth}`);

  const check = (el, label, min = 0) => {
    if (!el) return problems.push(`${label}: missing`);
    const r = el.getBoundingClientRect();
    if (r.left < -0.5 || r.right > innerWidth + 0.5) problems.push(`${label}: off-screen ${r.left.toFixed(1)}..${r.right.toFixed(1)}`);
    if (min && (r.height < min || r.width < min)) problems.push(`${label}: touch target ${r.width.toFixed(0)}x${r.height.toFixed(0)} < ${min}`);
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`${label}: text clipped (${el.scrollWidth} > ${el.clientWidth}) "${(el.textContent || '').slice(0, 28)}"`);
    return r;
  };

  const entry = document.querySelector('.stats-entry').getBoundingClientRect(); // hidden with the start screen; measured there instead
  const close = check(document.querySelector('.stats-close'), 'stats close', 40);
  const card = check(document.querySelector('.stats-card'), 'stats card');
  document.querySelectorAll('.stat').forEach((s, i) => {
    check(s, `stat tile ${i}`);
    const b = s.querySelector('b');
    if (parseFloat(getComputedStyle(b).fontSize) < 18) problems.push(`stat ${i} value too small`);
    if (parseFloat(getComputedStyle(s.querySelector('span')).fontSize) < 9.5) problems.push(`stat ${i} label too small`);
  });
  const rows = [...document.querySelectorAll('.stats-dist li')];
  if (rows.length !== 5) problems.push(`histogram has ${rows.length} rows, expected 5`);
  rows.forEach((li, i) => {
    check(li.querySelector('.stats-band'), `band label ${i}`);
    const track = li.querySelector('.stats-track');
    const fill = li.querySelector('.stats-fill');
    check(track, `band track ${i}`);
    if (track.getBoundingClientRect().height < 20) problems.push(`band ${i} track only ${track.getBoundingClientRect().height.toFixed(0)}px tall`);
    const w = fill.getBoundingClientRect().width;
    const n = Number(li.querySelector('.stats-count').textContent);
    if (n > 0 && w < 6) problems.push(`band ${i} has ${n} but bar is ${w.toFixed(1)}px`);
    if (n === 0 && w > 0.5) problems.push(`band ${i} empty but bar is ${w.toFixed(1)}px`);
    const label = li.querySelector('.stats-band').textContent;
    if (!/^\d+–\d+$/.test(label)) problems.push(`band ${i} label "${label}" malformed`);
  });
  const best = check(document.querySelector('[data-stats="best-round"]'), 'best round');
  check(document.querySelector('[data-stats="note"]'), 'footnote');

  // vertical: is the headline (streak + tiles) above the fold?
  const fold = { heroBottom: document.querySelector('.stats-hero').getBoundingClientRect().bottom, distTop: document.querySelector('.stats-head').getBoundingClientRect().top };
  const cardRect = card;
  return {
    problems,
    entry: `${entry.width.toFixed(0)}x${entry.height.toFixed(0)}`,
    close: `${close.width.toFixed(0)}x${close.height.toFixed(0)}`,
    cardW: cardRect.width.toFixed(0),
    cardH: cardRect.height.toFixed(0),
    scrollable: document.querySelector('.stats-screen').scrollHeight > innerHeight,
    screenScrollH: document.querySelector('.stats-screen').scrollHeight,
    fold,
    bestH: best.height.toFixed(0),
  };
};

const startAudit = () => {
  const problems = [];
  const screen = document.getElementById('start-screen');
  const content = [...screen.children].filter((el) => !el.hidden);
  const first = content[0].getBoundingClientRect();
  const last = content[content.length - 1].getBoundingClientRect();
  if (last.bottom > innerHeight + 0.5) problems.push(`start content overflows: bottom ${last.bottom.toFixed(0)} > ${innerHeight}`);
  if (first.top < -0.5) problems.push(`start content clipped at top: ${first.top.toFixed(0)}`);
  for (const el of content) {
    const r = el.getBoundingClientRect();
    if (el.tagName === 'BUTTON' && (r.height < 40 || r.width < 40)) problems.push(`start button ${el.className}: ${r.width.toFixed(0)}x${r.height.toFixed(0)} < 40`);
    if (r.left < -0.5 || r.right > innerWidth + 0.5) problems.push(`start element ${el.className || el.tagName} off-screen`);
    if (el.scrollWidth > el.clientWidth + 1) problems.push(`start element ${el.className || el.tagName} text clipped`);
  }
  return { problems, top: first.top.toFixed(0), bottom: last.bottom.toFixed(0), children: content.map((c) => c.className || c.tagName) };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const history = makeHistory(Number(process.argv[2] ?? 46));
  let failures = 0;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.addInitScript(([h]) => {
      const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.clear();
      localStorage.setItem('where-on-earth-history-v1', JSON.stringify(h));
      localStorage.setItem('where-on-earth-streak-v1', JSON.stringify({ last: key(new Date()), count: 46 }));
    }, [history]);
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__booted === true && !document.getElementById('play-button').disabled, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    const start = await page.evaluate(startAudit);
    await page.click('.stats-entry');
    await page.waitForSelector('.stats-screen:not([hidden])');
    await page.waitForTimeout(250);
    const stats = await page.evaluate(audit);
    const ok = !start.problems.length && !stats.problems.length;
    if (!ok) failures += 1;
    console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${vp.name}`);
    console.log('  start screen :', JSON.stringify(start));
    console.log('  stats card   :', JSON.stringify({ w: stats.cardW, h: stats.cardH, entry: stats.entry, close: stats.close, scrollH: stats.screenScrollH, scrolls: stats.scrollable, bestH: stats.bestH }));
    console.log('  above fold   :', JSON.stringify(stats.fold));
    for (const p of [...start.problems, ...stats.problems]) console.log('  !!', p);
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} viewport(s) with problems` : '\nall viewports clean');
  process.exit(failures ? 1 : 0);
})();