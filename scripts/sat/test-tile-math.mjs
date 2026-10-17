#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tileAt = (lat, lng, z) => {
  const n = 2 ** z;
  const clipped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor((1 - Math.asinh(Math.tan(clipped * Math.PI / 180)) / Math.PI) / 2 * n),
  };
};
const sites = JSON.parse(await readFile(resolve(here, 'pilot-sites.json'), 'utf8'));
assert.equal(sites.length, 12);
for (const site of sites) for (const z of [4, 6, 8, 9]) assert.deepEqual(tileAt(site.lat, site.lng, z), site.tiles[z], `${site.id} z${z}`);
const bay = sites.find((site) => site.id === 'bay-area');
assert.deepEqual(bay.tiles[8], { x: 40, y: 98 });
assert.ok(bay.tiles[8].x >= 0 && bay.tiles[8].x < 256 && bay.tiles[8].y >= 0 && bay.tiles[8].y < 256);
// 8/134/89 is a valid production tile, but it is a fixed-view reference rather
// than Bay Area's geographic tile. This check deliberately verifies plausibility,
// not false equality with that reference.
assert.deepEqual({ x: 134, y: 89 }, tileAt(47.517, 9.141, 8));
console.log('Tile math passed for 12 sites at z4, z6, z8, and z9.');
