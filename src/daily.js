// Daily-game selection: the ONE implementation. main.js imports it to compute
// unpinned dates and to repair pinned ones, and scripts/pin-daily.mjs imports
// the same file at deploy time, so the client and the pin step can never
// derive a game two different ways.
// Plain ES module with no DOM access: it must run in both the browser and node.

export const LANDMARK_TERMS = [
  'temple', 'cathedral', 'church', 'mosque', 'palace', 'castle', 'museum',
  'tower', 'bridge', 'statue', 'monument', 'ruins', 'abbey', 'shrine',
  'fort', 'citadel', 'basilica', 'chapel', 'synagogue', 'pagoda',
  'house of', 'hall of', 'tomb of',
];

// Keep placeholder art in the passport, but never use it for a game target.
// This is intentionally based on the image URL so a real replacement image
// automatically restores the location to every mode.
export function isPlayableLocation(item) {
  if (typeof item?.image !== 'string' || item.image.length === 0 || item.image.includes('No_image_available')) return false;
  // Antarctica is quarantined: the map projection breaks near the pole
  // (pin drops and zoom/swipe become buggy), so these are excluded from play.
  const lat = Number(item?.lat);
  if (Number.isFinite(lat) && lat < -60) return false;
  if (typeof item?.country === 'string' && item.country.toLowerCase().includes('antarctica')) return false;
  return true;
}

// Non-city locations (landmarks, mountains, lakes, etc.) are tagged with a
// category in locations.json and excluded from launch game modes. They stay
// in the DB for future modes (e.g. landmarks mode, nature mode).
export function isLaunchExcluded(item) {
  const cat = item?.category;
  // Fall back to name matching for items missing the category field
  if (!cat) {
    const name = typeof item?.short === 'string' ? item.short.toLowerCase() : '';
    return LANDMARK_TERMS.some((term) => name.includes(term));
  }
  return cat !== 'city';
}

// Legacy alias
export function isLandmark(item) {
  return isLaunchExcluded(item);
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomFrom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Five difficulty bands, one per round: R1 = diff 1-2, R2 = 3-4, R3 = 5-6,
// R4 = 7-8, R5 = 9-10. Each band is a deterministically shuffled queue.
export function bandQueues(list) {
  return [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]].map(([lo, hi], b) => {
    const band = list.filter((item) => !isLandmark(item) && isPlayableLocation(item) && (item.difficulty || 5) >= lo && (item.difficulty || 5) <= hi);
    const rand = randomFrom(hashSeed(`band-${b}`));
    for (let i = band.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [band[i], band[j]] = [band[j], band[i]];
    }
    return band;
  });
}

// Days since a fixed epoch; drives the rotation. The key is parsed as a UTC
// calendar date so the same key gives the same day number in every timezone
// (local-noon parsing put UTC+12..+14 one day behind).
export function dayNumber(date) {
  const epoch = Date.UTC(2026, 9, 1) / 86400000;
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 - epoch;
}

// First entry of `queue` at or after the day's index (wrapping) that passes ok().
function pickFrom(queue, dayNum, ok) {
  const idx = ((dayNum % queue.length) + queue.length) % queue.length;
  for (let i = 0; i < queue.length; i++) {
    const item = queue[(idx + i) % queue.length];
    if (ok(item)) return item;
  }
  return null;
}

export function dailyIds(date, list) {
  // Day N takes index N mod band length in each band's queue, so no location
  // repeats until its whole band is exhausted, and everyone gets the same game.
  // Pick one per band, avoiding duplicate countries across the 5 rounds; if a
  // band has no unused country, its day-index entry is taken anyway.
  const dayNum = dayNumber(date);
  const usedCountries = new Set();
  const result = [];
  for (const queue of bandQueues(list)) {
    if (!queue.length) continue;
    const idx = ((dayNum % queue.length) + queue.length) % queue.length;
    const pick = pickFrom(queue, dayNum, (item) => !usedCountries.has(item.country)) || queue[idx];
    usedCountries.add(pick.country);
    result.push(pick.id);
  }
  return result;
}

// A pinned game (assets/daily-pins.json) whose locations all still exist and are
// playable is returned unchanged. Each slot that no longer resolves is replaced,
// in slot order, by the first entry of that slot's band queue (slot i = band i,
// built from `list`) at or after the date's day index whose id is not already in
// the game and whose country is not used by any other slot. Every other slot
// stays identical. Returns null if a slot has no valid substitute.
export function resolvePinnedIds(date, ids, list) {
  const byId = new Map(list.map((item) => [item.id, item]));
  const usable = (id) => {
    const item = byId.get(id);
    return Boolean(item) && isPlayableLocation(item) && !isLandmark(item);
  };
  if (ids.every(usable)) return ids;
  const queues = bandQueues(list);
  const dayNum = dayNumber(date);
  const out = ids.slice();
  for (let slot = 0; slot < out.length; slot++) {
    if (usable(out[slot])) continue;
    const queue = queues[slot];
    const otherCountries = new Set(out.filter((id, i) => i !== slot && usable(id)).map((id) => byId.get(id).country));
    const sub = queue && queue.length ? pickFrom(queue, dayNum, (item) => !out.includes(item.id) && !otherCountries.has(item.country)) : null;
    if (!sub) return null;
    out[slot] = sub.id;
  }
  return out;
}
