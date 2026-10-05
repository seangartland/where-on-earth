// Second, independent cross-check direction: reverse geocode MY exact point and
// check the returned feature matches the intended place.
// Run: node build/reverse-verify.mjs
const POINTS = [
  { id: 'tokyo-japan',        lat: 35.6762,  lng: 139.6503, want: /Tokyo|千代田区|Chiyoda|Japan/i },
  { id: 'paris-france',       lat: 48.8566,  lng: 2.3522,   want: /Paris|France/i },
  { id: 'cairo-egypt',        lat: 30.0444,  lng: 31.2357,  want: /Cairo|al-Qahirah|Egypt/i },
  { id: 'sydney-australia',   lat: -33.8688, lng: 151.2093, want: /Sydney|Australia/i },
  { id: 'rio-de-janeiro',     lat: -22.9068, lng: -43.1729, want: /Rio|Brazil/i },
  { id: 'nairobi-kenya',      lat: -1.2921,  lng: 36.8219,  want: /Nairobi|Kenya/i },
  { id: 'reykjavik-iceland',  lat: 64.1466,  lng: -21.9426, want: /Reykjav[ií]k|Iceland/i },
  { id: 'cape-town',          lat: -33.9249, lng: 18.4241,  want: /Cape Town|South Africa/i },
  { id: 'new-york-usa',       lat: 40.7128,  lng: -74.0060, want: /New York|United States/i },
  { id: 'mumbai-india',       lat: 19.0760,  lng: 72.8777,  want: /Mumbai|Bombay|India/i },
  { id: 'battle-of-waterloo', lat: 50.6808,  lng: 4.4074,   want: /Waterloo|Braine-l'Alleud|Belgium|Belgi/i },
  { id: 'machu-picchu',       lat: -13.1631, lng: -72.5450, want: /Machu Picchu|Aguas Calientes|Peru/i },
  { id: 'angkor-wat',         lat: 13.4125,  lng: 103.8670, want: /Angkor|Siem Reap|Cambodia/i },
  { id: 'uluru',              lat: -25.3444, lng: 131.0369, want: /Uluru|Ayers Rock|Australia/i },
  // Titanic: expected to be open ocean; sanity check is that it is NOT on land
  // in a European/US place. Anything returning a named land feature = wrong.
  { id: 'titanic-sinking',    lat: 41.7317,  lng: -49.9478, want: /Atlantic|ocean|sea|North Atlantic/i },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
for (const p of POINTS) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${p.lat}&lon=${p.lng}`;
  let line;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'map-game-coord-verify/1.0', 'Accept-Language': 'en' } });
    const b = await res.json();
    const name = b.display_name || b.error || 'no display_name';
    const ok = p.want.test(name) ? 'PASS' : 'CHECK';
    if (ok !== 'PASS') fails++;
    line = `[${ok}] ${p.id.padEnd(20)} ${p.lat}, ${p.lng}  ->  ${name}`;
  } catch (e) {
    fails++;
    line = `[FAIL] ${p.id.padEnd(20)} ${p.lat}, ${p.lng}  ->  ERROR ${e.message}`;
  }
  console.log(line);
  await sleep(1300);
}
console.log(`\n${POINTS.length - fails}/${POINTS.length} reverse-geocoded to the intended feature.`);