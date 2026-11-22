#!/usr/bin/env node
// Usage: node scripts/sat/page-trace-report.mjs <trace.json>
//
// Reads a trace from scripts/sat/page-trace-probe.mjs (?pages=1&trace=1) and
// reports, per page round (each interval begins at a 'page-round' mark and
// ends at the next): the resolved serving path (pages or tiles, and why),
// the plan's accounted transfer/residency/texture counts, preparation
// duration, this round's own first input (a round with none reports that
// explicitly, never a neighboring round's input), whether preparation or any
// page asset load overlapped that input (by span interval, not just start
// time: a load that started before input but finished after it counts as
// overlap), every level-change span, and a per-round page asset span count.
// Legacy (non-pages) tile-pipeline spans are counted separately, expected
// zero inside page coverage.
//
// New page-store spans are named page-fetch/page-decode/page-upload.
// Historical traces recorded before that rename still use tile-fetch/
// decode/upload-submit for the same page work, distinguished only by
// pool: 'pages' on the span data; both are parsed here so old traces still
// replay correctly.
import { readFileSync } from 'node:fs';
import { pairSpans } from './zoom-trace-report.mjs';

const PAGE_SPAN_TYPES = ['page-fetch', 'page-decode', 'page-upload'];
const LEGACY_NAMED_TYPES = ['tile-fetch', 'decode', 'upload-submit'];

function isPagesPool(span) {
  return span.startData?.pool === 'pages' || span.endData?.pool === 'pages';
}

function isPageSpan(span) {
  if (PAGE_SPAN_TYPES.includes(span.type)) return true;
  return LEGACY_NAMED_TYPES.includes(span.type) && isPagesPool(span);
}

function isLegacyTileSpan(span) {
  return LEGACY_NAMED_TYPES.includes(span.type) && !isPagesPool(span);
}

// True when `span`'s interval contains `t`: started at or before t and (open,
// or) ending at or after t. This is "overlap", as distinct from merely
// starting after t (a load entirely after input is not in flight at input).
function overlapsAt(span, t) {
  if (span.start == null || t == null) return false;
  if (span.start > t) return false;
  return span.end == null || span.end >= t;
}

export function summarizePageTrace(events) {
  const { spans, marks } = pairSpans(events);
  const roundMarks = marks.filter((m) => m.type === 'page-round').sort((a, b) => a.t - b.t);
  const inputMarks = marks.filter((m) => m.type === 'input-start' || m.type === 'input-wheel');
  const pageSpans = spans.filter(isPageSpan);
  const legacyTileSpans = spans.filter(isLegacyTileSpan);

  const rounds = roundMarks.map((roundMark, i) => {
    const start = roundMark.t;
    const end = i + 1 < roundMarks.length ? roundMarks[i + 1].t : Infinity;
    const inRound = (t) => t != null && t >= start && t < end;

    const planMark = marks.find((m) => m.type === 'page-plan' && inRound(m.t));
    const prepSpan = spans.find((s) => s.type === 'page-prep' && inRound(s.start));
    const firstInput = inputMarks.find((m) => inRound(m.t)) ?? null;
    const roundPageSpans = pageSpans.filter((s) => inRound(s.start));
    const levelSelects = spans
      .filter((s) => s.type === 'page-level-select' && inRound(s.start))
      .map((s) => ({ from: s.startData?.from ?? null, to: s.startData?.to ?? null, readyAtMs: s.end }));

    const overlapping = firstInput
      ? [...(prepSpan ? [prepSpan] : []), ...roundPageSpans].filter((s) => overlapsAt(s, firstInput.t))
      : [];
    const postInputPageSpans = firstInput
      ? roundPageSpans.filter((s) => s.start != null && s.start > firstInput.t)
      : [];

    return {
      round: i + 1,
      path: roundMark.data?.path ?? null,
      fallbackReason: roundMark.data?.reason ?? null,
      lat: roundMark.data?.lat ?? null,
      lng: roundMark.data?.lng ?? null,
      plan: planMark?.data ?? null,
      prepStartMs: prepSpan?.start ?? null,
      prepEndMs: prepSpan?.end ?? null,
      prepDurationMs: prepSpan?.duration ?? null,
      hasInput: !!firstInput,
      firstInputMs: firstInput?.t ?? null,
      overlapsFirstInput: firstInput ? overlapping.length > 0 : null,
      overlappingSpans: overlapping.map((s) => ({ type: s.type, src: s.startData?.src, startMs: s.start, endMs: s.end })),
      levelSelects,
      pageSpanCount: roundPageSpans.length,
      postInputPageSpanCount: postInputPageSpans.length,
      postInputPageSpans: postInputPageSpans.map((s) => ({ type: s.type, src: s.startData?.src, startMs: s.start })),
    };
  });

  return {
    rounds,
    totalPageSpans: pageSpans.length,
    totalLegacyTileSpans: legacyTileSpans.length,
  };
}

function formatRound(r) {
  const lines = [];
  lines.push(`Round ${r.round}: path=${r.path}${r.fallbackReason ? ` (reason: ${r.fallbackReason})` : ''}`);
  if (r.plan) {
    lines.push(`  Plan: ${r.plan.textureCount} textures, residency ${r.plan.residencyBytes} bytes, transfer ${r.plan.transferBytes} bytes, fit=${JSON.stringify(r.plan.fit)}, z5Mode=${r.plan.z5Mode}${r.plan.z5Pair ? ` (${r.plan.z5Pair})` : ''}`);
  }
  if (r.prepStartMs != null) {
    lines.push(`  Prepare: start=${r.prepStartMs.toFixed(1)}ms end=${r.prepEndMs.toFixed(1)}ms duration=${r.prepDurationMs.toFixed(1)}ms`);
  }
  lines.push(`  First input this round: ${r.hasInput ? `${r.firstInputMs.toFixed(1)}ms` : 'none (round reports no input, not a borrowed timestamp)'}`);
  if (r.hasInput) {
    lines.push(`  Overlaps first input (span interval, not just start time): ${r.overlapsFirstInput}`);
    if (r.overlappingSpans.length) lines.push(`    ${JSON.stringify(r.overlappingSpans)}`);
  }
  lines.push('  Level selects (input-to-ready since each is a pure visibility swap with no fetch/decode/upload):');
  for (const l of r.levelSelects) lines.push(`    z${l.from ?? 'off'} -> z${l.to ?? 'off'} at ${l.readyAtMs?.toFixed(1)}ms`);
  if (!r.levelSelects.length) lines.push('    (none)');
  lines.push(`  Page fetch/decode/upload spans this round: ${r.pageSpanCount}`);
  lines.push(`  Of those, started after this round's own first input: ${r.postInputPageSpanCount}`);
  if (r.postInputPageSpans.length) lines.push(`    ${JSON.stringify(r.postInputPageSpans)}`);
  return lines.join('\n');
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node scripts/sat/page-trace-report.mjs <trace.json>'); process.exit(1); }
  const events = JSON.parse(readFileSync(file, 'utf8'));
  const summary = summarizePageTrace(events);
  console.log(`page-trace-report: ${events.length} events, ${summary.rounds.length} page round(s)\n`);
  for (const round of summary.rounds) console.log(`${formatRound(round)}\n`);
  console.log(`Total page fetch/decode/upload spans: ${summary.totalPageSpans}`);
  console.log(`Total legacy (non-pages) tile-pipeline spans: ${summary.totalLegacyTileSpans}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
