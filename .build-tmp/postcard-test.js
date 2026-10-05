// Postcard -> thumb transition: geometry match at the swap, real-time timing
// from touchdown, late-pop and abandon paths, under CPU throttling.
// usage: node postcard-test.js URL [tier] [cpuRate] [photoDelayMs]
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'postcard-shots');
require('fs').mkdirSync(OUT, { recursive: true });
const [URL, tierArg = 'all', cpu = '1', photoDelay = '0', busyMs = '0'] = process.argv.slice(2);
const SRC = require('fs').readFileSync('/home/hatch/workspace/map-game/demo/src/main.js', 'utf8').replace('renderer.render(scene, camera);', 'if (!window.__noRender) renderer.render(scene, camera);');
function offset(lat, lng, km) {
  const R = 6371.0088, d = km / R, br = 60 * Math.PI / 180;
  const p1 = lat * Math.PI / 180, l1 = lng * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * 180 / Math.PI, lng: ((l2 * 180 / Math.PI + 540) % 360) - 180 };
}
const cases = [['bullseye', 12], ['near', 120], ['normal', 3000], ['blowout', 12400]].filter(([n]) => tierArg === 'all' || n === tierArg);
(async () => {
  const browser = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  for (const [name, km] of cases) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver/.test(m.text())) errors.push(m.text()); });
    let armed = false;
    await page.route(/wikimedia|wikipedia/, async (r) => {
      if (armed && +photoDelay) await new Promise((res) => setTimeout(res, +photoDelay));
      r.fulfill({ path: '/home/hatch/workspace/map-game/demo/assets/og.png', contentType: 'image/png', headers: { 'cache-control': 'no-store' } });
    });
    // Software GL on this 2-core box is ~0.3 fps; skip only the draw call so the
    // game logic, camera math and DOM run at real frame rates.
    await page.route(/src\/main\.js/, (r) => r.fulfill({ body: SRC, contentType: 'text/javascript' }));
    await page.addInitScript((busy) => {
      window.__noRender = true;
      if (busy > 0) { const spin = () => { const e = performance.now() + busy; while (performance.now() < e); requestAnimationFrame(spin); }; requestAnimationFrame(spin); }
    }, +busyMs);
    await page.goto(URL);
    await page.waitForFunction(() => window.__booted && !document.getElementById('play-button').disabled, null, { timeout: 90000 });
    await page.evaluate(() => document.getElementById('play-button').click());
    await page.keyboard.press('Shift');
    await page.waitForTimeout(800);
    if (+cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +cpu }); }
    const ans = await page.evaluate(() => { const s = window.__game.state; return s.selected[s.daily.round]; });
    const g = offset(ans.lat, ans.lng, km);
    armed = true;
    await page.evaluate(() => {
      const A = window.__audio; window.__ev = {};
      const wrap = (k) => { const f = A[k].bind(A); A[k] = (...a) => { window.__ev[k] ??= performance.now(); return f(...a); }; };
      ['thump', 'tick'].forEach(wrap);
      const pc = document.querySelector('.postcard'), slot = document.querySelector('.thumb-slot'), th = document.getElementById('place-thumb');
      const rect = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => +v.toFixed(1)); };
      window.__fr = [];
      const f = () => {
        window.__fr.push({ t: performance.now(), pc: !pc.hidden, wait: slot.classList.contains('waiting'), img: pc.hidden ? null : rect(pc.querySelector('img')), th: th.hidden ? null : rect(th), op: +getComputedStyle(pc).opacity });
        if (window.__fr.length < 3000) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.evaluate(({ lat, lng }) => window.__game.guess(lat, lng), g);
    page.waitForFunction(() => document.querySelector('.thumb-slot.waiting') && getComputedStyle(document.getElementById('reveal-card')).visibility === 'visible' && !document.querySelector('.postcard').hidden, null, { timeout: 60000, polling: 50 })
      .then(() => page.screenshot({ path: path.join(OUT, `${name}-cpu${cpu}-d${photoDelay}-b${busyMs}-out.png`) })).catch(() => {});
    await page.waitForFunction(() => window.__ev.tick || (window.__ev.thump && performance.now() - window.__ev.thump > 9000), null, { timeout: 120000, polling: 100 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ ev: window.__ev, fr: window.__fr }));
    const land = r.ev.thump;
    const vis = r.fr.filter((f) => f.pc);
    const popAt = vis.length ? vis[0].t - land : null;
    const last = vis[vis.length - 1];
    const firstAfter = r.fr.find((f) => last && f.t > last.t);
    const dt = r.fr.slice(1).map((f, i) => f.t - r.fr[i].t).sort((a, b) => a - b);
    const out = {
      tier: name, cpu: +cpu, busyMs: +busyMs, photoDelay: +photoDelay,
      popAfterLand_ms: popAt && Math.round(popAt),
      swapAfterLand_ms: r.ev.tick ? Math.round(r.ev.tick - land) : 'no tick (abandoned/none)',
      lastPostcardImg: last && last.img, thumb: last && last.th,
      geomErr_px: last && last.img && last.th ? Math.max(...last.img.map((v, i) => Math.abs(v - last.th[i]))).toFixed(2) : null,
      waitingAfterSwap: firstAfter ? firstAfter.wait : null,
      everWaiting: r.fr.some((f) => f.wait),
      frameMedian_ms: dt[dt.length >> 1].toFixed(1),
      errors,
    };
    console.log(JSON.stringify(out));
    await page.screenshot({ path: path.join(OUT, `${name}-cpu${cpu}-d${photoDelay}-b${busyMs}-end.png`) });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
