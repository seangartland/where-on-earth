import fs from 'node:fs';

const SRC = new URL('./cities1000.txt', import.meta.url).pathname;
const OUT = new URL('../../assets/cities.json', import.meta.url).pathname;
const TMP = new URL('./cities.json.tmp', import.meta.url).pathname;
const TARGET = 10000;

// country code -> continent (verification only, not written to output)
const CONTINENT = {
  US:'North America', CA:'North America', MX:'North America', GT:'North America', HN:'North America',
  SV:'North America', NI:'North America', CR:'North America', PA:'North America', CU:'North America',
  DO:'North America', JM:'North America', HT:'North America', BS:'North America', TT:'North America',
  PR:'North America', GL:'North America', BL:'North America', MF:'North America',
  BR:'South America', AR:'South America', CL:'South America', PE:'South America', CO:'South America',
  VE:'South America', EC:'South America', BO:'South America', UY:'South America', PY:'South America',
  GY:'South America', SR:'South America',
  GB:'Europe', FR:'Europe', DE:'Europe', IT:'Europe', ES:'Europe', UA:'Europe', PL:'Europe',
  RO:'Europe', NL:'Europe', BE:'Europe', PT:'Europe', CZ:'Europe', GR:'Europe', SE:'Europe',
  NO:'Europe', FI:'Europe', DK:'Europe', IE:'Europe', AT:'Europe', CH:'Europe', HU:'Europe',
  SK:'Europe', BG:'Europe', HR:'Europe', RS:'Europe', SI:'Europe', LT:'Europe', LV:'Europe',
  EE:'Europe', IS:'Europe', AL:'Europe', BA:'Europe', MK:'Europe', ME:'Europe', MD:'Europe',
  BY:'Europe', RU:'Europe', TR:'Europe', GE:'Europe', AM:'Europe', AZ:'Europe', CY:'Europe',
  MT:'Europe', LU:'Europe', XK:'Europe',
  CN:'Asia', IN:'Asia', ID:'Asia', JP:'Asia', KR:'Asia', PH:'Asia', VN:'Asia', TH:'Asia',
  TR2:'Asia', MM:'Asia', MY:'Asia', BD:'Asia', PK:'Asia', LK:'Asia', NP:'Asia', IR:'Asia',
  IQ:'Asia', SA:'Asia', SY:'Asia', YE:'Asia', JO:'Asia', LB:'Asia', IL:'Asia', KW:'Asia',
  QA:'Asia', BH:'Asia', AE:'Asia', OM:'Asia', UZ:'Asia', KZ:'Asia', KG:'Asia', TJ:'Asia',
  TM:'Asia', MN:'Asia', AF:'Asia', GE2:'Asia',
  EG:'Africa', NG:'Africa', ZA:'Africa', ET:'Africa', KE:'Africa', TZ:'Africa', DZ:'Africa',
  SD:'Africa', MA:'Africa', AO:'Africa', MZ:'Africa', MG:'Africa', GH:'Africa', CI:'Africa',
  CM:'Africa', SN:'Africa', ML:'Africa', BF:'Africa', NE:'Africa', TD:'Africa', SO:'Africa',
  UG:'Africa', ZW:'Africa', ZM:'Africa', BW:'Africa', NA:'Africa', MZ2:'Africa', CD:'Africa',
  UG2:'Africa', RW:'Africa', BI:'Africa', MW:'Africa', GN:'Africa', SL:'Africa', LR:'Africa',
  TG:'Africa', BJ:'Africa', GA:'Africa', GQ:'Africa', SC:'Africa', CV:'Africa', GM:'Africa',
  GW:'Africa', MR:'Africa', EH:'Africa', SD2:'Africa', LY:'Africa', TN:'Africa',
  AU:'Oceania', NZ:'Oceania', PG:'Oceania', FJ:'Oceania', SB:'Oceania', VU:'Oceania',
  NC:'Oceania', WS:'Oceania', TO:'Oceania', KI:'Oceania', FM:'Oceania', MH:'Oceania',
  PW:'Oceania', NR:'Oceania', TV:'Oceania', CK:'Oceania', NU:'Oceania', PF:'Oceania',
  GU:'Oceania', MP:'Oceania',
  AQ:'Antarctica',
};

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const seen = new Map(); // dedupe key -> row
const rows = [];

for (const line of lines) {
  if (!line) continue;
  const f = line.split('\t');
  const fclass = f[6];
  const fcode = f[7];
  if (fclass !== 'P') continue;
  if (fcode === 'STLMT' || fcode === 'PPLS') continue; // islands, prisons
  const pop = Number(f[14]);
  if (!Number.isFinite(pop) || pop <= 0) continue;
  const lat = Number(f[4]);
  const lng = Number(f[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

  const name = (f[1] || f[2] || '').trim();
  if (!name) continue;

  rows.push({ name, lat: +lat.toFixed(4), lng: +lng.toFixed(4), pop, cc: f[8] });
}

// population descending, then name for deterministic ordering
rows.sort((a, b) => (b.pop - a.pop) || a.name.localeCompare(b.name) || a.cc.localeCompare(b.cc));

// drop exact duplicates on (name, rounded coord)
const picked = [];
for (const r of rows) {
  if (picked.length >= TARGET) break;
  const key = `${r.name}|${r.lat.toFixed(2)}|${r.lng.toFixed(2)}`;
  if (seen.has(key)) continue;
  seen.set(key, r);
  picked.push(r);
}

const out = picked.map(({ name, lat, lng, pop }) => ({ name, lat, lng, pop }));
fs.writeFileSync(TMP, JSON.stringify(out));
fs.renameSync(TMP, OUT);

// verification report
const byCont = new Map();
const byCc = new Map();
for (const r of picked) {
  const c = CONTINENT[r.cc] || 'unknown:' + r.cc;
  byCont.set(c, (byCont.get(c) || 0) + 1);
  byCc.set(r.cc, (byCc.get(r.cc) || 0) + 1);
}
console.log('count:', out.length);
console.log('pop range:', out[0].pop, '..', out[out.length - 1].pop);
console.log('top 12:', out.slice(0, 12).map((c) => `${c.name} ${c.pop}`).join(', '));
console.log('lat range:', Math.min(...out.map((c) => c.lat)), Math.max(...out.map((c) => c.lat)));
console.log('lng range:', Math.min(...out.map((c) => c.lng)), Math.max(...out.map((c) => c.lng)));
console.log('continents:');
for (const [c, n] of [...byCont].sort((a, b) => b[1] - a[1])) console.log('  ', c, n);
console.log('top countries:', [...byCc].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([c, n]) => `${c}:${n}`).join(' '));
console.log('bytes:', fs.statSync(OUT).size);
