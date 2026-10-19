// ---------------------------------------------------------------------------
// The Landmark pool. Landmark Survival merged into Survival on 2026-10-18
// (pacing doc): survival.js draws from landmarkPool() directly. The pool is
// also the Passport's Landmarks shelf and the pack's landmark subset.
// ---------------------------------------------------------------------------
import { isPlayableLocation } from '../daily.js';

let host = null;

// The v2 difficultyWhy shape from scripts/validate-landmarks.mjs; its trailing
// level must equal the stored difficulty.
const V2_WHY = /^p(?:1|\.\d{2})(?:\(via [^)]+\))?·fb\d+·K[\d.]+·iso\d+ → \d+(?:\.\d)? → (\d+)$/;

// Pool rule: approved areas have a positive extent; point landmarks retain
// their existing playable-image and measured-v2-rating requirements.
export function isPoolLandmark(item) {
  if (item?.kind === 'landmark') {
    if (!isPlayableLocation(item)) return false;
    const match = V2_WHY.exec(item.difficultyWhy || '');
    return Boolean(match) && Number(match[1]) === item.difficulty;
  }
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
