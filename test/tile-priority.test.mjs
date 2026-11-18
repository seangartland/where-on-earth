import test from 'node:test';
import assert from 'node:assert/strict';
import { sortTilesCenterOut, tilePriority } from '../src/globe/tile-priority.js';

test('tile priority keeps visible tiles ahead of margin tiles and sharpens from the center', () => {
  const centerX = 10.5;
  const centerY = 20.5;
  const tiles = [
    { id: 'margin-near', pri: tilePriority(false, 10, 20, centerX, centerY) },
    { id: 'visible-far', pri: tilePriority(true, 12, 20, centerX, centerY) },
    { id: 'visible-center', pri: tilePriority(true, 10, 20, centerX, centerY) },
    { id: 'visible-next', pri: tilePriority(true, 11, 20, centerX, centerY) },
  ];

  assert.deepEqual(sortTilesCenterOut(tiles).map((tile) => tile.id), [
    'visible-center', 'visible-next', 'visible-far', 'margin-near',
  ]);
});
