import assert from 'node:assert/strict';
import test from 'node:test';
import { levelForXp, validateAvatar, xpAtLevel, xpForCompletion } from '../src/progression.js';

test('Daily XP uses canonical performance caps and the published level curve', () => {
  const awards = xpForCompletion(5000, [
    { distance_km: 24.999, score: 1000 }, { distance_km: 149.999, score: 900 },
    { distance_km: 150, score: 800 }, { distance_km: 25, score: 700 }, { distance_km: 1, score: 1000 },
  ]);
  assert.deepEqual(awards, { completion: 100, score: 50, postcards: 20, bullseyes: 6 });
  assert.equal(xpAtLevel(2), 100);
  assert.equal(xpAtLevel(5), 520);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(520), 5);
});

test('avatar config accepts only the starter kit and gates Postmark at level 10', () => {
  assert.equal(validateAvatar({ frame: 'postmark' }, 9), null);
  assert.equal(validateAvatar({ frame: 'postmark' }, 10).frame, 'postmark');
  assert.equal(validateAvatar({ eyes: 'not-a-part' }, 10), null);
});
