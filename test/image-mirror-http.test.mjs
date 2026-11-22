import assert from 'node:assert/strict';
import test from 'node:test';

import { mapWithConcurrency, withRetry } from '../tools/image-mirror/src/http.js';

test('mapWithConcurrency preserves result order regardless of completion order', async () => {
  const items = [30, 10, 20, 5];
  const results = await mapWithConcurrency(
    items,
    (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)),
    { concurrency: 4 },
  );
  assert.deepEqual(results, [30, 10, 20, 5]);
});

test('mapWithConcurrency never runs more than `concurrency` workers at once', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 12 }, (_, i) => i);
  await mapWithConcurrency(
    items,
    async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    },
    { concurrency: 3 },
  );
  assert.ok(maxInFlight <= 3, `expected at most 3 concurrent workers, saw ${maxInFlight}`);
});

test('withRetry retries a failing function up to `retries` times then succeeds', async () => {
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('transient');
      return 'ok';
    },
    { retries: 3, baseDelayMs: 1 },
  );
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('withRetry gives up and rethrows after exhausting retries', async () => {
  let attempts = 0;
  await assert.rejects(
    withRetry(
      async () => {
        attempts += 1;
        throw new Error('always fails');
      },
      { retries: 2, baseDelayMs: 1 },
    ),
    /always fails/,
  );
  assert.equal(attempts, 3); // initial attempt + 2 retries
});

test('withRetry honors a retryAfterMs hint from the worker before retrying', async () => {
  let attempts = 0;
  const start = Date.now();
  const result = await withRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) return { retryAfterMs: 20 };
      return 'ok';
    },
    { retries: 2, baseDelayMs: 1 },
  );
  assert.equal(result, 'ok');
  assert.ok(Date.now() - start >= 20);
});
