// Exercises the pure helpers copied verbatim from src/main.js against a fake
// localStorage, so the stats math is checked without booting three.js.
import assert from 'node:assert';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = src.indexOf('const HISTORY_KEY =');
const end = src.indexOf('const statsStyle = document.createElement');
assert.ok(start > 0 && end > start, 'stats block located in src/main.js');

// Rebind the block's module consts to globals so a plain Function can run it.
const body = src
  .slice(start, end)
  .replace(/^const (HISTORY_KEY|HISTORY_LIMIT|BAND_EDGES|BAND_LOW_RGB|BAND_HIGH_RGB) = /gm, 'globalThis.$1 = ')
  .replace(/\bdaily\b/g, 'globalThis.daily')
  .replace(/\bWEIGHTS\b/g, 'globalThis.WEIGHTS');

const { readHistory, recordHistory, dayGap, longestRun, bandIndex, bandLabel, bandColor, statsSummary } = new Function(
  'return (function(){' + body + 'return { readHistory, recordHistory, dayGap, longestRun, bandIndex, bandLabel, bandColor, statsSummary };})()',
)();

const store = new Map();
globalThis.readJSON = (key) => {
  try { return JSON.parse(store.get(key) ?? null); } catch { return null; }
};
globalThis.localStorage = {
  setItem: (k, v) => store.set(k, v),
  getItem: (k) => store.get(k) ?? null,
};
globalThis.WEIGHTS = [1, 1, 2, 3, 3];
globalThis.daily = null;
globalThis.STREAK_KEY = 'where-on-earth-streak-v1';
globalThis.HISTORY_KEY = 'where-on-earth-history-v1';

// scoreGuess, copied from main.js
const scoreGuess = (km, round) => Math.round(100 * Math.exp(-km / 4650)) * globalThis.WEIGHTS[round];

// localDateKey, copied from main.js
const localDateKeyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// --- bandIndex covers the whole 0..1000 range
for (const [total, want] of [[0, 0], [1, 0], [199, 0], [200, 1], [399, 1], [400, 2], [599, 2], [600, 3], [799, 3], [800, 4], [1000, 4]]) {
  assert.strictEqual(bandIndex(total), want, `bandIndex(${total}) === ${want}`);
}
assert.strictEqual(Math.max(...Array.from({ length: 1001 }, (_, t) => bandIndex(t))), 4);
// five contiguous rows over 0..1000, no gaps and no overlap
assert.deepStrictEqual(
  Array.from({ length: 5 }, (_, i) => bandLabel(i)),
  ['0–199', '200–399', '400–599', '600–799', '800–1000'],
);
for (let i = 0; i < 5; i++) {
  const [lo, hi] = bandLabel(i).split('–').map(Number);
  assert.ok(lo <= hi, `band ${i} ordered`);
  if (i) assert.strictEqual(lo, Number(bandLabel(i - 1).split('–')[1]) + 1, `band ${i} starts where ${i - 1} ends`);
  assert.strictEqual(bandIndex(lo), i, `bandIndex of band ${i} start`);
  assert.strictEqual(bandIndex(hi), i, `bandIndex of band ${i} end`);
}
assert.strictEqual(bandLabel(4).endsWith('1000'), true, 'top band tops out at 1000');
for (let i = 0; i < 5; i++) assert.match(bandColor(i, 0.5), /^rgba\(\d+,\d+,\d+,0\.5\)$/);

// --- dayGap / longestRun
assert.strictEqual(dayGap('2026-10-01', '2026-10-02'), 1);
assert.strictEqual(dayGap('2026-10-01', '2026-10-04'), 3);
assert.strictEqual(dayGap('2026-10-01', '2026-11-01'), 31);
assert.strictEqual(dayGap('2026-02-28', '2026-03-01'), 1, 'leap day');
assert.strictEqual(dayGap('2026-12-31', '2027-01-01'), 1, 'year boundary');
assert.strictEqual(dayGap('2026-03-07', '2026-03-08'), 1, 'DST switch in most of the world');
assert.strictEqual(longestRun([]), 0);
assert.strictEqual(longestRun(['2026-10-01']), 1);
assert.strictEqual(longestRun(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']), 4);
assert.strictEqual(longestRun(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']), 3);
assert.strictEqual(longestRun(['2026-10-05', '2026-10-01', '2026-10-02']), 2, 'unsorted input');
assert.strictEqual(longestRun(['2026-10-01', '2026-10-01']), 1, 'a repeated date does not extend a run');

// --- empty state
assert.deepStrictEqual(readHistory(), []);
assert.strictEqual(statsSummary().games, 0);
assert.strictEqual(statsSummary().average, 0);
assert.strictEqual(statsSummary().bestTotal, 0);
assert.strictEqual(statsSummary().peak, 1, 'peak never 0, avoids divide-by-zero');
assert.strictEqual(statsSummary().bestRound, null);
assert.strictEqual(statsSummary().first, null);

// --- corrupt payloads never throw
store.set(globalThis.HISTORY_KEY, 'not json');
assert.deepStrictEqual(readHistory(), []);
store.set(globalThis.HISTORY_KEY, JSON.stringify({ nope: true }));
assert.deepStrictEqual(readHistory(), []);
store.set(globalThis.HISTORY_KEY, JSON.stringify([{ date: 'bad-date', rounds: [] }, { date: '2026-10-01' }, null, 7]));
assert.strictEqual(readHistory().length, 1, 'only well-formed entries survive');
store.set(globalThis.HISTORY_KEY, JSON.stringify([{ date: '2026-10-01', total: 'x', rounds: [{ distance: '12' }, { nope: 1 }, null] }]));
const salvaged = readHistory();
assert.strictEqual(salvaged[0].total, 0);
assert.strictEqual(salvaged[0].rounds.length, 1);
assert.strictEqual(salvaged[0].rounds[0].distance, 12);
store.delete(globalThis.HISTORY_KEY);

// --- recordHistory writes one entry per finished daily, idempotently
const finish = (date, kms) => {
  globalThis.daily = { date, results: kms.map((km, i) => ({ distance: km, score: scoreGuess(km, i) })) };
  recordHistory();
};

finish('2026-10-01', [0, 0, 0, 0, 0]);
finish('2026-10-02', [500, 900, 1500, 2600, 5000]);
finish('2026-10-03', [12000, 400, 60, 3000, 120]);
finish('2026-10-04', [50, 50, 50, 50, 50]);
assert.strictEqual(readHistory().length, 4);
assert.deepStrictEqual(readHistory().map((g) => g.date), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);

finish('2026-10-04', [50, 50, 50, 50, 50]);
assert.strictEqual(readHistory().length, 4, 'same date replaces, never appends');

globalThis.daily = { date: '2026-10-05', results: [{ distance: 10, score: 98 }] };
recordHistory();
assert.strictEqual(readHistory().length, 4, 'partial game not logged');

// --- summary over the four logged days
const stats = statsSummary();
assert.strictEqual(stats.games, 4);
assert.strictEqual(stats.counts.reduce((a, b) => a + b, 0), 4, 'every game falls in exactly one band');
// totals: 1000, 590, 745, 990 -> bands 4, 2, 3, 4
assert.deepStrictEqual(stats.counts, [0, 0, 1, 1, 2]);
assert.strictEqual(stats.counts[bandIndex(1000)], 2, '1000 and 990 both sit in the 800-1000 band');
assert.ok(stats.counts.every((n) => Number.isFinite(n) && n >= 0), 'dense counts, no holes');
assert.strictEqual(stats.longest, 4, 'four consecutive days');
assert.strictEqual(stats.bestTotal, 1000);
assert.strictEqual(stats.average, Math.round(stats.history.reduce((s, g) => s + g.total, 0) / 4));
assert.ok(stats.averageDistance > 0);
assert.strictEqual(stats.bestRound.base, 100, 'a dead-on guess wins best round');
assert.strictEqual(stats.bestRound.date, '2026-10-01');
assert.strictEqual(stats.first, '2026-10-01');

// longest streak also honours a live streak that predates the history log
store.set('where-on-earth-streak-v1', JSON.stringify({ last: '2026-10-04', count: 9 }));
assert.strictEqual(statsSummary().longest, 9, 'streak key wins when it is ahead');
assert.strictEqual(statsSummary().streak, 9);
store.set('where-on-earth-streak-v1', JSON.stringify({ last: '2026-10-04', count: 2 }));
assert.strictEqual(statsSummary().longest, 4, 'history run wins when it is ahead');
store.delete('where-on-earth-streak-v1');
assert.strictEqual(statsSummary().streak, 0, 'no streak key, no crash');

// --- history stays sorted and capped (400 real consecutive days pushes past the limit)
const day = new Date('2026-11-01T12:00:00');
let newest = '';
for (let i = 0; i < 400; i++) {
  newest = localDateKeyOf(day);
  finish(newest, [i * 37, 200, 300, 400, 500]);
  day.setDate(day.getDate() + 1);
}
const capped = readHistory();
assert.strictEqual(capped.length, 365, 'capped at HISTORY_LIMIT');
assert.deepStrictEqual(capped.map((g) => g.date), capped.map((g) => g.date).slice().sort(), 'sorted ascending');
assert.strictEqual(capped[capped.length - 1].date, newest, 'newest kept');
assert.ok(capped[0].date > '2026-11-01', 'oldest dropped');
assert.strictEqual(statsSummary().games, 365);
assert.strictEqual(statsSummary().longest, 365, 'a clean 365-day run');
assert.ok(store.get(globalThis.HISTORY_KEY).length < 200000, `history stays small (${store.get(globalThis.HISTORY_KEY).length} bytes)`);

// --- writes never break the game when storage throws (private mode / quota)
globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
globalThis.daily = { date: '2026-12-01', results: Array.from({ length: 5 }, () => ({ distance: 10, score: 98 })) };
assert.doesNotThrow(() => recordHistory(), 'recordHistory survives a failed write');

console.log('stats: all assertions passed');