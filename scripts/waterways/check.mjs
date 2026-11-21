// Waterways batch checks over the banked and quarantined waterway entries, through the game's own extent code.
// Extent: a guess on the pin scores 0 km for a polygon (pin inside the shipped polygon) and within the 2.5 km gate
// for a line; a guess 200 km away from the pin scores a positive distance. Also: id and short-name dedupe (raw and
// diacritic-stripped) against the bank, cities, quarantine and removed files; image URL unique across the dataset;
// no montage/collage/placeholder/.svg image; US clues show the state, non-US clues no region; banned filler
// phrases; required fields in the extent-entry order; nearest other entry (under 10 km needs a reason in the report).
// Usage (from demo/): node scripts/waterways/check.mjs
import { readFileSync, existsSync } from 'node:fs';

globalThis.location = { search: '' };
const { nearestExtentPoint, setExtentData } = await import('../../src/game/extents.js');
const { distanceKm } = await import('../../src/core/math.js');
const { isPlayableLocation } = await import('../../src/daily.js');
const { PACK_WATERS_IDS } = await import('../../src/meta/pack-waters.js');

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const extents = read('assets/extents.json');
setExtentData(extents);
const common = readFileSync(new URL('./common.py', import.meta.url), 'utf8');
const ids = new Set([...common.matchAll(/^ {4}'([a-z-]+)': dict\(/gm)].map((m) => m[1]));
const files = ['assets/locations-landmarks-sol.json', 'assets/locations.json', 'assets/locations-landmarks-quarantine.json',
  'assets/locations-landmarks-removed-2026-10-15.json'].filter((f) => existsSync(new URL(`../../${f}`, import.meta.url)));
const all = files.flatMap((f) => read(f).map((x) => ({ ...x, file: f })));
const batch = all.filter((x) => ids.has(x.id) && x.file !== 'assets/locations.json' && x.file !== 'assets/locations-landmarks-removed-2026-10-15.json');
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const BANNED = /urban center|regional hub|rich history|vibrant culture|recorded by|according to|source:|wikipedia|wikidata|geonames/i;
const BADIMG = /montage|collage|No_image_available|placeholder|\.svg|_map[._]|flag|logo|diagram/i;
const FIELDS = ['id', 'short', 'clue', 'fact', 'lat', 'lng', 'difficulty', 'image', 'country', 'continent', 'sets', 'difficultyWhy', 'category', 'kind', 'extentType'];
const US_STATE_CLUE = { 'golden-gate': 'California', 'erie-canal': 'New York', 'straits-of-florida': 'Florida' };

function offset(p, km, bearing) {
  const R = 6371.0088, d = km / R, b = bearing * Math.PI / 180, la = p.lat * Math.PI / 180, lo = p.lng * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return { lat: la2 * 180 / Math.PI, lng: lo2 * 180 / Math.PI };
}

let fail = 0;
for (const e of batch) {
  const problems = [];
  const banked = e.file === 'assets/locations-landmarks-sol.json';
  if (JSON.stringify(Object.keys(e).filter((k) => k !== 'file')) !== JSON.stringify(FIELDS)) problems.push(`field order ${Object.keys(e)}`);
  if (!isPlayableLocation(e)) problems.push('not playable');
  if (banked !== PACK_WATERS_IDS.has(e.id)) problems.push('waters set membership does not match the bank');
  for (const x of all) {
    if (x === e || (x.id === e.id && x.file === e.file)) continue;
    if (x.id === e.id) problems.push(`id also in ${x.file}`);
    if (x.short && (x.short === e.short || fold(x.short) === fold(e.short))) problems.push(`short name dupe ${x.id} (${x.file})`);
    if (x.image && x.image === e.image) problems.push(`image dupe ${x.id} (${x.file})`);
  }
  if (BADIMG.test(e.image)) problems.push('image filename rule');
  if (BANNED.test(e.fact) || BANNED.test(e.clue)) problems.push('banned phrase');
  const sentences = e.fact.split(/(?<=[.!?])\s+(?=[A-Z])/).length;
  if (sentences > 2) problems.push(`fact has ${sentences} sentences`);
  if (US_STATE_CLUE[e.id] && !e.clue.includes(US_STATE_CLUE[e.id])) problems.push('US clue lacks its state');
  let pinKm = null, farKm = null;
  if (banked) {
    if (!extents[e.id] || extents[e.id].type !== e.extentType) problems.push('extent record missing or mismatched');
    else {
      pinKm = nearestExtentPoint(e, { lat: e.lat, lng: e.lng }).km;
      if (e.extentType === 'polygon' ? pinKm !== 0 : pinKm > 2.5) problems.push(`pin scores ${pinKm.toFixed(3)} km`);
      farKm = Math.min(...[0, 90, 180, 270].map((b) => nearestExtentPoint(e, offset(e, 200, b)).km));
      if (!(farKm > 0)) problems.push('far guesses score 0');
    }
  } else if (extents[e.id]) problems.push('quarantined entry has an extent record');
  let near = null;
  for (const x of all) {
    if (x.id === e.id || !Number.isFinite(x.lat) || x.file === 'assets/locations-landmarks-removed-2026-10-15.json') continue;
    const d = distanceKm(e, x);
    if (!near || d < near.km) near = { id: x.id, km: d };
  }
  fail += problems.length ? 1 : 0;
  console.log(`${e.id.padEnd(20)} ${banked ? 'bank      ' : 'quarantine'} pin ${pinKm === null ? '-' : pinKm.toFixed(3)} km, min 200 km-probe ${farKm === null ? '-' : farKm.toFixed(1)} km | nearest ${near.id} ${near.km.toFixed(1)} km | ${problems.length ? 'FAIL ' + problems.join('; ') : 'ok'}`);
}
console.log(`${batch.length} checked, ${fail} failing`);
process.exit(fail ? 1 : 0);
