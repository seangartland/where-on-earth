const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox','--disable-gpu'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('console', m => console.log('C:', m.text()));
  await p.goto('http://127.0.0.1:8130/', { waitUntil: 'load' });
  await p.waitForTimeout(5000);
  const r = await p.evaluate(() => {
    let tex; window.__view.globe.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.uMap) tex = o.material.uniforms.uMap.value; });
    const cv = tex.image; const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
    const at = (lat, lng) => Array.from(ctx.getImageData(Math.round((lng+180)/360*W), Math.round((90-lat)/180*H), 1, 1).data);
    return { W, victoria: at(-1, 33), superior: at(47.7, -87.5), baikal: at(53.5, 108), sahara: at(23, 10), ocean: at(0, -30) };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
