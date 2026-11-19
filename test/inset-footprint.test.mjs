import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTileCoordinates } from '../src/globe/inset-footprint.js';

test('zoom warming selects only the arriving window visible footprint', () => {
  const win = { n: 16, vx0: 14, vx1: 17, vy0: 5, vy1: 6, tx0: 13, ty0: 4, cols: 6, rows: 4 };
  assert.deepEqual(visibleTileCoordinates(win), [
    { x: 14, y: 5 }, { x: 15, y: 5 }, { x: 0, y: 5 }, { x: 1, y: 5 },
    { x: 14, y: 6 }, { x: 15, y: 6 }, { x: 0, y: 6 }, { x: 1, y: 6 },
  ]);
});
