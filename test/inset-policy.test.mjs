import test from 'node:test';
import assert from 'node:assert/strict';
import { idlePrefetchAllowed, insetFetchLimit, servedRungIndex } from '../src/globe/inset-policy.js';

test('slow mode keeps the requested rung and visible burst while disabling idle prefetch', () => {
  const ladder = [5, 7, 8, 9];
  assert.equal(servedRungIndex(ladder, 9, false), 3);
  assert.equal(insetFetchLimit(true, 12, 18), 18);
  assert.equal(idlePrefetchAllowed(true), false);
  assert.equal(servedRungIndex(ladder, 9, true), 2, 'Save Data remains the explicit quality demotion');
});
