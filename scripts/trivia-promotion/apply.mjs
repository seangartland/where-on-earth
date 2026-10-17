// Trivia promotion pilot: apply docs/trivia-promotion-pilot-verdicts.json to
// assets/trivia-bank.json. Only records with promoted === true change the bank:
// their fact and clue rewrites (gate 1 and gate 2 changes, in order), the new
// image URL, and photo: "verified". Failed entries stay byte-identical.
// Edits are textual inside each entry's block, so untouched bytes stay as they
// were. Rerunnable: edits already applied are skipped.
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BANK = path.join(HERE, '../../assets/trivia-bank.json');
const recs = JSON.parse(fs.readFileSync(path.join(HERE, '../../docs/trivia-promotion-pilot-verdicts.json'), 'utf8'));
let text = fs.readFileSync(BANK, 'utf8');
const bank = JSON.parse(text);

function editBlock(id, fn) {
  const start = text.indexOf(`"id": ${JSON.stringify(id)},`);
  if (start < 0) throw new Error('no entry ' + id);
  const a = text.lastIndexOf('{', start), b = text.indexOf('\n  }', start);
  const before = text.slice(a, b), after = fn(before);
  text = text.slice(0, a) + after + text.slice(b);
  return before !== after;
}
const n = { fact: 0, clue: 0, image: 0, photo: 0, skipped: 0 };
for (const r of recs) {
  if (!r.promoted) continue;
  const e = bank.find(x => x.id === r.id);
  const g = r.gates;
  if (![g.fact.v, g.unique.v, g.photo.v].every(v => v === 'PASS')) throw new Error(r.id + ' promoted without three PASS gates');
  // final value per field: the last change across gate 1 then gate 2
  const finals = {};
  for (const c of [...(g.fact.changes || []), ...(g.unique.changes || [])]) finals[c.field] = c;
  for (const [key, c] of Object.entries(finals)) {
    if (/—/.test(c.after)) throw new Error(`${r.id}.${key} contains an em dash`);
    const changed = editBlock(r.id, s => {
      const oldLine = `"${key}": ${JSON.stringify(e[key])}`, newLine = `"${key}": ${JSON.stringify(c.after)}`;
      if (s.includes(newLine)) return s;
      if (!s.includes(oldLine)) throw new Error(`${r.id}: ${key} line not found`);
      return s.replace(oldLine, newLine);
    });
    changed ? n[key]++ : n.skipped++;
  }
  const img = editBlock(r.id, s => {
    const newLine = `"image": ${JSON.stringify(g.photo.url)}`;
    if (s.includes(newLine)) return s;
    const out = s.replace(/"image": "[^"\n]*"/, newLine);
    if (out === s) throw new Error(r.id + ': image line not found');
    return out;
  });
  img ? n.image++ : n.skipped++;
  const ph = editBlock(r.id, s => {
    if (s.includes('"photo": "verified"')) return s;
    // image is the last key in held entries; the flag goes after it, as in flagged entries
    return s.replace(/("image": "[^"\n]*")$/, '$1,\n    "photo": "verified"');
  });
  ph ? n.photo++ : n.skipped++;
}
const out = JSON.parse(text);
for (const r of recs.filter(r => r.promoted)) if (out.find(x => x.id === r.id).photo !== 'verified') throw new Error(r.id + ' flag not set');
fs.writeFileSync(BANK, text);
console.log(`records: ${recs.length}, promoted: ${recs.filter(r => r.promoted).length}`);
console.log(`applied now: facts ${n.fact}, clues ${n.clue}, images ${n.image}, flags ${n.photo}; already applied ${n.skipped}`);
