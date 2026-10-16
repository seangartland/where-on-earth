// Phase 3: applies clue-decisions.mjs to assets/trivia-bank.json and writes the full
// per-clue record to docs/trivia-clue-decisions.json. Rerunnable: already-applied
// rewrites are detected and left alone. Flags are computed on the pre-repair bank
// (git 0ea2ca0) so the record does not shrink once clues are fixed.
//   node scripts/trivia-repair/apply-clues.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { flag } from './clue-flags.mjs';
import { rewrites, keeps, drops } from './clue-decisions.mjs';

const BASE = '0ea2ca0';
const root = new URL('../../', import.meta.url);
const bankPath = new URL('assets/trivia-bank.json', root);
const before = JSON.parse(execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: root, maxBuffer: 1 << 26 }).toString());
const beforeById = new Map(before.map((e) => [e.id, e]));
const { classes } = flag(before);

const errors = [];
const records = new Map();
const flaggedIn = (id) => Object.entries(classes).filter(([k, rows]) => k !== 'compassOf' && rows.some(([e]) => e.id === id)).map(([k]) => k);
const relative = new Set(classes.compassOf.map(([e]) => e.id));

for (const [id, cls, edits, note] of rewrites) {
  const e = beforeById.get(id);
  if (!e) { errors.push(`rewrite ${id}: not in bank`); continue; }
  let after = e.clue;
  for (const [from, to] of edits) {
    if (!after.includes(from)) errors.push(`rewrite ${id}: "${from}" not found`);
    after = after.replace(from, to);
  }
  if (/—/.test(after)) errors.push(`rewrite ${id}: em dash`);
  records.set(id, { id, classes: cls, action: 'REWRITE', before: e.clue, after, ...(note ? { note } : {}) });
}
for (const [id, cls, reason] of keeps) {
  if (!beforeById.has(id)) { errors.push(`keep ${id}: not in bank`); continue; }
  const r = records.get(id);
  if (r) { r.keptFor = { classes: cls, reason }; continue; }
  records.set(id, { id, classes: cls, action: 'KEEP', clue: beforeById.get(id).clue, reason });
}
for (const [id, reason] of drops) {
  if (!beforeById.has(id)) errors.push(`drop ${id}: not in bank`);
  records.set(id, { id, classes: flaggedIn(id), action: 'DROP', clue: beforeById.get(id)?.clue, reason });
}
// Every flagged clue must carry a decision; own-name hits on a generic word are kept in bulk.
for (const [k, rows] of Object.entries(classes)) {
  if (k === 'compassOf') continue;
  for (const [e, why] of rows) {
    const r = records.get(e.id);
    if (r) { if (!r.classes.includes(k) && !(r.keptFor?.classes || []).includes(k)) (r.keptFor ||= { classes: [], reason: '' }).classes.push(k); continue; }
    if (k === 'ownName') records.set(e.id, { id: e.id, classes: [k], action: 'KEEP', clue: e.clue, reason: `generic word "${why}" shared with the name, not the place's name` });
    else errors.push(`${k} ${e.id}: no decision`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// Textual edit of the bank: one "clue" line per rewrite, entry blocks removed for drops.
let lines = readFileSync(bankPath, 'utf8').split('\n');
let applied = 0;
let already = 0;
for (const r of records.values()) {
  if (r.action !== 'REWRITE') continue;
  const from = `    "clue": ${JSON.stringify(r.before)},`;
  const to = `    "clue": ${JSON.stringify(r.after)},`;
  const i = lines.indexOf(from);
  if (i === -1) {
    if (lines.includes(to)) { already++; continue; }
    console.error(`clue line for ${r.id} not found`); process.exit(1);
  }
  if (lines.indexOf(from, i + 1) !== -1) { console.error(`clue line for ${r.id} not unique`); process.exit(1); }
  lines[i] = to;
  applied++;
}
let dropped = 0;
for (const [id] of drops) {
  const i = lines.indexOf(`    "id": ${JSON.stringify(id)},`);
  if (i === -1) continue;
  let s = i; while (lines[s] !== '  {') s--;
  let t = i; while (!/^  },?$/.test(lines[t])) t++;
  const last = lines[t] === '  }';
  lines.splice(s, t - s + 1);
  if (last) lines[s - 1] = lines[s - 1].replace(/,$/, '');
  dropped++;
}
const text = lines.join('\n');
JSON.parse(text);

const out = [...records.values()].sort((a, b) => a.action.localeCompare(b.action) || a.id.localeCompare(b.id));
const tally = {};
for (const r of out) {
  for (const c of r.classes) tally[`${c} ${r.action}`] = (tally[`${c} ${r.action}`] || 0) + 1;
  for (const c of r.keptFor?.classes || []) tally[`${c} KEEP`] = (tally[`${c} KEEP`] || 0) + 1;
}
const record = { base: BASE, tally, decisions: out, relativeCompassFollowUp: [...relative].filter((id) => !records.get(id)?.classes.includes('compass')).map((id) => ({ id, clue: beforeById.get(id).clue })) };
if (!process.argv.includes('--dry')) {
  writeFileSync(bankPath, text);
  writeFileSync(new URL('docs/trivia-clue-decisions.json', root), JSON.stringify(record, null, 1).replace(/\u2014/g, '\\u2014') + '\n');
}
console.log(`decisions ${out.length}: REWRITE ${out.filter((r) => r.action === 'REWRITE').length}, KEEP ${out.filter((r) => r.action === 'KEEP').length}, DROP ${out.filter((r) => r.action === 'DROP').length}`);
console.log(`bank: ${applied} clues rewritten now, ${already} already applied, ${dropped} entries dropped`);
console.log('tally', JSON.stringify(tally));
