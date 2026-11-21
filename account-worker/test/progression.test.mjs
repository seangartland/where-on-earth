import assert from 'node:assert/strict';
import test from 'node:test';
import { communityPercentage, communityPercentages, isHolidayTopperDate, isThanksgiving2026Date, levelForXp, normalizeSeal, ownsIdentity, validateSeal, xpAtLevel, xpForCompletion } from '../src/progression.js';
import { scoreForDistance } from '../src/daily-score.js';

test('Daily XP uses canonical performance caps and the published level curve', () => {
  const awards = xpForCompletion(5000, [
    { distance_km: 24.999, score: scoreForDistance(24.999) }, { distance_km: 149.999, score: 900 },
    { distance_km: 150, score: 800 }, { distance_km: 25, score: 700 }, { distance_km: 1, score: 1000 },
  ]);
  assert.deepEqual(awards, { base: 100, score: 50, postcards: 20, bullseyes: 6, total: 176 });
  assert.equal(xpAtLevel(2), 100);
  assert.equal(xpAtLevel(5), 520);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(520), 5);
});

test('level-two title ownership allows only the saved choice until level five', () => {
  const earned = new Set();
  assert.equal(ownsIdentity('title', 'window-seat', 2, earned, 'window-seat'), true);
  assert.equal(ownsIdentity('title', 'aisle-seat', 2, earned, 'window-seat'), false);
  assert.equal(ownsIdentity('title', 'window-seat', 5, earned, 'window-seat'), true);
  assert.equal(ownsIdentity('title', 'aisle-seat', 5, earned, 'window-seat'), true);
});

test('seal config validates discs, earned motifs, finishes, toppers, initials, and rejects legacy avatars', () => {
  assert.deepEqual(validateSeal({ v: 2, initials: 'm', disc: 'burgundy', motif: 'plane' }, new Set(['frequent-flyer'])), { v: 2, initials: 'M', disc: 'burgundy', motif: 'plane', ring: 'level', topper: null });
  assert.equal(validateSeal({ ring: 'silver' }, new Set(), 4), null);
  assert.equal(validateSeal({ ring: 'gold' }, new Set(), 9), null);
  assert.equal(validateSeal({ ring: 'silver' }, new Set(), 5)?.ring, 'silver');
  assert.equal(validateSeal({ ring: 'gold' }, new Set(), 10)?.ring, 'gold');
  assert.equal(validateSeal({ topper: 'santa-hat' }, new Set(), 1), null);
  assert.equal(validateSeal({ topper: 'antlers' }, new Set(['holiday-antlers']), 1)?.topper, 'antlers');
  assert.equal(validateSeal({ topper: 'leaf-cluster' }, new Set(), 1), null);
  assert.equal(validateSeal({ topper: 'leaf-cluster' }, new Set(['thanksgiving-2026-leaf-cluster']), 1)?.topper, 'leaf-cluster');
  assert.equal(validateSeal({ disc: 'violet' }, new Set()), null);
  assert.equal(validateSeal({ motif: 'plane' }, new Set()), null);
  assert.equal(validateSeal({ initials: '123' }, new Set()), null);
  assert.equal(validateSeal({ backdrop: 'atlas-navy' }, new Set()), null);
});

test('read normalization preserves a legitimately saved finish and topper', () => {
  assert.deepEqual(normalizeSeal(JSON.stringify({ v: 2, initials: 's', disc: 'navy', motif: 'globe', ring: 'gold', topper: 'santa-hat' }), new Set(['holiday-santa']), 10), { v: 2, initials: 'S', disc: 'navy', motif: 'globe', ring: 'gold', topper: 'santa-hat' });
});

test('holiday topper window is December 20 through 26 of the current year', () => {
  const now = Date.UTC(2026, 11, 21);
  assert.equal(isHolidayTopperDate('2026-12-19', now), false);
  assert.equal(isHolidayTopperDate('2026-12-20', now), true);
  assert.equal(isHolidayTopperDate('2026-12-26', now), true);
  assert.equal(isHolidayTopperDate('2026-12-27', now), false);
  assert.equal(isHolidayTopperDate('2025-12-21', now), false);
});

test('Thanksgiving window is November 25 through 29 of the current year', () => {
  const now = Date.UTC(2026, 10, 26);
  assert.equal(isThanksgiving2026Date('2026-11-24', now), false);
  assert.equal(isThanksgiving2026Date('2026-11-25', now), true);
  assert.equal(isThanksgiving2026Date('2026-11-29', now), true);
  assert.equal(isThanksgiving2026Date('2026-11-30', now), false);
  assert.equal(isThanksgiving2026Date('2025-11-27', now), false);
});

test('seasonal cards and titles require their earned rewards', () => {
  const earned = new Set(['card:harvest', 'title:grateful-traveler', 'card:winter-post', 'title:sleigh-captain']);
  for (const [type, id] of [['card', 'harvest'], ['title', 'grateful-traveler'], ['card', 'winter-post'], ['title', 'sleigh-captain']]) {
    assert.equal(ownsIdentity(type, id, 1, new Set()), false);
    assert.equal(ownsIdentity(type, id, 1, earned), true);
  }
});

test('community percentages keep small cohorts and zero earners private', () => {
  assert.equal(communityPercentage(49, 1), null);
  assert.equal(communityPercentage(50, 0), null);
  assert.equal(communityPercentage(200, 1), '<1%');
  assert.equal(communityPercentage(50, 1), '2%');
});

test('overlapping community reads cannot overwrite a newer percentage snapshot', async () => {
  let eligibleReads = 0; let releaseFirst;
  const firstRead = new Promise((resolve) => { releaseFirst = resolve; });
  const env = { DB: { prepare(sql) {
    if (sql.startsWith('SELECT COUNT(DISTINCT account_id)')) {
      const eligible = eligibleReads++ === 0 ? 50 : 51;
      return { first: async () => ({ n: eligible }) };
    }
    if (sql.startsWith('SELECT achievement_id')) {
      const call = eligibleReads;
      return { all: async () => {
        if (call === 1) await firstRead;
        return { results: [{ achievement_id: 'first-departure', n: 25 }] };
      } };
    }
    throw new Error(`unexpected write: ${sql}`);
  } } };
  const older = communityPercentages(env);
  await Promise.resolve();
  const newer = await communityPercentages(env);
  releaseFirst();
  await older;
  assert.equal(newer.get('first-departure'), '49%');
});
