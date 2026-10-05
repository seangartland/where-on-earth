// Rotation test: hard flings + tilt drags; checks the polar axis never
// precesses, north stays up, and the grabbed point tracks the finger.
const { chromium } = require('/home/hatch/workspace/.pw-setup/node_modules/playwright');
(async () => {
  const [url, outDir] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__view);
  await page.waitForTimeout(1000);

  // axis sampler: world direction of the globe's local +Y and pitch each rAF
  await page.evaluate(() => {
    window.__axis = [];
    const tick = () => {
      const q = window.__view.globe.quaternion;
      const x = 2 * (q.x * q.y - q.w * q.z), y = 1 - 2 * (q.x * q.x + q.z * q.z), z = 2 * (q.y * q.z + q.w * q.x);
      window.__axis.push({ x, y, z, p: window.__view.pitch, yaw: window.__view.yaw });
      requestAnimationFrame(tick);
    };
    tick();
  });

  const drag = async (x0, y0, dx, dy, steps, ms) => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
      await page.waitForTimeout(ms);
    }
    await page.mouse.up();
  };

  // finger tracking: slow drag, compare grabbed point's screen position to finger
  const track = async (x0, y0, dx, dy) => {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.waitForTimeout(50);
    const L = await page.evaluate(([x, y]) => window.__view.pick(x, y), [x0, y0]);
    let worst = 0;
    for (let i = 1; i <= 4; i++) {
      const fx = x0 + (dx * i) / 4, fy = y0 + (dy * i) / 4;
      await page.mouse.move(fx, fy);
      await page.waitForTimeout(40);
      const [sx, sy] = await page.evaluate((l) => window.__view.project(l), L);
      worst = Math.max(worst, Math.hypot(sx - fx, sy - fy));
    }
    await page.mouse.up();
    await page.waitForTimeout(600);
    return worst.toFixed(2);
  };

  for (let k = 0; k < 2; k++) await drag(20, 420, 350, 0, 1, 0);
  await drag(195, 120, 0, 700, 2, 0); // tilt hard past the clamp: north pole
  for (let k = 0; k < 2; k++) await drag(370, 600, -350, 0, 1, 0);
  await page.screenshot({ path: outDir + '/pole-spun.png' });
  await drag(195, 100, 0, 420, 1, 0);
  await drag(195, 100, 0, -350, 1, 0);
  for (let k = 0; k < 2; k++) await drag(20, 420, 350, 0, 1, 0);
  await page.screenshot({ path: outDir + '/after-spins.png' });
  const res = await page.evaluate(() => {
    const a = window.__axis;
    let worst = 0, minUp = 1, maxP = 0, yawSpan = [Infinity, -Infinity];
    for (const s of a) {
      // axis must lie in the y-z plane (x = 0) and match (0, cos p, sin p)
      const ex = Math.hypot(s.x, s.y - Math.cos(s.p), s.z - Math.sin(s.p));
      worst = Math.max(worst, ex);
      minUp = Math.min(minUp, s.y);
      maxP = Math.max(maxP, Math.abs(s.p));
      yawSpan = [Math.min(yawSpan[0], s.yaw), Math.max(yawSpan[1], s.yaw)];
    }
    const maxAxisX = Math.max(...a.map((s) => Math.abs(s.x)));
    return { frames: a.length, worstAxisDeviation: worst, maxAxisX, minAxisUp: minUp, maxPitchDeg: maxP * 180 / Math.PI, yawTurns: (yawSpan[1] - yawSpan[0]) / (2 * Math.PI) };
  });
  console.log(JSON.stringify(res), 'errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
