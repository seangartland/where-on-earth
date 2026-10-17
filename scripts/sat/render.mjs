#!/usr/bin/env node
import { appendFile, access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const quarters = [
  ['q1', '2025-01-01T00:00:00Z', '2025-03-31T23:59:59Z'],
  ['q2', '2025-04-01T00:00:00Z', '2025-06-30T23:59:59Z'],
  ['q3', '2025-07-01T00:00:00Z', '2025-09-30T23:59:59Z'],
  ['q4', '2025-10-01T00:00:00Z', '2025-12-31T23:59:59Z'],
];

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
    data: quarters.map(([id, from, to]) => ({
      id,
      type: 'sentinel-2-global-mosaics',
      dataFilter: { timeRange: { from, to } },
    })),
  },
  output: { width, height, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
});
const withEvalscript = (body, evalscript) => ({ ...body, evalscript });
const redacted = (body) => ({ ...body, evalscript: '[scripts/sat/evalscript.js]', authorization: '[redacted]' });
const runFfmpeg = (args, input, message) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args], { input });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr.toString().trim() || 'ffmpeg failed'}`);
  return result.stdout;
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
    try {
      const response = await fetch(PROCESS_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'image/png' },
        body: JSON.stringify(body),
      });
      await logRequest(out, { timestamp: new Date().toISOString(), ...label, status: response.status, puEstimate: estimate });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      if (![429, 500, 502, 503, 504].includes(response.status) || retry === RETRIES) throw new Error(`Process API request failed with HTTP ${response.status}`);
    } catch (error) {
      if (retry === RETRIES) throw error;
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
const sites = pilot ? JSON.parse(await readFile(resolve(here, 'pilot-sites.json'), 'utf8')) : [];
const windows = pilot
  ? sites.flatMap((site) => [4, 6, 8].map((z) => ({ x: site.tiles[z].x - 1, y: site.tiles[z].y - 1, z, site: site.id }))).concat(sites.filter((site) => ['bay-area', 'alps', 'fiji', 'sydney'].includes(site.id)).map((site) => ({ x: site.tiles[9].x - 1, y: site.tiles[9].y - 1, z: 9, site: site.id })))
  : windowFlag >= 0 ? [{ ...parseWindow(args[windowFlag + 1]), site: 'manual' }] : [];
if (!pilot && !windows.length) throw new Error('Use --pilot or --window z/x/y');

if (!clientId && !clientSecret) {
  for (const z of [...new Set(windows.map((window) => window.z))]) {
    const sample = windows.find((window) => window.z === z);
    console.log(JSON.stringify({ dryRun: true, zoom: z, request: redacted(requestBody(mercatorBbox(z, sample.x, sample.y), WINDOW_SIZE, WINDOW_SIZE, 'http://www.opengis.net/def/crs/EPSG/0/3857')) }, null, 2));
  }
  if (pilot) console.log(JSON.stringify({ dryRun: true, base: redacted(requestBody([-180, -90, 180, 90], 4096, 2048, 'http://www.opengis.net/def/crs/EPSG/0/4326')) }, null, 2));
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
  const body = withEvalscript(requestBody(mercatorBbox(window.z, window.x, window.y), WINDOW_SIZE, WINDOW_SIZE, 'http://www.opengis.net/def/crs/EPSG/0/3857'), evalscript);
  const png = await postRender(token, body, out, { z: window.z, x: window.x, y: window.y, site: window.site });
  await sliceWindow(png, out, window.z, window.x, window.y, qa);
  await writeFile(resolve(out, 'qa.json'), `${JSON.stringify(qa, null, 2)}\n`);
}
if (pilot && !(await exists(resolve(out, 'base-ours.jpg')))) {
  const body = withEvalscript(requestBody([-180, -90, 180, 90], 4096, 2048, 'http://www.opengis.net/def/crs/EPSG/0/4326'), evalscript);
  const png = await postRender(token, body, out, { kind: 'base', z: null, x: null, y: null });
  runFfmpeg(['-vf', 'scale=2048:1024', '-frames:v', '1', '-q:v', '2', '-y', resolve(out, 'base-ours.jpg')], png, 'Could not write pilot base texture');
}
await writeFile(resolve(out, 'report.json'), `${JSON.stringify({ inputBands: INPUT_BANDS, samples: SAMPLES, windows: windows.length, expectedPU: windows.length * puFor(WINDOW_SIZE, WINDOW_SIZE) + (pilot ? puFor(4096, 2048) : 0) }, null, 2)}\n`);
console.log(`Rendered ${windows.length} window(s) to ${out}`);
