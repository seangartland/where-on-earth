// ---------------------------------------------------------------------------
// Friends on the Daily: the numbers shown for a friend's pin. Every distance
// and score is recomputed here from the friend's guess and the answer, with
// the same scoring the local reveal uses; the server never supplies either.
// Pure (no DOM, no globe), so node tests can check it directly.
// ---------------------------------------------------------------------------
import { formatKm } from '../core/format.js';
import { distanceScore, scoringDistanceKm } from './scoring.js';

export const STRIP_CHIPS = 3; // chips before the "+N" overflow

export function friendInitial(name) {
  const first = String(name || '').trim().match(/^./u)?.[0] || '?';
  return first.toLocaleUpperCase();
}

// One row per friend, nearest first. km and score round the exact distance
// the same way revealGuess does for the player's own pin.
export function friendRows(friends, answer) {
  return (friends || [])
    .filter((friend) => Number.isFinite(friend?.guess?.lat) && Number.isFinite(friend?.guess?.lng))
    .map((friend) => {
      const kmExact = scoringDistanceKm(friend.guess, answer);
      return {
        friendId: friend.friendId,
        name: friend.displayName || 'Friend',
        initial: friendInitial(friend.displayName),
        guess: friend.guess,
        kmExact,
        distance: formatKm(Math.round(kmExact)),
        score: Math.round(distanceScore(kmExact)),
      };
    })
    .sort((a, b) => a.kmExact - b.kmExact);
}

// One row per friend who played the date, best total first. Scores are the
// same per-round recomputation friendRows does, summed across the rounds the
// friend has a stored guess for. rounds: [{ locationId, answer }].
export function friendTotals(pins, rounds) {
  const byFriend = new Map();
  for (const round of rounds || []) {
    const friends = pins?.locations?.[round.locationId]?.friends || [];
    for (const row of friendRows(friends, round.answer)) {
      const entry = byFriend.get(row.friendId) || { friendId: row.friendId, name: row.name, initial: row.initial, total: 0, rounds: 0 };
      entry.total += row.score;
      entry.rounds += 1;
      byFriend.set(row.friendId, entry);
    }
  }
  return [...byFriend.values()].sort((a, b) => b.total - a.total);
}

// The results leaderboard: the player ranked by total alongside friends,
// best first, with competition ranks (ties share the better number:
// 1, 2, 2, 4). The player used to be pinned first regardless of score;
// Sean ruled 2026-11-09 that the board must rank honestly.
export function rankLeaderboard(youTotal, totals) {
  const entries = [
    { you: true, name: 'You', initial: friendInitial('You'), total: youTotal },
    ...(totals || []).map((f) => ({ you: false, friendId: f.friendId, name: f.name, initial: f.initial, total: f.total })),
  ].sort((a, b) => b.total - a.total);
  let rank = 0;
  let prev = null;
  return entries.map((entry, i) => {
    if (entry.total !== prev) { rank = i + 1; prev = entry.total; }
    return { ...entry, rank };
  });
}

export function chipText(row) {
  return `${row.name} ${row.distance}`;
}

export function popoverText(row) {
  return `${row.name} · ${row.distance} · ${row.score}`;
}

// The visible chips and the overflow count; expanded shows everyone.
export function stripChips(rows, expanded = false) {
  if (expanded || rows.length <= STRIP_CHIPS) return { chips: rows, more: 0 };
  return { chips: rows.slice(0, STRIP_CHIPS), more: rows.length - STRIP_CHIPS };
}

// The worker stores guesses rounded to 4 decimal places; compare at that grain.
export function sameGuess(a, b) {
  const r = (v) => Math.round(v * 10000);
  return Boolean(a && b) && r(a.lat) === r(b.lat) && r(a.lng) === r(b.lng);
}
