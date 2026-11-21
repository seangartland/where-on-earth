// Pure, THREE-free core of experiment arm B (?warm=ladder, test-only;
// docs/zoom-diagnosis-astra.md §4.4/§6): the param gate, the footprint
// math and the job queue. surface.js wires this to the real fetch/LRU;
// kept separate so it stays importable without `three` (extracted-module
// pattern, test/warm-ladder.test.mjs).

export function warmLadderEnabled(search) {
  return new URLSearchParams(search).get('warm') === 'ladder';
}

// Arm B does nothing without a known target (possible in PvP before the
// server answer lands) and Save Data disables it outright.
export function shouldScheduleWarmLadder({ saveData, lat, lng }) {
  return !saveData && Number.isFinite(lat) && Number.isFinite(lng);
}

// Mercator tile coordinates for a lat/lng at zoom z (same formula
// prefetchDailyTiles already uses in surface.js, so cache keys match).
export function tileAt(lat, lng, z) {
  const n = 1 << z;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const fx = (lng + 180) / 360;
  const fy = 0.5 - Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360)) / (2 * Math.PI);
  return { cx: fx * n, cy: Math.max(0, Math.min(n - 1, fy * n)), n };
}

// The focal-first 3x3 job list for one target, across every rung in
// `rungs`, deduplicated by key. `resolveKey`/`resolveUrl` let the caller
// route through its own provider/fallback id so cache keys match the live
// loader; `includeTile` lets the caller skip tiles outside pilot coverage
// at z10; `isKnown` skips tiles already cached or known-missing.
export function buildWarmLadderJobs({ lat, lng, rungs, resolveKey, resolveUrl, includeTile, isKnown }) {
  const seen = new Set();
  const jobs = [];
  for (const z of rungs) {
    const { cx, cy, n } = tileAt(lat, lng, z);
    const cxFloor = Math.floor(cx);
    const cyFloor = Math.floor(cy);
    const tiles = [];
    for (let dy = -1; dy <= 1; dy++) {
      const y = Math.max(0, Math.min(n - 1, cyFloor + dy));
      for (let dx = -1; dx <= 1; dx++) {
        const x = (((cxFloor + dx) % n) + n) % n;
        if (includeTile && !includeTile(z, x, y)) continue;
        const key = resolveKey(z, x, y);
        if (seen.has(key) || isKnown?.(key)) continue;
        seen.add(key);
        tiles.push({ key, url: resolveUrl(z, x, y), z, x, y, dist: Math.hypot(x + 0.5 - cx, y + 0.5 - cy) });
      }
    }
    tiles.sort((a, b) => a.dist - b.dist); // focal (center) tile first within each rung
    jobs.push(...tiles);
  }
  return jobs;
}

// A small job queue with round tokens, independent of any fetch
// implementation: the caller supplies run(job, token) to actually dispatch.
// stop() only clears not-yet-dispatched jobs (the same "stops new dispatch,
// not already active requests" contract Daily prefetch's pause already
// uses) - nothing here ever pauses on input, by design.
export function createWarmLadderQueue(concurrency = 2) {
  let jobs = [];
  let active = 0;
  let token = 0;
  let run = null;

  function pump() {
    while (active < concurrency && jobs.length) {
      const job = jobs.shift();
      active++;
      const jobToken = token;
      Promise.resolve(run(job, jobToken)).finally(() => { active--; pump(); });
    }
  }

  return {
    configure(fn) { run = fn; },
    schedule(newJobs, newToken) { token = newToken; jobs = newJobs; pump(); },
    stop() { jobs = []; },
    get pendingCount() { return jobs.length; },
    get activeCount() { return active; },
    get token() { return token; },
  };
}
