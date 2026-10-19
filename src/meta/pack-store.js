// ---------------------------------------------------------------------------
// The Daily postcard pack store (docs/daily-pack-spec.md, 2b and 2c): today's
// pack only, saved under PACK_KEY. A pack is three distinct ids from the pool
// (cities plus the pack's landmark subset), one of them always a landmark
// (pacing doc, 2026-10-18), generated on the first tap of
// a new date and written before the first clue, so a reload cannot reroll it.
// A record from any other date reads as an empty record for today: unplayed
// cards from a past date are forfeit, as the Daily's are. No history, no
// streak, no stats. The pack round and screen live in src/modes/pack.js.
// ---------------------------------------------------------------------------
import { PACK_KEY } from '../core/config.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { localDateKey } from '../core/format.js';
import { isPlayableLocation } from '../daily.js';

export const PACK_CARDS = 3;

// landmarks is the Landmark pool (landmarkPool()). The live pool also admits
// extent-aware areas now; the approved pack decision remains the actual
// point landmarks only, so keep those area entries out of this pool.
export function packPool(locations, landmarks) {
  return [...locations.filter(isPlayableLocation), ...landmarks.filter((item) => item.kind === 'landmark')];
}

const isPack = (pack) => Array.isArray(pack?.ids) && pack.ids.length === PACK_CARDS
  && pack.ids.every((id) => typeof id === 'string');

// Today's record. Any other date, or a malformed value, is replaced by an
// empty record for today.
export function readPack(today = localDateKey()) {
  const saved = readJSON(PACK_KEY);
  if (saved && saved.date === today && Array.isArray(saved.packs)) return saved;
  const record = { date: today, packs: [] };
  if (saved) writePack(record);
  return record;
}

// A round still on screen at midnight banks into its own date's record, but
// never over a newer day's record.
export function writePack(record) {
  const stored = readJSON(PACK_KEY);
  if (typeof stored?.date === 'string' && stored.date > record.date) return false;
  return writeJSON(PACK_KEY, record);
}

// count distinct ids from pool, none of them in taken.
function drawIds(pool, count, random, taken = []) {
  const ids = [];
  const used = new Set(taken);
  const free = pool.filter((item) => !used.has(item.id)).length;
  while (ids.length < Math.min(count, free)) {
    const id = pool[Math.floor(random() * pool.length)].id;
    if (used.has(id)) continue;
    used.add(id);
    ids.push(id);
  }
  return ids;
}

// A fresh pack always holds a landmark (pacing doc, 2026-10-18): one slot is
// drawn from the pool's landmark subset, the rest from the full pool, then
// the three are shuffled so the landmark is not always the first card.
function drawPackIds(pool, random) {
  const landmarks = pool.filter((item) => item.kind === 'landmark');
  if (!landmarks.length) return drawIds(pool, PACK_CARDS, random);
  const guaranteed = drawIds(landmarks, 1, random);
  const ids = [...guaranteed, ...drawIds(pool, PACK_CARDS - 1, random, guaranteed)];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// The pack at index (0 = free pack), generated and saved if it does not exist
// yet. An unplayed slot whose id has left the pool gets a fresh draw; a played
// slot keeps its stored result. Returns null while the pool is too small.
export function ensurePack(record, index, pool, random = Math.random) {
  if (pool.length < PACK_CARDS) return null;
  let pack = record.packs[index];
  let changed = false;
  if (!isPack(pack)) {
    pack = { ids: drawPackIds(pool, random), results: Array(PACK_CARDS).fill(null) };
    changed = true;
  } else {
    const inPool = new Set(pool.map((item) => item.id));
    const landmarkIds = new Set(pool.filter((item) => item.kind === 'landmark').map((item) => item.id));
    const landmarks = pool.filter((item) => item.kind === 'landmark');
    pack.results = Array.from({ length: PACK_CARDS }, (_, i) => pack.results?.[i] || null);
    pack.ids.forEach((id, i) => {
      if (pack.results[i] || inPool.has(id)) return;
      // A replacement keeps the landmark guarantee: if no other slot holds a
      // landmark, the fresh card is drawn from the landmark subset.
      const others = pack.ids.filter((_, j) => j !== i);
      const source = !landmarks.length || others.some((other) => landmarkIds.has(other)) ? pool : landmarks;
      pack.ids[i] = drawIds(source, 1, random, pack.ids)[0];
      changed = true;
    });
  }
  record.packs[index] = pack;
  if (changed) writePack(record);
  return pack;
}

export function savePackResult(record, index, card, result) {
  record.packs[index].results[card] = result;
  return writePack(record);
}

// The reveal's story, stored with the result: postcardRoundOutcome's 'miss'
// split into a first visit ('visited', the grey card) and a repeat with
// nothing new ('repeat').
export function packOutcome(wasVisited, previousEarn, newlyEarned) {
  if (newlyEarned) return { kind: previousEarn ? 'upgrade' : 'new', tier: newlyEarned };
  return { kind: wasVisited ? 'repeat' : 'visited' };
}

// Played count, pack score (out of 1,000 per card) and outcome counts.
export function packSummary(pack) {
  const results = (pack?.results || []).filter(Boolean);
  const counts = { new: 0, upgrade: 0, visited: 0, repeat: 0 };
  for (const result of results) if (result.postcard?.kind in counts) counts[result.postcard.kind] += 1;
  return {
    played: results.length,
    nextCard: (pack?.results || []).findIndex((result) => !result),
    score: results.reduce((sum, result) => sum + (Number(result.base) || 0), 0),
    counts,
  };
}
