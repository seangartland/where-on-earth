import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };

const { extentTestPool, shuffleExtentPool } = await import('../src/modes/extent-test.js');
const bank = JSON.parse(readFileSync(new URL('../assets/locations-bank.json', import.meta.url), 'utf8'));

test('extent pool contains every and only playable extent entry', () => {
  const expected = bank.filter((item) => item.kind === 'extent' && Number.isFinite(item.lat)
    && Number.isFinite(item.lng) && typeof item.image === 'string' && item.image.trim());
  assert.deepEqual(extentTestPool(bank), expected);
  assert.equal(extentTestPool(bank).length, expected.length);
});

test('shuffled extent cycle has no repeats', () => {
  const pool = extentTestPool(bank);
  const cycle = shuffleExtentPool(pool, () => 0);
  assert.equal(cycle.length, pool.length);
  assert.equal(new Set(cycle.map((item) => item.id)).size, pool.length);
});
