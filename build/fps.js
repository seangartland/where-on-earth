const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(process.argv[2]);
  await page.waitForFunction(() => window.__view, null, { timeout: 30000 });
  console.log('view ok');
  const t = Date.now();
  const n = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(n); }; f(); }));
  console.log('frames in 3s', n, Date.now() - t);
  const t1 = Date.now(); await page.mouse.move(100, 100); console.log('mouse move ms', Date.now() - t1);
  await browser.close();
})();
