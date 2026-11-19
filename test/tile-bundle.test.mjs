import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTileBundle, tryUnpackTileBundle, unpackTileBundle } from '../src/globe/tile-bundle.js';

test('tile bundle round-trips every tile byte-for-byte', () => {
  const tiles = [
    { key: 's2gm2025/9/1/2', bytes: new Uint8Array([1, 2, 3]) },
    { key: 's2gm2025/9/2/2', bytes: new Uint8Array([4, 5]) },
  ];
  const unpacked = unpackTileBundle(buildTileBundle(tiles));
  for (const tile of tiles) assert.deepEqual(unpacked.get(tile.key), tile.bytes);
});

test('corrupt bundle is rejected so tile loading can fall back', () => {
  const expected = new Set(['s2gm2025/9/1/2']);
  assert.equal(tryUnpackTileBundle(new Uint8Array([0, 1, 2]), expected), null);
});
