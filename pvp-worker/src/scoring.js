const DEG = Math.PI / 180;

export function distanceKm(a, b) {
  const p1 = a.lat * DEG;
  const p2 = b.lat * DEG;
  const dp = (b.lat - a.lat) * DEG;
  const dl = (b.lng - a.lng) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function distanceScore(km) {
  return 1000 * Math.exp(-((km / 3500) ** 1.13));
}

export function scoreCoordinates(guess, answer) {
  const exactDistanceKm = distanceKm(guess, answer);
  return { exactDistanceKm, distanceKm: Math.round(exactDistanceKm), score: Math.round(distanceScore(exactDistanceKm)) };
}
