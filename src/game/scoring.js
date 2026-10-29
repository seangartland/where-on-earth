// ---------------------------------------------------------------------------
// Round scoring shared by the local modes (refactor Phase 5): distance to
// points, and the daily weights. The frozen difficulty scorer is separate
// and untouched; great-circle distance is core/math.js distanceKm.
// ---------------------------------------------------------------------------
import { WEIGHTS } from '../core/config.js';
import { distanceKm } from '../core/math.js';
import { nearestExtentPoint } from './extents.js';

export function scoringDistanceKm(guess, target) {
  const extentNear = nearestExtentPoint(target, guess);
  if (extentNear) return extentNear.km;
  const pinDistanceKm = distanceKm(guess, target);
  if (!Object.hasOwn(target, 'extentKm') || !Number.isFinite(target.extentKm) || target.extentKm <= 0) {
    return pinDistanceKm;
  }
  return Math.max(0, pinDistanceKm - target.extentKm);
}

// Stretched-exponential: near-perfect under ~10km, matches MapTap's generous
// mid-range (~980 @ 112km, ~940 @ 301km), and decays gradually toward 0 at
// antipodal distances instead of collapsing by a few hundred km.
export function distanceScore(km) {
  return 1000 * Math.exp(-((km / 3500) ** 1.13));
}

export function scoreGuess(km, round) {
  const base = Math.round(distanceScore(km));
  return Math.round(base * WEIGHTS[round]);
}
