import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('every catalog banner has a dedicated shared card and swatch treatment', async () => {
  const [css, sheet] = await Promise.all([
    readFile(new URL('../src/styles/game.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/account/sheet.js', import.meta.url), 'utf8'),
  ]);
  const bannerBlock = sheet.match(/Banners: \[(.*?)\],\n};/s)?.[1] || '';
  const ids = [...bannerBlock.matchAll(/\['([^']+)'/g)].map((match) => match[1]);
  assert.equal(ids.length, 10);
  for (const id of ids) {
    assert.match(css, new RegExp(`\\.traveler-card\\[data-card="${id}"\\], \\.banner-swatch\\[data-card="${id}"\\]`));
  }
  assert.doesNotMatch(css, /\.traveler-card\[data-card\]:not\(/);
});
