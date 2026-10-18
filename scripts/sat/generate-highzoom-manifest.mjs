#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const pinFiles = ['assets/locations.json', 'assets/locations-landmarks-sol.json'];
const minZoom = 10;
const maxZoom = 14;
const mercatorLimit = 85.05112878;

const load = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const banks = await Promise.all(pinFiles.map(load));
const pins = banks.flat();
const excluded = pins.filter(({ lat }) => !Number.isFinite(lat) || Math.abs(lat) > mercatorLimit);
const renderable = pins.filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= mercatorLimit);

const tileAt = (lat, lng, z) => {
  const n = 2 ** z;
  const radians = lat * Math.PI / 180;
  return {
    x: ((Math.floor((lng + 180) / 360 * n) % n) + n) % n,
    y: Math.max(0, Math.min(n - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n))),
  };
};

const zooms = {};
for (let z = minZoom; z <= maxZoom; z++) {
  const n = 2 ** z;
  const keys = new Set();
  for (const pin of renderable) {
    const center = tileAt(pin.lat, pin.lng, z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = ((center.x + dx) % n + n) % n;
      const y = Math.max(0, Math.min(n - 1, center.y + dy));
      keys.add(`${z}/${x}/${y}`);
    }
  }
  const xyz = [...keys].map((key) => key.split('/').map(Number));
  xyz.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const lines = xyz.map(([tileZ, x, y]) => `${tileZ}/${x}/${y}`);
  zooms[z] = {
    candidateCount: renderable.length * 9,
    count: lines.length,
    deduplicated: renderable.length * 9 - lines.length,
    sha256: createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex'),
    xyz: lines,
  };
}

const phase0 = JSON.parse(await readFile(resolve(here, 'eox2025-manifest.json'), 'utf8'));
const z8Count = phase0.tiles.filter(({ z }) => z === 8).length;
const descendantCounts = Object.fromEntries(
  Array.from({ length: maxZoom - minZoom + 1 }, (_, index) => {
    const z = minZoom + index;
    return [z, z8Count * 4 ** (z - 8)];
  }),
);

const manifest = {
  generatedFrom: pinFiles,
  sourceCounts: Object.fromEntries(pinFiles.map((file, index) => [file, banks[index].length])),
  window: '3x3',
  minZoom,
  maxZoom,
  mercatorLatitudeLimit: mercatorLimit,
  renderablePins: renderable.length,
  excludedPins: excluded.map(({ id, short, lat, lng }) => ({ id, short, lat, lng, reason: 'outside-web-mercator' })),
  hashDefinition: 'SHA-256 of sorted z/x/y records joined by LF, including a final LF',
  zooms,
  fullFootprintDescendants: {
    source: 'scripts/sat/eox2025-manifest.json z8 tiles',
    z8Tiles: z8Count,
    counts: descendantCounts,
    total: Object.values(descendantCounts).reduce((sum, count) => sum + count, 0),
  },
};

const output = resolve(here, 'highzoom-manifest.json');
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${Object.values(zooms).reduce((sum, zoom) => sum + zoom.count, 0)} pin tiles written to ${output}`);
