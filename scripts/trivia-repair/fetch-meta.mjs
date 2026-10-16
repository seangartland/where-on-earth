// Fetches Commons (or enwiki) file metadata for each distinct bank photo: description, categories, GPS.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const list = JSON.parse(readFileSync(new URL('photo-list.json', import.meta.url)));
const out = new URL('commons-meta.json', import.meta.url);
const meta = existsSync(out) ? JSON.parse(readFileSync(out)) : {};
const UA = { 'User-Agent': 'WhereOnEarthAudit/1.0 (gartland.79@gmail.com)' };
const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
async function batch(host, files) {
  const titles = files.map((f) => 'File:' + f.replace(/_/g, ' ')).join('|');
  const u = `https://${host}/w/api.php?action=query&format=json&redirects=1&prop=imageinfo|categories&cllimit=max&clshow=!hidden&iiprop=extmetadata&iiextmetadatafilter=ImageDescription|ObjectName|GPSLatitude|GPSLongitude&titles=${encodeURIComponent(titles)}`;
  const r = await fetch(u, { headers: UA });
  const j = await r.json();
  const norm = new Map();
  for (const n of j.query.normalized || []) norm.set(n.to, n.from);
  for (const n of j.query.redirects || []) norm.set(n.to, norm.get(n.from) || n.from);
  const res = {};
  for (const p of Object.values(j.query.pages || {})) {
    const em = p.imageinfo?.[0]?.extmetadata || {};
    const key = (norm.get(p.title) || p.title).replace(/^File:/, '');
    res[key] = { missing: 'missing' in p && !p.imageinfo, desc: strip(em.ImageDescription?.value), obj: strip(em.ObjectName?.value),
      gps: em.GPSLatitude ? [Number(em.GPSLatitude.value), Number(em.GPSLongitude.value)] : null,
      cats: (p.categories || []).map((c) => c.title.replace(/^Category:/, '')) };
  }
  return res;
}
const todo = list.filter((p) => !meta[p.n]);
for (let i = 0; i < todo.length; i += 40) {
  const chunk = todo.slice(i, i + 40);
  for (const host of ['commons.wikimedia.org', 'en.wikipedia.org']) {
    const files = chunk.filter((p) => !meta[p.n] && (host === 'commons.wikimedia.org' ? !p.url.includes('/wikipedia/en/') : true));
    if (!files.length) continue;
    const res = await batch(host, files.map((p) => p.file));
    for (const p of files) {
      const r = res[p.file.replace(/_/g, ' ')];
      if (r && !r.missing) meta[p.n] = { host, ...r };
    }
  }
  writeFileSync(out, JSON.stringify(meta, null, 1));
  process.stdout.write(`${Object.keys(meta).length} `);
}
console.log('\nmissing:', list.filter((p) => !meta[p.n]).map((p) => p.n + ':' + p.file).join(', '));
