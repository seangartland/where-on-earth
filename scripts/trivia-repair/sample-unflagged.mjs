// Deterministic sample of unflagged clues for the phase 3 manual review (60 playable, 50 other).
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const bank = JSON.parse(readFileSync(new URL('assets/trivia-bank.json', root), 'utf8'));
const dec = JSON.parse(readFileSync(new URL('docs/trivia-clue-decisions.json', root), 'utf8'));
const flagged = new Set([...dec.decisions.map((r) => r.id), ...dec.relativeCompassFollowUp.map((r) => r.id)]);
let seed = 20261016;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
const pool = bank.filter((e) => !flagged.has(e.id));
const sample = [...pick(pool.filter((e) => e.photo), 60), ...pick(pool.filter((e) => !e.photo), 50)];
for (const e of sample) console.log(`${e.id} [d${e.difficulty ?? '-'}${e.photo ? ' V' : ''}] ${e.short} :: ${e.clue}`);
