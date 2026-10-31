import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/meta/passport.js', import.meta.url), 'utf8');
const summarySource = source.match(/function passportSummary\(\) \{[\s\S]*?\n\}\n\nlet passportBox;/)?.[0]
  .replace(/\n\nlet passportBox;$/, '');
assert.ok(summarySource, 'passportSummary source found');

function summarize({ cities, landmarks, visits, order, meta = {} }) {
  const byId = new Map([...cities, ...landmarks].map((item) => [item.id, item]));
  const host = {
    locations: cities,
    landmarks,
    passport: { visits, order, meta },
    findLocation: (id) => byId.get(id),
    passportLocation: (id) => cities.find((item) => item.id === id),
  };
  return Function('host', 'PASSPORT_STAMPS', `${summarySource}; return passportSummary();`)(host, 5);
}

const city = { id: 'city-1', image: 'city.jpg' };
const landmark = { id: 'landmark-1', image: 'landmark.jpg' };

test('landmark-only passport is non-empty and includes the landmark stamp', () => {
  const summary = summarize({
    cities: [city],
    landmarks: [landmark],
    visits: { 'landmark-1': 800 },
    order: ['landmark-1'],
    meta: { 'landmark-1': { e: 1 } },
  });

  assert.equal(summary.found, 1);
  assert.equal(summary.earned, 1);
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.recent.map(({ item }) => item.id), ['landmark-1']);
});

test('mixed passport counts each city and landmark once', () => {
  const summary = summarize({
    cities: [city],
    landmarks: [landmark],
    visits: { 'city-1': 500, 'landmark-1': 700 },
    order: ['city-1', 'landmark-1'],
  });

  assert.equal(summary.found, 2);
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.recent.map(({ item }) => item.id), ['landmark-1', 'city-1']);
});

test('recommended home still forces the shared summary card visible', () => {
  assert.match(source, /if \(isRecsHome\) \{\s*passportEls\.box\.hidden = false;/);
  assert.match(source, /passportEls\.found\.textContent = summary\.found\.toLocaleString\(\);/);
  assert.match(source, /passportEls\.total\.textContent = summary\.total\.toLocaleString\(\);/);
});
