import test from 'node:test';
import assert from 'node:assert/strict';
import { focalObjectPosition } from '../src/core/focal.js';

test('focalObjectPosition returns a center position string for a finite focalY', () => {
  assert.equal(focalObjectPosition({ focalY: 15 }), 'center 15%');
  assert.equal(focalObjectPosition({ focalY: 0 }), 'center 0%');
});

test('focalObjectPosition returns null when focalY is absent or not finite', () => {
  assert.equal(focalObjectPosition({}), null);
  assert.equal(focalObjectPosition({ focalY: NaN }), null);
  assert.equal(focalObjectPosition(null), null);
});
