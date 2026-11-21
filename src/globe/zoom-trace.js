// Bounded zoom-trace ring buffer (docs/zoom-diagnosis-astra.md §6, §7 stage 1).
// Off by default; every call below is a no-op until ?trace=1 is present, so
// the instrumented call sites across surface.js/pin.js/main.js cost nothing
// in production. Enabled state is read live (not memoized at import time),
// the same convention getSatProvider() in surface.js already uses, so tests
// can flip `?trace=1` on and off within a single process.
const CAPACITY = 20000;

function enabled() {
  try { return new URLSearchParams(location.search).get('trace') === '1'; }
  catch { return false; }
}

let ring = new Array(CAPACITY);
let writeAt = 0;
let count = 0;
let nextId = 1;
const openSpanTypes = new Map();

function push(event) {
  ring[writeAt] = event;
  writeAt = (writeAt + 1) % CAPACITY;
  if (count < CAPACITY) count++;
}

// A point-in-time event: input/camera samples, bytes, rejections, breaker
// trips, pool dispatch, and anything else with no meaningful duration.
export function traceMark(type, data) {
  if (!enabled()) return;
  push({ id: 0, type, phase: 'mark', t: performance.now(), data });
}

// Paired with traceSpanEnd(id) by id, not by call order, so overlapping
// spans (two tiles decoding at once) never get summed as if sequential.
export function traceSpanStart(type, data) {
  if (!enabled()) return 0;
  const id = nextId++;
  openSpanTypes.set(id, type);
  push({ id, type, phase: 'start', t: performance.now(), data });
  return id;
}

export function traceSpanEnd(id, data) {
  if (!enabled() || !id) return;
  const type = openSpanTypes.get(id);
  openSpanTypes.delete(id);
  push({ id, type, phase: 'end', t: performance.now(), data });
}

function dump() {
  if (count < CAPACITY) return ring.slice(0, count);
  return [...ring.slice(writeAt), ...ring.slice(0, writeAt)];
}

function clear() {
  ring = new Array(CAPACITY);
  writeAt = 0;
  count = 0;
  nextId = 1;
  openSpanTypes.clear();
}

if (typeof window !== 'undefined') window.__woeTrace = { dump, clear };
