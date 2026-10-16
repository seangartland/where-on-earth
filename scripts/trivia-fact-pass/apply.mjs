// Trivia fact pass: apply the verdict files to assets/trivia-bank.json by
// textual edits inside each entry's block, so every untouched byte of the file
// (number formats, key order, other entries) stays as it was.
// Verdict files: slice*.json and named.json in this folder, each
//   { id: { v: KEEP|FIX|UNFLAG, fact?, clue?, lat?, lng?, note } }
// Rerunnable: edits already applied are detected and skipped.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BANK = path.join(HERE, '../../assets/trivia-bank.json');
let text = fs.readFileSync(BANK, 'utf8');
const bank = JSON.parse(text);

const files = fs.readdirSync(HERE).filter(f => /^(slice\d+|named)\.json$/.test(f)).sort();
const verdicts = {};
for (const f of files) {
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')))) {
    if (verdicts[id]) {
      // a named-item verdict may add fields (e.g. a pin move) to a slice verdict, never overwrite one
      const clash = ['fact', 'clue', 'lat', 'lng'].filter(k => v[k] !== undefined && verdicts[id][k] !== undefined);
      if (clash.length || v.v === 'UNFLAG' || verdicts[id].v === 'UNFLAG') throw new Error(`${id} has clashing verdicts in two files`);
      verdicts[id] = { ...verdicts[id], ...v, v: 'FIX', note: verdicts[id].note + ' | ' + v.note, file: verdicts[id].file + '+' + f };
      continue;
    }
    verdicts[id] = { ...v, file: f };
  }
}

function block(id) {
  const start = text.indexOf(`"id": ${JSON.stringify(id)},`);
  if (start < 0) throw new Error('no entry ' + id);
  const open = text.lastIndexOf('{', start);
  const close = text.indexOf('\n  }', start);
  return [open, close];
}
function editBlock(id, fn) {
  const [a, b] = block(id);
  const before = text.slice(a, b);
  const after = fn(before);
  text = text.slice(0, a) + after + text.slice(b);
  return before !== after;
}

let n = { fact: 0, clue: 0, coord: 0, unflag: 0, skipped: 0 };
for (const [id, v] of Object.entries(verdicts)) {
  const e = bank.find(x => x.id === id);
  if (!e) throw new Error('unknown id ' + id);
  if (v.v === 'KEEP') continue;
  for (const key of ['fact', 'clue']) {
    if (v[key] === undefined) continue;
    if (/\u2014/.test(v[key])) throw new Error(`${id}.${key} contains an em dash`);
    const changed = editBlock(id, s => {
      const oldLine = `"${key}": ${JSON.stringify(e[key])}`;
      const newLine = `"${key}": ${JSON.stringify(v[key])}`;
      if (s.includes(newLine)) return s;
      if (!s.includes(oldLine)) throw new Error(`${id}: ${key} line not found`);
      return s.replace(oldLine, newLine);
    });
    changed ? n[key]++ : n.skipped++;
  }
  for (const key of ['lat', 'lng']) {
    if (v[key] === undefined) continue;
    const changed = editBlock(id, s => {
      const re = new RegExp(`"${key}": -?[0-9.]+`);
      const newVal = `"${key}": ${v[key]}`;
      if (s.includes(newVal + ',') || s.includes(newVal + '\n')) return s;
      return s.replace(re, newVal);
    });
    changed ? n.coord++ : n.skipped++;
  }
  if (v.v === 'UNFLAG') {
    const changed = editBlock(id, s => {
      if (!s.includes('"photo": "verified"')) return s;
      // photo is the last key in flagged entries: drop the line and the comma before it
      const out = s.replace(/,\n\s*"photo": "verified"$/, '');
      if (out === s) throw new Error(`${id}: photo flag not in the expected place`);
      return out;
    });
    changed ? n.unflag++ : n.skipped++;
  }
}
JSON.parse(text); // must still be valid JSON
fs.writeFileSync(BANK, text);
console.log(`verdict files: ${files.join(', ')}; entries with verdicts: ${Object.keys(verdicts).length}`);
console.log(`applied now: facts ${n.fact}, clues ${n.clue}, coordinates ${n.coord}, unflagged ${n.unflag}; already applied ${n.skipped}`);
