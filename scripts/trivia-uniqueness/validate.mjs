// Trivia uniqueness pass validation: diff assets/trivia-bank.json against the bank
// at the fact-pass head commit (fb4af2a) and prove the pass stayed in bounds.
//   - same entries, same order; on kept entries only the clue changed
//   - every clue change is a REWRITE verdict, and every REWRITE was applied
//   - flag removals exactly match the PULL verdicts (and the report's list, once written)
//   - every flagged verdict names at least one competitor place
//   - rewritten clues: zero em dashes, a question, do not contain the entry's short name
//   - the file's text diff is exactly the changed lines (no reformatting)
//   - playable before = playable after + pulled
// Usage: node scripts/trivia-uniqueness/validate.mjs   (exit 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const BASE = 'fb4af2a';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '../..');
const beforeText = execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
const afterText = fs.readFileSync(path.join(ROOT, 'assets/trivia-bank.json'), 'utf8');
const before = JSON.parse(beforeText), after = JSON.parse(afterText);

const fails = [];
const fail = m => fails.push(m);

const verdicts = {};
const files = fs.readdirSync(HERE).filter(f => /^slice\d+\.json$/.test(f)).sort();
for (const f of files) for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')))) {
  if (verdicts[id]) fail(`${id}: verdicts in two files`);
  verdicts[id] = v;
}

const playableBefore = before.filter(e => e.photo === 'verified');
for (const id of Object.keys(verdicts)) if (!playableBefore.some(e => e.id === id)) fail(`${id}: verdict for an entry that was not playable`);
for (const [id, v] of Object.entries(verdicts)) {
  if (!['PASS', 'REWRITE', 'PULL'].includes(v.v)) fail(`${id}: unknown verdict ${v.v}`);
  if (v.v !== 'PASS' && !(v.competitors?.length)) fail(`${id}: flagged without a named competitor`);
}

const reportPath = path.join(ROOT, 'docs/trivia-uniqueness-report.md');
const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
const rm = report && report.match(/<!-- pulled:start -->([\s\S]*?)<!-- pulled:end -->/);
if (report && !rm) fail('report has no pulled list markers');
const reportPulled = rm ? new Set([...rm[1].matchAll(/`([a-z0-9-]+)`/g)].map(x => x[1])) : null;

if (before.length !== after.length) fail(`entry count ${before.length} -> ${after.length}`);
const n = { clue: 0, pulled: 0, touched: 0 };
const pulled = [];
let changedLines = 0;
before.forEach((b, i) => {
  const a = after[i];
  if (!a || a.id !== b.id) { fail(`entry ${i}: id ${b.id} -> ${a && a.id}`); return; }
  const v = verdicts[b.id];
  let touched = false;
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (JSON.stringify(b[k]) === JSON.stringify(a[k])) continue;
    touched = true;
    if (k === 'clue') {
      n.clue++; changedLines++;
      if (v?.v !== 'REWRITE' || v.clue !== a.clue || v.clue_before !== b.clue) fail(`${b.id}: clue change not backed by a REWRITE verdict`);
      if (/—/.test(a.clue)) fail(`${b.id}: clue contains an em dash`);
      if (!/^Where\b.*\?$/.test(a.clue)) fail(`${b.id}: clue is not a Where question`);
      if (a.short && a.clue.toLowerCase().includes(a.short.toLowerCase())) fail(`${b.id}: clue names its answer (${a.short})`);
    } else if (k === 'photo' && b.photo === 'verified' && a.photo === undefined) {
      n.pulled++; pulled.push(b.id); changedLines++;
      if (v?.v !== 'PULL') fail(`${b.id}: flag removed without a PULL verdict`);
      if (reportPulled && !reportPulled.has(b.id)) fail(`${b.id}: pulled but not in the report list`);
    } else fail(`${b.id}: field ${k} changed`);
  }
  if (touched) n.touched++;
});
for (const [id, v] of Object.entries(verdicts)) {
  const a = after.find(e => e.id === id);
  if (v.v === 'REWRITE' && a.clue !== v.clue) fail(`${id}: REWRITE not applied`);
  if (v.v === 'PULL' && a.photo !== undefined) fail(`${id}: PULL not applied`);
  if (v.v !== 'REWRITE' && a.clue !== v.clue_before && v.clue_before !== undefined) fail(`${id}: clue changed under ${v.v}`);
}
if (reportPulled) for (const id of reportPulled) if (!pulled.includes(id)) fail(`${id}: in the report list but still playable`);

// text diff: one changed line per clue change; a pull deletes one line and edits the line before it
const bl = beforeText.split('\n'), al = afterText.split('\n');
if (bl.length - al.length !== n.pulled) fail(`line count ${bl.length} -> ${al.length}, expected -${n.pulled}`);
let diffLines = 0;
{ let i = 0, j = 0;
  while (i < bl.length) {
    if (bl[i] === al[j]) { i++; j++; continue; }
    if (/^\s*"photo": "verified"$/.test(bl[i + 1] || '') && al[j] === bl[i].replace(/,$/, '')) { diffLines += 1; i += 2; j++; continue; }
    diffLines++; i++; j++;
  } }
if (diffLines !== changedLines) fail(`text diff touches ${diffLines} lines, expected ${changedLines}`);

const playableAfter = after.filter(e => e.photo === 'verified').length;
if (playableBefore.length !== playableAfter + n.pulled) fail(`playable ${playableBefore.length} != ${playableAfter} + ${n.pulled}`);

const tally = {};
for (const v of Object.values(verdicts)) tally[v.v] = (tally[v.v] || 0) + 1;
console.log(`base ${BASE}; verdict files: ${files.join(', ')}`);
console.log(`verdicts: ${Object.keys(verdicts).length} of ${playableBefore.length} playable; ${JSON.stringify(tally)}`);
console.log(`bank changes: ${n.touched} entries touched, ${n.clue} clues rewritten, ${n.pulled} flags removed`);
console.log(`playable before ${playableBefore.length} = after ${playableAfter} + pulled ${n.pulled}`);
console.log(`report pulled list: ${reportPulled ? reportPulled.size + ' ids, matches' : 'not written yet (checked once the report exists)'}`);
if (fails.length) { console.log(`FAIL (${fails.length}):`); fails.forEach(f => console.log('  ' + f)); process.exit(1); }
console.log('PASS: all checks');
