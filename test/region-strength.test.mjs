import assert from 'node:assert/strict';
import test from 'node:test';
import { regionStrength } from '../src/meta/region-strength.mjs';

const order = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
const entries = (continent, scores) => scores.map((best) => ({ continent, best }));

test('calculates rounded averages and keeps continent order', () => {
  const result = regionStrength([...entries('Europe', [700, 701, 702, 703, 704]), ...entries('Asia', [600, 601, 602])], order);
  assert.deepEqual(result.rows, [
    { continent: 'Asia', found: 3, avgBest: 601, qualifies: false },
    { continent: 'Europe', found: 5, avgBest: 702, qualifies: true },
  ]);
  assert.equal(result.strongest.continent, 'Europe');
  assert.equal(result.weakest, null);
});

test('applies the five-place guardrail and reports no qualifying regions', () => {
  const result = regionStrength([...entries('Africa', [100, 200, 300, 400]), ...entries('Oceania', [500])], order);
  assert.ok(result.rows.every((row) => !row.qualifies));
  assert.equal(result.strongest, null);
  assert.equal(result.weakest, null);
});

test('breaks strongest and weakest ties by count then continent order', () => {
  const scoreResult = regionStrength([...entries('Africa', [300, 300, 300, 300, 300]), ...entries('Asia', [700, 700, 700, 700, 700])], order);
  assert.equal(scoreResult.strongest.continent, 'Asia');
  assert.equal(scoreResult.weakest.continent, 'Africa');
  const result = regionStrength([...entries('Africa', [500, 500, 500, 500, 500]), ...entries('Asia', [500, 500, 500, 500, 500, 500]), ...entries('Europe', [500, 500, 500, 500, 500, 500])], order);
  assert.equal(result.strongest.continent, 'Asia');
  assert.equal(result.weakest.continent, 'Asia');
  const orderTie = regionStrength([...entries('Africa', [500, 500, 500, 500, 500]), ...entries('Asia', [500, 500, 500, 500, 500])], order);
  assert.equal(orderTie.strongest.continent, 'Africa');
  assert.equal(orderTie.weakest.continent, 'Africa');
});

test('sets weakest to null with a single qualifying region and supports empty input', () => {
  const single = regionStrength(entries('Antarctica', [900, 900, 900, 900, 900]), order);
  assert.equal(single.strongest.continent, 'Antarctica');
  assert.equal(single.weakest, null);
  assert.deepEqual(regionStrength([], order), { rows: [], strongest: null, weakest: null });
});
