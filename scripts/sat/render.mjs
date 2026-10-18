#!/usr/bin/env node
import { appendFile, access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const TILE_SIZE = 256;
const WINDOW_SIZE = TILE_SIZE * 3;
const INPUT_BANDS = 4;
const SAMPLES = 4;
const RETRIES = 3;
const BMNG_URL = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg';
const BMNG_FILE = 'world.topo.bathy.200412.3x21600x10800.jpg';
const LAND_MASK_FILE = 'ne-land-mask.png';
const NE_LAND_URL = 'https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip';
const NE_LAKES_URL = 'https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip';
const NE_LAND_FILE = 'ne_10m_land.zip';
const NE_LAKES_FILE = 'ne_10m_lakes.zip';
const LAND_MASK_WIDTH = 21600;
const LAND_MASK_HEIGHT = 10800;
const REQUEST_INTERVAL_MS = 500; // 120 Process API requests per minute.
let lastRequestAt = 0;
let bmng;
let landMask;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const tileAt = (lat, lng, z) => {
  const n = 2 ** z;
  const clipped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor((1 - Math.asinh(Math.tan(clipped * Math.PI / 180)) / Math.PI) / 2 * n),
  };
};
const mercatorBbox = (z, x, y) => {
  const n = 2 ** z;
  const edge = 20037508.342789244;
  return [
    -edge + (x / n) * edge * 2,
    edge - ((y + 3) / n) * edge * 2,
    -edge + ((x + 3) / n) * edge * 2,
    edge - (y / n) * edge * 2,
  ];
};
const preferenceFor = (z, bbox) => {
  if (![6, 8, 9].includes(z)) return [];
  const centerY = (bbox[1] + bbox[3]) / 2;
  const latitude = Math.atan(Math.sinh(centerY / 20037508.342789244 * Math.PI)) * 180 / Math.PI;
  return latitude > 23 ? [7, 8, 9] : latitude < -23 ? [1, 2, 3] : [];
};

const parseEnvFile = async () => {
  try {
    const text = await readFile(resolve(here, '.env'), 'utf8');
    return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
    }));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};
const exists = async (file) => {
  try { await access(file, constants.F_OK); return (await (await import('node:fs/promises')).stat(file)).size > 0; } catch { return false; }
};
const puFor = (width, height) => width * height / (512 * 512) * (INPUT_BANDS / 3) * SAMPLES;
const requestBody = (bbox, width, height, crs) => ({
  input: {
    bounds: { bbox, properties: { crs } },
    data: [{
      type: 'byoc-6af2d932-8f18-4bed-a31b-d32bc49d43a0',
      dataFilter: { timeRange: { from: '2025-01-01T00:00:00Z', to: '2025-12-31T23:59:59Z' } },
    }],
  },
  output: { width, height, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
});
const withEvalscript = (body, evalscript) => ({ ...body, evalscript });
const redacted = (body) => ({ ...body, evalscript: '[scripts/sat/evalscript.js]', authorization: '[redacted]' });
const runFfmpeg = (args, input, message) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args], { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr.toString().trim() || 'ffmpeg failed'}`);
  return result.stdout;
};
const rgba = (png) => runFfmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], png, 'Could not decode Process API image');
const rgb = (image) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {
    input: image,
    // The 21600x10800 source expands to about 700 MB as RGB. Keep it decoded
    // once for the run, but allow ffmpeg's complete output through the pipe.
    maxBuffer: 768 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Could not decode Blue Marble image: ${result.stderr.toString().trim() || 'ffmpeg failed'}`);
  return result.stdout;
};
const grayscale = (image) => runFfmpeg(['-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], image, 'Could not decode Natural Earth land mask');
const jpeg = (pixels, width, height, message) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${width}x${height}`, '-i', 'pipe:0', '-frames:v', '1', '-q:v', '2', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1'], { input: pixels, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr.toString().trim() || 'ffmpeg failed'}`);
  return result.stdout;
};
const imageDimensions = (file) => {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]);
  if (result.status !== 0) throw new Error(`Could not inspect Blue Marble image: ${result.stderr.toString().trim() || 'ffprobe failed'}`);
  const match = result.stdout.toString().trim().match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error('Could not read Blue Marble image dimensions');
  return { width: Number(match[1]), height: Number(match[2]) };
};
const loadBmng = async () => {
  if (bmng) return bmng;
  const file = resolve(here, 'cache', BMNG_FILE);
  if (!(await exists(file))) {
    await mkdir(dirname(file), { recursive: true });
    const response = await fetch(BMNG_URL);
    if (!response.ok) throw new Error(`Blue Marble download failed with HTTP ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  const dimensions = imageDimensions(file);
  bmng = { file, ...dimensions, pixels: rgb(await readFile(file)), bytes: (await stat(file)).size };
  if (bmng.pixels.length !== bmng.width * bmng.height * 3) throw new Error('Unexpected Blue Marble image dimensions');
  return bmng;
};
const loadLandMask = async () => {
  if (landMask) return landMask;
  const file = resolve(here, 'cache', LAND_MASK_FILE);
  if (!(await exists(file))) throw new Error(`Natural Earth land mask is missing: run scripts/sat/make-land-mask.py to create ${file}`);
  landMask = { file, pixels: grayscale(await readFile(file)), bytes: (await stat(file)).size };
  if (landMask.pixels.length !== LAND_MASK_WIDTH * LAND_MASK_HEIGHT) throw new Error('Unexpected Natural Earth land mask dimensions');
  return landMask;
};
const cachedDownload = async (url, name) => {
  const file = resolve(here, 'cache', name);
  if (!(await exists(file))) {
    await mkdir(dirname(file), { recursive: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name} download failed with HTTP ${response.status}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  return file;
};
const vectorMaskFile = (bbox, crs, width, height) => {
  const key = createHash('sha256').update(JSON.stringify([bbox, crs, width, height])).digest('hex').slice(0, 20);
  return resolve(here, 'cache', `ne-window-${key}.png`);
};
const prepareVectorBlendMasks = async (jobs) => {
  const missing = [];
  for (const job of jobs) {
    const file = vectorMaskFile(job.bbox, job.crs, job.width, job.height);
    if (!(await exists(file))) missing.push({ ...job, out: file, crs: job.crs.endsWith('/3857') ? '3857' : '4326' });
  }
  if (!missing.length) return;
  const land = await cachedDownload(NE_LAND_URL, NE_LAND_FILE);
  const lakes = await cachedDownload(NE_LAKES_URL, NE_LAKES_FILE);
  const result = spawnSync('python3', [resolve(here, 'make-land-mask.py'), '--batch', land, lakes], {
    input: JSON.stringify(missing), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Could not rasterize Natural Earth window masks: ${(result.stderr || result.stdout).trim()}`);
};
const loadVectorBlendMask = async (bbox, crs, width, height) => {
  const file = vectorMaskFile(bbox, crs, width, height);
  if (!(await exists(file))) await prepareVectorBlendMasks([{ bbox, crs, width, height }]);
  const pixels = grayscale(await readFile(file));
  if (pixels.length !== width * height) throw new Error('Unexpected vector land mask dimensions');
  return pixels;
};
const mercatorLatitude = (y) => Math.atan(Math.sinh(y / 20037508.342789244 * Math.PI)) * 180 / Math.PI;
const sampleBmng = (source, longitude, latitude, target) => {
  const x = ((longitude + 180) / 360 * source.width + source.width) % source.width;
  const y = Math.max(0, Math.min(source.height - 1, (90 - latitude) / 180 * source.height));
  const x0 = Math.floor(x);
  const x1 = (x0 + 1) % source.width;
  const y0 = Math.floor(y);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (px, py, channel) => source.pixels[(py * source.width + px) * 3 + channel];
  for (let channel = 0; channel < 3; channel++) target[channel] = Math.round(
    at(x0, y0, channel) * (1 - tx) * (1 - ty) + at(x1, y0, channel) * tx * (1 - ty) +
    at(x0, y1, channel) * (1 - tx) * ty + at(x1, y1, channel) * tx * ty,
  );
  const luminance = (target[0] * 0.2126 + target[1] * 0.7152 + target[2] * 0.0722) / 255;
  const tonedLuminance = 0.07 + 0.68 * Math.pow(luminance, 0.92);
  const saturation = 0.72;
  for (let channel = 0; channel < 3; channel++) {
    const value = tonedLuminance + (target[channel] / 255 - luminance) * saturation;
    target[channel] = Math.round(Math.max(0, Math.min(1, value)) * 255);
  }
};
const composeOcean = async (png, bbox, crs, width, height, vectorMask = false) => {
  const mosaic = rgba(png);
  if (mosaic.length !== width * height * 4) throw new Error('Unexpected Process API image dimensions');
  const source = await loadBmng();
  const mask = vectorMask ? null : await loadLandMask();
  const vectorBlend = vectorMask ? await loadVectorBlendMask(bbox, crs, width, height) : null;
  const output = Buffer.alloc(width * height * 3);
  const ocean = [0, 0, 0];
  const isMercator = crs.endsWith('/3857');
  const waterClasses = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rawX = bbox[0] + (x + 0.5) / width * (bbox[2] - bbox[0]);
    const longitude = isMercator ? rawX * 180 / 20037508.342789244 : rawX;
    const coordinateY = bbox[3] - (y + 0.5) / height * (bbox[3] - bbox[1]);
    const latitude = isMercator ? mercatorLatitude(coordinateY) : coordinateY;
    const maskX = Math.floor(((longitude + 180) / 360 * LAND_MASK_WIDTH + LAND_MASK_WIDTH) % LAND_MASK_WIDTH);
    const maskY = Math.max(0, Math.min(LAND_MASK_HEIGHT - 1, Math.floor((90 - latitude) / 180 * LAND_MASK_HEIGHT)));
    waterClasses[y * width + x] = vectorBlend ? vectorBlend[y * width + x] >= 128 : mask.pixels[maskY * LAND_MASK_WIDTH + maskX] < 128;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    const alpha = mosaic[at + 3];
    const rawX = bbox[0] + (x + 0.5) / width * (bbox[2] - bbox[0]);
    const longitude = isMercator ? rawX * 180 / 20037508.342789244 : rawX;
    const coordinateY = bbox[3] - (y + 0.5) / height * (bbox[3] - bbox[1]);
    const latitude = isMercator ? mercatorLatitude(coordinateY) : coordinateY;
    const water = waterClasses[y * width + x];
    sampleBmng(source, longitude, latitude, ocean);
    let nearestOpposite = Infinity;
    if (!vectorBlend && alpha > 0) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || mosaic[(ny * width + nx) * 4 + 3] === 0) continue;
        if (waterClasses[ny * width + nx] !== water) nearestOpposite = Math.min(nearestOpposite, Math.hypot(dx, dy));
      }
    }
    const blend = vectorBlend ? vectorBlend[y * width + x] / 255 : nearestOpposite <= 2
      ? (water ? 0.5 + nearestOpposite / 4 : 0.5 - nearestOpposite / 4)
      : (water ? 1 : 0);
    let landAt = at;
    if (!isMercator && !water && alpha === 0) {
      const step = y < height / 2 ? 1 : -1;
      for (let sourceY = y + step; sourceY >= 0 && sourceY < height; sourceY += step) {
        const candidate = (sourceY * width + x) * 4;
        if (mosaic[candidate + 3] > 0) { landAt = candidate; break; }
      }
    }
    const out = (y * width + x) * 3;
    for (let channel = 0; channel < 3; channel++) output[out + channel] = Math.round(mosaic[landAt + channel] * (1 - blend) + ocean[channel] * blend);
  }
  return jpeg(output, width, height, 'Could not encode ocean composite');
};
const nodataFraction = (pixels, offsetX, offsetY) => {
  let empty = 0;
  for (let y = offsetY; y < offsetY + TILE_SIZE; y++) for (let x = offsetX; x < offsetX + TILE_SIZE; x++) {
    const at = (y * WINDOW_SIZE + x) * 4;
    if (pixels[at + 3] === 0) empty++;
  }
  return empty / (TILE_SIZE * TILE_SIZE);
};
const sliceWindow = async (png, out, z, x, y, qa, nodataPixels = rgba(png)) => {
  const pixels = nodataPixels;
  if (pixels.length !== WINDOW_SIZE * WINDOW_SIZE * 4) throw new Error('Unexpected Process API image dimensions');
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const tx = ((x + dx) % (2 ** z) + 2 ** z) % (2 ** z);
    const ty = Math.max(0, Math.min(2 ** z - 1, y + dy));
    const file = resolve(out, String(z), String(tx), `${ty}.jpg`);
    await mkdir(dirname(file), { recursive: true });
    runFfmpeg(['-vf', `crop=${TILE_SIZE}:${TILE_SIZE}:${dx * TILE_SIZE}:${dy * TILE_SIZE}`, '-frames:v', '1', '-q:v', '2', '-y', file], png, `Could not write ${file}`);
    qa[`${z}/${tx}/${ty}`] = nodataFraction(pixels, dx * TILE_SIZE, dy * TILE_SIZE);
  }
};
const getToken = async (clientId, clientSecret) => {
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  if (!response.ok) throw new Error(`CDSE token request failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('CDSE token response did not contain an access token');
  return payload.access_token;
};
const logRequest = (out, record) => appendFile(resolve(out, 'run.jsonl'), `${JSON.stringify(record)}\n`);
const postRender = async (token, body, out, label) => {
  const estimate = puFor(body.output.width, body.output.height);
  for (let retry = 0; retry <= RETRIES; retry++) {
    const wait = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait) await sleep(wait);
    lastRequestAt = Date.now();
    let response;
    try {
      response = await fetch(PROCESS_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'image/png' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (retry === RETRIES) throw error;
      await sleep(500 * 2 ** retry);
      continue;
    }
    await logRequest(out, { timestamp: new Date().toISOString(), ...label, status: response.status, puEstimate: estimate });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    const responseBody = (await response.text()).slice(0, 300);
    if (![429, 500, 502, 503, 504].includes(response.status) || retry === RETRIES) {
      throw new Error(`Process API request failed with HTTP ${response.status}: ${responseBody}`);
    }
    await sleep(500 * 2 ** retry);
  }
};
const parseWindow = (value) => {
  const match = value?.match(/^(\d+)\/(\d+)\/(\d+)$/);
  if (!match) throw new Error('--window must be z/x/y');
  return { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
};

const args = process.argv.slice(2);
const pilot = args.includes('--pilot');
const refresh = args.includes('--refresh');
const dryRun = args.includes('--dry-run');
const sitesFlag = args.indexOf('--sites');
const windowFlag = args.indexOf('--window');
const outFlag = args.indexOf('--out');
const out = resolve(root, outFlag >= 0 ? args[outFlag + 1] : pilot ? 'scripts/sat/pilot' : 'scripts/sat/render');
if (outFlag >= 0 && !args[outFlag + 1]) throw new Error('--out needs a directory');
const envFile = await parseEnvFile();
const clientId = process.env.CDSE_CLIENT_ID || envFile.CDSE_CLIENT_ID;
const clientSecret = process.env.CDSE_CLIENT_SECRET || envFile.CDSE_CLIENT_SECRET;
const evalscript = await readFile(resolve(here, 'evalscript.js'), 'utf8');
const evalscriptFor = (preferredMonths) => evalscript.replace('__PREFERRED_MONTHS__', JSON.stringify(preferredMonths));
const allSites = pilot ? JSON.parse(await readFile(resolve(here, 'pilot-sites.json'), 'utf8')) : [];
const selectedIds = sitesFlag < 0 ? null : new Set((args[sitesFlag + 1] || '').split(',').filter(Boolean));
if (sitesFlag >= 0 && (!pilot || !selectedIds.size)) throw new Error('--sites needs a comma-separated list and requires --pilot');
const sites = selectedIds ? allSites.filter((site) => selectedIds.has(site.id)) : allSites;
if (selectedIds && sites.length !== selectedIds.size) throw new Error(`Unknown pilot site: ${[...selectedIds].find((id) => !sites.some((site) => site.id === id))}`);
const windows = pilot
  ? sites.flatMap((site) => [4, 6, 8].map((z) => ({ x: site.tiles[z].x - 1, y: site.tiles[z].y - 1, z, site: site.id }))).concat(sites.filter((site) => ['bay-area', 'alps', 'fiji', 'sydney'].includes(site.id)).map((site) => ({ x: site.tiles[9].x - 1, y: site.tiles[9].y - 1, z: 9, site: site.id })))
  : windowFlag >= 0 ? [{ ...parseWindow(args[windowFlag + 1]), site: 'manual' }] : [];
if (!pilot && !windows.length) throw new Error('Use --pilot or --window z/x/y');

if (dryRun || (!clientId && !clientSecret)) {
  for (const z of [...new Set(windows.map((window) => window.z))]) {
    const sample = windows.find((window) => window.z === z);
    const bbox = mercatorBbox(z, sample.x, sample.y);
    console.log(JSON.stringify({ dryRun: true, zoom: z, preferredMonths: preferenceFor(z, bbox), request: redacted(requestBody(bbox, WINDOW_SIZE, WINDOW_SIZE, 'http://www.opengis.net/def/crs/EPSG/0/3857')) }, null, 2));
  }
  if (pilot) console.log(JSON.stringify({ dryRun: true, preferredMonths: [], base: { part: 'whole', request: redacted(requestBody([-180, -90, 180, 90], 2048, 1024, 'http://www.opengis.net/def/crs/EPSG/0/4326')) } }, null, 2));
  process.exit(0);
}
if (!clientId || !clientSecret) throw new Error('Both CDSE_CLIENT_ID and CDSE_CLIENT_SECRET are required for a live render');

await mkdir(out, { recursive: true });
let qa = {};
try { qa = JSON.parse(await readFile(resolve(out, 'qa.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const token = await getToken(clientId, clientSecret);
await prepareVectorBlendMasks(windows.filter((window) => window.z >= 8).map((window) => ({
  bbox: mercatorBbox(window.z, window.x, window.y),
  crs: 'http://www.opengis.net/def/crs/EPSG/0/3857',
  width: WINDOW_SIZE,
  height: WINDOW_SIZE,
})));
for (const window of windows) {
  const tileFiles = await Promise.all(Array.from({ length: 9 }, (_, index) => {
    const tx = (window.x + index % 3 + 2 ** window.z) % 2 ** window.z;
    const ty = Math.max(0, Math.min(2 ** window.z - 1, window.y + Math.floor(index / 3)));
    return refresh ? false : exists(resolve(out, String(window.z), String(tx), `${ty}.jpg`));
  }));
  if (tileFiles.every(Boolean)) continue;
  const bbox = mercatorBbox(window.z, window.x, window.y);
  const body = withEvalscript(requestBody(bbox, WINDOW_SIZE, WINDOW_SIZE, 'http://www.opengis.net/def/crs/EPSG/0/3857'), evalscriptFor(preferenceFor(window.z, bbox)));
  const png = await postRender(token, body, out, { z: window.z, x: window.x, y: window.y, site: window.site });
  const nodataPixels = rgba(png);
  await sliceWindow(await composeOcean(png, bbox, 'http://www.opengis.net/def/crs/EPSG/0/3857', WINDOW_SIZE, WINDOW_SIZE, window.z >= 8), out, window.z, window.x, window.y, qa, nodataPixels);
  await writeFile(resolve(out, 'qa.json'), `${JSON.stringify(qa, null, 2)}\n`);
}
if (pilot && (refresh || !(await exists(resolve(out, 'base-ours.jpg'))))) {
  const bbox = [-180, -90, 180, 90];
  const crs = 'http://www.opengis.net/def/crs/EPSG/0/4326';
  const body = withEvalscript(requestBody(bbox, 2048, 1024, crs), evalscriptFor([]));
  await writeFile(resolve(out, 'base-ours.jpg'), await composeOcean(await postRender(token, body, out, { kind: 'base', part: 'whole', z: null, x: null, y: null }), bbox, crs, 2048, 1024));
}
await writeFile(resolve(out, 'report.json'), `${JSON.stringify({ inputBands: INPUT_BANDS, samples: SAMPLES, windows: windows.length, expectedPU: windows.length * puFor(WINDOW_SIZE, WINDOW_SIZE) + (pilot ? puFor(2048, 1024) : 0), bmng: bmng && { file: BMNG_FILE, source: BMNG_URL, bytes: bmng.bytes }, landMask: landMask && { file: LAND_MASK_FILE, bytes: landMask.bytes }, vectorMask: { land: NE_LAND_URL, lakes: NE_LAKES_URL, zooms: [8, 9], supersampling: 4 } }, null, 2)}\n`);
console.log(`Rendered ${windows.length} window(s) to ${out}`);
