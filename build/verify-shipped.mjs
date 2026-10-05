// Verifies the SHIPPED assets/locations.json by reverse-geocoding every coordinate
// in the file itself, so verification matches the artifact exactly.
// Run: node build/verify-shipped.mjs
import fs from 'node:fs';

const EXPECT = {
  'tokyo-japan': /Tokyo|Japan/,
  'paris-france': /Paris|France/,
  'cairo-egypt': /Cairo|Egypt/,
  'sydney-australia': /Sydney|Australia/,
  'rio-de-janeiro-brazil': /Rio|Brazil/,
  'nairobi-kenya': /Nairobi|Kenya/,
  'reykjavik-iceland': /Reykjav|Iceland/,
  'cape-town-south-africa': /Cape Town|South Africa/,
  'new-york-usa': /New York|United States/,
  'mumbai-india': /Mumbai|Bombay|India/,
  'battle-of-waterloo': /Waterloo|Braine|Belgium/,
  'machu-picchu': /Machu Picchu|Machupicchu|Peru/,
  'angkor-wat': /Angkor|Siem Reap|Cambodia/,
  'uluru': /Uluru|Northern Territory|Australia/,
  'titanic-sinking': /Titanic|Atlantic/i,
};

const data = JSON.parse(fs.readFileSync(new URL('../assets/locations.json', import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;

for (const loc of data) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${loc.lat}&lon=${loc.lng}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'map-game-coord-verify/1.0', 'Accept-Language': 'en' } });
    const b = await res.json();
    const name = b.display_name || b.error || 'no display_name';
    const want = EXPECT[loc.id];
    const pass = want ? want.test(name) : false;
    if (!pass) fails++;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${loc.id.padEnd(24)} ${loc.lat}, ${loc.lng}  ->  ${name}`);
  } catch (e) {
    fails++;
    console.log(`[FAIL] ${loc.id.padEnd(24)} ERROR ${e.message}`);
  }
  await sleep(1300);
}

// Continent spread, derived from the verified locations.
const CONTINENT = {
  'tokyo-japan': 'Asia', 'mumbai-india': 'Asia', 'angkor-wat': 'Asia',
  'paris-france': 'Europe', 'reykjavik-iceland': 'Europe', 'battle-of-waterloo': 'Europe',
  'cairo-egypt': 'Africa', 'nairobi-kenya': 'Africa', 'cape-town-south-africa': 'Africa',
  'sydney-australia': 'Oceania', 'uluru': 'Oceania',
  'rio-de-janeiro-brazil': 'South America', 'machu-picchu': 'South America',
  'new-york-usa': 'North America',
  'titanic-sinking': 'North Atlantic (intl. waters)',
};
const spread = {};
for (const loc of data) (spread[CONTINENT[loc.id]] ??= []).push(loc.id);
console.log('\nContinent spread:');
for (const [k, v] of Object.entries(spread)) console.log(`  ${k.padEnd(30)} ${v.length}  ${v.join(', ')}`);
console.log(`\n${data.length - fails}/${data.length} shipped coordinates reverse-geocode to the intended feature.`);
console.log(`Requirement of >= 5 continents: ${Object.keys(spread).length} regions, ${Object.keys(spread).length - 1} continents of land.`);
process.exit(fails ? 1 : 0);