const EARTH_RADIUS_KM = 6371.0088;

export function distanceKm(guess, answer) {
  const radians = Math.PI / 180;
  const p1 = guess.lat * radians;
  const p2 = answer.lat * radians;
  const dp = (answer.lat - guess.lat) * radians;
  const dl = (answer.lng - guess.lng) * radians;
  const h = Math.sin(dp / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function scoreForDistance(km) {
  if (km < 25) return 1000;
  return Math.round(1000 * Math.exp(-((km / 3500) ** 1.13)));
}

export function scoreGuess(guess, answer) {
  const distance = distanceKm(guess, answer);
  return { distance, score: scoreForDistance(distance) };
}

export const isBullseye = (distance, score) => distance < 25 && score === 1000;
export const isPostcard = (distance) => distance < 150;
