import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeDaily, mergeDocument, mergeExpeditions, mergeHistory, mergePassport,
  mergeStreak, mergeWeekly,
} from '../src/account/merge.js';

test('passport ids are unioned and metadata follows every field rule', () => {
  const local = { visits: { a: 100, b: 200 }, order: ['a', 'b'], meta: {
    a: { b: 700, d: 20, e: 2, ea: 20, eb1: 11, eb2: 22, f: '2026-02-02', t: 200 },
    b: { t: 50 },
  } };
  const account = { visits: { a: 900, c: 300 }, order: ['c', 'a'], meta: {
    a: { b: 800, d: 30, e: 1, ea: 10, eb1: 12, eb3: 33, f: '2026-01-01', t: 100 },
    c: { t: 300 },
  } };
  const merged = mergePassport(local, account);
  assert.deepEqual(Object.keys(merged.visits).sort(), ['a', 'b', 'c']);
  assert.deepEqual(merged.meta.a, { b: 800, e: 2, d: 20, ea: 10, eb1: 11, eb2: 22, eb3: 33, t: 200, f: '2026-01-01' });
  assert.equal(merged.visits.a, 100);
  assert.deepEqual(merged.order, ['b', 'a', 'c']);
});

test('legacy passport entry remains undated and legacy score takes max', () => {
  const merged = mergePassport(
    { visits: { old: 400 }, order: ['old'], meta: {} },
    { visits: { old: 300 }, order: ['old'], meta: { old: { f: '2026-01-01', t: 10 } } },
  );
  assert.equal(merged.meta.old.f, undefined);
  assert.equal(merged.visits.old, 300);
});

test('passport order is capped to the latest 240 ids', () => {
  const visits = {};
  const meta = {};
  const order = [];
  for (let i = 0; i < 241; i += 1) {
    const id = `id-${i}`;
    visits[id] = i;
    meta[id] = { t: i };
    order.push(id);
  }
  const merged = mergePassport({ visits, meta, order }, {});
  assert.equal(merged.order.length, 240);
  assert.equal(merged.order[0], 'id-1');
  assert.equal(Object.keys(merged.visits).length, 241);
});

test('all best score keys take max and unknown keys are refused', () => {
  const keys = [
    'where-on-earth-survival-best-v1', 'where-on-earth-best-landmarks-survival',
    'where-on-earth-best-trivia', 'where-on-earth-countries-best-v1',
    'where-on-earth-blackout-best-v1-world', 'where-on-earth-blackout-best-v1-africa',
    'where-on-earth-blackout-best-v1-asia', 'where-on-earth-blackout-best-v1-europe',
    'where-on-earth-blackout-best-v1-north-america', 'where-on-earth-blackout-best-v1-south-america',
    'where-on-earth-blackout-best-v1-oceania',
  ];
  for (const key of keys) assert.equal(mergeDocument(key, '7', '9'), '9');
  assert.throws(() => mergeDocument('where-on-earth-muted', '1', '0'), /not allowed/);
});

test('history is unioned by date, account duplicate wins, and result trims to 365', () => {
  const local = { entries: [{ date: '2026-01-01', total: 1 }, { date: '2026-01-02', total: 2 }] };
  const account = { entries: [{ date: '2026-01-01', total: 9 }] };
  assert.deepEqual(mergeHistory(local, account).entries, [
    { date: '2026-01-01', total: 9 }, { date: '2026-01-02', total: 2 },
  ]);
  const many = { entries: Array.from({ length: 366 }, (_, day) => ({ date: `2027-${String(Math.floor(day / 28) + 1).padStart(2, '0')}-${String(day % 28 + 1).padStart(2, '0')}` })) };
  assert.equal(mergeHistory(many, {}).entries.length, 365);
});

test('streak bridges devices and preserves a count older than history', () => {
  const merged = mergeStreak(
    { last: '2026-10-21', count: 3 }, { last: '2026-10-22', count: 1 },
    { entries: [{ date: '2026-10-21' }] }, { entries: [{ date: '2026-10-22' }] },
  );
  assert.deepEqual(merged, { last: '2026-10-22', count: 4, _v: 1 });
  assert.equal(mergeStreak({ last: '2026-10-10', count: 12 }, {}, { entries: [] }, {}).count, 12);
});

test('Daily merge handles complete, account first-write, and in-progress sign-in', () => {
  const incomplete = { date: '2026-10-16', round: 3, complete: false };
  const shorter = { date: '2026-10-16', round: 1, complete: false };
  const complete = { date: '2026-10-16', round: 5, complete: true, total: 10 };
  assert.equal(mergeDaily(incomplete, complete), complete);
  assert.equal(mergeDaily(complete, incomplete), complete);
  assert.equal(mergeDaily(incomplete, shorter), incomplete);
  const accountComplete = { ...complete, total: 99 };
  assert.equal(mergeDaily(complete, accountComplete), accountComplete);
});

test('expeditions take max completed and recompute complete', () => {
  const merged = mergeExpeditions(
    { progress: { alps: { completed: 3, complete: false } } },
    { progress: { alps: { completed: 7, complete: false }, nile: { completed: 1 } } },
  );
  assert.deepEqual(merged.progress.alps, { completed: 7, complete: true });
  assert.deepEqual(merged.progress.nile, { completed: 1, complete: false });
});

test('weekly week 0 unions stops, keeps account route, earliest date, and recomputes badge', () => {
  const week = 'Monday 2026-10-19';
  const localPlayed = { 0: '2026-10-20', 1: '2026-10-20', 2: '2026-10-21', 3: '2026-10-22' };
  const accountPlayed = { 0: '2026-10-19', 4: '2026-10-23', 5: '2026-10-24', 6: '2026-10-25' };
  const merged = mergeWeekly(
    { weeks: { [week]: { route: 'local', played: localPlayed, badge: false } } },
    { weeks: { [week]: { route: 'account', played: accountPlayed, badge: false } } },
  );
  assert.equal(merged.weeks[week].route, 'account');
  assert.equal(merged.weeks[week].played[0], '2026-10-19');
  assert.equal(merged.weeks[week].badge, true);
});

test('device preferences and corrupt backups are never merged', () => {
  assert.throws(() => mergeDocument('where-on-earth-reveal-view', 'flyover', 'north-up'));
  assert.throws(() => mergeDocument('where-on-earth-passport-v1.corrupt-backup', 'bad', 'worse'));
});

test('all merges are idempotent', () => {
  const passport = mergePassport({ visits: { a: 1 }, order: ['a'], meta: { a: { t: 1 } } }, {});
  assert.deepEqual(mergePassport(passport, passport), passport);
  const weekly = mergeWeekly({ weeks: { w: { route: 'r', played: { 0: 'd' } } } }, {});
  assert.deepEqual(mergeWeekly(weekly, weekly), weekly);
});
