import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RATING, actualScore, expectedScore, kFactor, updateRating } from '../pvp-worker/src/rating.js';

test('expected scores are symmetric', () => {
  assert.equal(expectedScore(1200, 1200), 0.5);
  assert.ok(Math.abs(expectedScore(1400, 1200) + expectedScore(1200, 1400) - 1) < 1e-12);
});

test('underdogs gain more for a win than favourites', () => {
  const favourite = updateRating({ rating: 1400, matches: 10 }, { rating: 1200 }, 1);
  const underdog = updateRating({ rating: 1200, matches: 10 }, { rating: 1400 }, 1);
  assert.ok(underdog.change > favourite.change);
});

test('draws preserve equal ratings and reward a draw against a stronger player', () => {
  assert.equal(updateRating({ rating: 1200, matches: 0 }, { rating: 1200 }, 0.5).change, 0);
  assert.ok(updateRating({ rating: 1200, matches: 10 }, { rating: 1400 }, 0.5).change > 0);
  assert.equal(actualScore(100, 100), 0.5);
});

test('the K factor switches on the tenth rated match', () => {
  assert.equal(kFactor(9), 40);
  assert.equal(kFactor(10), 20);
});

test('provisional status ends at five matches', () => {
  assert.equal(updateRating({ rating: 1200, matches: 3 }, { rating: 1200 }, 1).provisional, true);
  assert.equal(updateRating({ rating: 1200, matches: 4 }, { rating: 1200 }, 1).provisional, false);
});

test('the fresh start uses the default rating and no matches', () => {
  const result = updateRating({}, { rating: DEFAULT_RATING }, 0.5);
  assert.equal(DEFAULT_RATING, 1200);
  assert.equal(result.before, 1200);
  assert.equal(result.matches, 1);
});
