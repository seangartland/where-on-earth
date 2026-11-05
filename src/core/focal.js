// A per-card vertical focal point overriding the CSS object-position default
// on cover-fit photo surfaces; null when the location has no override.
export function focalObjectPosition(item) {
  return Number.isFinite(item?.focalY) ? `center ${item.focalY}%` : null;
}
