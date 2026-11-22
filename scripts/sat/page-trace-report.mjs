#!/usr/bin/env node
// Usage: node scripts/sat/page-trace-report.mjs <trace.json>
//
// Reads a trace from scripts/sat/page-trace-probe.mjs (?pages=1&trace=1) and
// reports, for the pilot's own gates (BRIEF-renderer-pilot.md): the resolved
// serving path (pages or tiles, and why), the plan's accounted transfer/
// residency/texture counts and whether they fit the caps, preparation
// duration and whether it finished before the first input mark, every
// level-change span (input-to-ready, since a page-level-select span closes
// the instant the visibility swap happens, with no fetch/decode/upload
// behind it), and a count of any post-input pages-pool fetch/decode/upload -
// expected to be zero inside coverage.
import { readFileSync } from 'node:fs';
import { pairSpans } from './zoom-trace-report.mjs';

export function summarizePageTrace(events) {
  const roundMark = events.findLast((e) => e.phase === 'mark' && e.type === 'page-round');
  const planMark = events.findLast((e) => e.phase === 'mark' && e.type === 'page-plan');
  const { spans } = pairSpans(events);
  const prepSpan = spans.find((s) => s.type === 'page-prep');
  const roundStartMark = events.find((e) => e.phase === 'mark' && e.type === 'round-start');
  const roundStartT = roundStartMark?.t ?? events[0]?.t ?? 0;
  const firstInput = events.find((e) => e.phase === 'mark' && (e.type === 'input-start' || e.type === 'input-wheel') && e.t >= roundStartT);

  const levelSelects = spans
    .filter((s) => s.type === 'page-level-select')
    .map((s) => ({
      from: s.startData?.from ?? null,
      to: s.startData?.to ?? null,
      readyAtMs: s.end,
      msSincePriorInput: firstInput ? s.end - firstInput.t : null,
    }));

  const pagesWorkSpans = spans.filter((s) => s.type === 'tile-fetch' || s.type === 'decode' || s.type === 'upload-submit')
    .filter((s) => s.startData?.pool === 'pages' || s.endData?.pool === 'pages');
  const postInputWork = firstInput
    ? pagesWorkSpans.filter((s) => (s.start ?? Infinity) > firstInput.t)
    : [];

  return {
    servingPath: roundMark?.data?.path ?? null,
    fallbackReason: roundMark?.data?.reason ?? null,
    plan: planMark?.data ?? null,
    prepStartMs: prepSpan?.start ?? null,
    prepEndMs: prepSpan?.end ?? null,
    prepDurationMs: prepSpan?.duration ?? null,
    firstInputMs: firstInput?.t ?? null,
    preparedBeforeFirstInput: prepSpan && firstInput ? prepSpan.end <= firstInput.t : (prepSpan ? true : null),
    levelSelects,
    postInputPagesFetchDecodeUploadCount: postInputWork.length,
    postInputPagesWork: postInputWork.map((s) => ({ type: s.type, src: s.startData?.src, startMs: s.start })),
  };
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node scripts/sat/page-trace-report.mjs <trace.json>'); process.exit(1); }
  const events = JSON.parse(readFileSync(file, 'utf8'));
  const summary = summarizePageTrace(events);
  console.log(`page-trace-report: ${events.length} events\n`);
  console.log(`Serving path: ${summary.servingPath}${summary.fallbackReason ? ` (reason: ${summary.fallbackReason})` : ''}`);
  if (summary.plan) {
    console.log(`Plan: ${summary.plan.textureCount} textures, residency ${summary.plan.residencyBytes} bytes, transfer ${summary.plan.transferBytes} bytes, fit=${JSON.stringify(summary.plan.fit)}, z5Mode=${summary.plan.z5Mode}${summary.plan.z5Pair ? ` (${summary.plan.z5Pair})` : ''}`);
  }
  console.log(`Prepare: start=${summary.prepStartMs?.toFixed(1)}ms end=${summary.prepEndMs?.toFixed(1)}ms duration=${summary.prepDurationMs?.toFixed(1)}ms`);
  console.log(`First input mark: ${summary.firstInputMs?.toFixed(1)}ms`);
  console.log(`Prepared before first input: ${summary.preparedBeforeFirstInput}`);
  console.log('Level selects (input-to-ready since each is a pure visibility swap with no fetch/decode/upload):');
  for (const l of summary.levelSelects) console.log(`  z${l.from ?? 'off'} -> z${l.to ?? 'off'} at ${l.readyAtMs.toFixed(1)}ms (${l.msSincePriorInput?.toFixed(1)}ms since first input)`);
  console.log(`Post-input pages fetch/decode/upload count (expect 0 inside coverage): ${summary.postInputPagesFetchDecodeUploadCount}`);
  if (summary.postInputPagesWork.length) console.log(JSON.stringify(summary.postInputPagesWork, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
