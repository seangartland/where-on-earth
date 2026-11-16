import { isBullseye, isPostcard } from './daily-score.js';

export const DEFAULT_AVATAR = Object.freeze({
  backdrop: 'cream-paper', skinTone: 'tone-4', faceShape: 'oval', eyes: 'open',
  faceDetail: 'clean', facialHair: 'none', hairHeadwear: 'close-crop',
  faceAccessory: 'none', clothing: 'cream-field-shirt', travelAccessory: 'none', frame: 'plain-paper',
});

export const AVATAR_PARTS = Object.freeze({
  backdrop: ['cream-paper', 'atlas-navy', 'ochre-sun'], skinTone: ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-5', 'tone-6'],
  faceShape: ['oval', 'round', 'angular'], eyes: ['open', 'almond', 'round-eyes', 'hooded'],
  faceDetail: ['clean', 'soft-brows', 'bold-brows', 'freckles', 'travel-lines'], facialHair: ['none', 'stubble', 'mustache', 'short-beard', 'full-beard'],
  hairHeadwear: ['close-crop', 'soft-curls', 'coil-crown', 'long-waves', 'center-part', 'gray-sweep', 'newsboy-cap', 'backward-cap', 'teal-wrap'],
  faceAccessory: ['none', 'round-glasses', 'square-glasses'], clothing: ['cream-field-shirt', 'ochre-scarf', 'atlas-jacket', 'route-jacket', 'map-shirt'],
  travelAccessory: ['none', 'backpack-straps', 'cream-headphones', 'camera'], frame: ['plain-paper', 'postmark'],
});

export const ACHIEVEMENTS = Object.freeze([
  ['first-departure', 'consistency', 'First Departure', 'Complete 1 Daily', 'title:day-tripper', (s) => s.dailies >= 1],
  ['return-ticket', 'consistency', 'Return Ticket', 'Reach a 3-day streak', 'card:return-ticket', (s) => s.bestStreak >= 3],
  ['one-week-abroad', 'consistency', 'One Week Abroad', 'Reach a 7-day streak', 'title:weekender', (s) => s.bestStreak >= 7],
  ['regular-route', 'consistency', 'Regular Route', 'Complete 25 Dailies', 'card:regular-route', (s) => s.dailies >= 25],
  ['no-fixed-address', 'consistency', 'No Fixed Address', 'Reach a 30-day streak', 'title:globetrotter', (s) => s.bestStreak >= 30],
  ['seasoned-traveler', 'consistency', 'Seasoned Traveler', 'Complete 100 Dailies', 'card:seasoned-traveler', (s) => s.dailies >= 100],
  ['postmarked', 'precision', 'Postmarked', 'Earn 1 Daily postcard', 'title:postmarked', (s) => s.postcards >= 1],
  ['right-on-the-map', 'precision', 'Right on the Map', 'Earn 1 bullseye', 'card:right-on-the-map', (s) => s.bullseyes >= 1],
  ['sharp-eye', 'precision', 'Sharp Eye', 'Earn 10 bullseyes', 'title:sharp-eye', (s) => s.bullseyes >= 10],
  ['five-star-landing', 'precision', 'Five-Star Landing', 'Earn postcards on all 5 rounds in one Daily', 'card:five-star-landing', (s) => s.fiveStar >= 1],
  ['perfect-itinerary', 'precision', 'Perfect Itinerary', 'Score 5,000 on one Daily', 'title:dead-reckoner', (s) => s.perfect >= 1],
  ['high-flyer', 'precision', 'High-Flyer', 'Score 4,500 on 10 Dailies', 'card:high-flyer', (s) => s.highFlyers >= 10],
  ['new-stamp', 'breadth', 'New Stamp', 'Visit 5 countries', 'frame:five-stamp', (s) => s.countries >= 5],
  ['border-crosser', 'breadth', 'Border Crosser', 'Visit 25 countries', 'title:border-crosser', (s) => s.countries >= 25],
  ['worldly', 'breadth', 'Worldly', 'Visit 50 countries', 'card:worldly', (s) => s.countries >= 50],
  ['continental-breakfast', 'breadth', 'Continental Breakfast', 'Visit 3 continents', 'title:early-explorer', (s) => s.continents >= 3],
  ['around-the-world', 'breadth', 'Around the World', 'Visit every represented game continent', 'card:around-the-world', (s) => s.continents >= s.representedContinents && s.representedContinents > 0],
  ['frequent-flyer', 'breadth', 'Frequent Flyer', 'Visit 3 countries on 10 Dailies', 'title:frequent-flyer', (s) => s.multiCountryDailies >= 10],
]);

export function xpForCompletion(total, rounds) {
  const postcards = rounds.filter((r) => isPostcard(r.distance_km)).length;
  const bullseyes = rounds.filter((r) => isBullseye(r.distance_km, r.score)).length;
  return { completion: 100, score: Math.min(50, Math.floor(total / 100)), postcards: Math.min(25, postcards * 5), bullseyes: Math.min(15, bullseyes * 3) };
}
export function levelForXp(xp) { let level = 1; let remaining = Math.max(0, xp); while (remaining >= 100 + 20 * (level - 1)) { remaining -= 100 + 20 * (level - 1); level += 1; } return level; }
export function xpAtLevel(level) { return level <= 1 ? 0 : (level - 1) * (100 + 10 * (level - 2)); }
export function validateAvatar(value, level) {
  if (!value || typeof value !== 'object') return null;
  const avatar = {};
  for (const [slot, parts] of Object.entries(AVATAR_PARTS)) {
    const selected = value[slot] || DEFAULT_AVATAR[slot];
    if (!parts.includes(selected) || (slot === 'frame' && selected === 'postmark' && level < 10)) return null;
    avatar[slot] = selected;
  }
  return avatar;
}
export function ownsIdentity(type, id, level, earned, levelTwoTitle = null) {
  const defaults = { title: ['traveler'], card: ['blue-horizon'], frame: ['plain-paper'] };
  if (defaults[type]?.includes(id)) return true;
  if (type === 'title' && ['window-seat', 'aisle-seat'].includes(id)) return level >= 5 || (level >= 2 && id === levelTwoTitle);
  if (type === 'card' && id === 'airmail') return level >= 5;
  if (type === 'frame' && id === 'postmark') return level >= 10;
  return earned.has(`${type}:${id}`);
}
export function communityPercentage(eligible, earners) {
  if (eligible < 50 || earners < 1) return null;
  const raw = (earners * 100) / eligible;
  return raw < 1 ? '<1%' : `${Math.round(raw)}%`;
}
export async function communityPercentages(env) {
  // Compute from one read-time snapshot instead of caching absolute counts.
  // This avoids a late overlapping completion writing an older snapshot.
  const eligible = Number((await env.DB.prepare('SELECT COUNT(DISTINCT account_id) AS n FROM canonical_daily_completions').first())?.n || 0);
  const rows = await env.DB.prepare('SELECT achievement_id, COUNT(DISTINCT account_id) AS n FROM user_achievements GROUP BY achievement_id').all();
  return new Map((rows.results || []).map((row) => [row.achievement_id, communityPercentage(eligible, Number(row.n))]).filter(([, percentage]) => percentage));
}
function achievementProgress(id, s) {
  const values = {
    'first-departure': [s.dailies, 1, 'Dailies'], 'return-ticket': [s.bestStreak, 3, 'Day streak'], 'one-week-abroad': [s.bestStreak, 7, 'Day streak'], 'regular-route': [s.dailies, 25, 'Dailies'], 'no-fixed-address': [s.bestStreak, 30, 'Day streak'], 'seasoned-traveler': [s.dailies, 100, 'Dailies'],
    postmarked: [s.postcards, 1, 'Postcards'], 'right-on-the-map': [s.bullseyes, 1, 'Bullseyes'], 'sharp-eye': [s.bullseyes, 10, 'Bullseyes'], 'five-star-landing': [s.fiveStar, 1, 'Five-star Dailies'], 'perfect-itinerary': [s.perfect, 1, 'Perfect Dailies'], 'high-flyer': [s.highFlyers, 10, 'High-score Dailies'],
    'new-stamp': [s.countries, 5, 'Countries'], 'border-crosser': [s.countries, 25, 'Countries'], worldly: [s.countries, 50, 'Countries'], 'continental-breakfast': [s.continents, 3, 'Continents'], 'around-the-world': [s.continents, s.representedContinents, 'Continents'], 'frequent-flyer': [s.multiCountryDailies, 10, 'Multi-country Dailies'],
  };
  const [current, target, label] = values[id] || [0, 0, 'Progress'];
  return { current, target, label };
}
async function stats(env, accountId) {
  const completions = (await env.DB.prepare('SELECT daily_date, total_score FROM canonical_daily_completions WHERE account_id = ? ORDER BY daily_date').bind(accountId).all()).results || [];
  const rounds = (await env.DB.prepare('SELECT daily_date, distance_km, score, country, continent FROM canonical_daily_rounds WHERE account_id = ?').bind(accountId).all()).results || [];
  const byDate = new Map(); for (const round of rounds) (byDate.get(round.daily_date) || (byDate.set(round.daily_date, []), byDate.get(round.daily_date))).push(round);
  let bestStreak = 0; let run = 0; let previous = null;
  for (const row of completions) { run = previous && Date.parse(`${row.daily_date}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === 86400000 ? run + 1 : 1; bestStreak = Math.max(bestStreak, run); previous = row.daily_date; }
  const countries = new Set(rounds.map((r) => r.country)); const continents = new Set(rounds.map((r) => r.continent));
  const represented = (await env.DB.prepare('SELECT COUNT(DISTINCT continent) AS n FROM daily_locations').first())?.n || 0;
  return { dailies: completions.length, totalScore: completions.reduce((n, r) => n + r.total_score, 0), bestScore: Math.max(0, ...completions.map((r) => r.total_score)), bestStreak, bullseyes: rounds.filter((r) => isBullseye(r.distance_km, r.score)).length, postcards: rounds.filter((r) => isPostcard(r.distance_km)).length, countries: countries.size, continents: continents.size, representedContinents: Number(represented), fiveStar: [...byDate.values()].filter((rs) => rs.length === 5 && rs.every((r) => isPostcard(r.distance_km))).length, perfect: completions.filter((r) => r.total_score === 5000).length, highFlyers: completions.filter((r) => r.total_score >= 4500).length, multiCountryDailies: [...byDate.values()].filter((rs) => new Set(rs.map((r) => r.country)).size >= 3).length };
}
export async function processCompletion(env, accountId, date, now = Date.now()) {
  const completion = await env.DB.prepare('SELECT total_score FROM canonical_daily_completions WHERE account_id = ? AND daily_date = ?').bind(accountId, date).first();
  if (!completion) return null;
  const rounds = (await env.DB.prepare('SELECT distance_km, score FROM canonical_daily_rounds WHERE account_id = ? AND daily_date = ?').bind(accountId, date).all()).results || [];
  if (rounds.length !== 5) return null;
  const awards = xpForCompletion(completion.total_score, rounds);
  await env.DB.batch(Object.entries(awards).map(([sourceType, amount]) => env.DB.prepare('INSERT OR IGNORE INTO xp_ledger (account_id, source_type, source_key, amount, created_at) VALUES (?, ?, ?, ?, ?)').bind(accountId, sourceType, `daily:${date}:${sourceType}`, amount, now)));
  const snapshot = await stats(env, accountId);
  const statements = ACHIEVEMENTS.filter(([, , , , , condition]) => condition(snapshot)).map(([id]) => env.DB.prepare('INSERT OR IGNORE INTO user_achievements (account_id, achievement_id, earned_at, qualifying_key) VALUES (?, ?, ?, ?)').bind(accountId, id, now, `daily:${date}`));
  if (statements.length) await env.DB.batch(statements);
  return awards;
}
export async function progressionProfile(env, accountId) {
  const xp = Number((await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_ledger WHERE account_id = ?').bind(accountId).first())?.xp || 0);
  const level = levelForXp(xp); const summary = await stats(env, accountId);
  const loadout = await env.DB.prepare(`SELECT l.title_id, l.card_id, l.avatar_json,
    c.title_id AS level_two_title FROM profile_loadouts l
    LEFT JOIN level_two_title_choices c ON c.account_id = l.account_id
    WHERE l.account_id = ?`).bind(accountId).first();
  const account = await env.DB.prepare('SELECT display_name FROM profiles WHERE account_id = ?').bind(accountId).first();
  const achievements = (await env.DB.prepare('SELECT achievement_id, earned_at FROM user_achievements WHERE account_id = ? ORDER BY earned_at DESC').bind(accountId).all()).results || [];
  const community = await communityPercentages(env);
  return { displayName: account?.display_name || 'Traveler', level, xpToNext: 100 + 20 * (level - 1) - (xp - xpAtLevel(level)), stats: { dailies: summary.dailies, averageScore: summary.dailies ? Math.round(summary.totalScore / summary.dailies) : 0, bestScore: summary.bestScore, bullseyes: summary.bullseyes, postcards: summary.postcards, bestStreak: summary.bestStreak, countries: summary.countries }, loadout: { titleId: loadout?.title_id || 'traveler', cardId: loadout?.card_id || 'blue-horizon', avatar: loadout ? JSON.parse(loadout.avatar_json) : DEFAULT_AVATAR, levelTwoTitle: loadout?.level_two_title || null }, achievements: achievements.map((row) => ({ id: row.achievement_id, earnedAt: row.earned_at })), achievementDefinitions: ACHIEVEMENTS.map(([id, category, name, condition, reward]) => ({ id, category, name, condition, reward, progress: achievementProgress(id, summary), ...(community.get(id) ? { communityPercentage: community.get(id) } : {}) })), progressionStartsAt: 'first canonical Daily' };
}
