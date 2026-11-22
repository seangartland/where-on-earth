import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerLegacyAbort, beginPagePreparation, markPageRoundActive, endPageLifecycle,
  pageLifecycleState, pageLifecycleBusy,
} from '../src/globe/page-lifecycle.js';

// page-lifecycle.js is a module-level singleton, so every test resets it to
// a known state first rather than relying on run order.
function reset() {
  registerLegacyAbort(null);
  endPageLifecycle();
}

test('starts idle, with legacy imagery allowed', () => {
  reset();
  assert.equal(pageLifecycleState(), 'idle');
  assert.equal(pageLifecycleBusy(), false);
});

test('beginPagePreparation claims ownership and abandons in-flight legacy work synchronously', () => {
  reset();
  let aborted = 0;
  registerLegacyAbort(() => { aborted++; });
  beginPagePreparation();
  assert.equal(aborted, 1, 'legacy work is abandoned the instant the round commits to pages, before any fetch for it begins');
  assert.equal(pageLifecycleState(), 'preparing');
  assert.equal(pageLifecycleBusy(), true, 'the legacy driver must not run while a page round is preparing');
});

test('beginPagePreparation with no registered abort does not throw (boot order, or surface.js not yet loaded)', () => {
  reset();
  assert.doesNotThrow(() => beginPagePreparation());
});

test('markPageRoundActive moves preparing -> active and keeps the legacy driver suppressed', () => {
  reset();
  registerLegacyAbort(() => {});
  beginPagePreparation();
  markPageRoundActive();
  assert.equal(pageLifecycleState(), 'active');
  assert.equal(pageLifecycleBusy(), true);
});

test('endPageLifecycle returns ownership to the legacy driver from either preparing or active', () => {
  reset();
  registerLegacyAbort(() => {});
  beginPagePreparation();
  endPageLifecycle();
  assert.equal(pageLifecycleState(), 'idle');
  assert.equal(pageLifecycleBusy(), false);

  beginPagePreparation();
  markPageRoundActive();
  endPageLifecycle();
  assert.equal(pageLifecycleState(), 'idle');
  assert.equal(pageLifecycleBusy(), false);
});

test('a second beginPagePreparation (round boundary while still busy) aborts legacy work again and stays preparing', () => {
  reset();
  let aborted = 0;
  registerLegacyAbort(() => { aborted++; });
  beginPagePreparation();
  markPageRoundActive();
  beginPagePreparation(); // a new round commits to pages while the previous one was active
  assert.equal(aborted, 2);
  assert.equal(pageLifecycleState(), 'preparing');
});
