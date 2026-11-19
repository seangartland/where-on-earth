const MAGIC = 'WOE1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function buildTileBundle(tiles) {
  const manifest = encoder.encode(JSON.stringify({ v: 1, tiles: tiles.map(({ key, bytes }) => ({ key, length: bytes.byteLength })) }));
  if (manifest.byteLength > 0xffff) throw new Error('bundle manifest too large');
  const out = new Uint8Array(6 + manifest.byteLength + tiles.reduce((total, tile) => total + tile.bytes.byteLength, 0));
  out.set(encoder.encode(MAGIC));
  new DataView(out.buffer).setUint16(4, manifest.byteLength);
  out.set(manifest, 6);
  let offset = 6 + manifest.byteLength;
  for (const { bytes } of tiles) { out.set(bytes, offset); offset += bytes.byteLength; }
  return out;
}

export function unpackTileBundle(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength < 6 || decoder.decode(data.subarray(0, 4)) !== MAGIC) throw new Error('invalid bundle magic');
  const manifestLength = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(4);
  const bodyOffset = 6 + manifestLength;
  if (bodyOffset > data.byteLength) throw new Error('truncated bundle manifest');
  let manifest;
  try { manifest = JSON.parse(decoder.decode(data.subarray(6, bodyOffset))); } catch { throw new Error('invalid bundle manifest'); }
  if (manifest?.v !== 1 || !Array.isArray(manifest.tiles)) throw new Error('invalid bundle manifest');
  const tiles = new Map();
  let offset = bodyOffset;
  for (const entry of manifest.tiles) {
    if (!entry || typeof entry.key !== 'string' || !Number.isSafeInteger(entry.length) || entry.length < 0 || tiles.has(entry.key) || offset + entry.length > data.byteLength) throw new Error('invalid bundle entry');
    tiles.set(entry.key, data.slice(offset, offset + entry.length));
    offset += entry.length;
  }
  if (offset !== data.byteLength) throw new Error('trailing bundle data');
  return tiles;
}

export function tryUnpackTileBundle(bytes, expectedKeys) {
  try {
    const tiles = unpackTileBundle(bytes);
    if (tiles.size !== expectedKeys.size || [...expectedKeys].some((key) => !tiles.has(key))) return null;
    return tiles;
  } catch { return null; }
}
