import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto('file:///home/hatch/workspace/map-game/demo/shots/pinpoint-options/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
for (const [cls, name] of [['opt-now', 'now'], ['opt-a', 'option-a'], ['opt-b', 'option-b'], ['opt-c', 'option-c']]) {
  const el = p.locator('section.' + cls);
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(150);
  await el.screenshot({ path: `/home/hatch/workspace/map-game/demo/shots/pinpoint-options/${name}.png` });
  console.log('shot', name);
}
await b.close();
