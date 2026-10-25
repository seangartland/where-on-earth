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

// Entries in the landmarks file carry a `kind` (landmark, area, settlement)
// and are excluded from launch game modes. Cities carry no kind, so they fall
// through to the older `category` field (or the name check when it is missing).
export function isLaunchExcluded(item) {
  if (item?.kind) return item.kind !== 'city';
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

// One stable queue over the same eligible city pool formerly split across the
// five difficulty bands. The new seed keeps this order independent of every
// legacy band shuffle.
function dailyQueue(list) {
  const queue = list.filter((item) => {
    const difficulty = item.difficulty || 5;
    return !isLandmark(item) && isPlayableLocation(item) && difficulty >= 1 && difficulty <= 10;
  });
  const rand = randomFrom(hashSeed('pool-v2'));
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

function picksForDay(queue, dayNum, recentIds) {
  if (!queue.length) return [];
  const start = ((5 * dayNum % queue.length) + queue.length) % queue.length;
  const usedIds = new Set();
  const usedCountries = new Set();
  const result = [];
  let cursor = start;
  for (let round = 0; round < 5; round++) {
    let pick = null;
    for (let offset = 0; offset < queue.length; offset++) {
      const item = queue[(cursor + offset) % queue.length];
      if (!recentIds.has(item.id) && !usedIds.has(item.id) && !usedCountries.has(item.country)) {
        pick = item;
        cursor = (cursor + offset + 1) % queue.length;
        break;
      }
    }
    if (!pick) {
      for (let offset = 0; offset < queue.length; offset++) {
        const item = queue[(cursor + offset) % queue.length];
        if (!recentIds.has(item.id) && !usedIds.has(item.id)) {
          pick = item;
          cursor = (cursor + offset + 1) % queue.length;
          break;
        }
      }
    }
    if (!pick) break;
    result.push(pick.id);
    usedIds.add(pick.id);
    usedCountries.add(pick.country);
  }
  return result;
}

export function dailyIds(date, list) {
  const dayNum = dayNumber(date);
  const queue = dailyQueue(list);
  if (dayNum < 0) return picksForDay(queue, dayNum, new Set());
  const history = [];
  for (let day = 0; day <= dayNum; day++) {
    const recentIds = new Set(history.flat());
    history.push(picksForDay(queue, day, recentIds));
    if (history.length > 6) history.shift();
  }
  return history[history.length - 1];
}

// A pinned game (assets/daily-pins.json) whose locations all still exist and are
// playable is returned unchanged. Each slot that no longer resolves is replaced,
// in slot order, by the first entry of the single daily queue at or after the
// date's stride start whose id is not already in the game and whose country is
// not used by any other slot. Every other slot stays identical. Returns null if
// a slot has no valid substitute.
export function resolvePinnedIds(date, ids, list) {
  const byId = new Map(list.map((item) => [item.id, item]));
  const usable = (id) => {
    const item = byId.get(id);
    return Boolean(item) && isPlayableLocation(item) && !isLandmark(item);
  };
  if (ids.every(usable)) return ids;
  const queue = dailyQueue(list);
  const dayNum = dayNumber(date);
  const start = queue.length ? ((5 * dayNum % queue.length) + queue.length) % queue.length : 0;
  const out = ids.slice();
  for (let slot = 0; slot < out.length; slot++) {
    if (usable(out[slot])) continue;
    const otherCountries = new Set(out.filter((id, i) => i !== slot && usable(id)).map((id) => byId.get(id).country));
    let sub = null;
    for (let offset = 0; offset < queue.length; offset++) {
      const item = queue[(start + offset) % queue.length];
      if (!out.includes(item.id) && !otherCountries.has(item.country)) {
        sub = item;
        break;
      }
    }
    if (!sub) return null;
    out[slot] = sub.id;
  }
  return out;
}
