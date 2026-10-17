#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const seed = args.includes('--seed') ? args[args.indexOf('--seed') + 1] : 'eox-phase1-pilot';
if (!seed) throw new Error('--seed needs a value');
const out = resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'scripts/sat/pilot');
const sites = JSON.parse(await readFile(resolve(here, 'pilot-sites.json'), 'utf8'));
const zoomsFor = (site) => [4, 6, 8].concat(['bay-area', 'alps', 'fiji', 'sydney'].includes(site.id) ? [9] : []);
const hash = (text) => {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
};
const run = (argsRun, message) => {
  const result = spawnSync('ffmpeg', argsRun, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr.trim() || 'ffmpeg failed'}`);
};
// Renderer tiles remain at <out>/<z>/<x>/<y>.jpg as documented; EOX tiles live
// under eox/ so the stitched outputs can use symmetric ours/ and eox/ paths.
const tilePath = (source, z, x, y) => resolve(out, source === 'ours' ? '' : source, String(z), String(x), `${y}.jpg`);
const download = async (url, file) => {
  if (existsSync(file)) return;
  await mkdir(dirname(file), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`EOX tile download failed with HTTP ${response.status} for ${url}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
};
const stitch = async (source, site, z) => {
  const center = site.tiles[z];
  const n = 2 ** z;
  const files = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const x = (center.x - 1 + dx + n) % n;
    const y = Math.max(0, Math.min(n - 1, center.y - 1 + dy));
    const file = tilePath(source, z, x, y);
    if (!existsSync(file)) throw new Error(`Missing ${source} tile ${z}/${x}/${y}; run the pilot renderer first`);
    files.push(file);
  }
  const destination = resolve(out, source, 'stitched', String(z), `${site.id}.jpg`);
  await mkdir(dirname(destination), { recursive: true });
  const layout = ['0_0', '256_0', '512_0', '0_256', '256_256', '512_256', '0_512', '256_512', '512_512'].join('|');
  run(['-hide_banner', '-loglevel', 'error', ...files.flatMap((file) => ['-i', file]), '-filter_complex', `xstack=inputs=9:layout=${layout}`, '-frames:v', '1', '-q:v', '2', '-y', destination], `Could not stitch ${source} ${site.id} z${z}`);
  return destination;
};

const panels = [];
for (const site of sites) for (const z of zoomsFor(site)) {
  const center = site.tiles[z];
  const n = 2 ** z;
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const x = (center.x - 1 + dx + n) % n;
    const y = Math.max(0, Math.min(n - 1, center.y - 1 + dy));
    await download(`https://tiles.where-on.earth/tiles/${z}/${x}/${y}.jpg`, tilePath('eox', z, x, y));
  }
  await stitch('ours', site, z);
  await stitch('eox', site, z);
  panels.push({ id: `${site.id}-z${z}`, title: `${site.name} z${z}`, ours: `ours/stitched/${z}/${site.id}.jpg`, eox: `eox/stitched/${z}/${site.id}.jpg` });
}
const oursBase = resolve(out, 'base-ours.jpg');
if (!existsSync(oursBase)) throw new Error('Missing pilot/base-ours.jpg; run the pilot renderer first');
await mkdir(resolve(out, 'eox'), { recursive: true });
await copyFile(resolve(root, 'assets/eox-z4-base-2k.jpg'), resolve(out, 'eox/base.jpg'));
panels.push({ id: 'base', title: 'Base texture', ours: 'base-ours.jpg', eox: 'eox/base.jpg' });

const key = {};
const markup = panels.map((panel) => {
  const oursIsA = (hash(`${seed}:${panel.id}`) & 1) === 0;
  key[panel.id] = oursIsA ? { A: 'ours', B: 'eox' } : { A: 'eox', B: 'ours' };
  const a = oursIsA ? panel.ours : panel.eox;
  const b = oursIsA ? panel.eox : panel.ours;
  return `<section><h2>${panel.title}</h2><div class="pair"><figure><figcaption>A</figcaption><img src="${a}" alt=""></figure><figure><figcaption>B</figcaption><img src="${b}" alt=""></figure></div></section>`;
}).join('\n');
const html = `<!doctype html>
<meta charset="utf-8">
<title>Blind satellite comparison</title>
<style>body{margin:24px;background:#121212;color:#eee;font:16px system-ui,sans-serif}section{margin:0 0 36px}h2{font-size:18px;font-weight:600}.pair{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;max-width:768px;flex:1 1 420px}figcaption{padding:7px 0;font-weight:700}img{display:block;width:100%;height:auto;background:#222}</style>
${markup}
`;
await writeFile(resolve(out, 'ab.html'), html);
await writeFile(resolve(out, 'ab-key.json'), `${JSON.stringify({ seed, panels: key }, null, 2)}\n`);
console.log(`Wrote ${panels.length} blind A/B panels to ${resolve(out, 'ab.html')}`);
