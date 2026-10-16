// Write sources.json: the Wikipedia article(s) each playable entry was checked
// against (from wiki-cache.json, fetched 2026-10-16), with the article-to-pin distance.
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const cache = JSON.parse(fs.readFileSync(path.join(HERE, 'wiki-cache.json'), 'utf8'));
const out = {};
for (const [id, w] of Object.entries(cache)) out[id] = { title: w.title, extra: w.extra || [], km: w.km ?? null };
fs.writeFileSync(path.join(HERE, 'sources.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out).length, 'entries');
