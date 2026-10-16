// Lists each distinct bank photo with the entries that use it (worklist for the verdict pass).
import { readFileSync, writeFileSync } from 'node:fs';
const bank = JSON.parse(readFileSync(new URL('../../assets/trivia-bank.json', import.meta.url)));
export function photoFile(url) {
  const u = url.split('?')[0];
  const parts = u.split('/');
  let name;
  if (u.includes('Special:Redirect/file/')) name = u.split('Special:Redirect/file/')[1];
  else if (u.includes('/thumb/')) name = parts[parts.length - 2];
  else name = parts[parts.length - 1];
  try { return decodeURIComponent(name); } catch { return name; }
}
const groups = new Map();
for (const e of bank) {
  if (!e.image) continue;
  if (!groups.has(e.image)) groups.set(e.image, []);
  groups.get(e.image).push(e);
}
const list = [...groups].map(([url, es], i) => ({ n: i + 1, url, file: photoFile(url), ids: es.map((e) => e.id) }));
if (process.argv[1] && process.argv[1].endsWith('photo-list.mjs')) {
  writeFileSync(new URL('photo-list.json', import.meta.url), JSON.stringify(list, null, 1));
  const lines = list.map((p) => `#${p.n} ${p.file}\n` + groups.get(p.url).map((e) => `   ${e.id} | ${e.short} | ${(e.fact || '').slice(0, 70)}`).join('\n'));
  writeFileSync(new URL('photo-list.txt', import.meta.url), lines.join('\n') + '\n');
  console.log(list.length, 'photos');
}
