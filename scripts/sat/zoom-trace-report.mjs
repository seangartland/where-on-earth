#!/usr/bin/env node
// Usage: node scripts/sat/zoom-trace-report.mjs <trace.json>
//
// Reads a trace exported from window.__woeTrace.dump() (src/globe/zoom-trace.js,
// docs/zoom-diagnosis-astra.md §6/§7 stage 1) and prints, per round: the
// critical-path busy time per stage (a union of overlapping spans, never a
// sum - two tiles decoding at once count once, not twice), request counts
// and bytes by pool (visible, prefetch, bundle, daily, speculative), window
// churn, time from the last input to window-ready and to the first
// presented frame, and native-vs-fallback coverage of ready windows.
//
// Plain node, no dependencies.
import { readFileSync } from 'node:fs';

// Pairs traceSpanStart/traceSpanEnd events by id (never by call order), so
// two spans opened before either closes are each matched to their own end.
export function pairSpans(events) {
  const starts = new Map();
  const spans = [];
  const marks = [];
  for (const event of events) {
    if (event.phase === 'mark') { marks.push(event); continue; }
    if (event.phase === 'start') { starts.set(event.id, event); continue; }
    if (event.phase === 'end') {
      const start = starts.get(event.id);
      starts.delete(event.id);
      spans.push({
        id: event.id,
        type: event.type ?? start?.type,
        start: start?.t ?? null,
        end: event.t,
        duration: start ? event.t - start.t : null,
        startData: start?.data,
        endData: event.data,
      });
    }
  }
  // Spans still open at dump time (no matching end) are reported with a
  // null end/duration rather than dropped, so an interrupted trace is visible.
  for (const start of starts.values()) {
    spans.push({ id: start.id, type: start.type, start: start.t, end: null, duration: null, startData: start.data, endData: undefined });
  }
  return { spans, marks };
}

// The union of wall-clock time covered by a set of [start, end) intervals:
// the correct "how long did this stage actually take" when instances
// overlap. Summing each span's own duration would double-count parallel
// work; this is the primitive that prevents that (Astra §2's warning
// against manufacturing a false explanation by summing rows).
export function unionDuration(intervals) {
  const sorted = intervals.filter((i) => i.start != null && i.end != null).sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = null;
  let curEnd = null;
  for (const { start, end } of sorted) {
    if (curEnd === null) { curStart = start; curEnd = end; continue; }
    if (start <= curEnd) { curEnd = Math.max(curEnd, end); }
    else { total += curEnd - curStart; curStart = start; curEnd = end; }
  }
  if (curEnd !== null) total += curEnd - curStart;
  return total;
}

// Split a flat event stream into rounds at each 'round-start' mark. Events
// before the first round-start (boot, home fill) form an initial round
// labelled 0 with no hasCoords flag.
export function splitRounds(events) {
  const rounds = [];
  let current = { label: 0, hasCoords: null, events: [] };
  for (const event of events) {
    if (event.phase === 'mark' && event.type === 'round-start') {
      if (current.events.length) rounds.push(current);
      current = { label: rounds.length + 1, hasCoords: event.data?.hasCoords ?? null, events: [] };
    }
    current.events.push(event);
  }
  if (current.events.length) rounds.push(current);
  return rounds;
}

const POOLS = ['visible', 'prefetch', 'bundle', 'daily', 'speculative'];

export function requestCountsByPool(events) {
  const counts = Object.fromEntries(POOLS.map((p) => [p, 0]));
  for (const event of events) {
    if (event.phase !== 'start') continue;
    if (event.type === 'tile-fetch') counts[event.data?.pool ?? 'visible']++;
    else if (event.type === 'daily-fetch') counts.daily++;
    else if (event.type === 'speculative-fetch') counts.speculative++;
    else if (event.type === 'bundle') counts.bundle++;
  }
  return counts;
}

export function bytesByPool(events) {
  const bytes = Object.fromEntries(POOLS.map((p) => [p, 0]));
  for (const event of events) {
    if (event.phase === 'mark' && event.type === 'tile-body-complete') {
      const pool = event.data?.pool ?? 'visible';
      if (pool in bytes) bytes[pool] += event.data?.bytes ?? 0;
    }
    if (event.phase === 'end' && event.type === 'bundle' && event.data?.bytes) bytes.bundle += event.data.bytes;
  }
  return bytes;
}

export function windowChurn(events) {
  let builds = 0;
  let aborts = 0;
  for (const event of events) {
    if (event.phase !== 'mark') continue;
    if (event.type === 'window-build') builds++;
    else if (event.type === 'abort') aborts++;
  }
  // Per-abort byte loss would need a streaming read of the aborted response
  // body; the brief's "marks only" instrumentation does not add one, so
  // wasted bytes are not measured in stage 1 (see LANE-REPORT deviations).
  return { builds, aborts, wastedBytes: null };
}

export function nativeCoverage(events) {
  return events
    .filter((e) => e.phase === 'mark' && e.type === 'window-ready')
    .map((e) => ({ gen: e.data?.gen, z: e.data?.z, nativeCoverage: e.data?.nativeCoverage ?? null, t: e.t }));
}

// Time from the last input mark to the first window-ready / first-presented
// frame mark that follows it, within this round's event slice.
export function timeFromLastInputTo(events, targetType) {
  const inputTypes = new Set(['input-start', 'input-end', 'input-wheel']);
  let lastInput = null;
  for (const event of events) {
    if (event.phase === 'mark' && inputTypes.has(event.type)) lastInput = event.t;
    if (event.phase === 'mark' && event.type === targetType && lastInput != null) return event.t - lastInput;
  }
  return null;
}

const CRITICAL_PATH_TYPES = ['window-pick', 'tile-fetch', 'decode', 'bundle', 'mip', 'daily-fetch', 'speculative-fetch'];

export function criticalPathSpans(events) {
  const { spans } = pairSpans(events);
  return CRITICAL_PATH_TYPES.map((type) => {
    const matching = spans.filter((s) => s.type === type);
    return { type, count: matching.length, busyMs: Math.round(unionDuration(matching) * 1000) / 1000 };
  }).filter((row) => row.count > 0).sort((a, b) => b.busyMs - a.busyMs);
}

export function specHitBytes(events) {
  let scheduled = 0;
  let landed = 0;
  let hit = 0;
  for (const event of events) {
    if (event.phase !== 'mark') continue;
    if (event.type === 'tile-body-complete' && event.data?.pool === 'speculative') landed += event.data?.bytes ?? 0;
    if (event.type === 'spec-hit') hit += event.data?.bytes ?? 0;
    if (event.type === 'speculative-schedule') scheduled = event.data?.count ?? scheduled;
  }
  return { scheduledTiles: scheduled, landedBytes: landed, usedBytes: hit, wastedBytes: landed - hit };
}

export function summarizeRound(round) {
  return {
    round: round.label,
    hasCoords: round.hasCoords,
    criticalPath: criticalPathSpans(round.events),
    requestCounts: requestCountsByPool(round.events),
    bytes: bytesByPool(round.events),
    windowChurn: windowChurn(round.events),
    nativeCoverage: nativeCoverage(round.events),
    timeToWindowReadyMs: timeFromLastInputTo(round.events, 'window-ready'),
    timeToFirstFrameMs: timeFromLastInputTo(round.events, 'frame-presented'),
    speculative: specHitBytes(round.events),
  };
}

export function buildReport(events) {
  const rounds = splitRounds(events).map(summarizeRound);
  return { rounds };
}

function formatRound(summary) {
  const lines = [];
  lines.push(`Round ${summary.round}${summary.hasCoords === false ? ' (no coordinates)' : ''}`);
  lines.push('  Critical path (busy ms, parallel work merged, never summed):');
  for (const row of summary.criticalPath) lines.push(`    ${row.type}: ${row.busyMs} ms over ${row.count} span(s)`);
  if (!summary.criticalPath.length) lines.push('    (no spans)');
  lines.push(`  Requests by pool: ${JSON.stringify(summary.requestCounts)}`);
  lines.push(`  Bytes by pool: ${JSON.stringify(summary.bytes)}`);
  lines.push(`  Window churn: ${summary.windowChurn.builds} build(s), ${summary.windowChurn.aborts} abort(s), wasted bytes: ${summary.windowChurn.wastedBytes ?? 'not measured'}`);
  lines.push(`  Native coverage of ready windows: ${summary.nativeCoverage.map((w) => `gen ${w.gen} z${w.z}: ${w.nativeCoverage == null ? 'n/a' : `${Math.round(w.nativeCoverage * 100)}%`}`).join(', ') || '(none ready)'}`);
  lines.push(`  Time from last input to window-ready: ${summary.timeToWindowReadyMs == null ? 'n/a' : `${Math.round(summary.timeToWindowReadyMs)} ms`}`);
  lines.push(`  Time from last input to first presented frame: ${summary.timeToFirstFrameMs == null ? 'n/a' : `${Math.round(summary.timeToFirstFrameMs)} ms`}`);
  if (summary.speculative.scheduledTiles) {
    lines.push(`  Speculative (?warm=ladder): ${summary.speculative.scheduledTiles} tile(s) scheduled, ${summary.speculative.landedBytes} bytes landed, ${summary.speculative.usedBytes} used, ${summary.speculative.wastedBytes} wasted`);
  }
  return lines.join('\n');
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node scripts/sat/zoom-trace-report.mjs <trace.json>'); process.exit(1); }
  const events = JSON.parse(readFileSync(file, 'utf8'));
  const report = buildReport(events);
  console.log(`zoom-trace-report: ${events.length} events, ${report.rounds.length} round(s)\n`);
  for (const round of report.rounds) console.log(`${formatRound(round)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
