// Cross-checks candidate lat/lng against OpenStreetMap Nominatim (forward geocode).
// Run: node build/verify-coords.mjs
const CANDIDATES = [
  { id: 'tokyo-japan',        q: 'Tokyo, Japan',            lat: 35.6762,  lng: 139.6503, tolKm: 8 },
  { id: 'paris-france',       q: 'Paris, France',           lat: 48.8566,  lng: 2.3522,  tolKm: 6 },
  { id: 'cairo-egypt',        q: 'Cairo, Egypt',            lat: 30.0444,  lng: 31.2357, tolKm: 8 },
  { id: 'sydney-australia',   q: 'Sydney, Australia',       lat: -33.8688, lng: 151.2093, tolKm: 8 },
  { id: 'rio-de-janeiro',     q: 'Rio de Janeiro, Brazil',  lat: -22.9068, lng: -43.1729, tolKm: 8 },
  { id: 'nairobi-kenya',      q: 'Nairobi, Kenya',          lat: -1.2921,  lng: 36.8219, tolKm: 8 },
  { id: 'reykjavik-iceland',  q: 'Reykjavik, Iceland',      lat: 64.1466,  lng: -21.9426, tolKm: 8 },
  { id: 'cape-town',          q: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241, tolKm: 8 },
  { id: 'new-york-usa',       q: 'New York, United States', lat: 40.7128,  lng: -74.0060, tolKm: 12 },
  { id: 'mumbai-india',       q: 'Mumbai, India',           lat: 19.0760,  lng: 72.8777, tolKm: 8 },
  { id: 'battle-of-waterloo', q: "Lion's Mound, Waterloo, Belgium", lat: 50.6808, lng: 4.4074, tolKm: 3 },
  { id: 'machu-picchu',       q: 'Machu Picchu, Peru',      lat: -13.1631, lng: -72.5450, tolKm: 2 },
  { id: 'angkor-wat',         q: 'Angkor Wat, Cambodia',    lat: 13.4125,  lng: 103.8670, tolKm: 2 },
  { id: 'uluru',              q: 'Uluru, Australia',        lat: -25.3444, lng: 131.0369, tolKm: 5 },
];

const R = 6371;
const distKm = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
for (const c of CANDIDATES) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(c.q)}`;
  let row = { id: c.id, mine: `${c.lat}, ${c.lng}`, osm: 'NO RESULT', km: 'n/a', delta: '', ok: 'FAIL' };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'map-game-coord-verify/1.0', 'Accept-Language': 'en' } });
    const body = await res.json();
    if (!body.length) throw new Error('empty result set');
    const hit = { lat: parseFloat(body[0].lat), lng: parseFloat(body[0].lon) };
    const km = distKm({ lat: c.lat, lng: c.lng }, hit);
    const dLat = +(hit.lat - c.lat).toFixed(4);
    const dLng = +(hit.lng - c.lng).toFixed(4);
    row = {
      id: c.id,
      mine: `${c.lat}, ${c.lng}`,
      osm: `${hit.lat}, ${hit.lng}`,
      osmName: body[0].display_name,
      km: km.toFixed(2),
      delta: `dLat ${dLat >= 0 ? '+' : ''}${dLat} / dLng ${dLng >= 0 ? '+' : ''}${dLng}`,
      ok: km <= c.tolKm ? 'PASS' : 'FAIL',
    };
  } catch (e) {
    row.osm = `ERROR: ${e.message}`;
  }
  if (row.ok === 'FAIL') fails++;
  console.log(
    `[${row.ok}] ${row.id.padEnd(20)} mine=${row.mine.padEnd(20)} osm=${String(row.osm).padEnd(22)} ${row.km} km  ${row.delta}`,
  );
  await sleep(1300);
}
console.log(`\n${CANDIDATES.length - fails}/${CANDIDATES.length} within tolerance.`);
process.exit(fails ? 1 : 0);