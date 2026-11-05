import { chromium } from 'playwright';
import fs from 'node:fs';
import crypto from 'node:crypto';
const domainsFile = '/tmp/webgl-domains.txt';
fs.writeFileSync(domainsFile, 'hatch-webgl-all-origins-v1\n');
const domainsSha256 = crypto.createHash('sha256').update(fs.readFileSync(domainsFile)).digest('hex');
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-crashpad', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${domainsFile}`, `--hatch-webgl-allowed-domains-sha256=${domainsSha256}`] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('file:///home/hatch/workspace/map-game/demo/shots/postcard-front-options/index.html');
await page.waitForTimeout(4000);
for (const id of ['now','a','b','c']) {
  const el = page.locator('#opt-' + id);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await el.screenshot({ path: `/home/hatch/workspace/map-game/demo/shots/postcard-front-options/${id === 'now' ? 'now' : 'option-' + id}.png` });
}
await browser.close();
console.log('captured');
