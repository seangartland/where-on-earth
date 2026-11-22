import assert from 'node:assert/strict';
import test from 'node:test';

import { variantKey, mirroredUrl, KEY_VERSION } from '../tools/image-mirror/src/keys.js';

test('variantKey matches the design key scheme exactly', () => {
  assert.equal(KEY_VERSION, 'v1');
  assert.equal(
    variantKey('0123abcdef', 256),
    'photos/v1/sha256/0123abcdef/w256.webp',
  );
});

test('mirroredUrl builds the full serving URL on the approved host', () => {
  assert.equal(
    mirroredUrl('0123abcdef', 1280),
    'https://images.where-on.earth/photos/v1/sha256/0123abcdef/w1280.webp',
  );
});

test('a new encoder/version never reuses a v1 object path (distinct source hash -> distinct key)', () => {
  assert.notEqual(variantKey('aaaa', 256), variantKey('bbbb', 256));
});
