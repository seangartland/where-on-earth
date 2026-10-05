const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox','--disable-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(process.argv[2]);
  await p.waitForTimeout(12000);
  console.log(await p.evaluate(() => ({ stage: window.__bootStage, booted: window.__booted, err: document.getElementById('err').textContent, dis: document.getElementById('play-button').disabled })));
  const n = await p.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; performance.now() - t < 2000 ? requestAnimationFrame(f) : r(n); }; f(); }));
  console.log('fps', n / 2, 'errors', errs);
  await b.close();
})();
