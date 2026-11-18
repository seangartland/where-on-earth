import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.location = { search: '' };

const { postcardAnimValue } = await import('../src/core/state.js');

test('postcard animation migration combines legacy settings with AND', () => {
  assert.equal(postcardAnimValue(null, 'on', 'on'), true);
  assert.equal(postcardAnimValue(null, 'off', 'on'), false);
  assert.equal(postcardAnimValue(null, 'on', 'off'), false);
  assert.equal(postcardAnimValue(null, 'off', 'off'), false);
});

test('saved postcard animation bypasses legacy settings', () => {
  assert.equal(postcardAnimValue('on', 'off', 'off'), true);
  assert.equal(postcardAnimValue('off', 'on', 'on'), false);
  assert.equal(postcardAnimValue(null, null, null), true);
});
