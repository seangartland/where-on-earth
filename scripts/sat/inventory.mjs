#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const work = resolve(here, 'work/inventory');
const rawDir = resolve(work, 'raw');
const stateFile = resolve(work, 'state.json');
const inventoryFile = resolve(work, 'source-inventory.jsonl');
const exclusionsFile = resolve(work, 'exclusions.jsonl');
const reportFile = resolve(root, 'docs/eox-inventory-report.md');
const tokenUrl = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const productsUrl = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products';
const landMaskFile = resolve(here, 'cache/ne-land-mask.png');
const maskWidth = 21600;
const maskHeight = 10800;
const products = [
  { key: 'low-resolution', id: 'byoc-6af2d932-8f18-4bed-a31b-d32bc49d43a0', target: 'manifest', family: 'S2MSI_L3__MCQ_LR' },
  { key: '10-metre', id: 'byoc-5460de54-082e-473a-b6ea-d5cbe3c17cca', target: 'pin-or-manifest', family: 'S2MSI_L3__MCQ' },
];
const quarters = [
  { key: '2025-Q1', from: '2025-01-01T00:00:00.000Z', to: '2025-04-01T00:00:00.000Z' },
  { key: '2025-Q2', from: '2025-04-01T00:00:00.000Z', to: '2025-07-01T00:00:00.000Z' },
  { key: '2025-Q3', from: '2025-07-01T00:00:00.000Z', to: '2025-10-01T00:00:00.000Z' },
  { key: '2025-Q4', from: '2025-10-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
];

const exists = async (file) => { try { await access(file, constants.F_OK); return true; } catch { return false; } };
const atomicJson = async (file, value) => {
  const temporary = `${file}.partial`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
};
const loadJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
const parseEnv = async () => {
  const text = await readFile(resolve(here, '.env'), 'utf8');
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const tileBounds = ({ z, x, y }) => {
  const n = 2 ** z;
  const lon = (tileX) => tileX / n * 360 - 180;
  const lat = (tileY) => Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / n))) * 180 / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
};
const minimalTileUnion = (tiles) => {
  const keys = new Set(tiles.map(({ z, x, y }) => `${z}/${x}/${y}`));
  return tiles.filter(({ z, x, y }) => {
    for (let parentZ = z - 1; parentZ >= 0; parentZ--) {
      const scale = 2 ** (z - parentZ);
      if (keys.has(`${parentZ}/${Math.floor(x / scale)}/${Math.floor(y / scale)}`)) return false;
    }
    return true;
  });
};
const pointInRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const pointInPolygon = (point, polygon) => pointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(point, ring));
const orientation = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const onSegment = (a, b, p) => orientation(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
const segmentsIntersect = (a, b, c, d) => {
  const o1 = orientation(a, b, c); const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a); const o4 = orientation(c, d, b);
  return (o1 !== o2 && o3 !== o4) || (!o1 && onSegment(a, b, c)) || (!o2 && onSegment(a, b, d)) || (!o3 && onSegment(c, d, a)) || (!o4 && onSegment(c, d, b));
};
const ringBounds = (ring) => ring.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const boxesOverlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const polygonIntersectsBox = (polygon, box) => {
  if (!boxesOverlap(ringBounds(polygon[0]), box)) return false;
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]];
  if (polygon.some((ring) => ring.some(([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]))) return true;
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  const edges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]]);
  return polygon.some((ring) => ring.some((point, index) => edges.some(([a, b]) => segmentsIntersect(point, ring[(index + 1) % ring.length], a, b))));
};
const polygonsOf = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  if (geometry.type === 'GeometryCollection') return geometry.geometries.flatMap(polygonsOf);
  throw new Error(`Unsupported footprint geometry type: ${geometry.type}`);
};
const parseFootprint = (value) => {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
};
const intersectsTiles = (polygons, tileBoxes) => polygons.some((polygon) => {
  const bounds = ringBounds(polygon[0]);
  return tileBoxes.some((box) => boxesOverlap(bounds, box) && polygonIntersectsBox(polygon, box));
});

const decodeLandMask = async () => {
  if (!(await exists(landMaskFile))) throw new Error(`Natural Earth land mask missing: ${landMaskFile}`);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', landMaskFile, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { maxBuffer: maskWidth * maskHeight + 1024 });
  if (result.status !== 0) throw new Error(`Could not decode Natural Earth land mask: ${result.stderr.toString().trim()}`);
  if (result.stdout.length !== maskWidth * maskHeight) throw new Error('Natural Earth land mask has unexpected dimensions');
  return result.stdout;
};
const footprintTouchesLand = (polygons, mask) => polygons.some((polygon) => {
  const bounds = ringBounds(polygon[0]);
  const x0 = Math.max(0, Math.floor((bounds[0] + 180) / 360 * maskWidth));
  const x1 = Math.min(maskWidth - 1, Math.ceil((bounds[2] + 180) / 360 * maskWidth));
  const y0 = Math.max(0, Math.floor((90 - bounds[3]) / 180 * maskHeight));
  const y1 = Math.min(maskHeight - 1, Math.ceil((90 - bounds[1]) / 180 * maskHeight));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (mask[y * maskWidth + x] < 128) continue;
    const cell = [x / maskWidth * 360 - 180, 90 - (y + 1) / maskHeight * 180, (x + 1) / maskWidth * 360 - 180, 90 - y / maskHeight * 180];
    if (polygonIntersectsBox(polygon, cell)) return true;
  }
  return false;
});

const productConfigOf = (product) => {
  const matches = products.filter(({ family }) => new RegExp(`(?:^|/)${family}(?:/|$)`).test(product.S3Path || ''));
  if (matches.length !== 1) throw new Error(`Product ${product.Id || product.Name || '<unknown>'} S3Path did not match exactly one known family: ${product.S3Path || '<missing>'}`);
  return matches[0];
};
const checksumOf = (product) => {
  const checksums = Array.isArray(product.Checksum) ? product.Checksum : product.Checksum ? [product.Checksum] : [];
  return checksums.map((checksum) => ({ algorithm: checksum.Algorithm || checksum.algorithm, value: checksum.Value || checksum.value }));
};
const gridCellOf = (product) => {
  const text = `${product.Name || ''} ${product.S3Path || ''}`;
  const match = text.match(/(?:^|[^A-Z0-9])T?(\d{2}[A-Z]{3})(?:[^A-Z0-9]|$)/i);
  if (match) return match[1].toUpperCase();
  const footprint = parseFootprint(product.GeoFootprint);
  return `footprint-${sha256(JSON.stringify(footprint)).slice(0, 16)}`;
};
const normalize = (product, context, footprint, flags) => ({
  productId: product.Id,
  name: product.Name,
  quarter: context.quarter.key,
  contentDate: product.ContentDate,
  collection: context.product.id,
  collectionLabel: context.product.key,
  gridCell: gridCellOf(product),
  footprint,
  s3Path: product.S3Path,
  contentLength: Number(product.ContentLength),
  checksum: checksumOf(product),
  intersects: flags,
});
const validateProduct = (product, context) => {
  if (!product.Id || !product.Name) throw new Error('OData product is missing Id or Name');
  if (!product.S3Path) throw new Error(`Product ${product.Id} is missing S3Path`);
  if (!Number.isFinite(Number(product.ContentLength)) || Number(product.ContentLength) < 0) throw new Error(`Product ${product.Id} has invalid ContentLength`);
  if (!checksumOf(product).length || checksumOf(product).some(({ value }) => !value)) throw new Error(`Product ${product.Id} is missing a checksum`);
  const start = Date.parse(product.ContentDate?.Start);
  if (!Number.isFinite(start) || start < Date.parse(context.quarter.from) || start >= Date.parse(context.quarter.to)) throw new Error(`Product ${product.Id} has an unexpected content date for ${context.quarter.key}`);
};

const initialUrl = ({ productType, from, to }) => {
  const typeFilter = `Attributes/OData.CSC.StringAttribute/any(a:a/Name eq 'productType' and a/OData.CSC.StringAttribute/Value eq '${productType}')`;
  const dates = `ContentDate/Start ge ${from} and ContentDate/Start lt ${to}`;
  const params = new URLSearchParams({
    '$filter': `${typeFilter} and ${dates}`,
    '$select': 'Id,Name,ContentDate,GeoFootprint,S3Path,ContentLength,Checksum',
    '$expand': 'Attributes',
    '$top': '1000',
    '$orderby': 'Id',
    '$count': 'true',
  });
  return `${productsUrl}?${params}`;
};
const daysOf = ({ from, to }) => {
  const days = [];
  for (let start = new Date(from); start < new Date(to); start = new Date(start.getTime() + 24 * 60 * 60 * 1000)) {
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    days.push({ key: start.toISOString().slice(0, 10), from: start.toISOString(), to: end.toISOString() });
  }
  return days;
};
const jobsForQuarter = (quarter) => [
  ...daysOf(quarter).map((slice) => ({
    key: `v2-S2MSI_L3__MCQ-${quarter.key}-${slice.key}`,
    productType: 'S2MSI_L3__MCQ',
    slice,
  })),
  {
    key: `v2-S2MSI_L3__MCQ_LR-${quarter.key}`,
    productType: 'S2MSI_L3__MCQ_LR',
    slice: { from: quarter.from, to: quarter.to },
  },
];
const getToken = async (clientId, clientSecret) => {
  const response = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }) });
  if (!response.ok) throw new Error(`CDSE token request failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('CDSE token response did not contain an access token');
  return payload.access_token;
};
const fetchPage = async (url, token) => {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`OData request failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  return text;
};
const pageFiles = async () => (await readdir(rawDir)).filter((name) => name.endsWith('.json')).sort();
const uniqueProductsInJob = async (key) => {
  const ids = new Set();
  for (const name of await pageFiles()) {
    if (!name.startsWith(`${key}-page-`)) continue;
    const payload = JSON.parse(await readFile(resolve(rawDir, name), 'utf8'));
    for (const product of payload.value || []) ids.add(product.Id);
  }
  return ids.size;
};

const materialize = async (manifestBoxes, pinBoxes, mask, complete, reconciliation) => {
  const retained = [];
  const excluded = [];
  const seenProducts = new Map();
  let duplicates = 0;
  for (const name of await pageFiles()) {
    const match = name.match(/^v2-(S2MSI_L3__MCQ(?:_LR)?)-(2025-Q[1-4])(?:-\d{4}-\d{2}-\d{2})?-page-(\d+)\.json$/);
    if (!match) continue;
    const quarter = quarters.find(({ key }) => key === match[2]);
    const payload = JSON.parse(await readFile(resolve(rawDir, name), 'utf8'));
    for (const product of payload.value || []) {
      const prior = seenProducts.get(product.Id);
      if (prior) {
        if (prior.s3Path !== product.S3Path || prior.contentLength !== Number(product.ContentLength)) throw new Error(`Conflicting duplicate product id ${product.Id}: S3Path or ContentLength differs`);
        duplicates++;
        continue;
      }
      seenProducts.set(product.Id, { s3Path: product.S3Path, contentLength: Number(product.ContentLength) });
      const productConfig = productConfigOf(product);
      validateProduct(product, { product: productConfig, quarter });
      const footprint = parseFootprint(product.GeoFootprint);
      const polygons = polygonsOf(footprint);
      if (!polygons.length) throw new Error(`Product ${product.Id} has no polygon footprint`);
      const flags = { manifestUnion: intersectsTiles(polygons, manifestBoxes), pinUnion: intersectsTiles(polygons, pinBoxes) };
      const inTarget = productConfig.target === 'manifest' ? flags.manifestUnion : flags.manifestUnion || flags.pinUnion;
      const record = normalize(product, { product: productConfig, quarter }, footprint, flags);
      if (!inTarget) {
        excluded.push({ ...record, reason: 'outside-requested-unions' });
      } else if (!footprintTouchesLand(polygons, mask)) {
        excluded.push({ ...record, reason: 'footprint-entirely-ocean-natural-earth-land-mask' });
      } else {
        retained.push(record);
      }
    }
  }
  retained.sort((a, b) => a.collection.localeCompare(b.collection) || a.quarter.localeCompare(b.quarter) || a.name.localeCompare(b.name));
  excluded.sort((a, b) => a.collection.localeCompare(b.collection) || a.quarter.localeCompare(b.quarter) || a.name.localeCompare(b.name));
  await writeFile(inventoryFile, `${retained.map(JSON.stringify).join('\n')}${retained.length ? '\n' : ''}`);
  await writeFile(exclusionsFile, `${excluded.map(JSON.stringify).join('\n')}${excluded.length ? '\n' : ''}`);
  if (complete) {
    for (const quarter of quarters) for (const product of products) {
      if (!retained.some((record) => record.quarter === quarter.key && record.collection === product.id)) throw new Error(`${product.key}-${quarter.key} has no retained objects after S3Path family assignment`);
    }
    await writeReport(retained, excluded, reconciliation, duplicates);
  }
};

const formatBytes = (bytes) => `${bytes.toLocaleString('en-US')} bytes (${(bytes / 1e9).toFixed(3)} GB)`;
const writeReport = async (retained, excluded, reconciliation, duplicates) => {
  const lines = ['# EOX source inventory report', '', `Generated by \`scripts/sat/inventory.mjs\` from completed live CDSE OData responses on ${new Date().toISOString()}.`, '', 'Collection family assignment is based solely on the S3Path family segment: `S2MSI_L3__MCQ_LR` is low-resolution and `S2MSI_L3__MCQ` is 10-metre.', '', '## Retained source inventory', '', '| Quarter | Catalogue objects | Fetched unique objects |', '| --- | ---: | ---: |'];
  for (const quarter of quarters) {
    const counts = reconciliation[quarter.key];
    lines.push(`| ${quarter.key} | ${counts.catalogue.toLocaleString('en-US')} | ${counts.fetched.toLocaleString('en-US')} |`);
  }
  lines.push('', `Dropped ${duplicates.toLocaleString('en-US')} duplicate page-overlap objects with identical Id, S3Path, and ContentLength.`, '', '| Product | Quarter | Unique grid cells | Objects | Total bytes |', '| --- | --- | ---: | ---: | ---: |');
  for (const product of products) for (const quarter of quarters) {
    const rows = retained.filter((record) => record.collection === product.id && record.quarter === quarter.key);
    lines.push(`| ${product.key} (\`${product.id}\`) | ${quarter.key} | ${new Set(rows.map(({ gridCell }) => gridCell)).size.toLocaleString('en-US')} | ${rows.length.toLocaleString('en-US')} | ${rows.reduce((sum, row) => sum + row.contentLength, 0).toLocaleString('en-US')} |`);
  }
  lines.push('', '## 10 m union comparison', '', '| Set | Unique grid cells | Objects | Total bytes |', '| --- | ---: | ---: | ---: |');
  const high = retained.filter(({ collection }) => collection === products[1].id);
  for (const [label, predicate] of [['Pin union', (row) => row.intersects.pinUnion], ['Phase 0 manifest union', (row) => row.intersects.manifestUnion], ['Pin only', (row) => row.intersects.pinUnion && !row.intersects.manifestUnion], ['Manifest only', (row) => row.intersects.manifestUnion && !row.intersects.pinUnion]]) {
    const rows = high.filter(predicate);
    lines.push(`| ${label} | ${new Set(rows.map(({ gridCell }) => gridCell)).size.toLocaleString('en-US')} | ${rows.length.toLocaleString('en-US')} | ${rows.reduce((sum, row) => sum + row.contentLength, 0).toLocaleString('en-US')} |`);
  }
  const ocean = excluded.filter(({ reason }) => reason.startsWith('footprint-entirely-ocean'));
  lines.push('', '## Ocean pruning', '', `The conservative test uses the checked-in 21,600 x 10,800 Natural Earth land-minus-lakes mask. A source footprint is pruned only when none of its polygon area intersects any land pixel cell; coastal ambiguity is retained. ${ocean.length.toLocaleString('en-US')} objects totalling ${formatBytes(ocean.reduce((sum, row) => sum + row.contentLength, 0))} were pruned as entirely ocean. Every exclusion is recorded in \`scripts/sat/work/inventory/exclusions.jsonl\`.`, '', '## Durable R2 ledger', '', '| Durable artifact | Projected size | Basis |', '| --- | ---: | --- |', '| Finished low-resolution tiles and base | up to 1.0 GB | Still estimated |', '| Finished z10-z14 pin layer | up to 1.975 GB | Still estimated from 49,379 tiles at 40 KB each |', '| Selected untoned windows | up to 7.0 GB | Still estimated |', '| **Worst-case durable total** | **9.975 GB** | Still estimated; source COGs and quarterly working windows are VM cache only |', '', 'The projected durable total is 0.025 GB below the 10 GB R2 free-storage allowance. Inventory evidence is retained with the build records but is below the reporting precision of this ledger. No source COG is budgeted for durable R2 storage.', '');
  await writeFile(reportFile, `${lines.join('\n')}\n`);
};

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/sat/inventory.mjs\nQueries 2025 daily MCQ slices plus quarterly LR and resumes from scripts/sat/work/inventory/state.json.');
  process.exit(0);
}

const manifest = await loadJson(resolve(here, 'eox2025-manifest.json'));
const highzoom = await loadJson(resolve(here, 'highzoom-manifest.json'));
// Drop a tile only when an ancestor tile is present. This preserves the exact
// multi-zoom union while avoiding redundant product-footprint intersections.
const manifestUnionTiles = minimalTileUnion(manifest.tiles);
const pinUnionTiles = minimalTileUnion(Object.values(highzoom.zooms).flatMap(({ xyz }) => xyz.map((key) => {
  const [z, x, y] = key.split('/').map(Number);
  return { z, x, y };
})));
const manifestBoxes = manifestUnionTiles.map(tileBounds);
const pinBoxes = pinUnionTiles.map(tileBounds);
const mask = await decodeLandMask();

if (process.argv.includes('--check')) {
  const land = [[[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]]];
  const london = [[[-0.2, 51.4], [0, 51.4], [0, 51.6], [-0.2, 51.6], [-0.2, 51.4]]];
  const pacific = [[[-150.2, -10.2], [-150, -10.2], [-150, -10], [-150.2, -10], [-150.2, -10.2]]];
  if (!polygonIntersectsBox(land[0], [-0.5, -0.5, 0.5, 0.5]) || polygonIntersectsBox(land[0], [2, 2, 3, 3])) throw new Error('Geometry self-check failed');
  if (!footprintTouchesLand([london], mask) || footprintTouchesLand([pacific], mask)) throw new Error('Natural Earth ocean-pruning self-check failed');
  if (Object.values(highzoom.zooms).reduce((sum, zoom) => sum + zoom.count, 0) !== 49379) throw new Error('High-zoom manifest count check failed');
  if (highzoom.fullFootprintDescendants.total !== 31104656) throw new Error('Full-footprint descendant count check failed');
  if (minimalTileUnion([{ z: 4, x: 1, y: 1 }, { z: 5, x: 2, y: 2 }, { z: 5, x: 9, y: 9 }]).length !== 2) throw new Error('Tile-union reduction self-check failed');
  console.log(`Offline checks passed: ${manifestBoxes.length} manifest-union boxes, ${pinBoxes.length} pin-union boxes, Natural Earth mask decoded`);
  process.exit(0);
}

await mkdir(rawDir, { recursive: true });
const env = await parseEnv();
const clientId = process.env.CDSE_CLIENT_ID || env.CDSE_CLIENT_ID;
const clientSecret = process.env.CDSE_CLIENT_SECRET || env.CDSE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('CDSE_CLIENT_ID and CDSE_CLIENT_SECRET are required');
const state = await loadJson(stateFile, { status: 'incomplete', startedAt: new Date().toISOString(), jobs: {} });
state.status = 'incomplete';
delete state.error;
state.updatedAt = new Date().toISOString();
await atomicJson(stateFile, state);

try {
  const token = await getToken(clientId, clientSecret);
  const reconciliation = {};
  for (const quarter of quarters) for (const query of jobsForQuarter(quarter)) {
    const { key, productType, slice } = query;
    const job = state.jobs[key] || { complete: false, pages: 0, nextUrl: initialUrl({ productType, from: slice.from, to: slice.to }) };
    state.jobs[key] = job;
    while (!job.complete && job.nextUrl) {
      const page = job.pages + 1;
      const text = await fetchPage(job.nextUrl, token);
      const payload = JSON.parse(text);
      if (!Array.isArray(payload.value)) throw new Error(`${key} page ${page} did not contain an OData value array`);
      if (page === 1) {
        const count = Number(payload['@odata.count']);
        if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${key} first page did not contain a valid @odata.count`);
        job.expectedCount = count;
      }
      await writeFile(resolve(rawDir, `${key}-page-${String(page).padStart(4, '0')}.json`), text);
      job.pages = page;
      job.nextUrl = payload['@odata.nextLink'] || null;
      job.updatedAt = new Date().toISOString();
      await atomicJson(stateFile, state);
    }
    if (!job.complete) {
      const fetched = await uniqueProductsInJob(key);
      if (fetched !== job.expectedCount) throw new Error(`${key} fetched ${fetched} unique products but catalogue reported ${job.expectedCount}`);
      job.uniqueProducts = fetched;
      job.complete = true;
      job.updatedAt = new Date().toISOString();
      await atomicJson(stateFile, state);
    }
    if (!Number.isSafeInteger(job.expectedCount) || !Number.isSafeInteger(job.uniqueProducts) || job.uniqueProducts !== job.expectedCount) throw new Error(`${key} fetched ${job.uniqueProducts ?? '<unknown>'} unique products but catalogue reported ${job.expectedCount ?? '<unknown>'}`);
    if (productType === 'S2MSI_L3__MCQ') {
      const counts = reconciliation[quarter.key] || { catalogue: 0, fetched: 0 };
      counts.catalogue += job.expectedCount;
      counts.fetched += job.uniqueProducts;
      reconciliation[quarter.key] = counts;
    }
  }
  state.status = 'complete';
  delete state.error;
  state.completedAt = new Date().toISOString();
  await atomicJson(stateFile, state);
  await materialize(manifestBoxes, pinBoxes, mask, true, reconciliation);
  console.log(`Inventory complete: ${inventoryFile}`);
} catch (error) {
  state.status = 'incomplete';
  state.error = { at: new Date().toISOString(), message: error.message };
  await atomicJson(stateFile, state);
  await materialize(manifestBoxes, pinBoxes, mask, false, {});
  throw new Error(`Inventory incomplete; resume state saved at ${stateFile}: ${error.message}`);
}
