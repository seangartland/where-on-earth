import test from 'node:test';
import assert from 'node:assert/strict';
import { inPilotZ10 } from '../src/globe/pilot-region.js';

test('pilot census includes the specified z10 footprints only', () => {
  assert.equal(inPilotZ10(10, 501, 386), true); // Madrid
  assert.equal(inPilotZ10(10, 262, 380), true); // Chicago
  assert.equal(inPilotZ10(10, 999, 491), true); // Majuro
  assert.equal(inPilotZ10(10, 774, 355), false); // Tokyo
  assert.equal(inPilotZ10(9, 250, 193), false);
});
