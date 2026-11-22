// Bounded page texture cache (BRIEF-renderer-pilot.md): LRU eviction against
// the feasibility-report caps, pinned keys for the active round's plan are
// never evicted. Pure and dependency-free: callers own the actual GPU
// textures and dispose them for whatever this reports as evicted.

export function createPageCache({ maxTextures, maxBytes }) {
  const entries = new Map(); // key -> { bytes, pinnedBy: Set<token> }, insertion order = LRU order
  let bytesUsed = 0;

  function touch(key, bytes) {
    const existing = entries.get(key);
    if (existing) { bytesUsed -= existing.bytes; entries.delete(key); existing.bytes = bytes; entries.set(key, existing); bytesUsed += bytes; return; }
    entries.set(key, { bytes, pinnedBy: new Set() });
    bytesUsed += bytes;
  }

  function pin(token, keys) {
    for (const key of keys) entries.get(key)?.pinnedBy.add(token);
  }

  function unpin(token) {
    for (const entry of entries.values()) entry.pinnedBy.delete(token);
  }

  function isPinned(key) {
    const entry = entries.get(key);
    return !!entry && entry.pinnedBy.size > 0;
  }

  // Evicts least-recently-touched unpinned entries until both caps are
  // satisfied, or until every remaining entry is pinned (in which case the
  // active round's own plan can legitimately exceed a cap; callers report
  // that rather than silently discarding resident pages the round needs).
  function evict() {
    const evicted = [];
    for (const [key, entry] of entries) {
      // entries.size already reflects every entries.delete() below (a live
      // Map), so it alone is this iteration's current count; subtracting
      // evicted.length on top double-counts each deletion and makes the
      // loop stop after evicting roughly half of what two-or-more-eviction
      // calls actually need (BRIEF-page-lifecycle.md requirement 4: found
      // via the round-transition test below, where 3 unpinned entries over
      // a cap of 3 left only 2 evicted and the cache 1 over budget).
      if (entries.size <= maxTextures && bytesUsed <= maxBytes) break;
      if (entry.pinnedBy.size > 0) continue;
      evicted.push(key);
      entries.delete(key);
      bytesUsed -= entry.bytes;
    }
    return evicted;
  }

  return {
    touch,
    pin,
    unpin,
    isPinned,
    evict,
    get textureCount() { return entries.size; },
    get bytesUsed() { return bytesUsed; },
    has: (key) => entries.has(key),
  };
}
