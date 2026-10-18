#!/usr/bin/env node
// Offline adaptation of make-ab.mjs: both candidate tile sets must already exist.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ACCEPTANCE_SITE_IDS, SITE_ZOOMS } from './local/sites.mjs';

const here = import.meta.dirname;
const root = resolve(here, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] || (() => { throw new Error(`${name} needs a value`); })() : fallback;
const seed = option('--seed', 'eox-finish-sites');
const ours = resolve(option('--ours', 'scripts/sat/work/s2gm2025/finished'));
const eox = resolve(option('--eox', 'scripts/sat/pilot/eox'));
const out = resolve(option('--out', 'scripts/sat/work/ab'));
const selected = new Set(option('--sites', ACCEPTANCE_SITE_IDS.join(',')).split(','));
const sites = (JSON.parse(await readFile(resolve(here, 'pilot-sites.json'), 'utf8'))).filter(site => selected.has(site.id));
if (sites.length !== selected.size) throw new Error('Unknown pilot site');
const hash = (text) => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; };
const run = (command, message) => { const result = spawnSync('ffmpeg', command, { encoding: 'utf8' }); if (result.status !== 0) throw new Error(`${message}: ${result.stderr.trim() || 'ffmpeg failed'}`); };
const tile = (source, z, x, y) => resolve(source, String(z), String(x), `${y}.jpg`);
const stitch = async (source, label, site, z) => {
  const n = 2 ** z, files = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = (site.tiles[z].x + dx + n) % n, y = Math.max(0, Math.min(n - 1, site.tiles[z].y + dy));
    const file = tile(source, z, x, y);
    if (!existsSync(file)) throw new Error(`Missing ${label} tile ${z}/${x}/${y}`);
    files.push(file);
  }
  const destination = resolve(out, label, 'stitched', String(z), `${site.id}.jpg`);
  await mkdir(dirname(destination), { recursive: true });
  run(['-hide_banner', '-loglevel', 'error', ...files.flatMap(file => ['-i', file]), '-filter_complex', 'xstack=inputs=9:layout=0_0|256_0|512_0|0_256|256_256|512_256|0_512|256_512|512_512', '-frames:v', '1', '-q:v', '2', '-y', destination], `Could not stitch ${label} ${site.id} z${z}`);
  return destination;
};
const panels = [];
for (const site of sites) for (const z of SITE_ZOOMS) {
  const oursImage = await stitch(ours, 'ours', site, z);
  const eoxImage = await stitch(eox, 'eox', site, z);
  panels.push({ id: `${site.id}-z${z}`, title: `${site.name} z${z}`, ours: oursImage, eox: eoxImage });
}
const key = {};
const markup = panels.map(panel => {
  const oursIsA = (hash(`${seed}:${panel.id}`) & 1) === 0;
  key[panel.id] = oursIsA ? { A: 'ours', B: 'eox' } : { A: 'eox', B: 'ours' };
  const relative = file => file.slice(out.length + 1);
  const a = relative(oursIsA ? panel.ours : panel.eox), b = relative(oursIsA ? panel.eox : panel.ours);
  return `<section><h2>${panel.title}</h2><div class="pair"><figure><figcaption>A</figcaption><img src="${a}" alt=""></figure><figure><figcaption>B</figcaption><img src="${b}" alt=""></figure></div></section>`;
}).join('\n');
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'ab.html'), `<!doctype html><meta charset="utf-8"><title>Blind satellite comparison</title><style>body{margin:24px;background:#121212;color:#eee;font:16px system-ui,sans-serif}section{margin:0 0 36px}h2{font-size:18px;font-weight:600}.pair{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;max-width:768px;flex:1 1 420px}figcaption{padding:7px 0;font-weight:700}img{display:block;width:100%;height:auto;background:#222}</style>${markup}\n`);
await writeFile(resolve(out, 'ab-key.json'), `${JSON.stringify({ seed, panels: key }, null, 2)}\n`);
console.log(`Wrote ${panels.length} offline blind A/B panels to ${resolve(out, 'ab.html')}`);
