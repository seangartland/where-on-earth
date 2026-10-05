// Coast detail capture at 390x844 DPR 2: pins the view on a lat/lng and saves.
// usage: node coast-shot.js <url> <out.png> <lat> <lng>
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
(async () => {
  const [url, out, lat, lng] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__view);
  await page.evaluate(([la, ln]) => {
    // yaw so lng faces the camera (same formula as main.js home view)
    const phi = (ln + 180) * Math.PI / 180;
    const x = -Math.cos(phi), z = Math.sin(phi);
    window.__view.set(Math.atan2(-x, z), la * Math.PI / 180);
  }, [+lat, +lng]);
  await page.waitForTimeout(8000);
  await page.screenshot({ path: out, timeout: 90000 });
  await browser.close();
  console.log('OK', out);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
