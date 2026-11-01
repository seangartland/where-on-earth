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
