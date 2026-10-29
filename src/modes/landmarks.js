// ---------------------------------------------------------------------------
// The Landmark pool. Landmark Survival merged into Survival on 2026-10-18
// (pacing doc): survival.js draws from landmarkPool() directly. The pool is
// also the Passport's Landmarks shelf and the pack's landmark subset.
// ---------------------------------------------------------------------------
import { isPlayableLocation } from '../daily.js';

let host = null;

// Pool rule: approved areas have a positive extent; point landmarks retain
// their existing playable-image requirement.
export function isPoolLandmark(item) {
  if (item?.kind === 'landmark') return isPlayableLocation(item);
  if (item?.kind === 'area') {
    return isPlayableLocation(item)
      && Object.hasOwn(item, 'extentKm')
      && Number.isFinite(item.extentKm)
      && item.extentKm > 0;
  }
  return false;
}

let poolFrom = null;
let pool = [];
export function landmarkPool() {
  if (host.landmarks !== poolFrom) {
    poolFrom = host.landmarks;
    pool = (poolFrom || []).filter(isPoolLandmark);
  }
  return pool;
}

// Legacy best key from the retired Landmark Survival mode. The merged
// Survival best reads the max of this key and the Classic key (survival.js);
// the key itself is never rewritten or deleted.
export const LANDMARKS_BEST_KEY = 'where-on-earth-best-landmarks-survival';

export function initLandmarks(main) {
  host = main;
}
