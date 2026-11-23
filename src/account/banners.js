export const TRUE_NAVY_BANNER = 'true-navy';
export const REMOVED_BANNER_IDS = new Set(['blue-horizon', 'airmail']);

export function bannerId(value) {
  return REMOVED_BANNER_IDS.has(value) ? TRUE_NAVY_BANNER : value || TRUE_NAVY_BANNER;
}
