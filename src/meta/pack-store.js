import { PACK_KEY } from '../core/config.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { localDateKey } from '../core/format.js';
import { isPlayableLocation } from '../daily.js';
import { PACK_CAPITAL_IDS } from './pack-capitals.js';
import { PACK_LANDFORM_IDS } from './pack-landforms.js';

export const PACK_CARDS = 3;
export const STAMINA_MAX = 2;
export const STAMINA_PERIOD = 12 * 60 * 60 * 1000;
export const SKIP_PERIOD = 60 * 60 * 1000;
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
  else record.stamina.nextAt = Math.min(record.stamina.nextAt, now + STAMINA_PERIOD);
  return record;
}

export function spend(record, now = Date.now()) {
  const fresh = readPack(now);
  if (fresh.stamina.stored <= 0) return false;
  const paused = fresh.stamina.nextAt == null;
  fresh.stamina.stored -= 1;
  if (paused) {
    fresh.stamina.nextAt = now + STAMINA_PERIOD - fresh.skipCredit;
    fresh.skipCredit = 0;
  }
  writePack(fresh);
  Object.assign(record, fresh);
  return true;
}

export function applySkips(record, count, now = Date.now()) {
  const fresh = readPack(now);
  let consumed = 0;
  while (consumed < count && fresh.skips > 0 && fresh.stamina.stored < STAMINA_MAX) {
    fresh.stamina.nextAt -= SKIP_PERIOD;
    fresh.skips -= 1;
    consumed += 1;
    if (fresh.stamina.nextAt <= now) {
      fresh.stamina.stored += 1;
      if (fresh.stamina.stored >= STAMINA_MAX) {
        fresh.skipCredit = Math.min(STAMINA_PERIOD - 1, Math.max(0, now - fresh.stamina.nextAt));
        fresh.stamina.nextAt = null;
      } else {
        fresh.stamina.nextAt += STAMINA_PERIOD;
      }
    }
  }
  if (consumed) writePack(fresh);
  Object.assign(record, fresh);
  return consumed;
}

export function awardDailySkips(record, dateStr) {
  const fresh = readPack();
  if (fresh.lastDailyReward && dateStr <= fresh.lastDailyReward) {
    Object.assign(record, fresh);
    return 0;
  }
  fresh.skips += 4;
  fresh.lastDailyReward = dateStr;
  writePack(fresh);
  Object.assign(record, fresh);
  return 4;
}

export function grantDailySkips(dateStr) {
  const record = readPack();
  return awardDailySkips(record, dateStr);
}

const freshRecord = () => ({
  skips: 12,
  skipCredit: 0,
  stamina: { stored: STAMINA_MAX, nextAt: null },
  byType: { capitals: null, landmarks: null, landforms: null },
});

export function readPack(now = Date.now()) {
  const saved = readJSON(PACK_KEY);
  if (saved?.byType && saved?.stamina) {
    const missingSkips = !Object.hasOwn(saved, 'skips');
    if (missingSkips) saved.skips = 12;
    const before = JSON.stringify([saved.skips, saved.skipCredit, saved.stamina]);
    saved.skips = Math.max(0, Math.floor(Number(saved.skips) || 0));
    saved.skipCredit = Math.min(STAMINA_PERIOD - 1, Math.max(0, Number(saved.skipCredit) || 0));
    saved.stamina.stored = Math.min(STAMINA_MAX, Math.max(0, Math.floor(Number(saved.stamina.stored) || 0)));
    saved.stamina.nextAt = saved.stamina.nextAt == null ? null : Number(saved.stamina.nextAt);
    if (saved.stamina.stored < STAMINA_MAX && !Number.isFinite(saved.stamina.nextAt)) {
      saved.stamina.nextAt = now + STAMINA_PERIOD;
    }
    accrue(saved, now);
    for (const type of PACK_TYPES) if (!(type in saved.byType)) saved.byType[type] = null;
    if (missingSkips || JSON.stringify([saved.skips, saved.skipCredit, saved.stamina]) !== before) writePack(saved);
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
    try { localStorage.removeItem(LEGACY_TORN_KEY); } catch { /* unavailable */ }
  }
  let rawExists = false;
  try { rawExists = localStorage.getItem(PACK_KEY) !== null; } catch { /* unavailable */ }
  if (rawExists && !saved) {
    try { localStorage.removeItem(PACK_KEY); } catch { /* unavailable */ }
  }
  if (saved || rawExists) writePack(record);
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
  const fresh = readPack();
  if (!fresh.byType[type]) return false;
  fresh.byType[type].results[card] = result;
  const written = writePack(fresh);
  Object.assign(record, fresh);
  return written;
}
export function completePack(record, type) {
  const fresh = readPack();
  fresh.byType[type] = null;
  const written = writePack(fresh);
  Object.assign(record, fresh);
  return written;
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

export function isOpenPack(pack) {
  return Boolean(pack?.torn) && packSummary(pack).played < PACK_CARDS;
}

export function hasOtherOpenPack(record, type) {
  return PACK_TYPES.some((candidate) => candidate !== type && isOpenPack(record.byType[candidate]));
}

export function packChoiceState(record, type) {
  const saved = record.byType[type];
  const complete = Boolean(saved && packSummary(saved).played >= PACK_CARDS);
  const inProgress = Boolean(saved && !complete && (saved.torn || saved.results.some(Boolean)));
  const anyOpen = PACK_TYPES.some((candidate) => isOpenPack(record.byType[candidate]));
  return {
    inProgress,
    complete,
    locked: anyOpen && !isOpenPack(saved),
  };
}

export function packProgressCount(record) {
  return Object.values(record.byType)
    .filter((saved) => saved && (saved.torn || saved.results?.some(Boolean))).length;
}

export function canTearPack(record, type) {
  return !hasOtherOpenPack(record, type);
}
