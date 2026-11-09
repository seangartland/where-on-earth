import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.location = { search: '' };

const { formatKm } = await import('../src/core/format.js');
const { distanceKm } = await import('../src/core/math.js');
const { distanceScore, scoringDistanceKm } = await import('../src/game/scoring.js');
const { setExtentData } = await import('../src/game/extents.js');
const { friendRows, friendTotals, friendInitial, chipText, popoverText, stripChips, sameGuess } = await import('../src/game/friend-rows.js');

const load = (name) => JSON.parse(readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'));
const extents = load('extents.json');
setExtentData(extents);
const salta = { id: 'salta-ar', lat: -24.7821, lng: -65.4232 };

const friends = [
  { friendId: 'u_far', displayName: 'Bea', guess: { lat: 40.4, lng: -3.7 }, submittedAt: 3 },
  { friendId: 'u_ana', displayName: 'Ana', guess: { lat: -24.1, lng: -64.9 }, submittedAt: 1 },
  { friendId: 'u_mid', displayName: 'Cal', guess: { lat: -34.6, lng: -58.4 }, submittedAt: 2 },
  { friendId: 'u_jo', displayName: 'jo', guess: { lat: -12.0, lng: -77.0 }, submittedAt: 4 },
  { friendId: 'u_eve', displayName: 'Eve', guess: { lat: 51.5, lng: -0.1 }, submittedAt: 5 },
];

test('a friend pin shows the recomputed distance, formatted like the local reveal', () => {
  for (const row of friendRows(friends, salta)) {
    const kmExact = scoringDistanceKm(row.guess, salta);
    assert.equal(row.kmExact, kmExact);
    assert.equal(row.distance, formatKm(Math.round(kmExact)));
  }
});

test('the recompute honours extents, the same scoring the player gets', () => {
  const reef = { id: 'great-barrier-reef', kind: 'extent', lat: -18.3, lng: 147.7 };
  const guess = { lat: -27.47, lng: 153.03 };
  const [row] = friendRows([{ friendId: 'u', displayName: 'Ana', guess }], reef);
  assert.equal(row.kmExact, scoringDistanceKm(guess, reef));
  assert.ok(row.kmExact < distanceKm(guess, reef)); // nearest reef edge, not the centre
});

test('chips sort by recomputed distance, nearest first', () => {
  const rows = friendRows(friends, salta);
  const km = rows.map((row) => row.kmExact);
  assert.deepEqual(km, [...km].sort((a, b) => a - b));
  assert.equal(rows[0].friendId, 'u_ana');
  assert.equal(rows.at(-1).friendId, 'u_eve');
});

test('sorting ignores server order and any server-sent distance or score', () => {
  const lying = friends.map((friend, i) => ({ ...friend, distanceKm: i, score: 1000 - i }));
  const rows = friendRows(lying, salta);
  assert.deepEqual(rows.map((row) => row.friendId), friendRows(friends, salta).map((row) => row.friendId));
  for (const row of rows) {
    assert.equal(row.score, Math.round(distanceScore(scoringDistanceKm(row.guess, salta))));
  }
});

test('the popover score is distanceScore of the recomputed distance', () => {
  for (const row of friendRows(friends, salta)) {
    const score = Math.round(distanceScore(scoringDistanceKm(row.guess, salta)));
    assert.equal(row.score, score);
    assert.equal(popoverText(row), `${row.name} · ${formatKm(Math.round(row.kmExact))} · ${score}`);
  }
});

test('the strip shows three chips then +N, and expands in place', () => {
  const rows = friendRows(friends, salta);
  const collapsed = stripChips(rows);
  assert.equal(collapsed.chips.length, 3);
  assert.equal(collapsed.more, 2);
  const expanded = stripChips(rows, true);
  assert.equal(expanded.chips.length, 5);
  assert.equal(expanded.more, 0);
  assert.deepEqual(stripChips(rows.slice(0, 3)), { chips: rows.slice(0, 3), more: 0 });
  assert.equal(chipText(rows[0]), `Ana ${rows[0].distance}`);
});

test('badges use an upper-case initial; malformed guesses are skipped', () => {
  assert.equal(friendInitial('jo'), 'J');
  assert.equal(friendInitial(''), '?');
  const rows = friendRows([...friends, { friendId: 'u_bad', displayName: 'Bad', guess: { lat: null, lng: 1 } }], salta);
  assert.equal(rows.length, friends.length);
  assert.equal(rows.find((row) => row.friendId === 'u_jo').initial, 'J');
});

test('the other-device check compares at the stored 4 decimal places', () => {
  assert.equal(sameGuess({ lat: -24.81, lng: -65.41 }, { lat: -24.810001, lng: -65.409999 }), true);
  assert.equal(sameGuess({ lat: -24.81, lng: -65.41 }, { lat: -24.9, lng: -65.41 }), false);
  assert.equal(sameGuess(null, { lat: 0, lng: 0 }), false);
});

test('friendTotals sums each friend across rounds and ranks best first', () => {
  const pins = { locations: {
    'salta-ar': { friends },
    'other-pl': { friends: [
      { friendId: 'u_ana', displayName: 'Ana', guess: { lat: 10, lng: 10 } },
      { friendId: 'u_bea2', displayName: 'Bea', guess: { lat: 10.2, lng: 10.1 } },
    ] },
  } };
  const rounds = [
    { locationId: 'salta-ar', answer: salta },
    { locationId: 'other-pl', answer: { id: 'other-pl', lat: 10.1, lng: 10.05 } },
  ];
  const totals = friendTotals(pins, rounds);
  assert.equal(totals[0].friendId, 'u_ana'); // nearest in round 1 and near in round 2
  assert.equal(totals.find((t) => t.friendId === 'u_ana').rounds, 2);
  assert.equal(totals.find((t) => t.friendId === 'u_far').rounds, 1);
  for (let i = 1; i < totals.length; i++) assert.ok(totals[i - 1].total >= totals[i].total);
  assert.deepEqual(friendTotals(null, rounds), []);
  assert.deepEqual(friendTotals(pins, []), []);
});
