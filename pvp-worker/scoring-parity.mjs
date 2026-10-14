import { distanceKm, distanceScore, scoreCoordinates } from "./src/scoring.js";

// Literal copy of the production formulas from demo/src/main.js for parity comparison.
const DEG = Math.PI / 180;
function productionDistanceKm(a, b) {
  const p1 = a.lat * DEG;
  const p2 = b.lat * DEG;
  const dp = (b.lat - a.lat) * DEG;
  const dl = (b.lng - a.lng) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function productionDistanceScore(km) { return 1000 * Math.exp(-((km / 3500) ** 1.13)); }

const vectors = [
  [{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }],
  [{ lat: 90, lng: -180 }, { lat: -90, lng: 180 }],
  [{ lat: 0, lng: -180 }, { lat: 0, lng: 180 }],
  [{ lat: -90, lng: -180 }, { lat: 90, lng: 180 }],
  [{ lat: 51.5074, lng: -0.1278 }, { lat: -33.8688, lng: 151.2093 }],
  [{ lat: 89.999999, lng: 179.999999 }, { lat: -89.999999, lng: -179.999999 }],
];
let passed = 0;
for (const [a, b] of vectors) {
  const expectedKm = productionDistanceKm(a, b);
  const actual = scoreCoordinates(a, b);
  const ok = Object.is(distanceKm(a, b), expectedKm) &&
    Object.is(distanceScore(expectedKm), productionDistanceScore(expectedKm)) &&
    actual.distanceKm === Math.round(expectedKm) && actual.score === Math.round(productionDistanceScore(expectedKm));
  if (ok) passed++;
  else console.error("FAIL", { a, b, expectedKm, actual });
}
console.log(`${passed === vectors.length ? "PASS" : "FAIL"}: ${passed}/${vectors.length} scoring vectors`);
if (passed !== vectors.length) process.exitCode = 1;
