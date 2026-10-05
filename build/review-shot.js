// Post-game review check at 390x844: plays 5 rounds, closes results, taps a pin.
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
(async () => {
  const [url, dir] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && !document.getElementById('play-button').disabled, null, { timeout: 60000 });
  await page.evaluate(() => { localStorage.clear(); window.__travelAnim = false; });
  await page.evaluate((q) => document.querySelector(q).click(), '#play-button');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const s = window.__game.state; const a = s.selected[s.daily.round];
      window.__game.guess(a.lat + 6, a.lng - 9);
    });
    await page.waitForTimeout(300);
    await page.evaluate((q) => document.querySelector(q).click(), '#next-button');
  }
  await page.waitForTimeout(500);
  console.log('mode after rounds', await page.evaluate(() => window.__game.state.mode));
  await page.screenshot({ path: `${dir}/1-results.png`, timeout: 120000 });
  await page.evaluate((q) => document.querySelector(q).click(), '.results-close');
  await page.waitForTimeout(20000);
  console.log('mode after close', await page.evaluate(() => window.__game.state.mode));
  await page.screenshot({ path: `${dir}/2-review.png`, timeout: 120000 });
  // tap the first visible answer pin base we can find
  const target = await page.evaluate(() => {
    const s = window.__game.state;
    for (let i = 0; i < 5; i++) {
      const a = s.selected[i];
      const phi = (a.lng + 180) * Math.PI / 180, th = (90 - a.lat) * Math.PI / 180;
      const l = [-Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi)];
      const [x, y] = window.__view.project(l);
      if (x > 30 && x < 360 && y > 140 && y < 800) return { i, x, y };
    }
    return null;
  });
  console.log('tap target', JSON.stringify(target));
  if (target) {
    await page.mouse.click(target.x + 4, target.y - 6);
    await page.waitForTimeout(2500);
    console.log('recap', await page.evaluate(() => document.querySelector('.recap-tag').textContent + ' | ' + document.querySelector('.recap-head h3').textContent + ' hidden=' + document.querySelector('.recap-card').hidden));
    await page.screenshot({ path: `${dir}/3-recap.png`, timeout: 120000 });
    await page.evaluate((q) => document.querySelector(q).click(), '.recap-close');
    await page.waitForTimeout(300);
    console.log('recap hidden after close', await page.evaluate(() => document.querySelector('.recap-card').hidden));
  }
  await page.evaluate((q) => document.querySelector(q).click(), '.review-pill[data-act="results"]');
  await page.waitForTimeout(300);
  console.log('mode after Results', await page.evaluate(() => window.__game.state.mode));
  await page.evaluate((q) => document.querySelector(q).click(), '#breakdown li:nth-child(3)');
  await page.waitForTimeout(2500);
  console.log('row tap ->', await page.evaluate(() => document.querySelector('.recap-tag').textContent));
  await page.screenshot({ path: `${dir}/4-row-recap.png`, timeout: 120000 });
  await page.evaluate((q) => document.querySelector(q).click(), '.review-pill[data-act="replay"]');
  await page.waitForTimeout(300);
  console.log('after replay start hidden=', await page.evaluate(() => document.getElementById('start-screen').hidden), 'review hidden=', await page.evaluate(() => document.querySelector('.review-screen').hidden));
  console.log('errors', JSON.stringify(errs));
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
