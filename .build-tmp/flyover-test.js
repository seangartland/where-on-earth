// Drives one reveal per tier at 390x844, grabs frames at key moments, logs
// errors, frame pacing, and DOM state of the new overlays.
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'flyover-shots');
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.argv[2];
const only = process.argv[3];

// Offset a lat/lng by km along bearing 60 deg.
function offset(lat, lng, km) {
  const R = 6371.0088, d = km / R, br = 60 * Math.PI / 180;
  const p1 = lat * Math.PI / 180, l1 = lng * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * 180 / Math.PI, lng: ((l2 * 180 / Math.PI + 540) % 360) - 180 };
}

const cases = [
  { name: 'bullseye', km: 12, shots: [1.6, 3.6] },
  { name: 'near', km: 120, shots: [3.0, 4.6, 5.4, 6.4] },
  { name: 'normal', km: 3000, shots: [2.6, 4.2] },
  { name: 'blowout', km: 12400, shots: [1.6, 2.4, 3.6, 4.6] },
].filter((c) => !only || c.name === only);

(async () => {
  const browser = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  for (const c of cases) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true })).newPage();
    const errors = [];
    page.on('crash', () => console.log('PAGE CRASHED'));
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.route(/wikimedia|wikipedia/, (r) => r.fulfill({ path: '/home/hatch/workspace/map-game/demo/assets/og.png', contentType: 'image/png' }));
    await page.goto(URL);
    await page.waitForFunction(() => window.__booted && !document.getElementById('play-button').disabled, null, { timeout: 90000 });
    await page.evaluate(() => document.getElementById('play-button').click());
    if (!process.env.NOAUDIO) await page.keyboard.press('Shift'); // a real gesture for the audio unlock
    await page.waitForTimeout(800);
    const ans = await page.evaluate(() => { const s = window.__game.state; return s.selected[s.daily.round]; });
    const g = offset(ans.lat, ans.lng, c.km);
    // Record frame times through the whole reveal.
    await page.evaluate(() => {
      window.__ft = []; window.__fc = 0; let last = performance.now();
      const f = () => { const n = performance.now(); window.__ft.push(n - last); window.__fc++; last = n; if (window.__ft.length < 4000) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
    const t0 = Date.now();
    await page.evaluate(({ lat, lng }) => { window.__fc = 0; window.__game.guess(lat, lng); }, g);
    for (const t of c.shots) {
      // dt is clamped to 1/20 s, so on a slow software renderer logical time = frames / 20.
      await page.evaluate((target) => new Promise((r) => { const chk = () => (window.__fc >= target ? r() : setTimeout(chk, 20)); chk(); }), Math.round(t * 20));
      const st = await page.evaluate(() => ({
        pill: document.getElementById('travel-distance').hidden ? null : document.getElementById('travel-distance').textContent.trim(),
        pillCls: document.getElementById('travel-distance').className,
        stamp: !document.querySelector('.bullseye-stamp').hidden,
        postcard: !document.querySelector('.postcard').hidden,
        card: getComputedStyle(document.getElementById('reveal-card')).visibility,
        audio: window.__audio && [window.__audio.ctx && window.__audio.ctx.state, !!window.__audio.whoosh],
      }));
      console.log(c.name, `t=${t}`, JSON.stringify(st));
      await page.screenshot({ path: path.join(OUT, `${c.name}-${String(t).replace('.', '_')}.png`), timeout: 240000 });
    }
    const ft = await page.evaluate(() => window.__ft);
    ft.sort((a, b) => a - b);
    console.log(c.name, 'frames', ft.length, 'median ms', ft[Math.floor(ft.length / 2)].toFixed(1), 'p95', ft[Math.floor(ft.length * 0.95)].toFixed(1));
    console.log(c.name, 'errors', errors.length ? errors : 'none');
    await page.context().close();
  }
  await browser.close();
})();
