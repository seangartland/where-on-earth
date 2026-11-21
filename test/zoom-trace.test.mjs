import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;

test('the ring buffer evicts the oldest event past 20,000 and stays in order', async () => {
  globalThis.location = { search: '?trace=1' };
  const { traceMark } = await import('../src/globe/zoom-trace.js');
  for (let i = 0; i < 20001; i++) traceMark('seq', { i });
  const dumped = globalThis.window.__woeTrace.dump();
  assert.equal(dumped.length, 20000);
  assert.equal(dumped[0].data.i, 1, 'event 0 was evicted');
  assert.equal(dumped[dumped.length - 1].data.i, 20000, 'the newest event is last, in chronological order');
});

test('span pairing matches traceSpanEnd to its traceSpanStart by id, not call order', async () => {
  globalThis.location = { search: '?trace=1' };
  const { clear } = globalThis.window.__woeTrace;
  clear();
  const { traceSpanStart, traceSpanEnd } = await import('../src/globe/zoom-trace.js');
  const a = traceSpanStart('decode', { src: 'a' });
  const b = traceSpanStart('decode', { src: 'b' });
  assert.notEqual(a, b);
  traceSpanEnd(b, { ok: true }); // b closes first even though a opened first
  traceSpanEnd(a, { ok: true });
  const dumped = globalThis.window.__woeTrace.dump();
  const starts = dumped.filter((e) => e.phase === 'start');
  const ends = dumped.filter((e) => e.phase === 'end');
  assert.equal(starts.length, 2);
  assert.equal(ends.length, 2);
  const aStart = starts.find((e) => e.id === a);
  const aEnd = ends.find((e) => e.id === a);
  assert.equal(aStart.data.src, 'a');
  assert.equal(aEnd.data.ok, true);
  assert.equal(aStart.type, 'decode');
});

test('disabled mode (no ?trace=1) is a true no-op', async () => {
  globalThis.location = { search: '' };
  const { traceMark, traceSpanStart, traceSpanEnd } = await import('../src/globe/zoom-trace.js');
  globalThis.window.__woeTrace.clear();
  traceMark('should-not-record', {});
  const id = traceSpanStart('should-not-record', {});
  assert.equal(id, 0, 'disabled traceSpanStart returns a falsy id');
  traceSpanEnd(id, {}); // must not throw
  traceSpanEnd(0, {}); // must not throw even with the falsy sentinel directly
  assert.deepEqual(globalThis.window.__woeTrace.dump(), []);
});

test("a synthetic overlapping-events trace proves the report's span logic merges parallel work instead of summing it", async () => {
  const { pairSpans, unionDuration } = await import('../scripts/sat/zoom-trace-report.mjs');
  // Two decodes run concurrently from t=0..100 and t=50..180: 100ms + 130ms
  // of wall-clock work overlap for 50ms, so summing would give 230ms but the
  // true busy time is 180ms.
  const events = [
    { id: 1, type: 'decode', phase: 'start', t: 0, data: { src: 'a' } },
    { id: 2, type: 'decode', phase: 'start', t: 50, data: { src: 'b' } },
    { id: 1, type: 'decode', phase: 'end', t: 100, data: {} },
    { id: 2, type: 'decode', phase: 'end', t: 180, data: {} },
  ];
  const { spans } = pairSpans(events);
  assert.equal(spans.length, 2);
  assert.equal(spans.find((s) => s.id === 1).duration, 100);
  assert.equal(spans.find((s) => s.id === 2).duration, 130);
  const summed = spans.reduce((total, s) => total + s.duration, 0);
  assert.equal(summed, 230, 'the naive sum double-counts the 50ms overlap');
  assert.equal(unionDuration(spans), 180, 'the critical-path union counts the overlap once');
});

test('a disjoint pair of spans unions to the plain sum', async () => {
  const { unionDuration } = await import('../scripts/sat/zoom-trace-report.mjs');
  assert.equal(unionDuration([{ start: 0, end: 50 }, { start: 100, end: 120 }]), 70);
});
