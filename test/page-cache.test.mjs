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

// BRIEF-page-lifecycle.md requirement 4: after each settled round
// transition, live resources return within the documented budget, with no
// superseded textures retained outside it. Models the real sequence
// page-store.js runs every round: touch+pin the new plan, evict, then
// unpin the old round and evict again.
test('round transition: the previous round\'s pinned plan is released and evicted once the new round pins its own', () => {
  const cache = createPageCache({ maxTextures: 3, maxBytes: 1000 });
  cache.touch('madrid-9a', 10); cache.touch('madrid-9b', 10); cache.touch('madrid-7', 10);
  cache.pin('round-1', ['madrid-9a', 'madrid-9b', 'madrid-7']);
  assert.deepEqual(cache.evict(), []); // exactly at the texture cap, nothing pinned that must go

  cache.touch('congo-9a', 10); cache.touch('congo-9b', 10); cache.touch('congo-7', 10);
  cache.pin('round-2', ['congo-9a', 'congo-9b', 'congo-7']);
  // Round 1's plan is still pinned (not yet released), so round 2's own
  // plan can legitimately exceed the cap rather than silently discarding
  // the active round's own assets.
  assert.deepEqual(cache.evict(), []);
  assert.equal(cache.textureCount, 6);

  cache.unpin('round-1'); // the round-boundary release
  const evicted = cache.evict();
  assert.deepEqual(evicted.sort(), ['madrid-7', 'madrid-9a', 'madrid-9b']);
  assert.equal(cache.textureCount, 3, 'live resources return within the documented budget after the transition settles');
  assert.ok(['congo-9a', 'congo-9b', 'congo-7'].every((k) => cache.has(k)), 'the new round\'s own resident plan is never one of its own superseded textures');
});

test('re-touching a key moves it to the most-recently-used end', () => {
  const cache = createPageCache({ maxTextures: 2, maxBytes: 1000 });
  cache.touch('a', 10);
  cache.touch('b', 10);
  cache.touch('a', 10); // a is now MRU, b is LRU
  cache.touch('c', 10);
  assert.deepEqual(cache.evict(), ['b']);
});
