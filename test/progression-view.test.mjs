import assert from 'node:assert/strict';
import test from 'node:test';
import { rewardLabel, stripWindow, unlocksBetween } from '../src/account/progression-view.mjs';

const catalogs = { Titles: [['window-seat', 'Window Seat']], Banners: [['airmail', 'Airmail']] };
test('progression unlock helpers cover levels 2, 5, and 10', () => {
  assert.deepEqual(unlocksBetween(1, 2).map(({ kind }) => kind), ['title-pick']);
  assert.deepEqual(unlocksBetween(2, 5).map(({ kind }) => kind), ['silver-ring', 'card', 'titles']);
  assert.deepEqual(unlocksBetween(5, 10).map(({ kind }) => kind), ['gold-ring']);
});
test('level strip window follows the current level', () => {
  assert.deepEqual(stripWindow(1), [1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(stripWindow(8), [4,5,6,7,8,9,10,11,12,13]);
  assert.deepEqual(stripWindow(12), [8,9,10,11,12,13,14,15,16,17]);
});
test('reward labels use catalog names', () => {
  assert.equal(rewardLabel('title:window-seat', catalogs), 'Window Seat title');
  assert.equal(rewardLabel('card:airmail', catalogs), 'Airmail banner');
  assert.equal(rewardLabel('motif:star', catalogs), 'Star seal motif');
});
