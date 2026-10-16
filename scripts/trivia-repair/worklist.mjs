// Worklist for verdicts: file, Commons description, GPS distance to each entry using the photo.
import { readFileSync, writeFileSync } from 'node:fs';
const bank = JSON.parse(readFileSync(new URL('../../assets/trivia-bank.json', import.meta.url)));
const list = JSON.parse(readFileSync(new URL('photo-list.json', import.meta.url)));
const meta = JSON.parse(readFileSync(new URL('commons-meta.json', import.meta.url)));
const byId = new Map(bank.map((e) => [e.id, e]));
const km = (a, b, c, d) => { const r = Math.PI / 180; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return Math.round(12742 * Math.asin(Math.sqrt(x))); };
const lines = [];
for (const p of list) {
  const m = meta[p.n] || {};
  const desc = (m.obj && m.obj !== p.file.replace(/\.\w+$/, '').replace(/_/g, ' ') ? m.obj + ' / ' : '') + (m.desc || '');
  const gps = m.gps && !Number.isNaN(m.gps[0]) ? m.gps : null;
  lines.push(`#${p.n} ${p.file}${gps ? ` [GPS ${gps[0].toFixed(2)},${gps[1].toFixed(2)}]` : ''}`);
  if (desc) lines.push(`   d: ${desc.slice(0, 160)}`);
  if (m.cats?.length) lines.push(`   c: ${m.cats.slice(0, 5).join('; ').slice(0, 160)}`);
  for (const id of p.ids) {
    const e = byId.get(id);
    lines.push(`   - ${id} | ${e.short}${gps ? ` | ${km(gps[0], gps[1], e.lat, e.lng)}km` : ''}`);
  }
}
writeFileSync(new URL('worklist.txt', import.meta.url), lines.join('\n') + '\n');
console.log(lines.length, 'lines;', list.filter((p) => meta[p.n]?.gps).length, 'photos with GPS');
