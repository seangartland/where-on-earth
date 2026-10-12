#!/usr/bin/env node
// Materializes the daily schedule (docs/daily-archive-design.md section 4.3).
// Runs inside deploy.sh before the asset copy; the client looks today's game up
// in assets/daily/<YYYY-MM>.json instead of computing it, so the archive and
// the served game are the same bytes.
//
//   F = today(UTC) + 2   freeze line (covers UTC+14 and the 1h /assets/ cache)
//   date <= F, present   kept byte-identical
//   date <= F, absent    filled from LIVE production (what players are being
//                        served right now), never from the working tree
//   date >  F            (re)generated with dailyIds() from src/daily.js and
//                        the working-tree locations.json, through today + 60
//
// Cutover rule: every date some timezone is playing right now (UTC-12..+14)
// that already has an entry must equal what live production serves for it, so
// a deploy never swaps out a game mid-day. Override one date deliberately with
// DAILY_ACCEPT_MIDDAY_CHANGE=YYYY-MM-DD[,YYYY-MM-DD].
//
// Any validation error exits 1 and writes nothing.
//   node scripts/build-daily-schedule.mjs          validate + write
//   node scripts/build-daily-schedule.mjs --check  validate only
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyIds, isLandmark, isPlayableLocation, monthKey } from '../src/daily.js';
import { selectionSource, runSelection } from './lib/deployed-daily.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets', 'daily');
const LIVE = (process.env.DAILY_LIVE_URL || 'https://where-on-earth-game.vercel.app').replace(/\/$/, '');
const CHECK_ONLY = process.argv.includes('--check');
const FREEZE_DAYS = 2;
const HORIZON_DAYS = 60;
const HORIZON_WARN_DAYS = 21;
// Backfilled history (section 6) was served by pre-dedup selection code, so
// those days may repeat a country. Everything after it must not.
const HISTORY_THROUGH = '2026-10-10';
// Canonical anchor: the game a UTC-12..+11 player got (deploy live at noon
// Pacific). Only matters for pre-cutover live code, which parsed local noon.
const ANCHOR_TZ = 'America/Los_Angeles';
const DAY = 86400000;

const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const msOf = (key) => Date.parse(`${key}T00:00:00Z`);
const addDays = (key, n) => keyOf(msOf(key) + n * DAY);

const now = process.env.DAILY_NOW ? Date.parse(process.env.DAILY_NOW) : Date.now();
const today = keyOf(now);
const F = addDays(today, FREEZE_DAYS);
const horizon = addDays(today, HORIZON_DAYS);
// Local dates in play somewhere on Earth right now.
const inPlayFrom = keyOf(now - 12 * 3600000);
const inPlayTo = keyOf(now + 14 * 3600000);
const accepted = new Set((process.env.DAILY_ACCEPT_MIDDAY_CHANGE || '').split(',').map((s) => s.trim()).filter(Boolean));

const errors = [];
const warnings = [];
const notes = [];

// ---- load ----
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pool = readJson(join(ROOT, 'assets', 'locations.json'));
const byId = new Map(pool.map((l) => [l.id, l]));
const retiredPath = join(DIR, 'retired-locations.json');
const retired = existsSync(retiredPath) ? readJson(retiredPath).locations || {} : {};
const resolve = (id) => byId.get(id) || retired[id];

const months = {}; // 'YYYY-MM' -> parsed file
for (const name of readdirSync(DIR).filter((n) => /^\d{4}-\d{2}\.json$/.test(n)).sort()) {
  const file = readJson(join(DIR, name));
  if (file.month !== name.slice(0, 7)) errors.push(`${name}: month field is ${file.month}`);
  months[name.slice(0, 7)] = file;
}
const oldDays = {};
for (const m of Object.values(months)) Object.assign(oldDays, m.days);
const indexPath = join(DIR, 'index.json');
const first = (existsSync(indexPath) && readJson(indexPath).first) || Object.keys(oldDays).sort()[0] || today;

// ---- live production ----
async function getText(path) {
  const res = await fetch(`${LIVE}/${path}`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${LIVE}/${path}: HTTP ${res.status}`);
  return res.text();
}
let live;
async function loadLive() {
  if (live) return live;
  const html = await getText('');
  const mainPath = html.match(/src\/main\.js(\?v=[^"']*)?/)?.[0] || 'src/main.js';
  const mainJs = await getText(mainPath);
  const dailyJs = /from '\.\/daily\.js/.test(mainJs) ? await getText('src/daily.js') : undefined;
  const locPath = mainJs.match(/assets\/locations\.json(\?v=[^"'`]*)?/)?.[0] || 'assets/locations.json';
  live = {
    mainPath,
    source: selectionSource(mainJs, dailyJs),
    pool: JSON.parse(await getText(locPath)),
    // Post-cutover clients read the schedule; pre-cutover ones compute.
    readsSchedule: /assets\/daily\//.test(mainJs),
    months: {},
  };
  return live;
}
async function liveGames(dates) {
  const l = await loadLive();
  const out = {};
  const compute = [];
  for (const d of dates) {
    if (l.readsSchedule) {
      const m = monthKey(d);
      if (!(m in l.months)) l.months[m] = await getText(`assets/daily/${m}.json`).then(JSON.parse).catch(() => ({ days: {} }));
      if (l.months[m].days?.[d]) { out[d] = l.months[m].days[d]; continue; }
    }
    compute.push(d); // pre-cutover, or the live schedule lapsed: clients fell back to dailyIds
  }
  if (compute.length) Object.assign(out, runSelection(l.source, l.pool, compute, ANCHOR_TZ));
  return out;
}

// ---- build ----
const days = {};
const toFill = [];
for (let d = first; d <= horizon; d = addDays(d, 1)) {
  if (d <= F) {
    if (oldDays[d]) days[d] = oldDays[d];
    else toFill.push(d);
  } else {
    days[d] = dailyIds(d, pool);
  }
}
const inPlayPresent = Object.keys(oldDays).filter((d) => d >= inPlayFrom && d <= inPlayTo);
let liveByDate = {};
try {
  liveByDate = await liveGames([...new Set([...toFill, ...inPlayPresent])]);
} catch (err) {
  errors.push(`cannot read live production (${err.message}); cutover rule needs it`);
}
for (const d of toFill) {
  if (!liveByDate[d]) continue;
  days[d] = liveByDate[d];
  if (d < today) warnings.push(`${d}: was missing (lapse?), filled from the current live deploy; may not match what was served that day`);
  notes.push(`${d}: filled from live production (${live.mainPath})`);
}
for (const d of inPlayPresent) {
  const want = liveByDate[d];
  if (!want || JSON.stringify(want) === JSON.stringify(oldDays[d])) continue;
  const msg = `${d}: in play now, schedule has [${oldDays[d]}] but live serves [${want}]; deploying would change the game mid-day`;
  if (accepted.has(d)) warnings.push(`${msg} (accepted via DAILY_ACCEPT_MIDDAY_CHANGE)`);
  else errors.push(`${msg}. Wait until ${addDays(d, 1)}T12:00Z, or set DAILY_ACCEPT_MIDDAY_CHANGE=${d}`);
}

// ---- validate ----
// (a) frozen entries unchanged
for (const [d, ids] of Object.entries(oldDays)) {
  if (d <= F && JSON.stringify(days[d]) !== JSON.stringify(ids)) errors.push(`(a) frozen ${d} changed`);
}
const variants = {};
for (const m of Object.values(months)) Object.assign(variants, m.variants || {});
// (b) every ID resolvable, past or future (retire by quarantine, never delete)
for (const [d, ids] of [...Object.entries(days), ...Object.entries(variants).flatMap(([d, games]) => games.map((g) => [d, g]))]) {
  for (const id of ids) if (!resolve(id)) errors.push(`(b) ${d}: ${id} is not in locations.json or retired-locations.json`);
}
for (const [d, ids] of Object.entries(days)) {
  // (c) generated days are playable, non-landmark
  if (d > F) {
    for (const id of ids) {
      const loc = byId.get(id);
      if (!loc || !isPlayableLocation(loc) || isLandmark(loc)) errors.push(`(c) ${d}: ${id} is not playable`);
    }
  }
  // (d) exactly 5, distinct countries
  if (!Array.isArray(ids) || ids.length !== 5) { errors.push(`(d) ${d}: ${ids?.length} ids`); continue; }
  const countries = new Set(ids.map((id) => resolve(id)?.country));
  if (countries.size !== 5 && d > HISTORY_THROUGH) errors.push(`(d) ${d}: repeated country`);
}
for (let d = first; d <= horizon; d = addDays(d, 1)) if (!days[d]) errors.push(`${d}: no entry`);

const left = (msOf(horizon) - msOf(today)) / DAY;
if (left < HORIZON_WARN_DAYS) warnings.push(`horizon ${horizon} is ${left} days out`);

for (const w of warnings) console.warn(`⚠️  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`);
  console.error(`daily schedule: ${errors.length} error(s), nothing written`);
  process.exit(1);
}

// ---- write ----
const out = {};
for (const d of Object.keys(days).sort()) {
  const m = monthKey(d);
  out[m] ||= { v: 1, month: m, days: {} };
  out[m].days[d] = days[d];
}
for (const [m, file] of Object.entries(months)) if (file.variants) (out[m] ||= { v: 1, month: m, days: {} }).variants = file.variants;
const index = { v: 1, first, frozenThrough: F, horizon };
for (const n of notes) console.log(n);
if (!CHECK_ONLY) {
  for (const [m, file] of Object.entries(out)) writeFileSync(join(DIR, `${m}.json`), `${JSON.stringify(file)}\n`);
  writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
}
console.log(`daily schedule ${CHECK_ONLY ? 'OK (check only)' : 'written'}: ${first} .. ${horizon}, frozen through ${F}, ${Object.keys(out).length} month file(s)`);
