import assert from 'node:assert/strict';
import test from 'node:test';
import { bannerId } from '../src/account/banners.js';

test('removed banner selections fall back to Open Field', () => {
  assert.equal(bannerId('blue-horizon'), 'open-field');
  assert.equal(bannerId('airmail'), 'open-field');
  assert.equal(bannerId('low-tide'), 'low-tide');
});
