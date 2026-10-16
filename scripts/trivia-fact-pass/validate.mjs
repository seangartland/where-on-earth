// Trivia fact pass validation: diff assets/trivia-bank.json against the bank at
// the repair-pass head commit (ef89290) and prove the pass stayed in bounds.
//   - same entries, same order; no field other than fact/clue/lat/lng/photo changed
//   - fact changes only on entries playable before the pass, plus titanic-sinking
//   - clue changes only on entries playable before the pass
//   - lat/lng changes only on wartburg-castle (gurudongmar-lake left as is)
//   - no photo flag added; every flag removal is listed in the report
//   - every change is backed by a verdict file, and every verdict was applied
//   - zero em dashes in changed text
//   - the file's text diff is exactly the changed lines (no reformatting)
//   - playable before = playable after + unflagged
// Usage: node scripts/trivia-fact-pass/validate.mjs   (exit 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = 'ef89290';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '../..');
const before = JSON.parse(execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString());
const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/trivia-bank.json'), 'utf8'));

const FACT_EXTRA = new Set(['titanic-sinking']);
const COORD_OK = new Set(['wartburg-castle']);
const TEXT_KEYS = ['fact', 'clue'];

const fails = [];
const fail = m => fails.push(m);

// report's unflagged list: ids in backticks between the markers
const report = fs.existsSync(path.join(ROOT, 'docs/trivia-fact-pass-report.md'))
  ? fs.readFileSync(path.join(ROOT, 'docs/trivia-fact-pass-report.md'), 'utf8') : '';
const m = report.match(/<!-- unflagged:start -->([\s\S]*?)<!-- unflagged:end -->/);
if (!m) fail('report has no unflagged list markers');
const reportUnflagged = new Set(m ? [...m[1].matchAll(/`([a-z0-9-]+)`/g)].map(x => x[1]) : []);

// verdicts (same merge rule as apply.mjs)
const verdicts = {};
for (const f of fs.readdirSync(HERE).filter(f => /^(slice\d+|named)\.json$/.test(f)).sort()) {
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')))) {
    verdicts[id] = { ...(verdicts[id] || {}), ...v, v: verdicts[id] ? 'FIX' : v.v };
  }
}

if (before.length !== after.length) fail(`entry count ${before.length} -> ${after.length}`);
const n = { fact: 0, clue: 0, coord: 0, unflag: 0, entriesTouched: 0 };
const unflagged = [];
before.forEach((b, i) => {
  const a = after[i];
  if (!a || a.id !== b.id) { fail(`entry ${i}: id ${b.id} -> ${a && a.id}`); return; }
  const playableBefore = b.photo === 'verified';
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  let touched = false;
  for (const k of keys) {
    if (JSON.stringify(b[k]) === JSON.stringify(a[k])) continue;
    touched = true;
    if (TEXT_KEYS.includes(k)) {
      const allowed = playableBefore || (k === 'fact' && FACT_EXTRA.has(b.id));
      if (!allowed) fail(`${b.id}: ${k} changed on a non-playable entry`);
      if (typeof a[k] !== 'string' || !a[k].trim()) fail(`${b.id}: ${k} empty`);
      if (/\u2014/.test(a[k])) fail(`${b.id}: ${k} contains an em dash`);
      if (verdicts[b.id]?.[k] !== a[k]) fail(`${b.id}: ${k} change not backed by a verdict`);
      n[k]++;
    } else if (k === 'lat' || k === 'lng') {
      if (!COORD_OK.has(b.id)) fail(`${b.id}: ${k} changed (not allowed)`);
      if (verdicts[b.id]?.[k] !== a[k]) fail(`${b.id}: ${k} change not backed by a verdict`);
      n.coord++;
    } else if (k === 'photo') {
      if (b.photo === 'verified' && a.photo === undefined) {
        unflagged.push(b.id); n.unflag++;
        if (!reportUnflagged.has(b.id)) fail(`${b.id}: flag removed but not in the report list`);
        if (verdicts[b.id]?.v !== 'UNFLAG') fail(`${b.id}: flag removed without an UNFLAG verdict`);
      } else fail(`${b.id}: photo ${JSON.stringify(b.photo)} -> ${JSON.stringify(a.photo)} (only removing 'verified' is allowed)`);
    } else fail(`${b.id}: field ${k} changed`);
  }
  if (touched) n.entriesTouched++;
});
for (const id of reportUnflagged) if (!unflagged.includes(id)) fail(`${id}: in the report list but still flagged`);

// every verdict applied
for (const [id, v] of Object.entries(verdicts)) {
  const a = after.find(e => e.id === id);
  if (!a) { fail(`verdict for unknown entry ${id}`); continue; }
  for (const k of ['fact', 'clue', 'lat', 'lng']) if (v[k] !== undefined && a[k] !== v[k]) fail(`${id}: verdict ${k} not applied`);
  if (v.v === 'UNFLAG' && a.photo === 'verified') fail(`${id}: UNFLAG verdict not applied`);
}

// byte level: the file's changed lines are exactly the changed values (a flag removal
// touches two lines: the photo line goes and the line before it loses its comma)
const [added, removed] = execSync(`git diff --numstat ${BASE} -- assets/trivia-bank.json`, { cwd: ROOT }).toString().trim().split(/\s+/).map(Number);
const expectLines = n.fact + n.clue + n.coord + 2 * n.unflag;
if (removed !== expectLines || added !== expectLines - n.unflag) fail(`text diff +${added} -${removed} lines, expected +${expectLines - n.unflag} -${expectLines}`);

const gd = after.find(e => e.id === 'gurudongmar-lake');
if (gd.photo === 'verified') fail('gurudongmar-lake flagged verified');

const playBefore = before.filter(e => e.photo === 'verified');
const playAfter = after.filter(e => e.photo === 'verified');
const checked = Object.keys(verdicts).filter(id => playBefore.some(e => e.id === id)).length;
if (checked !== playBefore.length) fail(`verdicts cover ${checked} of ${playBefore.length} playable entries`);
if (playBefore.length !== playAfter.length + n.unflag) fail('playable counts do not reconcile');

const band = d => d == null ? 'none' : d <= 2 ? '1-2' : d <= 4 ? '3-4' : d <= 6 ? '5-6' : d <= 8 ? '7-8' : '9-10';
const bands = {};
for (const e of playAfter) bands[band(e.difficulty)] = (bands[band(e.difficulty)] || 0) + 1;

console.log(`base ${BASE} vs working tree: ${before.length} entries before, ${after.length} after`);
console.log(`playable entries with a verdict: ${checked} of ${playBefore.length}`);
console.log(`entries changed: ${n.entriesTouched}; facts changed ${n.fact}, clues changed ${n.clue}, coordinate values changed ${n.coord}, flags removed ${n.unflag}`);
console.log(`unflagged: ${unflagged.length ? unflagged.join(', ') : 'none'} (report list: ${reportUnflagged.size ? [...reportUnflagged].join(', ') : 'none'})`);
console.log(`playable before ${playBefore.length} = playable after ${playAfter.length} + unflagged ${n.unflag}: ${playBefore.length === playAfter.length + n.unflag ? 'OK' : 'MISMATCH'}`);
console.log(`text diff of assets/trivia-bank.json vs ${BASE}: +${added} -${removed} lines (every other byte unchanged)`);
console.log(`playable per band after: ${JSON.stringify(bands)}`);
console.log(fails.length ? `FAIL (${fails.length}):\n  ` + fails.join('\n  ') : 'PASS: all checks');
process.exit(fails.length ? 1 : 0);
