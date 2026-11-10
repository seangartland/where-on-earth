// Where on Earth tile cache worker (loading pass part 2).
//
// Scope discipline, the safety core of this file: the fetch handler calls
// respondWith ONLY for requests to the tile host. Every other request -
// game code, API calls, photos - is left completely untouched, so a bad
// worker can never trap a deploy or serve stale game code. Tile URLs carry
// ?v= version keys (a re-render ships a new ?v=), so a cached tile can
// never go stale against a re-render.
//
// Strategy: cache-first from the versioned cache 'woe-tiles-v1'. On a miss,
// fetch, store a clone stamped with its insertion time, and return the
// response. Tile responses are CORS-readable, so they cache as ordinary
// responses, not opaque ones.
//
// LRU cap ~100 MB: Cache Storage keeps no LRU metadata, so insertion order
// is tracked with a timestamp header stamped on the stored clone. A trim
// pass (on activate, then every 50 puts) sums stored sizes from
// Content-Length (blob size when the header is absent) and evicts
// oldest-first down to the cap.
const CACHE_NAME = 'woe-tiles-v1';
const TILE_HOST = 'tiles.where-on.earth';
const CAP_BYTES = 100 << 20; // ~100 MB (Sean, 2026-11-10: up from 60)
const STAMP_HEADER = 'x-woe-stamp';
const TRIM_EVERY_PUTS = 50;
let putsSinceTrim = 0;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('woe-tiles-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await trimCache();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  let url;
  try { url = new URL(event.request.url); } catch { return; }
  if (url.hostname !== TILE_HOST) return; // untouched: no respondWith
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response && response.ok) {
      await cache.put(event.request, await stampedClone(response));
      putsSinceTrim++;
      if (putsSinceTrim >= TRIM_EVERY_PUTS) {
        putsSinceTrim = 0;
        await trimCache(cache);
      }
    }
    return response;
  })());
});

// Rebuild a response with the insertion-time header set. The body is read
// from a clone, so the original response stays deliverable.
async function stampedClone(response) {
  const blob = await response.clone().blob();
  const headers = new Headers(response.headers);
  headers.set(STAMP_HEADER, String(Date.now()));
  return new Response(blob, { status: response.status, statusText: response.statusText, headers });
}

async function trimCache(openCache) {
  const cache = openCache || await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  const entries = [];
  let total = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    let size = Number(response.headers.get('content-length')) || 0;
    if (!size) size = (await response.clone().blob()).size;
    entries.push({ request, size, stamp: Number(response.headers.get(STAMP_HEADER)) || 0 });
    total += size;
  }
  entries.sort((a, b) => a.stamp - b.stamp);
  while (total > CAP_BYTES && entries.length) {
    const oldest = entries.shift();
    await cache.delete(oldest.request);
    total -= oldest.size;
  }
}
