#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { flag, readJson, readJsonl } from './common.mjs';
import { ACCEPTANCE_SITE_IDS } from './sites.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: site-blocks.mjs --plan FILE [--inventory FILE] [--out FILE]');
  process.exit(0);
}
const root = resolve(import.meta.dirname, '../../..');
const plan = await readJson(resolve(flag(args, '--plan')));
const inventory = await readJsonl(resolve(flag(args, '--inventory', resolve(root, 'scripts/sat/work/inventory/lr-inventory.jsonl'))));
const out = resolve(flag(args, '--out', resolve(root, 'scripts/sat/work/inventory/site-blocks.json')));
const edge = 20037508.342789244;
const latitude = (y) => Math.atan(Math.sinh(y / edge * Math.PI)) * 180 / Math.PI;
const lonLatBounds = (window) => window.crs === 'EPSG:4326' ? window.bounds : [window.bounds[0] / edge * 180, latitude(window.bounds[1]), window.bounds[2] / edge * 180, latitude(window.bounds[3])];
const recordBounds = (record) => {
  const points = record.footprint?.coordinates?.flat();
  if (!points?.length) return null;
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
};
const overlaps = (a, b) => a && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const windows = new Map(plan.windows.map(window => [window.id, window]));
if (!plan.siteWindows) throw new Error('Plan has no siteWindows; generate it with plan.mjs --sites');
const sites = {};
for (const id of ACCEPTANCE_SITE_IDS) {
  const ids = plan.siteWindows[id];
  if (!ids) throw new Error(`Plan is missing acceptance site ${id}`);
  const blocks = new Set();
  for (const windowId of ids) {
    const window = windows.get(windowId);
    if (!window) throw new Error(`Plan is missing window ${windowId} for ${id}`);
    const bounds = lonLatBounds(window);
    for (const record of inventory) if (record.collectionLabel === 'low-resolution' && overlaps(recordBounds(record), bounds)) blocks.add(record.gridCell);
  }
  sites[id] = [...blocks].sort();
}
const union = [...new Set(Object.values(sites).flat())].sort();
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify({ version: 1, sites, union }, null, 2)}\n`);
console.log(`Wrote ${union.length} LR blocks for ${Object.keys(sites).length} acceptance sites to ${out}`);
