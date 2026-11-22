import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageCache } from '../src/globe/page-cache.js';

test('evicts least-recently-touched entries once over the texture cap', () => {
  const cache = createPageCache({ maxTextures: 2, maxBytes: 1000 });
  cache.touch('a', 10);
  cache.touch('b', 10);
  cache.touch('c', 10);
  const evicted = cache.evict();
  assert.deepEqual(evicted, ['a']);
  assert.equal(cache.textureCount, 2);
});

test('evicts once over the byte cap even under the texture cap', () => {
  const cache = createPageCache({ maxTextures: 10, maxBytes: 25 });
  cache.touch('a', 10);
  cache.touch('b', 10);
  cache.touch('c', 10);
  const evicted = cache.evict();
  assert.deepEqual(evicted, ['a']);
  assert.equal(cache.bytesUsed, 20);
});

test('never evicts a key pinned by the active round, even over both caps', () => {
  const cache = createPageCache({ maxTextures: 1, maxBytes: 5 });
  cache.touch('a', 10);
  cache.pin('round-1', ['a']);
  cache.touch('b', 10);
  const evicted = cache.evict();
  assert.deepEqual(evicted, ['b']);
  assert.ok(cache.has('a'));
  assert.equal(cache.isPinned('a'), true);
});

test('unpin releases a key back to normal LRU eviction', () => {
  const cache = createPageCache({ maxTextures: 2, maxBytes: 1000 });
  cache.touch('a', 10);
  cache.pin('round-1', ['a']);
  cache.touch('b', 10);
  assert.deepEqual(cache.evict(), []); // both fit under the texture cap, nothing to evict yet
  cache.touch('c', 10); // now 3 entries over a cap of 2; 'a' is pinned and LRU-oldest
  assert.deepEqual(cache.evict(), ['b'], "'a' is pinned so the unpinned-but-newer 'b' is evicted instead");
  cache.unpin('round-1');
  cache.touch('d', 10);
  const evicted = cache.evict();
  assert.deepEqual(evicted, ['a']);
});

test('re-touching a key moves it to the most-recently-used end', () => {
  const cache = createPageCache({ maxTextures: 2, maxBytes: 1000 });
  cache.touch('a', 10);
  cache.touch('b', 10);
  cache.touch('a', 10); // a is now MRU, b is LRU
  cache.touch('c', 10);
  assert.deepEqual(cache.evict(), ['b']);
});
