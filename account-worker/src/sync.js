import { BEST_KEY_PATTERN, mergeDocument } from '../../src/account/merge.js';

const MAX_DOC_BYTES = 512 * 1024;
const FIXED_KEYS = new Set([
  'where-on-earth-passport-v1',
  'where-on-earth-history-v1',
  'where-on-earth-streak-v1',
  'where-on-earth-expedition-v1',
  'where-on-earth-weekly-v1',
]);

export const isAllowedKey = (key) => FIXED_KEYS.has(key) || BEST_KEY_PATTERN.test(key);

const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

async function account(auth, request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id || null;
}

function parseDoc(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function tomorrowUtcLimit() {
  return new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function saveDevice(env, accountId, deviceId, label) {
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO devices
    (device_id, account_id, label, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen, label = excluded.label`)
    .bind(deviceId, accountId, label || null, now, now).run();
}

export async function getSync(request, env, auth) {
  const accountId = await account(auth, request);
  if (!accountId) return response({ code: 'UNAUTHORIZED' }, 401);
  const url = new URL(request.url);
  let have = {};
  try { have = JSON.parse(url.searchParams.get('have') || '{}'); } catch { return response({ code: 'INVALID_HAVE' }, 400); }
  const rows = await env.DB.prepare(
    'SELECT key, doc, version FROM progress_docs WHERE account_id = ?',
  ).bind(accountId).all();
  const docs = {};
  for (const row of rows.results || []) {
    if ((Number(have[row.key]) || 0) < row.version) docs[row.key] = { doc: parseDoc(row.doc), version: row.version };
  }
  const dates = [url.searchParams.get('today'), url.searchParams.get('yesterday')].filter(Boolean);
  let daily = [];
  if (dates.length) {
    const result = await env.DB.prepare(
      'SELECT date, ids, total, rounds, complete, completed_at FROM daily_results WHERE account_id = ? AND date IN (?, ?)',
    ).bind(accountId, dates[0], dates[1] || dates[0]).all();
    daily = (result.results || []).map((row) => ({ ...row, ids: parseDoc(row.ids), rounds: parseDoc(row.rounds) }));
  }
  return response({ docs, daily });
}

export async function postSync(request, env, auth) {
  const accountId = await account(auth, request);
  if (!accountId) return response({ code: 'UNAUTHORIZED' }, 401);
  let body;
  try { body = await request.json(); } catch { return response({ code: 'INVALID_BODY' }, 400); }
  if (!/^dev_[A-Za-z0-9_-]+$/.test(body?.deviceId || '')) return response({ code: 'INVALID_DEVICE' }, 400);
  await saveDevice(env, accountId, body.deviceId, body.deviceLabel);
  const returned = {};
  for (const [key, incoming] of Object.entries(body.docs || {})) {
    if (!isAllowedKey(key)) return response({ code: 'KEY_NOT_ALLOWED', key }, 400);
    const serialized = JSON.stringify(incoming.doc);
    if (new TextEncoder().encode(serialized).length > MAX_DOC_BYTES) return response({ code: 'DOC_TOO_LARGE', key }, 413);
    const stored = await env.DB.prepare(
      'SELECT doc, version FROM progress_docs WHERE account_id = ? AND key = ?',
    ).bind(accountId, key).first();
    let doc = incoming.doc;
    if (stored && Number(incoming.baseVersion) !== stored.version) {
      const context = {};
      if (key === 'where-on-earth-streak-v1') {
        const history = await env.DB.prepare(
          'SELECT doc FROM progress_docs WHERE account_id = ? AND key = ?',
        ).bind(accountId, 'where-on-earth-history-v1').first();
        context.accountHistory = history ? parseDoc(history.doc) : null;
        context.localHistory = body.docs['where-on-earth-history-v1']?.doc;
      }
      doc = mergeDocument(key, incoming.doc, parseDoc(stored.doc), context);
    }
    const version = (stored?.version || 0) + 1;
    await env.DB.prepare(`INSERT INTO progress_docs
      (account_id, key, doc, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, key) DO UPDATE SET doc = excluded.doc, version = excluded.version,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(accountId, key, JSON.stringify(doc), version, Date.now(), body.deviceId).run();
    returned[key] = { doc, version };
  }
  if (body.daily) {
    const daily = body.daily;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(daily.date || '') || daily.date > tomorrowUtcLimit()) {
      return response({ code: 'INVALID_DAILY_DATE' }, 400);
    }
    await env.DB.prepare(`INSERT OR IGNORE INTO daily_results
      (account_id, date, ids, total, rounds, complete, completed_at, device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(accountId, daily.date, JSON.stringify(daily.ids || []), Number(daily.total) || 0,
        JSON.stringify(daily.rounds || []), daily.complete ? 1 : 0,
        daily.complete ? Date.now() : null, body.deviceId).run();
    const storedDaily = await env.DB.prepare(
      'SELECT date, ids, total, rounds, complete, completed_at FROM daily_results WHERE account_id = ? AND date = ?',
    ).bind(accountId, daily.date).first();
    const rounds = parseDoc(storedDaily.rounds) || [];
    returned['where-on-earth-v1'] = { doc: {
      date: storedDaily.date, ids: parseDoc(storedDaily.ids), results: rounds,
      round: rounds.length, complete: Boolean(storedDaily.complete), _v: 1,
    } };
  }
  for (const [key, raw] of Object.entries(body.corruptBackups || {})) {
    if (!key.endsWith('.corrupt-backup') || !key.startsWith('where-on-earth-')) continue;
    await env.DB.prepare(
      'INSERT INTO corrupt_backups (account_id, key, raw, device_id, at) VALUES (?, ?, ?, ?, ?)',
    ).bind(accountId, key, String(raw), body.deviceId, Date.now()).run();
  }
  return response({ docs: returned });
}
