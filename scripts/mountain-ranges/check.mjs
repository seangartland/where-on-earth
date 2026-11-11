// Mountain-ranges batch checks over the staged entries, through the game's own extent code.
// Extent sanity: a guess on the spine scores ~0 km (every vertex, every segment midpoint, the pin), and guesses
// 100 km either side of the spine score the true nearest distance (game value = independent brute force, <= 100 km). Also: id and short-name dedupe (raw and
// diacritic-stripped) against the bank, cities, quarantine and removed files; image URL unique across the dataset;
// no montage/collage/placeholder image; no US state named in a clue; banned filler phrases; required fields.
// Usage (from demo/): node scripts/mountain-ranges/check.mjs
import { readFileSync, existsSync } from 'node:fs';

globalThis.location = { search: '' };
const { nearestExtentPoint, setExtentData } = await import('../../src/game/extents.js');
const { distanceKm } = await import('../../src/core/math.js');
const { isPlayableLocation } = await import('../../src/daily.js');

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const staged = read('scripts/mountain-ranges/staged.json');
const extents = { ...read('assets/extents.json') };
for (const [id, s] of Object.entries(staged)) extents[id] = s.extent;
setExtentData(extents);

const others = [];
for (const f of ['assets/locations-landmarks-sol.json', 'assets/locations.json', 'assets/locations-landmarks-quarantine.json',
  'assets/locations-landmarks-removed-2026-10-15.json']) {
  if (existsSync(new URL(`../../${f}`, import.meta.url))) for (const x of read(f)) if (!staged[x.id] || f !== 'assets/locations-landmarks-sol.json') others.push({ ...x, file: f });
}
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const BANNED = /urban center|regional hub|rich history|vibrant culture|recorded by|according to (geonames|wikidata)/i;
const FIELDS = ['id', 'short', 'clue', 'fact', 'lat', 'lng', 'difficulty', 'image', 'country', 'continent', 'sets', 'difficultyWhy', 'category', 'kind', 'extentType'];

function offset(p, km, bearing) {
  const R = 6371.0088, d = km / R, b = bearing * Math.PI / 180, la = p.lat * Math.PI / 180, lo = p.lng * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: la2 * 180 / Math.PI, lng: lo2 * 180 / Math.PI };
}

function bruteKm(line, p) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = { lat: line[i - 1][1], lng: line[i - 1][0] }, b = { lat: line[i][1], lng: line[i][0] };
    const n = Math.max(2, Math.ceil(distanceKm(a, b) / 0.5));
    for (let k = 0; k <= n; k++) best = Math.min(best, distanceKm(p, { lat: a.lat + (b.lat - a.lat) * k / n, lng: a.lng + (b.lng - a.lng) * k / n }));
  }
  return best;
}

let fail = 0;
const allImages = new Map();
for (const x of others) if (x.image) allImages.set(x.image, x.id);
const out = {};
for (const [id, s] of Object.entries(staged)) {
  const e = s.entry, line = s.extent.lines[0], problems = [];
  for (const f of FIELDS) if (!(f in e)) problems.push(`missing ${f}`);
  if (!isPlayableLocation(e)) problems.push('not playable');
  let onMax = 0;
  const probes = line.map(([lng, lat]) => ({ lat, lng }));
  for (let i = 1; i < line.length; i++) probes.push({ lat: (line[i - 1][1] + line[i][1]) / 2, lng: (line[i - 1][0] + line[i][0]) / 2 });
  probes.push({ lat: e.lat, lng: e.lng });
  for (const p of probes) onMax = Math.max(onMax, nearestExtentPoint(e, p).km);
  // Off-spine probe: 100 km perpendicular to the segment holding the pin's nearest point.
  const near = nearestExtentPoint(e, { lat: e.lat, lng: e.lng });
  let seg = 1, best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const m = { lat: (line[i - 1][1] + line[i][1]) / 2, lng: (line[i - 1][0] + line[i][0]) / 2 };
    const d = distanceKm(m, near); if (d < best) { best = d; seg = i; }
  }
  const [a, b] = [line[seg - 1], line[seg]];
  const brg = Math.atan2((b[0] - a[0]) * Math.cos(near.lat * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI;
  const offPts = [90, -90].map((t) => offset(near, 100, brg + t));
  const off = offPts.map((p) => nearestExtentPoint(e, p).km);
  const brute = offPts.map((p) => bruteKm(line, p));
  const pinKm = nearestExtentPoint(e, { lat: e.lat, lng: e.lng }).km;
  if (onMax > 0.5) problems.push(`on-spine guess scores ${onMax.toFixed(3)} km`);
  // Behaves: the game's nearest-point distance matches an independent brute-force nearest distance (spine sampled every
  // ~0.5 km, haversine), is positive, and never exceeds the 100 km offset.
  off.forEach((k, j) => {
    if (!(k > 1 && k <= 100.5 && Math.abs(k - brute[j]) <= Math.max(1, 0.02 * brute[j]))) problems.push(`off-spine guess ${k.toFixed(1)} km vs brute ${brute[j].toFixed(1)} km`);
  });
  if (s.extent.vertices > 60 || line.length !== s.extent.vertices) problems.push(`vertex count ${line.length}/${s.extent.vertices}`);
  for (const x of others) {
    if (x.id === id) problems.push(`duplicate id in ${x.file}`);
    if (fold(x.short || '') === fold(e.short)) problems.push(`duplicate short name ${x.id} in ${x.file}`);
  }
  if (allImages.has(e.image)) problems.push(`image already used by ${allImages.get(e.image)}`);
  allImages.set(e.image, id);
  if (/montage|collage|No_image_available/i.test(e.image)) problems.push('denylisted image');
  // Georgia the country shows its own flag; only a state reading counts.
  for (const st of STATES) if (new RegExp(`\\b${st}\\b`).test(e.clue) && !(st === 'Georgia' && e.clue.includes('\u{1F1EC}\u{1F1EA}'))) problems.push(`clue names US state ${st}`);
  if (BANNED.test(e.clue) || BANNED.test(e.fact)) problems.push('banned phrase');
  out[id] = { onSpineMaxKm: +onMax.toFixed(4), pinKm: +pinKm.toFixed(4), offSpine100Km: off.map((k) => +k.toFixed(1)), bruteKm: brute.map((k) => +k.toFixed(1)), problems };
  if (problems.length) fail++;
  console.log(`${id.padEnd(24)} on-spine max ${onMax.toFixed(4)} km, pin ${pinKm.toFixed(4)} km, 100 km off -> ${off.map((k) => k.toFixed(1)).join(' / ')} km (brute ${brute.map((k) => k.toFixed(1)).join(' / ')}) ${problems.length ? 'FAIL ' + problems.join('; ') : 'ok'}`);
}
console.log(JSON.stringify(out));
console.log(fail ? `FAIL: ${fail} entries` : `PASS: ${Object.keys(staged).length} staged entries`);
process.exit(fail ? 1 : 0);
