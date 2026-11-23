export const OPEN_FIELD_BANNER = 'open-field';
export const REMOVED_BANNER_IDS = new Set(['blue-horizon', 'airmail']);

export function bannerId(value) {
  return REMOVED_BANNER_IDS.has(value) ? OPEN_FIELD_BANNER : value || OPEN_FIELD_BANNER;
}
