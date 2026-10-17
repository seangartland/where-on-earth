#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

// These are the coordinate banks the game can use. Expedition files contain
// ids, so their stops are resolved against the banks below.
const locationFiles = {
  locations: 'assets/locations.json',
  landmarks: 'assets/locations-landmarks-sol.json',
  trivia: 'assets/trivia-bank.json',
  expeditions: 'assets/expeditions.json',
  weeklyExpeditions: 'assets/weekly-expeditions.json',
};
const source = { id: 'eox2025', maxZ: 8 };

const tileAt = (lat, lng, z) => {
  const n = 2 ** z;
  const clippedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = Math.floor(((lng + 180) / 360) * n);
  const radians = clippedLat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n);
  return { x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)), n };
};

const load = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const locationSets = await Promise.all(Object.entries(locationFiles).map(async ([name, file]) => [name, await load(file)]));
const banks = new Map(locationSets.slice(0, 3));
const locationsById = new Map();
for (const locations of banks.values()) {
  for (const location of locations) {
    const matches = locationsById.get(location.id) || [];
    matches.push(location);
    locationsById.set(location.id, matches);
  }
}

const routeStops = [];
for (const [, routes] of locationSets.slice(3)) {
  for (const route of routes) {
    for (const id of route.locationIds || []) {
      const matches = locationsById.get(id) || [];
      if (!matches.length) throw new Error(`Expedition stop ${id} does not resolve to a location bank`);
      // Gameplay resolves cities before landmarks. Trivia is last because it is
      // self-contained and does not participate in the runtime lookup.
      routeStops.push(matches[0]);
    }
  }
}

const coordinateSets = [...banks.values(), routeStops];
const coordinates = new Map();
for (const locations of coordinateSets) {
  for (const location of locations) {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
      throw new Error(`Invalid coordinate for ${location.id}`);
    }
    coordinates.set(`${location.lat},${location.lng}`, location);
  }
}
const locations = [...coordinates.values()];
const tiles = [];
for (let z = 4; z <= source.maxZ; z++) {
  const seen = new Set();
  for (const { lat, lng } of locations) {
    const { x, y, n } = tileAt(lat, lng, z);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${z}/${((x + dx) % n + n) % n}/${Math.max(0, Math.min(n - 1, y + dy))}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [tileZ, tileX, tileY] = key.split('/').map(Number);
        tiles.push({ z: tileZ, x: tileX, y: tileY });
      }
    }
  }
}
tiles.sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);

const manifest = {
  source,
  locationFiles: Object.values(locationFiles),
  locations: locations.length,
  window: '3x3',
  tiles,
};
const output = resolve(here, `${source.id}-manifest.json`);
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${tiles.length} tiles written to ${output}`);
