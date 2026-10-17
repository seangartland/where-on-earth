import assert from 'node:assert/strict';
import test from 'node:test';
import { passportEntryCompare, passportGroups } from '../src/meta/passport-grouping.mjs';

const entry = (name, country, continent, band, extra = {}) => ({
  item: { short: name }, country, continent, band, visited: false, earned: 0, recency: -1, ...extra,
});
const fixtures = [
  entry('Kyoto', 'Japan', 'Asia', 'common', { visited: true, earned: 1, recency: 3, km: 20 }),
  entry('Osaka', 'Japan', 'Asia', 'rare'),
  entry('Lima', 'Peru', 'South America', 'legendary', { visited: true, recency: 8, km: 40 }),
  entry('Unknown', 'Atlantis', '', null),
];

test('builds and orders all grouped modes with fallbacks', () => {
  assert.deepEqual(passportGroups(fixtures, 'continent', ['Asia', 'South America'], () => null).map((g) => g.key), ['Asia', 'South America', 'Other']);
  assert.deepEqual(passportGroups(fixtures, 'country', [], (key) => ({ flag: key === 'Japan' ? '🇯🇵' : '' })).map((g) => [g.key, g.flag]), [['Atlantis', ''], ['Japan', '🇯🇵'], ['Peru', '']]);
  assert.deepEqual(passportGroups(fixtures, 'difficulty', [], () => null).map((g) => g.key), ['common', 'rare', 'legendary', 'other']);
  assert.deepEqual(passportGroups(fixtures, 'none', [], () => null), []);
});

test('sorts inside sections and leaves mysteries last for recency and distance', () => {
  assert.deepEqual([...fixtures].sort(passportEntryCompare('atlas')).map((e) => e.item.short), ['Unknown', 'Kyoto', 'Osaka', 'Lima']);
  assert.deepEqual([...fixtures].sort(passportEntryCompare('name')).map((e) => e.item.short), ['Kyoto', 'Lima', 'Osaka', 'Unknown']);
  assert.deepEqual([...fixtures].sort(passportEntryCompare('recent')).map((e) => e.item.short), ['Lima', 'Kyoto', 'Unknown', 'Osaka']);
  assert.deepEqual([...fixtures].sort(passportEntryCompare('distance')).map((e) => e.item.short), ['Kyoto', 'Lima', 'Unknown', 'Osaka']);
});

test('filtered visibility does not change full group totals', () => {
  const japan = passportGroups(fixtures, 'country', [], () => null).find((group) => group.key === 'Japan');
  const visible = japan.entries.filter((item) => !item.visited);
  assert.equal(japan.entries.length, 2);
  assert.equal(japan.entries.filter((item) => item.earned).length, 1);
  assert.equal(visible.length, 1);
});
