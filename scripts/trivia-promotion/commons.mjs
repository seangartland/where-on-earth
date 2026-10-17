// Trivia promotion pilot: Wikimedia Commons photo search for gate 3.
// Usage:
//   node scripts/trivia-promotion/commons.mjs search "<query>" [limit]
//     lists File: hits (bitmap photos only) with size, license and author
//   node scripts/trivia-promotion/commons.mjs get "<File title>" <out.jpg>
//     prints license, author and the 500px thumb URL in the bank's format,
//     and saves the thumb so it can be viewed before a verdict is given
//   node scripts/trivia-promotion/commons.mjs cat "<Category name>" [limit]
//     lists files in a Commons category
import fs from 'node:fs';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'WhereOnEarthPromotionPilot/1.0 (gartland.79 map-game trivia photo sourcing)';
async function api(params) {
  const u = new URL(API);
  Object.entries({ format: 'json', formatversion: '2', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); } catch {}
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error('api failed ' + u);
}
const strip = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function info(p) {
  const ii = p.imageinfo?.[0]; if (!ii) return null;
  const m = ii.extmetadata || {};
  return { title: p.title, w: ii.width, h: ii.height, mime: ii.mime, license: strip(m.LicenseShortName?.value), attribution: strip(m.AttributionRequired?.value), author: strip(m.Artist?.value).slice(0, 120), date: strip(m.DateTimeOriginal?.value).slice(0, 20), desc: strip(m.ImageDescription?.value).slice(0, 160), thumb: ii.thumburl };
}
const iiprops = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500' };
const [cmd, q, arg] = process.argv.slice(2);
if (cmd === 'search' || cmd === 'cat') {
  const gen = cmd === 'search'
    ? { generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: arg || '15' }
    : { generator: 'categorymembers', gcmtitle: q.startsWith('Category:') ? q : 'Category:' + q, gcmtype: 'file', gcmlimit: arg || '30' };
  const j = await api({ action: 'query', ...gen, ...iiprops });
  const pages = (j.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const x = info(p); if (!x || !/jpeg|png|tiff|webp/.test(x.mime)) continue;
    console.log(`${x.title} | ${x.w}x${x.h} | ${x.license} | ${x.author} | ${x.date} | ${x.desc}`);
  }
} else if (cmd === 'get') {
  const j = await api({ action: 'query', titles: q, ...iiprops });
  const x = info(j.query.pages[0]);
  if (!x) { console.log('NO FILE', q); process.exit(1); }
  // bank format: https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/<file>/500px-<file>
  const url = x.thumb.split("?")[0];
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (arg) fs.writeFileSync(arg, Buffer.from(await r.arrayBuffer()));
  console.log(JSON.stringify({ ...x, url, fetched: r.status }, null, 1));
}
