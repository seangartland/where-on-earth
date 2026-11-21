import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// surface.js also imports the browser-only Three scene. Evaluate only its
// provider declarations so these tests exercise the production routing code.
const surfaceURL = new URL('../src/globe/surface.js', import.meta.url);
const surface = await readFile(surfaceURL, 'utf8');
const providerCode = surface.slice(surface.indexOf('export const SAT_PROVIDERS'), surface.indexOf('export const getSatProvider'));
const pilotURL = pathToFileURL(fileURLToPath(new URL('../src/globe/pilot-region.js', import.meta.url))).href;
const sf1bURL = pathToFileURL(fileURLToPath(new URL('../src/globe/sf1b-region.js', import.meta.url))).href;
const { SAT_PROVIDERS, tileURL, windowHasPilotZ10 } = await import(`data:text/javascript,${encodeURIComponent(`import { inPilotZ10 } from '${pilotURL}';\nimport { inSf1bRegion } from '${sf1bURL}';\nconst imod = (a, n) => ((a % n) + n) % n;\n${providerCode}`)}`);
const defaultProvider = SAT_PROVIDERS.find((provider) => provider.id === 's2gm2025');

test('default provider routes z10 pilot footprints to the pilot cache key', () => {
  assert.equal(tileURL(defaultProvider, 10, 386, 501), 'https://tiles.where-on.earth/s2gm2025-pilot/10/501/386.jpg?v=2'); // Madrid
  assert.equal(tileURL(defaultProvider, 10, 380, 262), 'https://tiles.where-on.earth/s2gm2025-pilot/10/262/380.jpg?v=2'); // Chicago
  assert.equal(tileURL(defaultProvider, 10, 491, 999), 'https://tiles.where-on.earth/s2gm2025-pilot/10/999/491.jpg?v=2'); // Majuro
});

test('default provider retains its prefix outside the pilot and below z10', () => {
  assert.equal(tileURL(defaultProvider, 10, 355, 774), 'https://tiles.where-on.earth/s2gm2025/10/774/355.jpg?v=2'); // Tokyo
  assert.equal(tileURL(defaultProvider, 9, 193, 250), 'https://tiles.where-on.earth/s2gm2025/9/250/193.jpg?v=2'); // Madrid
});

test('z10 windows keep only pilot footprints', () => {
  assert.equal(windowHasPilotZ10({ z: 10, n: 1024, tx0: 774, ty0: 355, cols: 1, rows: 1 }), false); // Tokyo
  assert.equal(windowHasPilotZ10({ z: 10, n: 1024, tx0: 501, ty0: 386, cols: 1, rows: 1 }), true); // Madrid
  assert.equal(windowHasPilotZ10({ z: 10, n: 1024, tx0: 495, ty0: 386, cols: 2, rows: 1 }), true); // Iberia edge
});
