#!/usr/bin/env node
// One-off backfill of assets/daily/2026-10.json for 2026-10-04..2026-10-10
// (docs/daily-archive-design.md section 6). History is rebuilt from what each
// production deploy actually served: archive-sources/ holds every aliased
// deploy's main.js + locations.json, and each deploy's OWN dailyIds is run
// (the selection code changed during the period).
//
// For each date D and each deploy live during D's worldwide window, the game a
// fresh client got is computed for two timezone groups, because pre-cutover
// clients parsed the date at local noon:
//   west  UTC-12..+11, local D = [D-1 13:00Z, D+1 12:00Z), run as America/Los_Angeles
//   east  UTC+12..+14, local D = [D-1 10:00Z, D   12:00Z), run as Pacific/Auckland
// Canonical days[D] = the deploy live at 12:00 America/Los_Angeles on D (west
// group). Every other distinct game goes in variants[D]. Which deploy/group
// produced each game is written to archive-sources/backfill-provenance.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectionSource, runSelection } from './lib/deployed-daily.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'archive-sources');
const FIRST = '2026-10-04';
const LAST = '2026-10-10';
const H = 3600000;

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'))
  .sort((a, b) => a.aliasAssigned - b.aliasAssigned);
const live = manifest.map((d, k) => ({ ...d, from: d.aliasAssigned, to: manifest[k + 1]?.aliasAssigned ?? Infinity }));
const liveAt = (t) => live.find((d) => d.from <= t && t < d.to);

const dates = [];
for (let t = Date.parse(`${FIRST}T00:00:00Z`); t <= Date.parse(`${LAST}T00:00:00Z`); t += 24 * H) {
  dates.push(new Date(t).toISOString().slice(0, 10));
}

const blob = (name) => readFileSync(join(SRC, 'blobs', name), 'utf8');
const cache = new Map();
function served(dep, date, tz) {
  const key = `${dep.files['src/main.js']}|${dep.files['assets/locations.json']}|${tz}`;
  if (!cache.has(key)) {
    const source = selectionSource(blob(dep.files['src/main.js']));
    const pool = JSON.parse(blob(dep.files['assets/locations.json']));
    cache.set(key, runSelection(source, pool, dates, tz));
  }
  return cache.get(key)[date];
}

const days = {};
const variants = {};
const provenance = {};
for (const D of dates) {
  const d0 = Date.parse(`${D}T00:00:00Z`);
  const groups = [
    { group: 'west', tz: 'America/Los_Angeles', from: d0 - 11 * H, to: d0 + 36 * H },
    { group: 'east', tz: 'Pacific/Auckland', from: d0 - 14 * H, to: d0 + 12 * H },
  ];
  // Noon in Los Angeles: PDT (UTC-7) throughout October 2026 before Nov 1.
  const anchor = liveAt(d0 + 19 * H);
  if (!anchor.files['assets/locations.json']) throw new Error(`${D}: anchor deploy ${anchor.uid} has no locations.json`);
  const games = new Map(); // JSON(ids) -> [{deploy, group}]
  const add = (ids, dep, group) => {
    const k = JSON.stringify(ids);
    if (!games.has(k)) games.set(k, []);
    games.get(k).push({ deploy: dep.uid, group, liveFrom: new Date(dep.from).toISOString() });
  };
  const canonical = served(anchor, D, 'America/Los_Angeles');
  add(canonical, anchor, 'west (canonical: live at 12:00 America/Los_Angeles)');
  for (const g of groups) {
    for (const dep of live.filter((x) => x.from < g.to && x.to > g.from)) {
      if (!dep.files['assets/locations.json']) throw new Error(`${D}: ${dep.uid} served ${g.group} but has no locations.json`);
      add(served(dep, D, g.tz), dep, g.group);
    }
  }
  days[D] = canonical;
  const rest = [...games.keys()].filter((k) => k !== JSON.stringify(canonical)).map((k) => JSON.parse(k));
  if (rest.length) variants[D] = rest;
  provenance[D] = [...games.entries()].map(([k, by]) => ({ ids: JSON.parse(k), canonical: k === JSON.stringify(canonical), by }));
}

const outDir = join(ROOT, 'assets', 'daily');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, '2026-10.json'), `${JSON.stringify({ v: 1, month: '2026-10', days, variants })}\n`);
writeFileSync(join(outDir, 'index.json'), `${JSON.stringify({ v: 1, first: FIRST, frozenThrough: LAST, horizon: LAST })}\n`);
writeFileSync(join(SRC, 'backfill-provenance.json'), `${JSON.stringify(provenance, null, 1)}\n`);
for (const D of dates) console.log(D, days[D].join(','), variants[D] ? `+${variants[D].length} variant(s)` : '');
