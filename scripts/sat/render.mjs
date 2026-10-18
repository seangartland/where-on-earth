#!/usr/bin/env node
import { appendFile, access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
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
const REQUEST_INTERVAL_MS = 500; // 120 Process API requests per minute.
let lastRequestAt = 0;

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
const runFfmpegFiles = (args, message) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr.toString().trim() || 'ffmpeg failed'}`);
};
const rgba = (png) => runFfmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], png, 'Could not decode Process API image');
const nodataFraction = (pixels, offsetX, offsetY) => {
  let empty = 0;
  for (let y = offsetY; y < offsetY + TILE_SIZE; y++) for (let x = offsetX; x < offsetX + TILE_SIZE; x++) {
    const at = (y * WINDOW_SIZE + x) * 4;
    if (pixels[at + 3] === 0) empty++;
  }
  return empty / (TILE_SIZE * TILE_SIZE);
};
const sliceWindow = async (png, out, z, x, y, qa) => {
  const pixels = rgba(png);
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
const windowFlag = args.indexOf('--window');
const outFlag = args.indexOf('--out');
const out = resolve(root, outFlag >= 0 ? args[outFlag + 1] : pilot ? 'scripts/sat/pilot' : 'scripts/sat/render');
if (outFlag >= 0 && !args[outFlag + 1]) throw new Error('--out needs a directory');
const envFile = await parseEnvFile();
const clientId = process.env.CDSE_CLIENT_ID || envFile.CDSE_CLIENT_ID;
const clientSecret = process.env.CDSE_CLIENT_SECRET || envFile.CDSE_CLIENT_SECRET;
const evalscript = await readFile(resolve(here, 'evalscript.js'), 'utf8');
const evalscriptFor = (preferredMonths) => evalscript.replace('__PREFERRED_MONTHS__', JSON.stringify(preferredMonths));
const sites = pilot ? JSON.parse(await readFile(resolve(here, 'pilot-sites.json'), 'utf8')) : [];
const windows = pilot
  ? sites.flatMap((site) => [4, 6, 8].map((z) => ({ x: site.tiles[z].x - 1, y: site.tiles[z].y - 1, z, site: site.id }))).concat(sites.filter((site) => ['bay-area', 'alps', 'fiji', 'sydney'].includes(site.id)).map((site) => ({ x: site.tiles[9].x - 1, y: site.tiles[9].y - 1, z: 9, site: site.id })))
  : windowFlag >= 0 ? [{ ...parseWindow(args[windowFlag + 1]), site: 'manual' }] : [];
if (!pilot && !windows.length) throw new Error('Use --pilot or --window z/x/y');

if (!clientId && !clientSecret) {
  for (const z of [...new Set(windows.map((window) => window.z))]) {
    const sample = windows.find((window) => window.z === z);
    const bbox = mercatorBbox(z, sample.x, sample.y);
    console.log(JSON.stringify({ dryRun: true, zoom: z, preferredMonths: preferenceFor(z, bbox), request: redacted(requestBody(bbox, WINDOW_SIZE, WINDOW_SIZE, 'http://www.opengis.net/def/crs/EPSG/0/3857')) }, null, 2));
  }
  if (pilot) for (const { part, bbox } of [{ part: 'west', bbox: [-180, -90, 0, 90] }, { part: 'east', bbox: [0, -90, 180, 90] }]) {
    console.log(JSON.stringify({ dryRun: true, preferredMonths: [], base: { part, request: redacted(requestBody(bbox, 2048, 2048, 'http://www.opengis.net/def/crs/EPSG/0/4326')) } }, null, 2));
  }
  process.exit(0);
}
if (!clientId || !clientSecret) throw new Error('Both CDSE_CLIENT_ID and CDSE_CLIENT_SECRET are required for a live render');

await mkdir(out, { recursive: true });
let qa = {};
try { qa = JSON.parse(await readFile(resolve(out, 'qa.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const token = await getToken(clientId, clientSecret);
for (const window of windows) {
  const tileFiles = await Promise.all(Array.from({ length: 9 }, (_, index) => {
    const tx = (window.x + index % 3 + 2 ** window.z) % 2 ** window.z;
    const ty = Math.max(0, Math.min(2 ** window.z - 1, window.y + Math.floor(index / 3)));
    return exists(resolve(out, String(window.z), String(tx), `${ty}.jpg`));
  }));
  if (tileFiles.every(Boolean)) continue;
  const bbox = mercatorBbox(window.z, window.x, window.y);
  const body = withEvalscript(requestBody(bbox, WINDOW_SIZE, WINDOW_SIZE, 'http://www.opengis.net/def/crs/EPSG/0/3857'), evalscriptFor(preferenceFor(window.z, bbox)));
  const png = await postRender(token, body, out, { z: window.z, x: window.x, y: window.y, site: window.site });
  await sliceWindow(png, out, window.z, window.x, window.y, qa);
  await writeFile(resolve(out, 'qa.json'), `${JSON.stringify(qa, null, 2)}\n`);
}
if (pilot && !(await exists(resolve(out, 'base-ours.jpg')))) {
  const baseParts = [{ part: 'west', bbox: [-180, -90, 0, 90] }, { part: 'east', bbox: [0, -90, 180, 90] }];
  const files = baseParts.map(({ part }) => resolve(out, `.base-${part}.png`));
  try {
    for (let index = 0; index < baseParts.length; index++) {
      const { part, bbox } = baseParts[index];
      const body = withEvalscript(requestBody(bbox, 2048, 2048, 'http://www.opengis.net/def/crs/EPSG/0/4326'), evalscriptFor([]));
      await writeFile(files[index], await postRender(token, body, out, { kind: 'base', part, z: null, x: null, y: null }));
    }
    runFfmpegFiles(['-i', files[0], '-i', files[1], '-filter_complex', '[0:v][1:v]hstack=inputs=2,scale=2048:1024', '-frames:v', '1', '-q:v', '2', '-y', resolve(out, 'base-ours.jpg')], 'Could not write pilot base texture');
  } finally {
    await Promise.all(files.map((file) => unlink(file).catch((error) => { if (error.code !== 'ENOENT') throw error; })));
  }
}
await writeFile(resolve(out, 'report.json'), `${JSON.stringify({ inputBands: INPUT_BANDS, samples: SAMPLES, windows: windows.length, expectedPU: windows.length * puFor(WINDOW_SIZE, WINDOW_SIZE) + (pilot ? puFor(4096, 2048) : 0) }, null, 2)}\n`);
console.log(`Rendered ${windows.length} window(s) to ${out}`);
