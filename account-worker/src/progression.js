import { isBullseye, isPostcard } from './daily-score.js';

export const SEAL_DISCS = Object.freeze(['navy', 'burgundy', 'forest', 'charcoal']);
export const SEAL_MOTIFS = Object.freeze({ globe: null, plane: 'frequent-flyer', compass: 'border-crosser', camera: 'postmarked', mountain: 'around-the-world', star: 'new-stamp' });
export const DEFAULT_SEAL = Object.freeze({ v: 2, initials: null, disc: 'navy', motif: 'globe', ring: 'level', topper: null });
export const THANKSGIVING_2026_WINDOW = Object.freeze({ month: 11, startDay: 25, endDay: 29 });
export const CHRISTMAS_2026_WINDOW = Object.freeze({ month: 12, startDay: 20, endDay: 26 });
// Kept as the public name used by the first seasonal drop.
export const HOLIDAY_TOPPER_WINDOW = CHRISTMAS_2026_WINDOW;
const SEASONAL_TOPPER_ACHIEVEMENTS = Object.freeze({ 'santa-hat': 'holiday-santa', antlers: 'holiday-antlers', 'leaf-cluster': 'thanksgiving-2026-leaf-cluster' });

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
  ['new-stamp', 'breadth', 'New Stamp', 'Visit 5 countries', 'motif:star', (s) => s.countries >= 5],
  ['border-crosser', 'breadth', 'Border Crosser', 'Visit 25 countries', 'title:border-crosser', (s) => s.countries >= 25],
  ['worldly', 'breadth', 'Worldly', 'Visit 50 countries', 'card:worldly', (s) => s.countries >= 50],
  ['continental-breakfast', 'breadth', 'Continental Breakfast', 'Visit 3 continents', 'title:early-explorer', (s) => s.continents >= 3],
  ['around-the-world', 'breadth', 'Around the World', 'Visit every represented game continent', 'card:around-the-world', (s) => s.continents >= s.representedContinents && s.representedContinents > 0],
  ['frequent-flyer', 'breadth', 'Frequent Flyer', 'Visit 3 countries on 10 Dailies', 'title:frequent-flyer', (s) => s.multiCountryDailies >= 10],
  ['plus-one', 'consistency', 'Plus One', 'Refer 1 friend', null, (s) => s.referrals >= 1],
  ['travel-agent', 'consistency', 'Travel Agent', 'Refer 3 friends', null, (s) => s.referrals >= 3],
  ['tour-guide', 'consistency', 'Tour Guide', 'Refer 5 friends', null, (s) => s.referrals >= 5],
  ['holiday-santa', 'seasonal', 'Holiday Hat', 'Complete a Daily December 20–26', 'topper:santa-hat', () => false],
  ['holiday-antlers', 'seasonal', 'Holiday Antlers', 'Complete a Daily December 20–26', 'topper:antlers', () => false],
  ['thanksgiving-2026-leaf-cluster', 'seasonal', 'Thanksgiving 2026: Leaf Cluster', 'Complete a Daily November 25–29', 'topper:leaf-cluster', () => false],
  ['thanksgiving-2026-harvest', 'seasonal', 'Thanksgiving 2026: Harvest', 'Complete a Daily November 25–29', 'card:harvest', () => false],
  ['thanksgiving-2026-grateful-traveler', 'seasonal', 'Thanksgiving 2026: Grateful Traveler', 'Complete a Daily November 25–29', 'title:grateful-traveler', () => false],
  ['christmas-2026-winter-post', 'seasonal', 'Christmas 2026: Winter Post', 'Complete a Daily December 20–26', 'card:winter-post', () => false],
  ['christmas-2026-sleigh-captain', 'seasonal', 'Christmas 2026: Sleigh Captain', 'Complete a Daily December 20–26', 'title:sleigh-captain', () => false],
]);

export function xpForCompletion(total, rounds) {
  const postcards = rounds.filter((r) => isPostcard(r.distance_km)).length;
  const bullseyes = rounds.filter((r) => isBullseye(r.distance_km, r.score)).length;
  const base = 100; const score = Math.min(50, Math.floor(total / 100));
  const postcardXp = Math.min(25, postcards * 5); const bullseyeXp = Math.min(15, bullseyes * 3);
  return { base, score, postcards: postcardXp, bullseyes: bullseyeXp, total: base + score + postcardXp + bullseyeXp };
}
export function levelForXp(xp) { let level = 1; let remaining = Math.max(0, xp); while (remaining >= 100 + 20 * (level - 1)) { remaining -= 100 + 20 * (level - 1); level += 1; } return level; }
export function xpAtLevel(level) { return level <= 1 ? 0 : (level - 1) * (100 + 10 * (level - 2)); }
export function validateSeal(value, earnedIds, level = 1) {
  if (!value || typeof value !== 'object') return null;
  if ('backdrop' in value || 'skinTone' in value || (value.v != null && value.v !== 2)) return null;
  const disc = value.disc || DEFAULT_SEAL.disc; const motif = value.motif || DEFAULT_SEAL.motif; const ring = value.ring || DEFAULT_SEAL.ring; const topper = value.topper || null;
  if (!SEAL_DISCS.includes(disc) || !Object.hasOwn(SEAL_MOTIFS, motif) || (SEAL_MOTIFS[motif] && !earnedIds?.has(SEAL_MOTIFS[motif]))) return null;
  if (!['level', 'bronze', 'silver', 'gold'].includes(ring) || (ring === 'silver' && level < 5) || (ring === 'gold' && level < 10)) return null;
  if (!Object.hasOwn(SEASONAL_TOPPER_ACHIEVEMENTS, topper) && topper !== null) return null;
  if (topper && !earnedIds?.has(SEASONAL_TOPPER_ACHIEVEMENTS[topper])) return null;
  if (value.initials != null && (typeof value.initials !== 'string' || !/^[A-Za-z]{1,2}$/.test(value.initials))) return null;
  return { v: 2, initials: value.initials == null ? null : value.initials.toUpperCase(), disc, motif, ring, topper };
}
export function normalizeSeal(value, earnedIds, level = null) {
  try {
    const stored = typeof value === 'string' ? JSON.parse(value) : value;
    return stored?.backdrop || stored?.skinTone ? DEFAULT_SEAL : validateSeal(stored, earnedIds, level == null ? Infinity : level) || DEFAULT_SEAL;
  } catch { return DEFAULT_SEAL; }
}
function isSeasonalDate(date, window, now = Date.now()) {
  const year = new Date(now).getUTCFullYear();
  const start = `${year}-${String(window.month).padStart(2, '0')}-${String(window.startDay).padStart(2, '0')}`;
  const end = `${year}-${String(window.month).padStart(2, '0')}-${String(window.endDay).padStart(2, '0')}`;
  return date >= start && date <= end;
}
export function isThanksgiving2026Date(date, now = Date.now()) { return isSeasonalDate(date, THANKSGIVING_2026_WINDOW, now); }
export function isHolidayTopperDate(date, now = Date.now()) { return isSeasonalDate(date, CHRISTMAS_2026_WINDOW, now); }
export function ownsIdentity(type, id, level, earned, levelTwoTitle = null) {
  const defaults = { title: ['traveler'], card: ['blue-horizon'] };
  if (defaults[type]?.includes(id)) return true;
  if (type === 'title' && ['window-seat', 'aisle-seat'].includes(id)) return level >= 5 || (level >= 2 && id === levelTwoTitle);
  if (type === 'card' && id === 'airmail') return level >= 5;
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
    'plus-one': [s.referrals, 1, 'Referrals'], 'travel-agent': [s.referrals, 3, 'Referrals'], 'tour-guide': [s.referrals, 5, 'Referrals'],
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
  const referrals = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM referral_credits WHERE inviter_id = ? AND status = 'paid'`).bind(accountId).first())?.n || 0);
  return { dailies: completions.length, totalScore: completions.reduce((n, r) => n + r.total_score, 0), bestScore: Math.max(0, ...completions.map((r) => r.total_score)), bestStreak, bullseyes: rounds.filter((r) => isBullseye(r.distance_km, r.score)).length, postcards: rounds.filter((r) => isPostcard(r.distance_km)).length, countries: countries.size, continents: continents.size, representedContinents: Number(represented), fiveStar: [...byDate.values()].filter((rs) => rs.length === 5 && rs.every((r) => isPostcard(r.distance_km))).length, perfect: completions.filter((r) => r.total_score === 5000).length, highFlyers: completions.filter((r) => r.total_score >= 4500).length, multiCountryDailies: [...byDate.values()].filter((rs) => new Set(rs.map((r) => r.country)).size >= 3).length, referrals };
}
export async function processCompletion(env, accountId, date, now = Date.now()) {
  const completion = await env.DB.prepare('SELECT total_score FROM canonical_daily_completions WHERE account_id = ? AND daily_date = ?').bind(accountId, date).first();
  if (!completion) return null;
  const rounds = (await env.DB.prepare('SELECT distance_km, score FROM canonical_daily_rounds WHERE account_id = ? AND daily_date = ?').bind(accountId, date).all()).results || [];
  if (rounds.length !== 5) return null;
  const awards = xpForCompletion(completion.total_score, rounds);
  const xpBefore = Number((await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_ledger WHERE account_id = ?').bind(accountId).first())?.xp || 0);
  const ledger = { completion: awards.base, score: awards.score, postcards: awards.postcards, bullseyes: awards.bullseyes };
  await env.DB.batch(Object.entries(ledger).map(([sourceType, amount]) => env.DB.prepare('INSERT OR IGNORE INTO xp_ledger (account_id, source_type, source_key, amount, created_at) VALUES (?, ?, ?, ?, ?)').bind(accountId, sourceType, `daily:${date}:${sourceType}`, amount, now)));
  const xpAfter = Number((await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_ledger WHERE account_id = ?').bind(accountId).first())?.xp || 0);
  const snapshot = await stats(env, accountId);
  const holidayIds = new Set();
  if (isThanksgiving2026Date(date, now)) ['thanksgiving-2026-leaf-cluster', 'thanksgiving-2026-harvest', 'thanksgiving-2026-grateful-traveler'].forEach((id) => holidayIds.add(id));
  if (isHolidayTopperDate(date, now)) ['holiday-santa', 'holiday-antlers', 'christmas-2026-winter-post', 'christmas-2026-sleigh-captain'].forEach((id) => holidayIds.add(id));
  const statements = ACHIEVEMENTS.filter(([id, , , , , condition]) => holidayIds.has(id) || condition(snapshot)).map(([id]) => env.DB.prepare('INSERT OR IGNORE INTO user_achievements (account_id, achievement_id, earned_at, qualifying_key) VALUES (?, ?, ?, ?)').bind(accountId, id, now, `daily:${date}`));
  if (statements.length) await env.DB.batch(statements);
  if (xpAfter === xpBefore) return null;
  return { ...awards, xpBefore, xpAfter, levelBefore: levelForXp(xpBefore), levelAfter: levelForXp(xpAfter) };
}
export async function processReferralPayout(env, inviteeId, now = Date.now()) {
  const completions = Number((await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM canonical_daily_completions WHERE account_id = ?',
  ).bind(inviteeId).first())?.n || 0);
  if (completions !== 1) return null;
  const credit = await env.DB.prepare(
    `SELECT inviter_id FROM referral_credits WHERE invitee_id = ? AND status = 'pending'`,
  ).bind(inviteeId).first();
  if (!credit) return null;
  const updated = await env.DB.prepare(`UPDATE referral_credits SET status = 'paid', paid_at = ?
    WHERE invitee_id = ? AND status = 'pending'
    AND (SELECT COUNT(*) FROM referral_credits WHERE inviter_id = ? AND status = 'paid') < 5`)
    .bind(now, inviteeId, credit.inviter_id).run();
  if (updated.meta.changes !== 1) return null;
  await env.DB.prepare(`INSERT OR IGNORE INTO xp_ledger (account_id, source_type, source_key, amount, created_at)
    VALUES (?, 'referral', ?, 25, ?)`).bind(credit.inviter_id, `referral:${inviteeId}`, now).run();
  const snapshot = await stats(env, credit.inviter_id);
  const statements = ACHIEVEMENTS.filter(([, , , , , condition]) => condition(snapshot))
    .map(([achievementId]) => env.DB.prepare(
      'INSERT OR IGNORE INTO user_achievements (account_id, achievement_id, earned_at, qualifying_key) VALUES (?, ?, ?, ?)',
    ).bind(credit.inviter_id, achievementId, now, `referral:${inviteeId}`));
  if (statements.length) await env.DB.batch(statements);
  return { inviterId: credit.inviter_id, xp: 25 };
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
  const avatar = normalizeSeal(loadout?.avatar_json, new Set(achievements.map(({ achievement_id }) => achievement_id)), level);
  const xpIntoLevel = xp - xpAtLevel(level); const levelSpan = 100 + 20 * (level - 1);
  return { displayName: account?.display_name || 'Traveler', level, totalXp: xp, xpIntoLevel, levelSpan, xpToNext: levelSpan - xpIntoLevel, stats: { dailies: summary.dailies, averageScore: summary.dailies ? Math.round(summary.totalScore / summary.dailies) : 0, bestScore: summary.bestScore, bullseyes: summary.bullseyes, postcards: summary.postcards, bestStreak: summary.bestStreak, countries: summary.countries, referrals: summary.referrals }, loadout: { titleId: loadout?.title_id || 'traveler', cardId: loadout?.card_id || 'blue-horizon', avatar, levelTwoTitle: loadout?.level_two_title || null }, achievements: achievements.map((row) => ({ id: row.achievement_id, earnedAt: row.earned_at })), achievementDefinitions: ACHIEVEMENTS.map(([id, category, name, condition, reward]) => ({ id, category, name, condition, reward, progress: achievementProgress(id, summary), ...(community.get(id) ? { communityPercentage: community.get(id) } : {}) })), progressionStartsAt: 'first canonical Daily' };
}
