import assert from 'node:assert/strict';
import test from 'node:test';
import { bannerId } from '../src/account/banners.js';

test('removed banner selections fall back to True Navy', () => {
  assert.equal(bannerId('blue-horizon'), 'true-navy');
  assert.equal(bannerId('airmail'), 'true-navy');
  assert.equal(bannerId('low-tide'), 'low-tide');
});

test('open-field remains selectable', () => {
  assert.equal(bannerId('open-field'), 'open-field');
});
