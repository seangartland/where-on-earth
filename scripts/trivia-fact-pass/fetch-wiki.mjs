// Trivia fact pass: resolve each playable entry (photo === 'verified') to an
// English Wikipedia article and cache its plain-text extract.
// Resolution: exact title on `short` (redirects followed), else the top search
// hit for `short`. The article's coordinates (when it has any) are compared with
// the entry pin so a wrong article shows up in the worklist.
// Usage: node scripts/trivia-fact-pass/fetch-wiki.mjs [--only id1,id2] [--title id=Title]
// Output: scripts/trivia-fact-pass/wiki-cache.json  { id: {title, pageid, km, text} }
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BANK = path.join(HERE, '../../assets/trivia-bank.json');
const CACHE = path.join(HERE, 'wiki-cache.json');
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'WhereOnEarthFactPass/1.0 (gartland.79 map-game trivia fact check)';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const forced = {};
const extra = {}; // --extra id=Title appends a second article's text (event entries whose pin is a venue)
args.forEach((a, i) => {
  if (a === '--title') { const [id, ...t] = args[i + 1].split('='); forced[id] = t.join('='); }
  if (a === '--extra') { const [id, ...t] = args[i + 1].split('='); (extra[id] ||= []).push(t.join('=')); }
});

const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
const playable = bank.filter(e => e.photo === 'verified');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

async function api(params) {
  const u = new URL(API);
  Object.entries({ format: 'json', formatversion: '2', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (r.ok) return r.json();
    } catch {}
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error('api failed ' + u);
}

function km(a, b, c, d) {
  const R = 6371, t = Math.PI / 180;
  const x = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

async function page(title) {
  const j = await api({ action: 'query', titles: title, redirects: '1', prop: 'extracts|coordinates', explaintext: '1' });
  const p = j.query.pages[0];
  if (!p || p.missing) return null;
  return p;
}

for (const e of playable) {
  if (extra[e.id] && cache[e.id] && !forced[e.id]) {
    for (const t of extra[e.id]) {
      const p = await page(t);
      if (!p) { console.log('MISSING extra', e.id, t); continue; }
      (cache[e.id].extra ||= []).push(p.title);
      cache[e.id].text += `\n\n[[EXTRA ARTICLE: ${p.title}]]\n` + p.extract;
      console.log(e.id, '+', p.title, p.extract.length);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    continue;
  }
  if (only ? !only.has(e.id) : (cache[e.id] && !forced[e.id])) continue;
  let p = forced[e.id] ? await page(forced[e.id]) : await page(e.short);
  if (p && /may refer to|may also refer to/.test((p.extract || '').slice(0, 400))) p = null;
  if (!p) {
    const s = await api({ action: 'query', list: 'search', srsearch: e.short, srlimit: '1' });
    const hit = s.query.search[0];
    if (hit) p = await page(hit.title);
  }
  if (!p) { cache[e.id] = { title: null }; console.log('NONE', e.id); continue; }
  const c = p.coordinates && p.coordinates[0];
  cache[e.id] = { title: p.title, pageid: p.pageid, km: c ? km(e.lat, e.lng, c.lat, c.lon) : null, text: p.extract };
  console.log(e.id, '=>', p.title, c ? km(e.lat, e.lng, c.lat, c.lon) + ' km' : 'no coords', (p.extract || '').length);
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}
fs.writeFileSync(CACHE, JSON.stringify(cache));
