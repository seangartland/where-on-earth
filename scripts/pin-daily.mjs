#!/usr/bin/env node
// Deploy-time daily pin step (docs/daily-mechanism-rec-opus.md). deploy.sh runs
// it before building the deploy dir. It:
//   1. reads what live production serves for every date in play anywhere
//      (UTC-12 .. UTC+14) plus the next date, by running production's own
//      selection code on production's own locations.json (or its pin, if any);
//   2. pins each of those dates that is not already pinned (never overwrites),
//      and backfills every unpinned date from the earliest existing pin up to
//      the window, so a skipped deploy cannot leave a past day unrecorded;
//   3. for every pinned date, replaces only the slots whose location is gone
//      from the working-tree locations.json being deployed (resolvePinnedIds);
//   4. writes assets/daily-pins.json and commits it, if anything changed.
// Fails closed: if production cannot be read, it exits non-zero.
//
//   node scripts/pin-daily.mjs                     pin + commit
//   node scripts/pin-daily.mjs --dry-run           report only, write nothing
//   node scripts/pin-daily.mjs --pins-file <path>  pin into <path>, no commit
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePinnedIds } from '../src/daily.js';
import { selectionSource, runSelection } from './lib/deployed-daily.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.env.PROD_URL || 'https://where-on-earth-game.vercel.app';
const DEFAULT_PINS = join(ROOT, 'assets/daily-pins.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fileArg = args.indexOf('--pins-file');
const pinsPath = fileArg >= 0 ? resolve(args[fileArg + 1]) : DEFAULT_PINS;
const commit = !dryRun && pinsPath === DEFAULT_PINS;

function fail(msg) {
  console.error(`❌ pin-daily: ${msg}`);
  process.exit(1);
}

async function getText(path) {
  const url = `${PROD}/${path.replace(/^\.?\//, '')}`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (err) {
    fail(`cannot read production (${url}): ${err.cause?.code || err.message}`);
  }
  if (!res.ok) fail(`cannot read production (${url}): HTTP ${res.status}`);
  return res.text();
}

const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10);

// Every local date in play somewhere (UTC-12 .. UTC+14) at `now`, plus the next.
function windowDates(now) {
  const H = 3600 * 1000;
  const dates = [];
  const last = Date.parse(utcDate(now + 14 * H)) + 24 * H;
  for (let t = Date.parse(utcDate(now - 12 * H)); t <= last; t += 24 * H) dates.push(utcDate(t));
  return dates;
}

// Backfill: every date from the earliest existing pin up to the window start.
// Dates before the earliest pin predate the pin system and stay out of scope.
function backfillDates(pinnedDates, windowStart) {
  const H = 3600 * 1000;
  const dates = [];
  const earliest = [...pinnedDates].sort()[0];
  if (!earliest) return dates;
  for (let t = Date.parse(earliest); t < Date.parse(windowStart); t += 24 * H) dates.push(utcDate(t));
  return dates;
}

// --- 1. What live production serves for each window date -------------------
const now = Date.now();
const file = JSON.parse(readFileSync(pinsPath, 'utf8'));
const windowed = windowDates(now);
const dates = [...backfillDates(Object.keys(file.pins || {}), windowed[0]), ...windowed];

const html = await getText('/');
const mainPath = html.match(/src\/main\.js(\?v=[^"']*)?/)?.[0];
if (!mainPath) fail('production index.html has no src/main.js script tag');
const mainJs = await getText(mainPath);
const dailyJs = /from '\.\/daily\.js/.test(mainJs) ? await getText('src/daily.js') : null;
const locPath = mainJs.match(/assets\/locations\.json(\?v=[^"']*)?/)?.[0];
if (!locPath) fail('production main.js has no assets/locations.json URL');
let livePool;
try {
  livePool = JSON.parse(await getText(locPath));
} catch (err) {
  fail(`production ${locPath} is not valid JSON: ${err.message}`);
}
const livePinsPath = mainJs.match(/assets\/daily-pins\.json(\?v=[^"']*)?/)?.[0];
const livePins = livePinsPath ? JSON.parse(await getText(livePinsPath)).pins || {} : {};

const computed = runSelection(selectionSource(mainJs, dailyJs), livePool, dates, 'UTC');
const liveIds = new Set(livePool.map((item) => item.id));
const live = {};
for (const d of dates) {
  live[d] = Array.isArray(livePins[d]) ? livePins[d] : computed[d];
  // Shipped pins always resolve in the shipped pool (step 3), so this means
  // production is not what deploy.sh built: stop rather than guess.
  const missing = live[d].filter((id) => !liveIds.has(id));
  if (missing.length) fail(`production's game for ${d} has ids missing from production's own pool: ${missing.join(', ')}`);
}

// --- 2. Pin window (and backfill) dates that are not pinned yet -------------
const pins = { ...(file.pins || {}) };
const added = [];
for (const d of dates) {
  if (Array.isArray(pins[d])) {
    if (pins[d].join() !== live[d].join()) console.warn(`⚠️  ${d}: existing pin differs from production (kept): pin ${pins[d].join(',')} / live ${live[d].join(',')}`);
    continue;
  }
  pins[d] = live[d];
  added.push(d);
}

// --- 3. Substitute dropped locations against the pool being deployed --------
const newPool = JSON.parse(readFileSync(join(ROOT, 'assets/locations.json'), 'utf8'));
const subs = [];
for (const d of Object.keys(pins)) {
  const fixed = resolvePinnedIds(d, pins[d], newPool);
  if (!fixed) fail(`${d}: a dropped location has no valid substitute in its difficulty band`);
  fixed.forEach((id, slot) => { if (id !== pins[d][slot]) subs.push(`${d} R${slot + 1}: ${pins[d][slot]} -> ${id}`); });
  pins[d] = fixed;
}

// --- Report -----------------------------------------------------------------
console.log(`Production: ${PROD} (${mainPath}, ${locPath}, ${livePool.length} locations, ${livePinsPath ? `pins ${livePinsPath}` : 'no pins file'})`);
console.log(`In-play window at ${new Date(now).toISOString()}: ${windowed.join(', ')}`);
if (dates.length > windowed.length) console.log(`Backfill range: ${dates[0]} .. ${windowed[0]} (exclusive)`);
for (const d of dates) console.log(`  ${d}  ${pins[d].join(', ')}${added.includes(d) ? '  (new pin)' : '  (already pinned)'}`);
for (const s of subs) console.log(`  substituted ${s}`);

if (!added.length && !subs.length) {
  console.log('Pins unchanged.');
  process.exit(0);
}
if (dryRun) {
  console.log(`Dry run: would pin ${added.length} date(s), substitute ${subs.length} slot(s). Nothing written.`);
  process.exit(0);
}

const sorted = Object.fromEntries(Object.keys(pins).sort().map((d) => [d, pins[d]]));
const body = Object.entries(sorted).map(([d, ids]) => `    ${JSON.stringify(d)}: ${JSON.stringify(ids)}`).join(',\n');
writeFileSync(pinsPath, `{\n  "v": 1,\n  "pins": {\n${body}\n  }\n}\n`);
console.log(`Wrote ${pinsPath}: +${added.length} pin(s), ${subs.length} substitution(s).`);

if (commit) {
  const msg = [`Daily pins: ${added.length ? `pin ${added.join(', ')}` : 'no new dates'}${subs.length ? `; ${subs.length} substitution(s)` : ''}`, '', ...subs].join('\n');
  try {
    execFileSync('git', ['-C', ROOT, 'add', '--', 'assets/daily-pins.json'], { stdio: 'inherit' });
    execFileSync('git', ['-C', ROOT, 'commit', '-q', '-m', msg, '--', 'assets/daily-pins.json'], { stdio: 'inherit' });
  } catch {
    fail('could not commit assets/daily-pins.json');
  }
  console.log('Committed assets/daily-pins.json.');
}
