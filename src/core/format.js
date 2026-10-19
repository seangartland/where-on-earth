// ---------------------------------------------------------------------------
// Formatting shared across screens (refactor Phase 3). Only formatters whose
// output is byte-identical at every call site live here; per-mode share text
// keeps its own wording and is not routed through this file. Phase 5 moved in
// the date keys, location flags, the country key and the shared share-text
// frame (formatGameShare) that several modes already called through main.js.
// ---------------------------------------------------------------------------

// Distance label, e.g. "1,234 km".
export function formatKm(km) {
  return `${km.toLocaleString()} km`;
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// dateKey is the same YYYY-MM-DD shape used as the daily-archive.json keys.
export function formatDailyDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export const COUNTRY_FLAGS = {
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  'Northern Ireland': '🇬🇧',
  Wales: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
  'International Waters': '🌊', Uruguay: '🇺🇾', 'United States': '🇺🇸',
  Suriname: '🇸🇷', Botswana: '🇧🇼', Guyana: '🇬🇾', Ukraine: '🇺🇦',
  Comoros: '🇰🇲', Niue: '🇳🇺', 'Cape Verde': '🇨🇻', Latvia: '🇱🇻',
  'Vatican City': '🇻🇦', Lesotho: '🇱🇸', Brunei: '🇧🇳',
};

export function flagForLocation(item) {
  return item.clue?.match(/\p{Regional_Indicator}{2}/u)?.[0] || COUNTRY_FLAGS[item.country] || '🌍';
}

export const SHARE_URL = 'www.where-on.earth';
export const SHARE_HASHTAG = '#WhereOnEarth';

export function closestGuessLines(results, items) {
  return results
    .map((result, index) => ({ result, item: items[index] }))
    .filter(({ result, item }) => item && Number.isFinite(result.distance))
    .sort((a, b) => a.result.distance - b.result.distance)
    .slice(0, 3)
    .map(({ result, item }) => `${item.short || item.clue}: ${result.distance.toLocaleString()} km`);
}

export function formatGameShare({ title, titleSep = ' — ', headline, streak, streakLabel = 'Best streak', guesses = [], visited, missed, url = SHARE_URL }) {
  const lines = [`Where on Earth?${titleSep}${title}`, headline];
  if (streak != null) lines.push(`${streakLabel}: ${streak.toLocaleString()}`);
  if (guesses.length) lines.push('', ...guesses);
  if (visited != null) lines.push('', `${visited.toLocaleString()} places visited`);
  if (missed) lines.push(`Missed: ${missed}`);
  lines.push('', `${url} ${SHARE_HASHTAG}`);
  return lines.join('\n');
}

// England/Scotland/Wales/Northern Ireland/United Kingdom stay five separate
// rows (Sean, 2026-10-11): this is just the one place that name is read from.
export function countryKey(item) { return item.country; }

// The answer's US state outline key ('US.ID' in the data, 'US-ID' in the
// states geometry), or null. Cities carry a state and show it; landmarks
// deliberately do not (Sean, 2026-10-18: a state reveal would make them too
// easy), so this reads region.outline only, which landmarks do not carry.
export function regionKey(item) {
  const outline = item?.region?.outline;
  if (!outline) return null;
  const key = outline.replace('.', '-');
  return /^US-[A-Z]{2}$/.test(key) ? key : null;
}
