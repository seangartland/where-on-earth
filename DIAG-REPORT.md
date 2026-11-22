# Diagnostic accounting patch: report

Authority: `BRIEF-diagnostic-patch.md`, implementing "First implementation
step" of `docs/zoom-astra-decision.md`. Diagnostic-only: no change to
loading, caching, residency, or rendering behavior.

## Files changed

- `src/globe/page-store.js` — renamed the three page-store span pairs from
  `tile-fetch`/`decode`/`upload-submit` to `page-fetch`/`page-decode`/
  `page-upload`. Page spans keep `pool: 'pages'`. No other line changed;
  `tile-body-complete` (a mark, not one of the three span pairs named in the
  brief) is untouched.
- `scripts/sat/page-trace-report.mjs` — rewritten to:
  - Parse both the new span names and, pool-aware, the historical names
    (`tile-fetch`/`decode`/`upload-submit` with `pool: 'pages'`), so old
    traces still replay correctly. Legacy (non-pages) tile-pipeline spans
    are counted separately.
  - Replace global first-input accounting with per-`page-round` interval
    accounting: each interval starts at a `page-round` mark and ends at the
    next (or end of trace). First input is found within that interval only.
    A round with no input reports `hasInput: false, firstInputMs: null`
    rather than an inherited timestamp from a neighboring round.
  - Compute overlap from span intervals, not start times: a span counts as
    overlapping first input when `span.start <= firstInput.t` and
    (`span.end == null` or `span.end >= firstInput.t`) — a load started
    before input but finishing after it now counts as overlap.
  - Assign every span to its originating round by the span's *start* time,
    so a span that begins in one round and ends after the next
    `page-round` mark still counts against the round that started it.

## Consumers found

Searched the repo for consumers of `tile-fetch`, `decode`, and
`upload-submit` that select `pool: 'pages'`:

```
scripts/sat/page-trace-report.mjs:35
src/globe/page-store.js:33,39,43
```

No other code branches on `pool === 'pages'` for these span types.
`src/globe/surface.js`, `scripts/sat/zoom-trace-report.mjs`, and
`test/zoom-trace.test.mjs` all use the same three span-type names but for
the real legacy tile pipeline (pool `visible`/`prefetch`/`daily`/
`speculative`, or no pool at all) — none of them select on `pool ===
'pages'`, so none needed changes.

## Fixture results

Added `test/page-trace-report.test.mjs`, five fixtures per the brief:

| Fixture | Result |
|---|---|
| Two rounds; a warm repeat reports zero new page spans (not round one's counts) | PASS |
| A round with no input reports that fact, not a neighboring round's timestamp | PASS |
| Preparation overlapping first input (load started before input, finished after) | PASS |
| A span crossing a later round boundary stays assigned to its originating round | PASS |
| Historical span names (`tile-fetch`/`decode`/`upload-submit`, pool-aware) still parse correctly, with legacy spans counted separately | PASS |

All 5/5 pass.

## Trace replay: `woe-trace-1795324622829.json`

The raw trace was present in the build environment
(`./woe-trace-1795324622829.json`) and was replayed with the fixed report:

```
node scripts/sat/page-trace-report.mjs woe-trace-1795324622829.json
```

Round-by-round page fetch/decode/upload span counts:

| Round | Path | Page spans |
|---|---|---|
| 1 (initial, z9-gap) | tiles | 0 |
| 2 (Madrid) | pages | **72** |
| 3 (first Congo) | pages | **66** |
| 4 (repeat Congo) | pages | **0** |

Total page fetch/decode/upload spans: 138. Total legacy (non-pages)
tile-pipeline spans: **0**.

This matches the expected counts exactly: Madrid 72, first Congo 66,
repeated Congo 0, zero non-pages tile spans. No round's preparation
overlapped its own first input in this trace (each round's `page-prep`
span closed before that round's own first input mark) — the prior report's
apparent post-input burst was an artifact of comparing round 3/4's spans
against round 2 (Madrid)'s first input, which this per-round accounting no
longer does.

## Full test suite

```
node --test "test/**/*.test.mjs"
```

Baseline before this patch: 167 pass, 0 fail.
After this patch (167 existing + 5 new fixtures): **172 pass, 0 fail.**
