import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../tile-bundle-worker/src/index.js';
import { unpackTileBundle } from '../src/globe/tile-bundle.js';

function stubTiles(byKey) {
  globalThis.fetch = async (url) => {
    const m = url.match(/\/(\d+)\/(\d+)\/(\d+)\.jpg/);
    const res = byKey[`${m[1]}/${m[2]}/${m[3]}`];
    return { ok: res.ok, status: res.status, arrayBuffer: async () => res.bytes.buffer };
  };
}

function stubCache(hit = null) {
  const puts = [];
  globalThis.caches = { default: { match: async () => hit, put: async (key, value) => puts.push({ key, value }) } };
  return puts;
}

const ctx = { waitUntil: () => {} };
const body = (tiles) => JSON.stringify({ provider: 's2gm2025', version: '2', tiles });

test('a member failure returns the graceful bundle-failed response instead of an unhandled rejection', async () => {
  stubCache();
  stubTiles({
    '7/1/1': { ok: true, status: 200, bytes: new Uint8Array([1, 2, 3]) },
    '7/2/1': { ok: false, status: 404, bytes: new Uint8Array() },
  });
  const req = new Request('https://bundle.invalid/', { method: 'POST', body: body([{ z: 7, x: 1, y: 1 }, { z: 7, x: 2, y: 1 }]) });
  const res = await worker.fetch(req, {}, ctx);
  assert.equal(res.status, 500);
  assert.equal(await res.text(), 'bundle failed');
  assert.match(res.headers.get('server-timing') || '', /cache;desc=miss/);
});

test('a successful bundle assembles every member and reports Server-Timing', async () => {
  const puts = stubCache();
  stubTiles({
    '7/1/1': { ok: true, status: 200, bytes: new Uint8Array([1, 2, 3]) },
    '7/2/1': { ok: true, status: 200, bytes: new Uint8Array([4, 5]) },
  });
  const req = new Request('https://bundle.invalid/', { method: 'POST', body: body([{ z: 7, x: 1, y: 1 }, { z: 7, x: 2, y: 1 }]) });
  const res = await worker.fetch(req, {}, ctx);
  assert.equal(res.status, 200);
  const tiles = unpackTileBundle(await res.arrayBuffer());
  assert.deepEqual([...tiles.get('s2gm2025/7/1/1')], [1, 2, 3]);
  assert.deepEqual([...tiles.get('s2gm2025/7/2/1')], [4, 5]);
  assert.match(res.headers.get('server-timing') || '', /cache;desc=miss/);
  assert.equal(puts.length, 1, 'a fresh assembly is cached');
});

test('a cache hit skips origin fetches and reports cache;desc=hit', async () => {
  globalThis.fetch = async () => { throw new Error('must not fetch on a cache hit'); };
  const cachedBody = new Uint8Array([9, 9]);
  stubCache(new Response(cachedBody, { status: 200, headers: { 'content-type': 'application/x-woe-tile-bundle' } }));
  const req = new Request('https://bundle.invalid/', { method: 'POST', body: body([{ z: 7, x: 1, y: 1 }]) });
  const res = await worker.fetch(req, {}, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('server-timing') || '', /cache;desc=hit/);
});
