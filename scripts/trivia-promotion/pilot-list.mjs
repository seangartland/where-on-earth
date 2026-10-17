// Trivia promotion pilot (slice 0): the 30 pilot entries, derived from the bank
// at the pilot's base commit. 10 per thin band (9-10, 7-8, 3-4), in bank order,
// among entries without photo === 'verified'. No cherry-picking.
// Usage: node scripts/trivia-promotion/pilot-list.mjs  (prints JSON)
import { execSync } from 'node:child_process';
import path from 'node:path';

export const BASE = '47cbe5e';
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
export function baseBank() {
  return JSON.parse(execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString());
}
export const GROUPS = [['9-10', 9, 10], ['7-8', 7, 8], ['3-4', 3, 4]];
export function pilotList(bank = baseBank()) {
  return GROUPS.map(([band, lo, hi]) => ({
    band,
    ids: bank.filter(e => e.photo !== 'verified' && e.difficulty >= lo && e.difficulty <= hi).slice(0, 10).map(e => e.id),
  }));
}
if (process.argv[1] === new URL(import.meta.url).pathname) console.log(JSON.stringify(pilotList(), null, 1));
