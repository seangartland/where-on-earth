import {
  ACCOUNT_KEY, EXPEDITION_KEY, GAME_KEY, HISTORY_KEY, PASSPORT_KEY, PREMERGE_KEY,
  STREAK_KEY, SYNC_QUEUE_KEY, WEEKLY_KEY,
} from '../core/config.js';
import { safeSetItem } from '../core/storage.js';
import { accountApi } from './api.js';
import { mergeDocument } from './merge.js';
import { readAccountSession, updateAccountSession } from './session.js';

const FIXED_KEYS = [PASSPORT_KEY, HISTORY_KEY, STREAK_KEY, EXPEDITION_KEY, WEEKLY_KEY,
  'where-on-earth-survival-best-v1', 'where-on-earth-best-landmarks-survival',
  'where-on-earth-best-trivia', 'where-on-earth-countries-best-v1'];
const BLACKOUT_SCOPES = ['world', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania'];
export const SYNC_KEYS = [...FIXED_KEYS, ...BLACKOUT_SCOPES.map((scope) => `where-on-earth-blackout-best-v1-${scope}`)];

function stored(key) {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function localDocs() {
  return Object.fromEntries(SYNC_KEYS.flatMap((key) => {
    const doc = stored(key);
    return doc === null ? [] : [[key, doc]];
  }));
}

function backups() {
  const result = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith('where-on-earth-') && key.endsWith('.corrupt-backup')) result[key] = localStorage.getItem(key);
  }
  return result;
}

function writeDoc(key, doc) {
  return safeSetItem(key, typeof doc === 'string' ? doc : JSON.stringify(doc));
}

function dailyUpload(doc) {
  if (!doc?.date) return null;
  return {
    date: doc.date,
    ids: doc.ids || [],
    total: (doc.results || []).reduce((sum, round) => sum + (Number(round.score) || 0), 0),
    rounds: doc.results || [],
    complete: Boolean(doc.complete),
  };
}

function localDate(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function firstSignInMerge() {
  const session = readAccountSession();
  if (!session?.sessionToken) throw new Error('A session is required before merge');
  const local = localDocs();
  const daily = stored(GAME_KEY);
  localStorage.setItem(PREMERGE_KEY, JSON.stringify({ _v: 1, at: Date.now(), docs: local, daily }));
  const remote = await accountApi(`/v1/sync?today=${localDate()}&yesterday=${localDate(-1)}`, { token: session.sessionToken });
  const merged = {};
  const versions = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote.docs || {})])) {
    const accountEntry = remote.docs?.[key];
    versions[key] = accountEntry?.version || 0;
    if (local[key] == null) merged[key] = accountEntry.doc;
    else if (!accountEntry) merged[key] = local[key];
    else merged[key] = mergeDocument(key, local[key], accountEntry.doc, {
      localHistory: local[HISTORY_KEY], accountHistory: remote.docs?.[HISTORY_KEY]?.doc,
    });
  }
  const docs = Object.fromEntries(Object.entries(merged).map(([key, doc]) => [key, { baseVersion: versions[key], doc }]));
  const accountDailyRow = (remote.daily || []).find((row) => row.date === daily?.date);
  const accountDaily = accountDailyRow ? { date: accountDailyRow.date, ids: accountDailyRow.ids,
    results: accountDailyRow.rounds, round: accountDailyRow.rounds?.length || 0,
    complete: Boolean(accountDailyRow.complete), _v: 1 } : null;
  const mergedDaily = accountDaily && daily ? mergeDocument(GAME_KEY, daily, accountDaily) : (daily || accountDaily);
  const result = await accountApi('/v1/sync', {
    method: 'POST', token: session.sessionToken,
    body: { deviceId: session.deviceId, docs, daily: dailyUpload(mergedDaily), corruptBackups: backups() },
  });
  for (const [key, entry] of Object.entries(result.docs || {})) {
    writeDoc(key, entry.doc);
  }
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify({ _v: 1, keys: [] }));
  updateAccountSession({ merged: true, lastSyncAt: Date.now() });
  return result;
}

export async function syncAccountProgress() {
  const session = readAccountSession();
  if (!session?.merged || !session.sessionToken) return;
  await flushSyncQueue();
  const remote = await accountApi(`/v1/sync?today=${localDate()}&yesterday=${localDate(-1)}`, {
    token: session.sessionToken,
  });
  const local = localDocs();
  for (const [key, entry] of Object.entries(remote.docs || {})) {
    const doc = local[key] == null ? entry.doc : mergeDocument(key, local[key], entry.doc, {
      localHistory: local[HISTORY_KEY], accountHistory: remote.docs?.[HISTORY_KEY]?.doc,
    });
    writeDoc(key, doc);
  }
  for (const daily of remote.daily || []) {
    const accountDaily = { date: daily.date, ids: daily.ids, results: daily.rounds,
      round: daily.rounds?.length || 0, complete: Boolean(daily.complete), _v: 1 };
    const current = stored(GAME_KEY);
    if (!current || current.date === accountDaily.date) writeDoc(GAME_KEY,
      current ? mergeDocument(GAME_KEY, current, accountDaily) : accountDaily);
  }
  updateAccountSession({ lastSyncAt: Date.now() });
}

export async function flushSyncQueue() {
  const session = readAccountSession();
  if (!session?.merged || !session.sessionToken) return;
  const queue = stored(SYNC_QUEUE_KEY);
  const keys = (queue?.keys || []).filter((key) => SYNC_KEYS.includes(key));
  if (!keys.length) return;
  const docs = Object.fromEntries(keys.map((key) => [key, { baseVersion: 0, doc: stored(key) }]));
  const result = await accountApi('/v1/sync', { method: 'POST', token: session.sessionToken,
    body: { deviceId: session.deviceId, docs } });
  for (const [key, entry] of Object.entries(result.docs || {})) writeDoc(key, entry.doc);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify({ _v: 1, keys: [] }));
  updateAccountSession({ lastSyncAt: Date.now() });
}

export { ACCOUNT_KEY };
