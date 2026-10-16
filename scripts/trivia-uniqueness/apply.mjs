// Trivia uniqueness pass: apply the slice verdict files to assets/trivia-bank.json
// by textual edits inside each entry's block (same method as the fact pass), so
// every untouched byte of the file stays as it was.
// Verdict files: slice*.json in this folder, each
//   { id: { v: PASS|REWRITE|PULL, clue_before?, competitors?, clue?, note? } }
// REWRITE replaces the clue; PULL removes the photo flag (entry stays in the bank).
// Rerunnable: edits already applied are detected and skipped.
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BANK = path.join(HERE, '../../assets/trivia-bank.json');
let text = fs.readFileSync(BANK, 'utf8');
const bank = JSON.parse(text);

const files = fs.readdirSync(HERE).filter(f => /^slice\d+\.json$/.test(f)).sort();
const verdicts = {};
for (const f of files) {
  for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')))) {
    if (verdicts[id]) throw new Error(`${id} has verdicts in two files`);
    verdicts[id] = v;
  }
}

function editBlock(id, fn) {
  const start = text.indexOf(`"id": ${JSON.stringify(id)},`);
  if (start < 0) throw new Error('no entry ' + id);
  const a = text.lastIndexOf('{', start), b = text.indexOf('\n  }', start);
  const before = text.slice(a, b), after = fn(before);
  text = text.slice(0, a) + after + text.slice(b);
  return before !== after;
}

const n = { clue: 0, pull: 0, skipped: 0 };
for (const [id, v] of Object.entries(verdicts)) {
  const e = bank.find(x => x.id === id);
  if (!e) throw new Error('unknown id ' + id);
  if (v.v === 'PASS') continue;
  if (!v.competitors?.length) throw new Error(`${id}: flagged without named competitors`);
  if (v.v === 'REWRITE') {
    if (/\u2014/.test(v.clue)) throw new Error(`${id}: clue contains an em dash`);
    const changed = editBlock(id, s => {
      const oldLine = `"clue": ${JSON.stringify(v.clue_before)}`, newLine = `"clue": ${JSON.stringify(v.clue)}`;
      if (s.includes(newLine)) return s;
      if (!s.includes(oldLine)) throw new Error(`${id}: clue line not found`);
      return s.replace(oldLine, newLine);
    });
    changed ? n.clue++ : n.skipped++;
  } else if (v.v === 'PULL') {
    const changed = editBlock(id, s => {
      if (!s.includes('"photo": "verified"')) return s;
      const out = s.replace(/,\n\s*"photo": "verified"$/, '');
      if (out === s) throw new Error(`${id}: photo flag not in the expected place`);
      return out;
    });
    changed ? n.pull++ : n.skipped++;
  } else throw new Error(`${id}: unknown verdict ${v.v}`);
}
JSON.parse(text);
fs.writeFileSync(BANK, text);
console.log(`verdict files: ${files.join(', ')}; entries with verdicts: ${Object.keys(verdicts).length}`);
console.log(`applied now: clues ${n.clue}, pulled ${n.pull}; already applied ${n.skipped}`);
