import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const locations = JSON.parse(await readFile(new URL('../assets/locations.json', import.meta.url)));
const date = process.argv[2] || '2026-10-03';
const weights = [1, 1, 2, 3, 3];
const deg = Math.PI / 180;

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randomFrom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(day) {
  const items = [...locations];
  const random = randomFrom(hashSeed(day));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, 5);
}

function distance(a, b) {
  const p1 = a.lat * deg;
  const p2 = b.lat * deg;
  const dp = (b.lat - a.lat) * deg;
  const dl = (b.lng - a.lng) * deg;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function play(answers, guesses) {
  let round = 0;
  const results = [];
  while (round < 5) {
    const km = distance(guesses[round], answers[round]);
    results.push({ distance: Math.round(km), score: Math.round(100 * Math.exp(-km / 4650)) * weights[round] });
    round += 1;
  }
  return { round, results, total: results.reduce((sum, result) => sum + result.score, 0) };
}

const answers = pick(date);
assert.deepEqual(pick(date).map((x) => x.id), answers.map((x) => x.id), 'daily order is deterministic');
assert.equal(new Set(answers.map((x) => x.id)).size, 5, 'daily locations are unique');
const perfect = play(answers, answers);
assert.equal(perfect.round, 5);
assert.deepEqual(perfect.results.map((x) => x.score), [100, 100, 200, 300, 300]);
assert.equal(perfect.total, 1000);
const imperfect = play(answers, answers.map(() => ({ lat: 0, lng: 0 })));
assert.equal(imperfect.round, 5);
assert.ok(imperfect.total >= 0 && imperfect.total < 1000);
console.log(JSON.stringify({ date, ids: answers.map((x) => x.id), perfect: perfect.total, imperfect: imperfect.total, imperfectRounds: imperfect.results }, null, 2));
