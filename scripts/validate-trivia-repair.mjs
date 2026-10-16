// Before/after proof for the trivia bank repair (docs/trivia-bank-repair-report.md).
// Compares assets/trivia-bank.json against the pre-repair bank at git 0ea2ca0 and
// against the two decision records. Exits nonzero on any failure.
//   node scripts/validate-trivia-repair.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { drops } from './trivia-repair/clue-decisions.mjs';

const BASE = '0ea2ca0';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const before = JSON.parse(execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: root, maxBuffer: 1 << 26 }).toString());
const afterText = read('assets/trivia-bank.json');
const after = JSON.parse(afterText);
const verdicts = JSON.parse(read('docs/trivia-photo-verdicts.json'));
const clueRecord = JSON.parse(read('docs/trivia-clue-decisions.json'));

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); return ok; };
const beforeById = new Map(before.map((e) => [e.id, e]));
const afterById = new Map(after.map((e) => [e.id, e]));
const dropIds = new Set(drops.map(([id]) => id));

// 1. Entries: only the drop list may disappear, nothing may appear.
const missing = before.filter((e) => !afterById.has(e.id)).map((e) => e.id);
const added = after.filter((e) => !beforeById.has(e.id)).map((e) => e.id);
check(missing.every((id) => dropIds.has(id)) && [...dropIds].every((id) => !afterById.has(id)), `deleted ids differ from the drop list: ${missing.join(', ')}`);
check(added.length === 0, `new ids: ${added.join(', ')}`);
check(new Set(after.map((e) => e.id)).size === after.length, 'duplicate ids after');
check(before.length === after.length + dropIds.size, 'before != kept + dropped');

// 2. Kept entries: only clue may change, only photo may be added (and only as 'verified').
const rewriteIds = new Map(clueRecord.decisions.filter((r) => r.action === 'REWRITE').map((r) => [r.id, r.after]));
let clueChanged = 0;
for (const a of after) {
  const b = beforeById.get(a.id);
  if (!b) continue;
  const keysA = Object.keys(a).filter((k) => k !== 'photo');
  check(keysA.length === Object.keys(b).length && keysA.every((k) => k in b), `${a.id}: field set changed`);
  for (const k of Object.keys(b)) {
    if (k === 'clue') continue;
    check(JSON.stringify(a[k]) === JSON.stringify(b[k]), `${a.id}: ${k} changed`);
  }
  if ('photo' in a) check(a.photo === 'verified', `${a.id}: photo is ${a.photo}`);
  if (a.clue !== b.clue) {
    clueChanged++;
    check(rewriteIds.get(a.id) === a.clue, `${a.id}: clue changed outside the REWRITE list`);
  }
}
check(clueChanged === rewriteIds.size, `clue changes ${clueChanged} != REWRITE decisions ${rewriteIds.size}`);

// 3. Photo flags match the phase 1 verdicts exactly.
check(verdicts.length === new Set(before.filter((e) => e.image).map((e) => e.image)).size, 'verdict count != distinct photos');
const verifiedByVerdict = new Set(verdicts.filter((v) => v.verified).map((v) => v.verified));
for (const v of verdicts) if (v.verified) check(beforeById.get(v.verified)?.image === v.url, `verdict #${v.n}: ${v.verified} does not use that photo`);
const flagged = after.filter((e) => e.photo === 'verified');
check(flagged.length === [...verifiedByVerdict].filter((id) => !dropIds.has(id)).length && flagged.every((e) => verifiedByVerdict.has(e.id)), 'photo flags differ from the verdicts');

// 4. Zero em dashes in the bank.
check(!afterText.includes('\u2014'), 'em dash in the bank');

const method = { F: 0, M: 0, V: 0 };
for (const v of verdicts) method[v.method]++;
const bands = { '1-2': 0, '3-4': 0, '5-6': 0, '7-8': 0, '9-10': 0 };
for (const e of flagged) bands[Object.keys(bands)[Math.ceil(e.difficulty / 2) - 1]]++;
const playable = after.filter((e) => Number.isInteger(e.difficulty) && e.difficulty >= 1 && e.difficulty <= 10 && e.image && e.photo === 'verified');
console.log(`base ${BASE}: entries before ${before.length}, after ${after.length}, dropped ${dropIds.size} (${[...dropIds].join(', ') || 'none'})`);
console.log(`before = kept + dropped: ${before.length} = ${after.length} + ${dropIds.size}`);
console.log(`photos judged ${verdicts.length} (filename ${method.F}, Commons metadata ${method.M}, visual ${method.V}); photos that verify an entry ${verifiedByVerdict.size}`);
console.log(`entries flagged photo=verified ${flagged.length}; per band ${JSON.stringify(bands)}; playable ${playable.length}`);
console.log(`clues changed ${clueChanged} (REWRITE decisions ${rewriteIds.size}); other field changes on kept entries: ${fails.filter((f) => / changed$/.test(f)).length}`);
console.log(fails.length ? `FAIL (${fails.length})\n  ${fails.join('\n  ')}` : 'PASS: all checks');
process.exit(fails.length ? 1 : 0);
