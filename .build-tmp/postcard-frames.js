// Freezes the settle morph at fixed progress points and screenshots each, plus
// the dashed placeholder state, for an eyeball check of the transition.
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'postcard-shots');
const SRC = require('fs').readFileSync('/home/hatch/workspace/map-game/demo/src/main.js', 'utf8').replace('renderer.render(scene, camera);', 'if (!window.__noRender) renderer.render(scene, camera);');
(async () => {
  const browser = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await page.route(/wikimedia|wikipedia/, (r) => r.fulfill({ path: '/home/hatch/workspace/map-game/demo/assets/og.png', contentType: 'image/png' }));
  await page.route(/src\/main\.js/, (r) => r.fulfill({ body: SRC, contentType: 'text/javascript' }));
  await page.addInitScript(() => { window.__noRender = true; });
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => window.__booted && !document.getElementById('play-button').disabled, null, { timeout: 90000 });
  await page.evaluate(() => document.getElementById('play-button').click());
  await page.waitForTimeout(800);
  await page.evaluate(() => { const s = window.__game.state; const a = s.selected[s.daily.round]; window.__game.guess(a.lat + 20, a.lng + 20); });
  // Freeze the instant the settle morph starts (its keyframes animate width).
  await page.evaluate(() => new Promise((res) => {
    const pc = document.querySelector('.postcard');
    const chk = () => {
      const a = pc.getAnimations().find((x) => x.effect.getKeyframes().some((k) => k.width));
      if (a) { document.getAnimations().forEach((x) => x.pause()); res(); } else requestAnimationFrame(chk);
    };
    chk();
  }));
  await page.screenshot({ path: path.join(OUT, 'morph-0-placeholder.png') });
  for (const p of [0.15, 0.45, 0.75, 0.97]) {
    await page.evaluate((p) => {
      const els = [document.querySelector('.postcard'), document.querySelector('.postcard img'), document.querySelector('.postcard p')];
      els.forEach((el) => el.getAnimations().forEach((a) => { a.currentTime = 640 * p; }));
    }, p);
    await page.screenshot({ path: path.join(OUT, `morph-${String(p).replace('.', '')}.png`) });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
