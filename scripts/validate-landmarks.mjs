#!/usr/bin/env node
// Checks assets/locations-landmarks-sol.json. Fails when an entry lacks a
// known kind or a continent, when a playable candidate (kind landmark that
// the game's own isPlayableLocation accepts: real image, not Antarctic) lacks
// a v2 difficultyWhy matching its difficulty, or when an id repeats.
// Usage (from demo/): node scripts/validate-landmarks.mjs

import { readFileSync } from 'node:fs';
import { isPlayableLocation } from '../src/daily.js';

const KINDS = new Set(['landmark', 'area', 'settlement']);
const V2_WHY = /^p(?:1|\.\d{2})(?:\(via [^)]+\))?·fb\d+·K[\d.]+·iso\d+ → \d+(?:\.\d)? → (\d+)$/;

const items = JSON.parse(readFileSync(new URL('../assets/locations-landmarks-sol.json', import.meta.url), 'utf8'));
const failures = [];
const seen = new Set();
const count = (key) => items.reduce((m, x) => m.set(x[key], (m.get(x[key]) || 0) + 1), new Map());

for (const x of items) {
  if (seen.has(x.id)) failures.push(`duplicate id: ${x.id}`);
  seen.add(x.id);
  if (!KINDS.has(x.kind)) failures.push(`missing or unknown kind: ${x.id} (${x.kind})`);
  if (typeof x.continent !== 'string' || !x.continent) failures.push(`missing continent: ${x.id}`);
  if (x.kind === 'landmark' && isPlayableLocation(x)) {
    const m = V2_WHY.exec(x.difficultyWhy || '');
    if (!m) failures.push(`playable landmark without v2 difficultyWhy: ${x.id} (${x.difficultyWhy})`);
    else if (Number(m[1]) !== x.difficulty) failures.push(`difficulty ${x.difficulty} does not match difficultyWhy: ${x.id}`);
  }
}

const playable = items.filter((x) => x.kind === 'landmark' && isPlayableLocation(x)).length;
console.log(`${items.length} entries; by kind ${JSON.stringify(Object.fromEntries(count('kind')))}`);
console.log(`playable landmark candidates: ${playable}`);
if (failures.length) {
  console.log(`FAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log('PASS');
