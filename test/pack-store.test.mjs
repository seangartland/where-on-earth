import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

const { PACK_KEY } = await import('../src/core/config.js');
const {
  STAMINA_PERIOD, accrue, spend, applySkips, readPack, writePack, ensurePack,
  savePackResult, completePack, packOutcome, packSummary, packPool,
  awardDailySkips, grantDailySkips,
  isOpenPack, hasOtherOpenPack,
  packChoiceState, packProgressCount, canTearPack,
} = await import('../src/meta/pack-store.js');
const cities = JSON.parse(readFileSync(new URL('../assets/locations.json', import.meta.url)));
const pool = packPool(cities);
const raw = () => JSON.parse(localStorage.getItem(PACK_KEY));
const empty = (stamina = { stored: 2, nextAt: null }) => ({
  skips: 12, skipCredit: 0, stamina, byType: { capitals: null, landmarks: null, landforms: null },
});

test.beforeEach(() => localStorage.clear());

test('accrual handles partial periods, multiple periods, and pauses at cap', () => {
  const record = empty({ stored: 0, nextAt: 1000 });
  accrue(record, 999);
  assert.deepEqual(record.stamina, { stored: 0, nextAt: 1000 });
  accrue(record, 1000 + STAMINA_PERIOD);
  assert.deepEqual(record.stamina, { stored: 2, nextAt: null });
});

test('spending from cap starts the clock; spending at one keeps it running', () => {
  const record = empty();
  writePack(record);
  assert.equal(spend(record, 5000), true);
  assert.deepEqual(record.stamina, { stored: 1, nextAt: 5000 + STAMINA_PERIOD });
  assert.equal(spend(record, 6000), true);
  assert.deepEqual(record.stamina, { stored: 0, nextAt: 5000 + STAMINA_PERIOD });
  assert.equal(spend(record, 7000), false);
});

test('five skips reproduce the worked rollover example', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const record = empty({ stored: 0, nextAt: now + 4.25 * 60 * 60 * 1000 });
  writePack(record);
  assert.equal(applySkips(record, 5, now), 5);
  assert.deepEqual(record.stamina, { stored: 1, nextAt: now + 11.25 * 60 * 60 * 1000 });
  assert.equal(record.skips, 7);
});

test('skips stop at the stamina cap', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const record = { ...empty({ stored: 1, nextAt: now + 60 * 60 * 1000 }), skips: 5 };
  writePack(record);
  assert.equal(applySkips(record, 5, now), 1);
  assert.deepEqual(record.stamina, { stored: 2, nextAt: null });
  assert.equal(record.skips, 4);
});

test('partial skips move the running timer without accruing', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const record = empty({ stored: 0, nextAt: now + 4.25 * 60 * 60 * 1000 });
  writePack(record);
  assert.equal(applySkips(record, 2, now), 2);
  assert.deepEqual(record.stamina, { stored: 0, nextAt: now + 2.25 * 60 * 60 * 1000 });
});

test('fresh and migrated records get one starter grant while saved balances remain', () => {
  assert.equal(readPack(0).skips, 12);
  const saved = empty();
  saved.skips = 3;
  writePack(saved);
  assert.equal(readPack(0).skips, 3);
  delete saved.skips;
  writePack(saved);
  assert.equal(readPack(0).skips, 12);
  assert.equal(raw().skips, 12);
  assert.equal(readPack(0).skips, 12);
});

test('daily skips grant once per date and grant again the next day', () => {
  const record = empty();
  writePack(record);
  assert.equal(awardDailySkips(record, '2026-10-29'), 4);
  assert.equal(record.skips, 16);
  assert.equal(record.lastDailyReward, '2026-10-29');
  assert.equal(awardDailySkips(record, '2026-10-29'), 0);
  assert.equal(record.skips, 16);
  assert.equal(awardDailySkips(record, '2026-10-30'), 4);
  assert.equal(record.skips, 20);
  assert.equal(record.lastDailyReward, '2026-10-30');
});

test('daily skips never reward an older date when completions alternate', () => {
  const record = empty();
  writePack(record);
  for (const date of ['2026-10-29', '2026-10-30', '2026-10-29', '2026-10-30', '2026-10-29']) {
    awardDailySkips(record, date);
  }
  assert.equal(record.skips, 20);
});

test('accrual clamps a clock restored from the distant future', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const record = empty();
  writePack(record);
  spend(record, now);
  readPack(now + 30 * 24 * 60 * 60 * 1000);
  const minted = readPack(now + 30 * 24 * 60 * 60 * 1000);
  spend(minted, now + 30 * 24 * 60 * 60 * 1000);
  spend(minted, now + 30 * 24 * 60 * 60 * 1000);
  const restored = readPack(now);
  assert.ok(restored.stamina.nextAt - now <= STAMINA_PERIOD);
});

test('skip credit survives filling the bank and shortens the next countdown', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const record = empty({ stored: 1, nextAt: now + 4.25 * 60 * 60 * 1000 });
  writePack(record);
  assert.equal(applySkips(record, 5, now), 5);
  assert.equal(record.skipCredit, 45 * 60 * 1000);
  assert.deepEqual(record.stamina, { stored: 2, nextAt: null });
  assert.equal(spend(record, now), true);
  assert.deepEqual(record.stamina, { stored: 1, nextAt: now + 11.25 * 60 * 60 * 1000 });
  assert.equal(record.skipCredit, 0);
});

test('read normalizes stamina, skip balances, and a missing countdown', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const malformed = empty({ stored: 0, nextAt: null });
  malformed.skips = '12';
  writePack(malformed);
  const record = readPack(now);
  assert.deepEqual(record.stamina, { stored: 0, nextAt: now + STAMINA_PERIOD });
  awardDailySkips(record, '2026-10-29');
  assert.equal(record.skips, 16);
});

test('a corrupt pack record is backed up, replaced, and remains spendable only twice', () => {
  localStorage.setItem(PACK_KEY, '{garbage');
  const record = readPack(1000);
  assert.equal(localStorage.getItem(`${PACK_KEY}.corrupt-backup`), '{garbage');
  assert.equal(spend(record, 1000), true);
  const reloaded = readPack(1000);
  assert.equal(reloaded.stamina.stored, 1);
  assert.equal(spend(reloaded, 1000), true);
  assert.equal(spend(reloaded, 1000), false);
});

test('daily skips preserve a legacy balance and persist through the pack store', () => {
  const legacy = empty();
  legacy.skips = 7;
  writePack(legacy);
  assert.equal(grantDailySkips('2026-10-29'), 4);
  assert.equal(raw().skips, 11);
  assert.equal(raw().lastDailyReward, '2026-10-29');
  assert.equal(grantDailySkips('2026-10-29'), 0);
  assert.equal(raw().skips, 11);
});

test('fresh migration starts full and persists the new shape', () => {
  localStorage.setItem(PACK_KEY, JSON.stringify({ date: '2026-10-28', packs: [] }));
  assert.deepEqual(readPack(Date.parse('2026-10-29T12:00:00Z')), empty());
  assert.equal('date' in raw(), false);
});

test('legacy pack from today migrates its results and torn state', () => {
  const date = '2026-10-29';
  const legacyPack = { ids: pool.slice(0, 3).map((x) => x.id), results: [{ base: 1 }, null, null] };
  localStorage.setItem(PACK_KEY, JSON.stringify({ date, packs: [legacyPack] }));
  localStorage.setItem(`${PACK_KEY}-torn`, date);
  const record = readPack(Date.parse(`${date}T12:00:00Z`));
  assert.deepEqual(record.byType.capitals, { ...legacyPack, torn: true });
  assert.equal(record.stamina.stored, 2);
  assert.equal(localStorage.getItem(`${PACK_KEY}-torn`), null);
});

test('stale legacy pack is dropped', () => {
  localStorage.setItem(PACK_KEY, JSON.stringify({ date: '2026-10-28', packs: [{ ids: ['a', 'b', 'c'], results: [] }] }));
  assert.equal(readPack(Date.parse('2026-10-29T12:00:00Z')).byType.capitals, null);
});

test('per-type packs are isolated and retired unplayed ids redraw', () => {
  const record = empty();
  let n = 0;
  const random = () => ((n += 1) % pool.length) / pool.length;
  const capitals = ensurePack(record, 'capitals', pool, random);
  const otherPool = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  let m = 0;
  const landmarks = ensurePack(record, 'landmarks', otherPool, () => ((m += 1) % 3) / 3);
  assert.notEqual(capitals, landmarks);
  assert.deepEqual(new Set(landmarks.ids), new Set(['one', 'two', 'three']));
  landmarks.ids[1] = 'gone';
  landmarks.results[0] = { base: 10 };
  ensurePack(record, 'landmarks', otherPool, () => ((m += 1) % 3) / 3);
  assert.notEqual(landmarks.ids[1], 'gone');
  assert.equal(record.byType.capitals, capitals);
});

test('results summarize and completion clears only that type', () => {
  const record = empty();
  ensurePack(record, 'capitals', pool);
  ensurePack(record, 'landmarks', [{ id: 'one' }, { id: 'two' }, { id: 'three' }]);
  savePackResult(record, 'capitals', 0, { base: 731, postcard: { kind: 'new', tier: 2 } });
  assert.deepEqual(packSummary(record.byType.capitals), {
    played: 1, nextCard: 1, score: 731,
    counts: { new: 1, upgrade: 0, visited: 0, repeat: 0 },
  });
  completePack(record, 'capitals');
  assert.equal(record.byType.capitals, null);
  assert.ok(record.byType.landmarks);
});

test('only torn unfinished packs block tearing another type', () => {
  const record = empty();
  const dealt = { ids: ['one', 'two', 'three'], results: [null, null, null], torn: false };
  record.byType.capitals = dealt;
  assert.equal(isOpenPack(dealt), false);
  assert.equal(hasOtherOpenPack(record, 'landmarks'), false);

  dealt.torn = true;
  assert.equal(isOpenPack(dealt), true);
  assert.equal(hasOtherOpenPack(record, 'capitals'), false);
  assert.equal(hasOtherOpenPack(record, 'landmarks'), true);

  dealt.results = [{}, {}, {}];
  assert.equal(isOpenPack(dealt), false);
  assert.equal(hasOtherOpenPack(record, 'landmarks'), false);
});

test('legacy multiple open packs stay resumable but block every new type', () => {
  const open = () => ({ ids: ['one', 'two', 'three'], results: [null, null, null], torn: true });
  const record = empty();
  record.byType.capitals = open();
  record.byType.landmarks = open();
  assert.equal(hasOtherOpenPack(record, 'capitals'), true);
  assert.equal(hasOtherOpenPack(record, 'landmarks'), true);
  assert.equal(hasOtherOpenPack(record, 'landforms'), true);
});

test('select state locks other cards until the open pack completes', () => {
  const record = empty();
  record.byType.capitals = { ids: ['one', 'two', 'three'], results: [null, null, null], torn: true };
  writePack(record);
  assert.deepEqual(packChoiceState(record, 'capitals'), { inProgress: true, complete: false, locked: false });
  assert.deepEqual(packChoiceState(record, 'landmarks'), { inProgress: false, complete: false, locked: true });
  assert.deepEqual(packChoiceState(record, 'landforms'), { inProgress: false, complete: false, locked: true });
  completePack(record, 'capitals');
  assert.deepEqual(packChoiceState(record, 'landmarks'), { inProgress: false, complete: false, locked: false });
});

test('an untorn dealt pack does not lock select cards', () => {
  const record = empty();
  record.byType.capitals = { ids: ['one', 'two', 'three'], results: [null, null, null], torn: false };
  assert.equal(packChoiceState(record, 'landmarks').locked, false);
});

test('the tear guard refuses another type while a pack is open', () => {
  const record = empty();
  record.byType.capitals = { ids: ['one', 'two', 'three'], results: [null, null, null], torn: true };
  assert.equal(canTearPack(record, 'capitals'), true);
  assert.equal(canTearPack(record, 'landmarks'), false);
});

test('fresh mutations preserve another actor and expose the tear lock', () => {
  const first = empty();
  writePack(first);
  ensurePack(first, 'capitals', pool);
  const second = readPack();
  first.byType.capitals.torn = true;
  writePack(first);
  savePackResult(second, 'capitals', 0, { base: 10 });
  const current = readPack();
  assert.equal(current.byType.capitals.torn, true);
  assert.equal(current.byType.capitals.results[0].base, 10);
  assert.equal(canTearPack(current, 'landmarks'), false);
});

test('a finished pack is complete rather than in progress', () => {
  const record = empty();
  record.byType.capitals = { ids: ['one', 'two', 'three'], results: [{}, {}, {}], torn: true };
  assert.deepEqual(packChoiceState(record, 'capitals'), { inProgress: false, complete: true, locked: false });
});

test('home progress ignores merely dealt packs', () => {
  const record = empty();
  record.byType.capitals = { ids: ['one', 'two', 'three'], results: [null, null, null], torn: false };
  record.byType.landmarks = { ids: ['four', 'five', 'six'], results: [{}, null, null], torn: false };
  assert.equal(packProgressCount(record), 1);
});

test('select render drops skip-one-hour but retains open-now', () => {
  const source = readFileSync(new URL('../src/modes/pack.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Skip 1 hour/);
  assert.match(source, /Open a pack now/);
});

test('outcome kinds remain stable', () => {
  assert.deepEqual(packOutcome(false, 0, 0), { kind: 'visited' });
  assert.deepEqual(packOutcome(true, 0, 0), { kind: 'repeat' });
  assert.deepEqual(packOutcome(false, 0, 1), { kind: 'new', tier: 1 });
  assert.deepEqual(packOutcome(true, 1, 3), { kind: 'upgrade', tier: 3 });
});
