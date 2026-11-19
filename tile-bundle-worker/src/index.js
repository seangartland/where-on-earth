import { buildTileBundle } from '../../src/globe/tile-bundle.js';

const PROVIDERS = {
  s2gm2025: { path: 's2gm2025', version: '2', zooms: new Set([5, 7, 8, 9]) },
  eox2025: { path: 'tiles', version: '3' },
  's2gm2025-sf1b': { path: 's2gm2025-sf1b', version: '1' },
};
const TILE_ORIGIN = 'https://tiles.where-on.earth';
const MAX_TILES = 128;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

function response(body, status = 200, headers = {}) { return new Response(body, { status, headers: { ...cors, ...headers } }); }
function validTile(tile, provider) {
  if (!tile || !Number.isInteger(tile.z) || !Number.isInteger(tile.x) || !Number.isInteger(tile.y) || tile.z < 0 || tile.z > 10 || (provider.zooms && !provider.zooms.has(tile.z))) return false;
  const n = 2 ** tile.z;
  return tile.x >= 0 && tile.x < n && tile.y >= 0 && tile.y < n;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return response(null, 204);
    if (request.method !== 'POST') return response('method not allowed', 405);
    let body;
    try { body = await request.json(); } catch { return response('invalid JSON', 400); }
    const provider = PROVIDERS[body?.provider];
    if (!provider || body.version !== provider.version || !Array.isArray(body.tiles) || !body.tiles.length || body.tiles.length > MAX_TILES || body.tiles.some((tile) => !validTile(tile, provider))) return response('invalid bundle request', 400);
    const keys = new Set();
    for (const tile of body.tiles) keys.add(`${body.provider}/${tile.z}/${tile.x}/${tile.y}`);
    if (keys.size !== body.tiles.length) return response('duplicate tile', 400);
    const cacheKey = new Request(`https://bundle-cache.invalid/${body.provider}/v${provider.version}/${[...keys].sort().join(',')}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const tiles = await Promise.all(body.tiles.map(async (tile) => {
      const url = `${TILE_ORIGIN}/${provider.path}/${tile.z}/${tile.x}/${tile.y}.jpg?v=${provider.version}`;
      const tileResponse = await fetch(url);
      if (!tileResponse.ok) throw new Error(`tile ${tileResponse.status}`);
      return { key: `${body.provider}/${tile.z}/${tile.x}/${tile.y}`, bytes: new Uint8Array(await tileResponse.arrayBuffer()) };
    }));
    let bundle;
    try { bundle = buildTileBundle(tiles); } catch { return response('bundle failed', 500); }
    const out = response(bundle, 200, { 'content-type': 'application/x-woe-tile-bundle', 'cache-control': 'public, max-age=31536000, immutable' });
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  },
};
