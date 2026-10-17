// Trivia promotion pilot: validate assets/trivia-bank.json against the pilot's
// base commit (pilot-list.mjs BASE) and docs/trivia-promotion-pilot-verdicts.json.
// Checks:
//  1. same entries in the same order; changes only on the 30 pilot entries
//  2. on those entries only fact, clue, image and photo changed
//  3. every byte outside the pilot entries' blocks is identical to the base
//  4. flags added (photo newly 'verified') exactly match the verdicts' promoted list
//  5. promoted entries carry exactly the verdicts' final fact, clue and image;
//     pilot entries that were not promoted are unchanged
//  6. every promoted entry passed all three gates; every photo pass records a
//     file, license and author
//  7. no new image is shared with any other bank entry; all are 500px Commons thumbs
//  8. zero em dashes in the bank text changes, the verdicts file and the report
//  9. counts reconcile: playable before = playable after minus flags added
// Usage: node scripts/trivia-promotion/validate.mjs   (exit 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BASE, pilotList } from './pilot-list.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
const baseText = execSync(`git show ${BASE}:assets/trivia-bank.json`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
const nowText = fs.readFileSync(path.join(ROOT, 'assets/trivia-bank.json'), 'utf8');
const before = JSON.parse(baseText), after = JSON.parse(nowText);
const recs = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/trivia-promotion-pilot-verdicts.json'), 'utf8'));
const reportPath = path.join(ROOT, 'docs/trivia-promotion-pilot-report.md');
const groups = pilotList(before);
const pilot = new Set(groups.flatMap(g => g.ids));

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const playableRule = e => Number.isInteger(e.difficulty) && e.difficulty >= 1 && e.difficulty <= 10 && Boolean(e.image) && e.photo === 'verified';

// 1, 2
check(before.length === after.length, `entry count ${before.length} -> ${after.length}`);
const changed = [];
before.forEach((b, i) => {
  const a = after[i];
  check(a && a.id === b.id, `entry ${i} id ${b.id} -> ${a?.id}`);
  if (!a || JSON.stringify(a) === JSON.stringify(b)) return;
  changed.push(b.id);
  check(pilot.has(b.id), `${b.id} changed but is not a pilot entry`);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) check(['fact', 'clue', 'image', 'photo'].includes(k), `${b.id}: field ${k} changed`);
});

// 3: strip each pilot entry's block from both texts; the rest must be identical
const stripBlocks = text => {
  for (const id of pilot) {
    const s = text.indexOf(`"id": ${JSON.stringify(id)},`);
    const a = text.lastIndexOf('{', s), b = text.indexOf('\n  }', s);
    text = text.slice(0, a) + `<${id}>` + text.slice(b);
  }
  return text;
};
check(stripBlocks(baseText) === stripBlocks(nowText), 'bytes outside the pilot entries differ from the base');

// 4
const added = after.filter((a, i) => a.photo === 'verified' && before[i].photo !== 'verified').map(a => a.id).sort();
const promoted = recs.filter(r => r.promoted).map(r => r.id).sort();
check(JSON.stringify(added) === JSON.stringify(promoted), `flags added [${added}] != promoted [${promoted}]`);
const removed = after.filter((a, i) => a.photo !== 'verified' && before[i].photo === 'verified').map(a => a.id);
check(removed.length === 0, `flags removed: ${removed}`);

// 5, 6
check(new Set(recs.map(r => r.id)).size === recs.length, 'duplicate verdict records');
for (const r of recs) {
  check(pilot.has(r.id), `verdict for non-pilot entry ${r.id}`);
  const b = before.find(e => e.id === r.id), a = after.find(e => e.id === r.id);
  const g = r.gates;
  const allPass = ['fact', 'unique', 'photo'].every(k => g[k]?.v === 'PASS');
  check(r.promoted === allPass, `${r.id}: promoted=${r.promoted} but gates ${g.fact.v}/${g.unique.v}/${g.photo.v}`);
  for (const [i, k] of ['fact', 'unique', 'photo'].entries()) {
    check(['PASS', 'FAIL', 'NOT RUN'].includes(g[k]?.v), `${r.id}: gate ${k} verdict ${g[k]?.v}`);
    if (g[k].v === 'FAIL') check(Boolean(g[k].note), `${r.id}: gate ${k} FAIL without a reason`);
    if (g[k].v === 'NOT RUN') check(['fact', 'unique', 'photo'].slice(0, i).some(p => g[p].v === 'FAIL'), `${r.id}: gate ${k} not run without an earlier fail`);
  }
  if (g.unique.v !== 'NOT RUN') check(Array.isArray(g.unique.competitors), `${r.id}: gate 2 has no competitors list`);
  if (g.unique.v === 'FAIL' || (g.unique.changes || []).length) check(g.unique.competitors.length > 0, `${r.id}: gate 2 flag without named competitors`);
  if (g.photo.v === 'PASS') check(g.photo.file && g.photo.license && g.photo.author && g.photo.url, `${r.id}: photo pass missing file/license/author/url`);
  if (g.photo.v === 'FAIL') check((g.photo.searched || []).length > 0, `${r.id}: photo fail without searches recorded`);
  const finals = { fact: b.fact, clue: b.clue };
  for (const c of [...(g.fact.changes || []), ...(g.unique.changes || [])]) {
    check(c.before === finals[c.field], `${r.id}: ${c.field} change 'before' does not chain`);
    finals[c.field] = c.after;
  }
  if (r.promoted) {
    check(a.fact === finals.fact && a.clue === finals.clue, `${r.id}: bank text != verdict final text`);
    check(a.image === g.photo.url, `${r.id}: bank image != verdict photo url`);
    check(a.photo === 'verified', `${r.id}: not flagged`);
  } else {
    check(JSON.stringify(a) === JSON.stringify(b), `${r.id}: not promoted but changed`);
  }
}
for (const id of changed) check(recs.some(r => r.id === id && r.promoted), `${id} changed without a promoted verdict`);

// 7
const imgCount = new Map();
for (const e of after) if (e.image) imgCount.set(e.image, (imgCount.get(e.image) || 0) + 1);
for (const r of recs.filter(r => r.promoted)) {
  const u = r.gates.photo.url;
  check(imgCount.get(u) === 1, `${r.id}: image shared with another entry`);
  check(/^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/[^/]+\/500px-[^/?]+$/.test(u), `${r.id}: image not a 500px Commons thumb`);
}

// 8
const EM = /—/;
for (const id of changed) {
  const a = after.find(e => e.id === id);
  check(!EM.test(a.fact) && !EM.test(a.clue), `${id}: em dash in text`);
}
check(!EM.test(fs.readFileSync(path.join(ROOT, 'docs/trivia-promotion-pilot-verdicts.json'), 'utf8')), 'em dash in the verdicts file');
if (fs.existsSync(reportPath)) check(!EM.test(fs.readFileSync(reportPath, 'utf8')), 'em dash in the report');

// 9
const pb = before.filter(playableRule).length, pa = after.filter(playableRule).length;
check(pb === pa - added.length, `playable ${pb} != ${pa} - ${added.length}`);
const bandOf = d => Math.ceil(d / 2);
const perBand = list => [1, 2, 3, 4, 5].map(k => list.filter(e => playableRule(e) && bandOf(e.difficulty) === k).length);

console.log(`base ${BASE}; pilot entries ${pilot.size} (${groups.map(g => `${g.band}: ${g.ids.length}`).join(', ')})`);
console.log(`verdict records ${recs.length}; entries changed ${changed.length}; flags added ${added.length}; promoted ${promoted.length}`);
console.log(`playable before ${pb}, after ${pa}, after minus flags added ${pa - added.length}`);
console.log(`playable per band (1-2, 3-4, 5-6, 7-8, 9-10): before ${perBand(before).join(' / ')}; after ${perBand(after).join(' / ')}`);
console.log(fails.length ? `FAIL (${fails.length}):\n  ` + fails.join('\n  ') : 'PASS: all checks');
process.exit(fails.length ? 1 : 0);
