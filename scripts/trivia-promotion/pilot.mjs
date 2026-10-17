// Trivia promotion pilot (slice 0): pick the 30 held entries, 10 from each thin
// band, in bank order among entries without photo === 'verified'.
// Reads the bank at the pilot base commit so the selection is reproducible.
// Usage: node scripts/trivia-promotion/pilot.mjs   (writes pilot.json)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
export const BASE = '47cbe5e';
export const BANDS = { '9-10': [9, 10], '7-8': [7, 8], '3-4': [3, 4] };

export function pick(bank) {
  const out = [];
  for (const [band, ds] of Object.entries(BANDS)) {
    bank.filter(e => e.photo !== 'verified' && ds.includes(e.difficulty)).slice(0, 10)
      .forEach(e => out.push({ id: e.id, band, difficulty: e.difficulty, short: e.short }));
  }
  return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const bank = JSON.parse(execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: path.join(HERE, '../..'), maxBuffer: 1 << 26 }).toString());
  const list = pick(bank);
  fs.writeFileSync(path.join(HERE, 'pilot.json'), JSON.stringify(list, null, 1) + '\n');
  console.log(list.length, 'pilot entries');
}
