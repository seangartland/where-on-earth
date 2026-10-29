import { PACK_KEY } from '../core/config.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { localDateKey } from '../core/format.js';
import { isPlayableLocation } from '../daily.js';
import { PACK_CAPITAL_IDS } from './pack-capitals.js';
import { PACK_LANDFORM_IDS } from './pack-landforms.js';

export const PACK_CARDS = 3;
export const STAMINA_MAX = 2;
export const STAMINA_PERIOD = 12 * 60 * 60 * 1000;
export const PACK_TYPES = ['capitals', 'landmarks', 'landforms'];
const LEGACY_TORN_KEY = `${PACK_KEY}-torn`;

export function packPool(locations) {
  return locations.filter((item) => PACK_CAPITAL_IDS.has(item.id) && isPlayableLocation(item));
}
const playableLandmark = (item) => Number.isFinite(item?.lat) && Number.isFinite(item?.lng)
  && typeof item?.image === 'string' && item.image.length > 0;
export function landmarkPackPool(locations) {
  return locations.filter((item) => !PACK_LANDFORM_IDS.has(item.id) && playableLandmark(item));
}
export function landformPackPool(locations) {
  return locations.filter((item) => PACK_LANDFORM_IDS.has(item.id) && playableLandmark(item));
}

const isPack = (pack) => Array.isArray(pack?.ids) && pack.ids.length === PACK_CARDS
  && pack.ids.every((id) => typeof id === 'string');

export function accrue(record, now = Date.now()) {
  while (record.stamina.stored < STAMINA_MAX && record.stamina.nextAt != null && record.stamina.nextAt <= now) {
    record.stamina.stored += 1;
    record.stamina.nextAt += STAMINA_PERIOD;
  }
  if (record.stamina.stored >= STAMINA_MAX) record.stamina.nextAt = null;
  return record;
}

export function spend(record, now = Date.now()) {
  accrue(record, now);
  if (record.stamina.stored <= 0) return false;
  const paused = record.stamina.nextAt == null;
  record.stamina.stored -= 1;
  if (paused) record.stamina.nextAt = now + STAMINA_PERIOD;
  writePack(record);
  return true;
}

const freshRecord = () => ({
  stamina: { stored: STAMINA_MAX, nextAt: null },
  byType: { capitals: null, landmarks: null, landforms: null },
});

export function readPack(now = Date.now()) {
  const saved = readJSON(PACK_KEY);
  if (saved?.byType && saved?.stamina) {
    const before = JSON.stringify(saved.stamina);
    accrue(saved, now);
    for (const type of PACK_TYPES) if (!(type in saved.byType)) saved.byType[type] = null;
    if (JSON.stringify(saved.stamina) !== before) writePack(saved);
    return saved;
  }
  const record = freshRecord();
  const today = localDateKey(new Date(now));
  const legacy = saved?.date === today && isPack(saved?.packs?.[0]) ? saved.packs[0] : null;
  if (legacy) {
    let torn = false;
    try { torn = localStorage.getItem(LEGACY_TORN_KEY) === saved.date; } catch { /* unavailable */ }
    record.byType.capitals = {
      ids: legacy.ids.slice(),
      results: Array.from({ length: PACK_CARDS }, (_, i) => legacy.results?.[i] || null),
      torn,
    };
  }
  if (saved) writePack(record);
  return record;
}

export function writePack(record) { return writeJSON(PACK_KEY, record); }

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

export function ensurePack(record, type, pool, random = Math.random) {
  if (!PACK_TYPES.includes(type) || pool.length < PACK_CARDS) return null;
  let current = record.byType[type];
  let changed = false;
  if (!isPack(current)) {
    current = { ids: drawIds(pool, PACK_CARDS, random), results: Array(PACK_CARDS).fill(null), torn: false };
    changed = true;
  } else {
    const inPool = new Set(pool.map((item) => item.id));
    current.results = Array.from({ length: PACK_CARDS }, (_, i) => current.results?.[i] || null);
    current.torn = Boolean(current.torn);
    current.ids.forEach((id, i) => {
      if (current.results[i] || inPool.has(id)) return;
      current.ids[i] = drawIds(pool, 1, random, current.ids)[0];
      changed = true;
    });
  }
  record.byType[type] = current;
  if (changed) writePack(record);
  return current;
}

export function savePackResult(record, type, card, result) {
  record.byType[type].results[card] = result;
  return writePack(record);
}
export function completePack(record, type) {
  record.byType[type] = null;
  return writePack(record);
}
export function packOutcome(wasVisited, previousEarn, newlyEarned) {
  if (newlyEarned) return { kind: previousEarn ? 'upgrade' : 'new', tier: newlyEarned };
  return { kind: wasVisited ? 'repeat' : 'visited' };
}
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
