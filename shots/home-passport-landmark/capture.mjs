import { chromium } from '/home/hatch/workspace/.pw-setup/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const ROOT = '/home/hatch/workspace/map-game/demo/';
const OUT = `${ROOT}shots/home-passport-landmark/`;
const cities = JSON.parse(fs.readFileSync(`${ROOT}assets/locations.json`, 'utf8'));
const landmarks = JSON.parse(fs.readFileSync(`${ROOT}assets/locations-landmarks-sol.json`, 'utf8'));
const landmark = landmarks.find((item) => item.image) || landmarks[0];
const expectedText = `1 / ${(cities.length + landmarks.length).toLocaleString()} places found · 1 earned`;
const photo = fs.readFileSync(`${ROOT}assets/eox-z4-base-2k.jpg`);
const mime = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/home/hatch/workspace/.pw-setup/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessChecks'],
});

async function capture(name, query = '') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(({ id }) => {
    localStorage.setItem('where-on-earth-passport-v1', JSON.stringify({
      v: 2,
      visits: { [id]: 850 },
      order: [id],
      meta: { [id]: { b: 850, d: 25, e: 1, f: '2026-10-29', t: Date.now() } },
    }));
  }, { id: landmark.id });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net') {
      const filename = url.pathname.split('/').pop();
      try { return route.fulfill({ body: fs.readFileSync(`/home/hatch/workspace/map-game/shots/cdn/${filename}`), contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }); }
      catch { return route.continue(); }
    }
    if (url.hostname.includes('wikimedia') || url.hostname.includes('wikipedia')) return route.fulfill({ body: photo, contentType: 'image/jpeg' });
    if (url.hostname !== 'game.local') return route.abort();
    const path = url.pathname.replace(/^\//, '') || 'index.html';
    try { return route.fulfill({ body: fs.readFileSync(`${ROOT}${path}`), contentType: mime[path.split('.').pop()] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  await page.goto(`https://game.local/index.html${query}`);
  await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 }); // __game.state exposes no landmarks field; the card assertion below is the landmarks-loaded proof
  await page.waitForFunction(() => {
    const card = document.querySelector('.passport');
    return card && !card.hidden && card.querySelector('[data-passport="found"]')?.textContent === '1';
  }, null, { timeout: 45000 });
  const result = await page.evaluate(() => {
    const card = document.querySelector('.passport');
    const rect = card.getBoundingClientRect();
    return {
      visible: !card.hidden && getComputedStyle(card).display !== 'none',
      text: card.querySelector('.passport-count').textContent.trim(),
      recentStampCount: card.querySelectorAll('.passport-stamps img').length,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
  if (!result.visible || result.text !== expectedText) throw new Error(`${name}: expected "${expectedText}", got "${result.text}"`);
  // CDP screenshot (same pattern as shots/passport/pp-shot.mjs): page.screenshot
  // hangs in the headless shell on this WebGL page.
  const cdp = await context.newCDPSession(page);
  const shotData = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}${name}.png`, Buffer.from(shotData.data, 'base64'));
  await context.close();
  return result;
}

const results = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  landmark: { id: landmark.id, name: landmark.short || landmark.clue },
  expectedText,
  defaultHome: await capture('default-home-landmark-only'),
  recsHome: await capture('recs-home-landmark-only', '?home=recs'),
};
fs.writeFileSync(`${OUT}capture-results.json`, `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(results, null, 2));
