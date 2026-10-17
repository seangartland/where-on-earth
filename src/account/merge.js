const PASSPORT_ORDER_LIMIT = 240;
const HISTORY_LIMIT = 365;
const WEEK_STOPS = 7;
const DAY_MS = 86400000;

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const finite = (value) => Number.isFinite(value);
const earliest = (...values) => values.filter((value) => value !== undefined && value !== null).sort()[0];
const latest = (...values) => values.filter((value) => value !== undefined && value !== null).sort().at(-1);

function mergeMeta(local, account, legacy) {
  if (legacy) {
    const merged = mergeMeta(local, account, false);
    delete merged.f;
    return merged;
  }
  const merged = {};
  const maxFields = ['b', 'e'];
  const minFields = ['d', 'ea', 'eb1', 'eb2', 'eb3'];
  for (const key of maxFields) {
    const values = [local?.[key], account?.[key]].filter(finite);
    if (values.length) merged[key] = Math.max(...values);
  }
  for (const key of minFields) {
    const values = [local?.[key], account?.[key]].filter(finite);
    if (values.length) merged[key] = Math.min(...values);
  }
  const times = [local?.t, account?.t].filter(finite);
  if (times.length) merged.t = Math.max(...times);
  const first = earliest(local?.f, account?.f);
  if (first) merged.f = first;
  return merged;
}

export function mergePassport(localValue, accountValue) {
  const local = object(localValue);
  const account = object(accountValue);
  const localVisits = object(local.visits);
  const accountVisits = object(account.visits);
  const localMeta = object(local.meta);
  const accountMeta = object(account.meta);
  const ids = [...new Set([...Object.keys(accountVisits), ...Object.keys(localVisits)])];
  const visits = {};
  const meta = {};
  for (const id of ids) {
    const legacy = (id in localVisits && !(id in localMeta)) || (id in accountVisits && !(id in accountMeta));
    const mergedMeta = mergeMeta(localMeta[id], accountMeta[id], legacy);
    if (Object.keys(mergedMeta).length) meta[id] = mergedMeta;
    const lt = localMeta[id]?.t;
    const at = accountMeta[id]?.t;
    if (finite(lt) || finite(at)) visits[id] = finite(lt) && (!finite(at) || lt > at)
      ? localVisits[id] : accountVisits[id];
    else visits[id] = Math.max(Number(localVisits[id]) || 0, Number(accountVisits[id]) || 0);
  }

  const legacyOrder = [...(Array.isArray(account.order) ? account.order : []),
    ...(Array.isArray(local.order) ? local.order : [])];
  const position = new Map();
  legacyOrder.forEach((id, index) => { if (!position.has(id)) position.set(id, index); });
  const order = ids.sort((left, right) => {
    const lt = meta[left]?.t;
    const rt = meta[right]?.t;
    if (!finite(lt) && !finite(rt)) return (position.get(left) ?? Infinity) - (position.get(right) ?? Infinity);
    if (!finite(lt)) return -1;
    if (!finite(rt)) return 1;
    return lt - rt || (position.get(left) ?? Infinity) - (position.get(right) ?? Infinity);
  }).slice(-PASSPORT_ORDER_LIMIT);
  return { v: Math.max(Number(local.v) || 0, Number(account.v) || 0, 2), visits, order, meta, _v: 1 };
}

export function mergeHistory(localValue, accountValue) {
  const localEntries = Array.isArray(localValue) ? localValue : object(localValue).entries || [];
  const accountEntries = Array.isArray(accountValue) ? accountValue : object(accountValue).entries || [];
  const byDate = new Map(accountEntries.map((entry) => [entry.date, entry]));
  for (const entry of localEntries) if (!byDate.has(entry.date)) byDate.set(entry.date, entry);
  return { _v: 1, entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-HISTORY_LIMIT) };
}

function dayNumber(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  return match ? Math.floor(Date.UTC(+match[1], +match[2] - 1, +match[3]) / DAY_MS) : null;
}

export function mergeStreak(localValue, accountValue, localHistory, accountHistory) {
  const local = object(localValue);
  const account = object(accountValue);
  const last = latest(local.last, account.last);
  if (!last) return { _v: 1, last: '', count: 0 };
  const played = new Set();
  for (const source of [mergeHistory(localHistory, accountHistory).entries]) {
    for (const entry of source) if (dayNumber(entry.date) !== null) played.add(dayNumber(entry.date));
  }
  for (const side of [local, account]) {
    const end = dayNumber(side.last);
    const count = Math.max(0, Number(side.count) || 0);
    if (end !== null) for (let offset = 0; offset < count; offset += 1) played.add(end - offset);
  }
  const end = dayNumber(last);
  let count = 0;
  while (played.has(end - count)) count += 1;
  const owner = local.last === last ? local : account;
  return { last, count: Math.max(count, Number(owner.count) || 0), _v: 1 };
}

export function mergeDaily(localValue, accountValue) {
  const local = object(localValue);
  const account = object(accountValue);
  if (!local.date) return accountValue;
  if (!account.date) return localValue;
  if (local.date !== account.date) return accountValue;
  if (Boolean(local.complete) !== Boolean(account.complete)) return local.complete ? localValue : accountValue;
  if (local.complete && account.complete) return accountValue;
  return (Number(local.round) || 0) > (Number(account.round) || 0) ? localValue : accountValue;
}

export function mergeExpeditions(localValue, accountValue, stopCounts = {}) {
  const local = object(localValue);
  const account = object(accountValue);
  const lp = object(local.progress);
  const ap = object(account.progress);
  const progress = {};
  for (const id of new Set([...Object.keys(ap), ...Object.keys(lp)])) {
    const completed = Math.max(Number(lp[id]?.completed) || 0, Number(ap[id]?.completed) || 0);
    progress[id] = { completed, complete: completed >= (stopCounts[id] || 7) };
  }
  return { progress, _v: 1 };
}

export function mergeWeekly(localValue, accountValue) {
  const local = object(localValue);
  const account = object(accountValue);
  const lw = object(local.weeks);
  const aw = object(account.weeks);
  const weeks = {};
  for (const key of new Set([...Object.keys(aw), ...Object.keys(lw)])) {
    const l = object(lw[key]);
    const a = object(aw[key]);
    const played = { ...object(a.played) };
    for (const [stop, date] of Object.entries(object(l.played))) played[stop] = earliest(played[stop], date);
    weeks[key] = {
      route: a.route ?? l.route,
      played,
      badge: Boolean(a.badge || l.badge || Object.keys(played).length >= WEEK_STOPS),
    };
  }
  return { weeks, _v: 1 };
}

export const BEST_KEY_PATTERN = /^where-on-earth-(?:survival-best-v1|best-landmarks-survival|best-trivia|countries-best-v1|blackout-best-v1-(?:world|africa|asia|europe|north-america|south-america|oceania))$/;

export function mergeDocument(key, local, account, context = {}) {
  if (key === 'where-on-earth-passport-v1') return mergePassport(local, account);
  if (key === 'where-on-earth-history-v1') return mergeHistory(local, account);
  if (key === 'where-on-earth-streak-v1') return mergeStreak(local, account, context.localHistory, context.accountHistory);
  if (key === 'where-on-earth-v1') return mergeDaily(local, account);
  if (key === 'where-on-earth-expedition-v1') return mergeExpeditions(local, account, context.expeditionStops);
  if (key === 'where-on-earth-weekly-v1') return mergeWeekly(local, account);
  if (BEST_KEY_PATTERN.test(key)) return String(Math.max(Number(local) || 0, Number(account) || 0));
  throw new Error(`Sync key is not allowed: ${key}`);
}
