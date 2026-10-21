import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };

const { distanceKm } = await import('../src/core/math.js');
const { flyoverTier, WEIGHTS } = await import('../src/core/config.js');
const { distanceScore, scoreGuess, scoringDistanceKm } = await import('../src/game/scoring.js');
const { dailyIds, isLandmark, isPlayableLocation, resolvePinnedIds } = await import('../src/daily.js');
const { isPoolLandmark } = await import('../src/modes/landmarks.js');

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const cities = load('locations.json');
const landmarks = load('locations-landmarks-sol.json');
const trivia = load('trivia-bank.json');
const expeditions = load('expeditions.json');
const weekly = load('weekly-expeditions.json');
const pins = load('daily-pins.json').pins;
const byLandmarkId = new Map(landmarks.map((item) => [item.id, item]));

const APPROVED_AREAS = {
  'amalfi-coast-d34-58': 30,
  'bering-strait': 45,
  'black-forest': 80,
  'daintree-rainforest': 35,
  'danube-delta': 50,
  'dead-sea': 55,
  'great-ocean-road': 122,
  'napa-valley-ava': 30,
  'suez-canal': 97,
  'lake-baikal': 342.7,
  'lake-superior': 338,
  'lake-victoria': 246.7,
  'lake-titicaca': 83.7,
  'lake-bled': 1.1,
  'crater-lake': 4.9,
  'great-salt-lake': 58.1,
  'moraine-lake': 0.8,
  'plitvice-lakes': 16.5,
  'lake-como': 25.7,
  'lake-malawi': 301.2,
  'lake-balkhash': 334.3,
  'yellowstone-national-park': 74.8,
  'serengeti-national-park': 110.9,
  'kruger-national-park': 191,
  'fiordland-national-park': 128.5,
  'etosha-national-park': 203.3,
  'masai-mara': 40.6,
  'sagarmatha-national-park': 29.3,
  'grand-teton-national-park': 33,
  'easter-island': 14,
  'lord-howe-island': 5,
  'galapagos-islands': 148,
  'loch-ness': 20,
};

function destination(start, km, bearingDegrees = 73) {
  const angular = km / 6371.0088;
  const bearing = bearingDegrees * Math.PI / 180;
  const lat1 = start.lat * Math.PI / 180;
  const lng1 = start.lng * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular)
    + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
}

const close = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

test('all approved areas clamp inside and boundary guesses, then subtract outside', () => {
  const actualMap = Object.fromEntries(landmarks
    .filter((item) => item.kind === 'area' && Object.hasOwn(item, 'extentKm'))
    .map((item) => [item.id, item.extentKm]));
  assert.deepEqual(actualMap, APPROVED_AREAS);

  for (const [id, extentKm] of Object.entries(APPROVED_AREAS)) {
    const target = byLandmarkId.get(id);
    for (const [factor, expected] of [[0.5, 0], [1, 0], [1.5, extentKm * 0.5]]) {
      const guess = destination(target, extentKm * factor);
      const adjusted = scoringDistanceKm(guess, target);
      close(adjusted, expected, 1e-8);
      assert.ok(adjusted >= 0);
    }
  }
});

test('extent validation is own-property, finite, positive, and clamps exact zero', () => {
  const guess = { lat: 0, lng: 1 };
  const target = { lat: 0, lng: 0 };
  const raw = distanceKm(guess, target);
  assert.equal(scoringDistanceKm(target, { ...target, extentKm: 30 }), 0);
  assert.equal(scoringDistanceKm(guess, { ...target, extentKm: raw }), 0);
  assert.equal(scoringDistanceKm(guess, { ...target, extentKm: raw + 1 }), 0);
  for (const extentKm of [undefined, null, 0, -1, '30', NaN, Infinity]) {
    assert.ok(Object.is(scoringDistanceKm(guess, { ...target, extentKm }), raw));
  }
  assert.ok(Object.is(scoringDistanceKm(guess, target), raw));
  const inherited = Object.assign(Object.create({ extentKm: 30 }), target);
  assert.ok(Object.is(scoringDistanceKm(guess, inherited), raw));
});

test('adjusted exact distance drives score, display rounding, tiers, postcard and Survival boundaries', () => {
  const target = { lat: 0, lng: 0, extentKm: 40 };
  const postcardEarn = (km) => ({ pinpoint: 3, bullseye: 2, near: 1 }[flyoverTier(km)] || 0);
  for (const expected of [0, 24.999, 25, 149.999, 150, 151]) {
    const exact = scoringDistanceKm(destination(target, target.extentKm + expected, 90), target);
    close(exact, expected, 1e-8);
    assert.equal(Math.round(distanceScore(exact)), Math.round(1000 * Math.exp(-((exact / 3500) ** 1.13))));
    assert.equal(Math.round(exact), Math.round(expected));
    // Test the exact numeric boundaries independently of the tiny error from
    // constructing a point on a sphere at a requested distance.
    assert.equal(flyoverTier(expected), expected < 5 ? 'pinpoint' : expected < 25 ? 'bullseye' : expected < 150 ? 'near' : 'normal');
    assert.equal(postcardEarn(expected), expected < 5 ? 3 : expected < 25 ? 2 : expected < 150 ? 1 : 0);
  }
  const survivalSource = readFileSync(new URL('../src/modes/survival.js', import.meta.url), 'utf8');
  assert.match(survivalSource, /survival\.missed = kmExact > SURVIVAL_LIMIT_KM/);
});

test('cities and point landmarks preserve the raw number and frozen score fixtures', () => {
  const samples = [
    ['tokyo-japan', 0, { lat: 36.91136, lng: 137.41829 }, 251.05352006657486, 251, 950, 950],
    ['enugu-ng', 2, { lat: 7.67582, lng: 5.15323 }, 292.9841319554443, 293, 941, 941],
    ['krasnoyarsk-ru', 4, { lat: 57.27192, lng: 90.58576 }, 198.46724682154738, 198, 962, 962],
  ];
  const byCityId = new Map(cities.map((item) => [item.id, item]));
  for (const [id, round, guess, frozenKm, rounded, base, weighted] of samples) {
    const target = byCityId.get(id);
    const raw = distanceKm(guess, target);
    assert.ok(Object.is(scoringDistanceKm(guess, target), raw));
    close(raw, frozenKm, 1e-10);
    assert.deepEqual([Math.round(raw), Math.round(distanceScore(raw)), scoreGuess(raw, round)], [rounded, base, weighted]);
  }
  for (const id of ['machu-picchu', 'uluru']) {
    const target = byLandmarkId.get(id);
    const guess = destination(target, 123.456);
    const raw = distanceKm(guess, target);
    assert.ok(Object.is(scoringDistanceKm(guess, target), raw));
  }
});

test('fixed pinned and derived Daily selections and serialized round fields stay frozen', () => {
  const fixtures = [
    ['2026-10-18', ['tokyo-japan', 'boise-usa', 'enugu-ng', 'ciudad-juarez-mx', 'krasnoyarsk-ru'], [251.05352006657486, 231.86657960125547, 292.9841319554443, 259.6144718086858, 198.46724682154738], [[251, 950, 950], [232, 955, 955], [293, 941, 941], [260, 948, 948], [198, 962, 962]]],
    ['2026-11-03', ['nashville-usa', 'osaka-japan', 'durban-south-africa', 'malabo-equatorial-guinea', 'oymyakon-russia'], [249.95192791543136, 253.25007566156745, 265.76571920044677, 294.0622469008112, 178.4221670484311], [[250, 951, 951], [253, 950, 950], [266, 947, 947], [294, 941, 941], [178, 966, 966]]],
  ];
  const byId = new Map(cities.map((item) => [item.id, item]));
  for (const [date, expectedIds, expectedExact, expectedScores] of fixtures) {
    const proposed = pins[date] || dailyIds(date, cities);
    const ids = resolvePinnedIds(date, proposed, cities);
    assert.deepEqual(ids, expectedIds);
    const results = ids.map((id, round) => {
      const target = byId.get(id);
      const guess = { lat: target.lat + 1.2345, lng: target.lng - 2.3456 };
      const distanceExact = scoringDistanceKm(guess, target);
      return { guess, distance: Math.round(distanceExact), base: Math.round(distanceScore(distanceExact)), score: scoreGuess(distanceExact, round), distanceExact };
    });
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(results[0]))), ['guess', 'distance', 'base', 'score', 'distanceExact']);
    results.forEach((result, round) => close(result.distanceExact, expectedExact[round], 1e-10));
    assert.deepEqual(results.map((result) => [result.distance, result.base, result.score]), expectedScores);
    assert.ok(results.every((result, round) => result.score === result.base * WEIGHTS[round]));
  }
});

test('landmark pool preserves point landmarks and adds exactly the approved areas', () => {
  const oldPool = landmarks.filter((item) => item.kind === 'landmark' && isPlayableLocation(item) && (() => {
    const match = /^p(?:1|\.\d{2})(?:\(via [^)]+\))?·fb\d+·K[\d.]+·iso\d+ → \d+(?:\.\d)? → (\d+)$/.exec(item.difficultyWhy || '');
    return Boolean(match) && Number(match[1]) === item.difficulty;
  })());
  const newPool = landmarks.filter(isPoolLandmark);
  assert.deepEqual(newPool.filter((item) => item.kind === 'landmark').map((x) => x.id), oldPool.map((x) => x.id));
  assert.deepEqual(newPool.filter((item) => item.kind === 'area').map((x) => x.id).sort(), Object.keys(APPROVED_AREAS).sort());

  const playable = { image: 'real.jpg', lat: 0, lng: 0 };
  for (const item of [
    { ...playable, kind: 'settlement', extentKm: 30 },
    { ...playable, kind: 'area' },
    { ...playable, kind: 'area', extentKm: 0 },
    { ...playable, kind: 'area', extentKm: '30' },
    { ...playable, kind: 'lake', extentKm: 30 },
  ]) assert.equal(isPoolLandmark(item), false);
  assert.equal(isPoolLandmark(trivia.find((item) => item.id === 'gurudongmar-lake')), false);
});

test('other mode catalogs remain center-scored and independent', () => {
  assert.ok(cities.filter((item) => isPlayableLocation(item) && !isLandmark(item)).every((item) => !Object.hasOwn(item, 'extentKm')));
  assert.ok(trivia.every((item) => !Object.hasOwn(item, 'extentKm')));
  const islandIds = ['easter-island', 'galapagos-islands', 'lord-howe-island'];
  const islandRoute = expeditions.find((route) => islandIds.every((id) => route.locationIds.includes(id)));
  assert.ok(islandRoute);
  // Sean 2026-10-18: the compact island stops carry extents (Easter 14 km,
  // Lord Howe 5 km), and Galapagos got 148 km (the main island group) on his
  // call later the same evening.
  assert.equal(byLandmarkId.get('easter-island').extentKm, 14);
  assert.equal(byLandmarkId.get('lord-howe-island').extentKm, 5);
  assert.equal(byLandmarkId.get('galapagos-islands').extentKm, 148);
  assert.ok(weekly.every((route) => islandIds.every((id) => !route.locationIds.includes(id))));
  const catalogSource = readFileSync(new URL('../pvp-worker/src/catalog.js', import.meta.url), 'utf8');
  assert.ok(Object.keys(APPROVED_AREAS).every((id) => !catalogSource.includes(`\"${id}\"`)));
  const tapCountrySource = readFileSync(new URL('../src/modes/tap-country.js', import.meta.url), 'utf8');
  assert.doesNotMatch(tapCountrySource, /scoringDistanceKm|extentKm/);
});

test('runtime has one extent-aware call site and retains existing zero-km copy path', () => {
  const roundSource = readFileSync(new URL('../src/game/round.js', import.meta.url), 'utf8');
  assert.equal((roundSource.match(/scoringDistanceKm\(guess, answer\)/g) || []).length, 1);
  assert.doesNotMatch(roundSource, /Inside the feature/);
  assert.match(roundSource, /beginBullseyeReveal\(guess, answer, km,/);
  assert.match(roundSource, /beginTravelReveal\(guess, answer, km,/);
});
