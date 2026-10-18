#!/usr/bin/env node
// Build the complete, B08-free LR acquisition inventory from list-lr.py JSONL.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
};
if (args.includes('--help')) {
  console.log('Usage: node scripts/sat/make-lr-inventory.mjs [--listing FILE] [--out FILE] [--python PYTHON]');
  console.log('Without --listing, runs list-lr.py. Grid tokens name southwest block corners; blocks are 36 by 36 degrees.');
  process.exit(0);
}

const listing = flag('--listing');
const out = resolve(flag('--out', resolve(here, 'work/inventory/lr-inventory.jsonl')));
const python = flag('--python', resolve(root, '.venv-sat/bin/python'));
const listingText = listing
  ? await readFile(resolve(listing), 'utf8')
  : (() => {
      const result = spawnSync(python, [resolve(here, 'list-lr.py')], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      if (result.status !== 0) throw new Error(`LR S3 listing failed: ${result.stderr.trim() || `exit status ${result.status}`}`);
      return result.stdout;
    })();
const quarterByMonth = { '01': '2025-Q1', '04': '2025-Q2', '07': '2025-Q3', '10': '2025-Q4' };
const quarters = {
  '2025-Q1': ['2025-01-01T00:00:00.000Z', '2025-03-31T23:59:59.999Z'],
  '2025-Q2': ['2025-04-01T00:00:00.000Z', '2025-06-30T23:59:59.999Z'],
  '2025-Q3': ['2025-07-01T00:00:00.000Z', '2025-09-30T23:59:59.999Z'],
  '2025-Q4': ['2025-10-01T00:00:00.000Z', '2025-12-31T23:59:59.999Z'],
};
const signedDegrees = (hemisphere, degrees) => (hemisphere === 'S' || hemisphere === 'W' ? -degrees : degrees);
// The grid token is the inclusive southwest edge; the east and north edges are exclusive.
const footprintOf = (cell) => {
  const match = cell.match(/^([NS])(\d{2})([EW])(\d{3})$/);
  if (!match) throw new Error(`Invalid LR grid cell: ${cell}`);
  const west = signedDegrees(match[3], Number(match[4]));
  const south = signedDegrees(match[1], Number(match[2]));
  const east = west + 36;
  const north = south + 36;
  if (west < -180 || east > 180 || south < -90 || north > 90) throw new Error(`LR grid cell is outside the global 36-degree grid: ${cell}`);
  return { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
};
const records = listingText.split(/\r?\n/).filter(Boolean).map((line, index) => {
  let object;
  try { object = JSON.parse(line); } catch { throw new Error(`Listing line ${index + 1} is not JSON`); }
  if (!object.key || !Number.isSafeInteger(object.size) || object.size < 0 || typeof object.etag !== 'string' || !object.etag) throw new Error(`Listing line ${index + 1} is missing key, size, or etag`);
  const match = object.key.match(/^Global-Mosaics\/Sentinel-2\/S2MSI_L3__MCQ_LR\/2025\/(01|04|07|10)\/01\/(Sentinel-2_mosaic_2025_Q[1-4]_([NS]\d{2}[EW]\d{3})_low_resolution)\/(B02|B03|B04|B08|observations)\.tif$/i);
  if (!match) throw new Error(`Listing line ${index + 1} is not an LR 2025 data file: ${object.key}`);
  if (match[4].toUpperCase() === 'B08') return null;
  const quarter = quarterByMonth[match[1]];
  const cell = match[3].toUpperCase();
  return {
    productId: `s3:${object.key}`,
    name: `${match[2]}/${match[4]}.tif`,
    quarter,
    contentDate: { Start: quarters[quarter][0], End: quarters[quarter][1] },
    collection: 'byoc-6af2d932-8f18-4bed-a31b-d32bc49d43a0',
    collectionLabel: 'low-resolution',
    gridCell: cell,
    footprint: footprintOf(cell),
    s3Path: `/eodata/${object.key}`,
    contentLength: object.size,
    checksum: [{ algorithm: 's3-etag', value: object.etag.replace(/^\"|\"$/g, '') }],
    source: 's3-listing',
  };
}).filter(Boolean);
records.sort((left, right) => left.s3Path.localeCompare(right.s3Path));
const seen = new Set();
for (const record of records) {
  if (seen.has(record.productId)) throw new Error(`Duplicate LR object: ${record.s3Path}`);
  seen.add(record.productId);
}
for (const quarter of Object.keys(quarters)) if (!records.some((record) => record.quarter === quarter)) throw new Error(`No kept LR files for ${quarter}`);
await mkdir(dirname(out), { recursive: true });
const temporary = `${out}.partial`;
await writeFile(temporary, `${records.map(JSON.stringify).join('\n')}\n`);
await rename(temporary, out);
console.log(`Wrote ${records.length} B08-free LR records (${records.reduce((total, record) => total + record.contentLength, 0)} bytes) to ${out}`);
