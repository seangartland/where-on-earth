// Converts verdicts.txt (photo#|verified id or -|method|note) into docs/trivia-photo-verdicts.json.
// With --apply, also adds "photo": "verified" to each verified entry in assets/trivia-bank.json.
import { readFileSync, writeFileSync } from 'node:fs';
const here = (p) => new URL(p, import.meta.url);
const list = JSON.parse(readFileSync(here('photo-list.json')));
const rows = readFileSync(here('verdicts.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
const byN = new Map();
for (const l of rows) {
  const [n, id, method, ...note] = l.split('|');
  byN.set(Number(n), { id, method, note: note.join('|') });
}
const out = [];
const errors = [];
for (const p of list) {
  const v = byN.get(p.n);
  if (!v) continue;
  const pending = v.id.endsWith('?');
  const verified = pending || v.id === '-' ? null : v.id;
  if (verified && !p.ids.includes(verified)) errors.push(`#${p.n}: ${verified} does not use this photo`);
  if (!['F', 'M', 'V'].includes(v.method)) errors.push(`#${p.n}: bad method ${v.method}`);
  out.push({ n: p.n, file: p.file, url: p.url, entries: p.ids, verified, method: v.method, ...(pending ? { pending: true } : {}), ...(v.note ? { note: v.note } : {}) });
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
writeFileSync(here('../../docs/trivia-photo-verdicts.json'), JSON.stringify(out, null, 1) + '\n');
const done = out.filter((o) => !o.pending);
const per = { F: 0, M: 0, V: 0 };
for (const o of done) per[o.method]++;
console.log(`judged ${done.length}/${list.length} photos (pending ${out.length - done.length}); per method F=${per.F} M=${per.M} V=${per.V}; verifying photos ${done.filter((o) => o.verified).length}`);

if (process.argv.includes('--apply')) {
  if (done.length !== list.length) { console.error('refusing --apply: not every photo has a final verdict'); process.exit(1); }
  const bankUrl = here('../../assets/trivia-bank.json');
  const raw = readFileSync(bankUrl, 'utf8');
  const bank = JSON.parse(raw);
  const ok = new Set(done.filter((o) => o.verified).map((o) => o.verified));
  let n = 0;
  for (const e of bank) if (ok.has(e.id)) { e.photo = 'verified'; n++; }
  writeFileSync(bankUrl, JSON.stringify(bank, null, raw.includes('\n  ') ? 2 : raw.includes('\n ') ? 1 : 0) + (raw.endsWith('\n') ? '\n' : ''));
  console.log(`flagged ${n} entries photo=verified`);
}
