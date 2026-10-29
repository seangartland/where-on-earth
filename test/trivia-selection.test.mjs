import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null };
globalThis.window = globalThis;

const { drawGame, initTrivia, triviaBankLoaded } = await import('../src/modes/trivia.js');

initTrivia({
  gameEls: {
    triviaEntry: { disabled: false, addEventListener() {} },
  },
});

test('trivia draws five unique verified-photo entries without reading difficulty', () => {
  const bank = Array.from({ length: 6 }, (_, index) => {
    const entry = { id: `trivia-${index}`, image: `${index}.jpg`, photo: 'verified' };
    Object.defineProperty(entry, 'difficulty', { get() { throw new Error('difficulty was read'); } });
    return entry;
  });
  triviaBankLoaded([...bank, { id: 'unverified', image: 'x.jpg', photo: 'pending' }]);
  const picks = drawGame();
  assert.equal(picks.length, 5);
  assert.equal(new Set(picks.map((entry) => entry.id)).size, 5);
  assert.ok(picks.every((entry) => entry.photo === 'verified'));
});
