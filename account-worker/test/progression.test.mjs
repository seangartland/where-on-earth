import assert from 'node:assert/strict';
import test from 'node:test';
import { communityPercentage, communityPercentages, levelForXp, ownsIdentity, validateAvatar, xpAtLevel, xpForCompletion } from '../src/progression.js';
import { scoreForDistance } from '../src/daily-score.js';

test('Daily XP uses canonical performance caps and the published level curve', () => {
  const awards = xpForCompletion(5000, [
    { distance_km: 24.999, score: scoreForDistance(24.999) }, { distance_km: 149.999, score: 900 },
    { distance_km: 150, score: 800 }, { distance_km: 25, score: 700 }, { distance_km: 1, score: 1000 },
  ]);
  assert.deepEqual(awards, { completion: 100, score: 50, postcards: 20, bullseyes: 6 });
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

test('avatar config accepts only the starter kit and gates Postmark at level 10', () => {
  assert.equal(validateAvatar({ frame: 'postmark' }, 9), null);
  assert.equal(validateAvatar({ frame: 'postmark' }, 10).frame, 'postmark');
  assert.equal(validateAvatar({ eyes: 'not-a-part' }, 10), null);
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
