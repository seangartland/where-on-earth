#!/usr/bin/env node
/**
 * Build the compact, evidence-backed tile coverage index.
 *
 * Inputs deliberately have different authority:
 * - scripts/sat/eox2025-manifest.json is the QA-passed rendered tile tree
 *   recorded in docs/eox-full-render-report.md.
 * - src/globe/pilot-region.js is the gate-verified s2gm2025-pilot z10 census
 *   (5,745 tiles; corroborated by the zfill cutlist regions, 5,628, plus the
 *   Majuro atoll list, 117. The 10,385 figure in its comment is the pilot
 *   census across all zooms, not the z10 set.)
 * - scripts/sat/s2gm2025-z9-coords.json is the production z9 set, enumerated
 *   from the finished render tree (see that file for provenance).
 * - tile-header events in docs/zoom-stage1-evidence are live observations,
 *   used only for the individual default-z9 known-absent keys they name.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'scripts/sat/eox2025-manifest.json'), 'utf8'));
const pilotSource = await readFile(resolve(root, 'src/globe/pilot-region.js'), 'utf8');

const rangesByRows = (keys) => {
  const rows = new Map();
  for (const { x, y } of keys) {
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([y, xs]) => {
    xs.sort((a, b) => a - b);
    const ranges = [];
    for (const x of xs) {
      const last = ranges.at(-1);
      if (last && x <= last[1] + 1) last[1] = x;
      else ranges.push([x, x]);
    }
    return [y, ...ranges.flat()];
  });
};

const parsePilot = (text) => {
  const body = text.match(/const ROWS = \{([\s\S]*?)\n\};/);
  if (!body) throw new Error('Could not parse pilot census ROWS');
  const keys = [];
  for (const match of body[1].matchAll(/'10\/(\d+)': \[([^\]]+)\]/g)) {
    const y = Number(match[1]);
    const bounds = match[2].split(',').map((n) => Number(n.trim()));
    for (let i = 0; i < bounds.length; i += 2) for (let x = bounds[i]; x <= bounds[i + 1]; x++) keys.push({ x, y });
  }
  return keys;
};

const traceEvents = JSON.parse(await readFile(resolve(root, 'docs/zoom-stage1-evidence/tokyo-trace.json'), 'utf8'));
const observedZ9 = new Map();
for (const event of traceEvents) {
  if (event.type !== 'tile-headers' || !event.data?.src?.startsWith('s2gm2025/9/')) continue;
  const [, z, x, y] = event.data.src.split('/').map(Number);
  if (z === 9 && Number.isInteger(event.data.status)) observedZ9.set(`${x}/${y}`, { x, y, status: event.data.status });
}

const manifestTiles = (z) => manifest.tiles.filter((tile) => tile.z === z).map(({ x, y }) => ({ x, y }));
const z9Data = JSON.parse(await readFile(resolve(root, 'scripts/sat/s2gm2025-z9-coords.json'), 'utf8'));
const z9Present = z9Data.tiles.map(([x, y]) => ({ x, y }));
const z9Absent = [...observedZ9.values()].filter((tile) => tile.status === 404);
const pilotTiles = parsePilot(pilotSource);

const level = (z, present, knownAbsent, source, complete) => ({
  grid: { z, x: [0, 2 ** z - 1], y: [0, 2 ** z - 1] },
  domain: 'the union of present and known-absent row ranges below; every other valid XYZ coordinate is outside-domain for this index',
  complete,
  source,
  counts: { present: present.length, 'known-absent': knownAbsent.length, 'outside-domain': 2 ** (2 * z) - present.length - knownAbsent.length },
  states: { present: rangesByRows(present), 'known-absent': rangesByRows(knownAbsent) },
});

const index = {
  schema: 'where-on-earth.tile-coverage-index/v1',
  generatedAt: new Date().toISOString(),
  coordinateEncoding: 'Each state row is [y, x0, x1, x2, x3, ...], with inclusive x ranges. Valid XYZ coordinates absent from both listed states are outside-domain.',
  stateSemantics: {
    present: 'A verified object exists.',
    'known-absent': 'Inside the indexed mosaic domain and verified to have no object.',
    'outside-domain': 'No object is expected by this index. This must not be interpreted as a live-host probe result where complete is false.',
  },
  limitations: [
    'All levels are complete against their named sources. Absence inference is bounded by each level domain definition: coordinates outside the listed present and known-absent ranges are outside-domain for this index, which is a statement about the rendered mosaic domain, not a fresh live probe of every coordinate.',
    'An R2 bucket listing has still never been taken; the index rests on the render trees, manifests, and live spot probes named in each level source.',
  ],
  prefixes: {
    s2gm2025: {
      objectPath: 's2gm2025/{z}/{x}/{y}.jpg?v=2',
      levels: {
        5: level(5, manifestTiles(5), [], 'scripts/sat/eox2025-manifest.json and docs/eox-full-render-report.md', true),
        7: level(7, manifestTiles(7), [], 'scripts/sat/eox2025-manifest.json and docs/eox-full-render-report.md', true),
        8: level(8, manifestTiles(8), [], 'scripts/sat/eox2025-manifest.json and docs/eox-full-render-report.md', true),
        9: level(9, z9Present, z9Absent, 'scripts/sat/s2gm2025-z9-coords.json (finished render tree, enumerated 2026-11-21); known-absent keys from docs/zoom-stage1-evidence/tokyo-trace.json', true),
      },
    },
    's2gm2025-pilot': {
      objectPath: 's2gm2025-pilot/10/{x}/{y}.jpg?v=2',
      levels: {
        10: level(10, pilotTiles, [], 'src/globe/pilot-region.js executable prefix census, corroborated by the zfill cutlist (5,628) plus Majuro atoll list (117) and the r2-full-gate tree (5,745 files)', true),
      },
    },
  },
};

await writeFile(resolve(root, 'assets/coverage-index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(index.prefixes).map(([prefix, value]) => [prefix, Object.fromEntries(Object.entries(value.levels).map(([z, entry]) => [z, entry.counts]))])), null, 2));
