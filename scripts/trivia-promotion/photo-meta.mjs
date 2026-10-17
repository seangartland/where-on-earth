// Trivia promotion pilot: fill gate-3 photo metadata (bank-format 500px URL,
// license, author, attribution flag) from Commons for every verdict record
// whose photo gate names a file. Rerunnable; overwrites only those fields.
// Usage: node scripts/trivia-promotion/photo-meta.mjs
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const FILE = path.join(HERE, '../../docs/trivia-promotion-pilot-verdicts.json');
const UA = 'WhereOnEarthPromotionPilot/1.0 (gartland.79 map-game trivia photo sourcing)';
const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const recs = JSON.parse(fs.readFileSync(FILE, 'utf8'));
for (const r of recs) {
  const p = r.gates.photo;
  if (!p || !p.file) continue;
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', format: 'json', formatversion: '2', titles: 'File:' + p.file, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '500' })
    .forEach(([k, v]) => u.searchParams.set(k, v));
  const j = await (await fetch(u, { headers: { 'User-Agent': UA } })).json();
  const ii = j.query.pages[0].imageinfo?.[0];
  if (!ii) throw new Error('no file ' + p.file);
  const m = ii.extmetadata;
  p.url = ii.thumburl.split('?')[0];
  p.license = strip(m.LicenseShortName?.value);
  p.author = strip(m.Artist?.value);
  p.attributionRequired = strip(m.AttributionRequired?.value) !== 'false';
  p.source = ii.descriptionurl;
  console.log(r.id, '|', p.license, '|', p.author, '|', p.url);
}
fs.writeFileSync(FILE, JSON.stringify(recs, null, 1) + '\n');
