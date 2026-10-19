# Daily postcard pack build log

Date: 2026-10-19 (UTC). Scope: steps 1–5 of `docs/daily-pack-spec.md`.
Work is intentionally uncommitted. No network was used.

## Commands and results

- `node test/pack-store.test.mjs`
  - PASS: 10/10 tests.
  - Confirmed the approved pool is 805 cities + 332 landmarks = 1,137.
  - Covers the versioned/off-sync key, saved shape, lazy generation, no
    reroll, date rollover, distinct cards, retired-id redraw, persistence,
    totals and all four postcard outcomes.
- `node --test test/*.test.mjs`
  - PASS: all 4 repository test files (account merge, extent-aware scoring,
    pack store and Passport grouping).
- `node --check <file>` for every touched JavaScript file and both new test
  harnesses, plus `node --check --input-type=module < src/main.js`
  - PASS.
- `git diff --check`
  - PASS.
- `REGRESSION_LOGS_DIR=/tmp/pack-regression-logs SHOTS_DIR=$PWD/shots bash scripts/regression.sh account`
  - PASS: account merge regression.
- `node shots/pack/pack-verify.mjs`
  - The saved output from the latest successful run reports 36/36
    checks passing, including earning/seen behavior, cross-mode colour,
    reload resume, screen states, totals, postcard detail, repeat copy,
    midnight behavior and zero page errors.
  - The harness now additionally checks layout at 390x844 and 390x664,
    full-width Daily/pack rows, intact mode pairs, cleanup DOM state and
    `elementFromPoint` on the settings gear.
  - A rerun in this managed sandbox is blocked before page creation because
    Chromium exits with `setsockopt: Operation not permitted`. The same
    restriction prevents the browser suites in the full regression wrapper;
    its default sibling log path is also read-only here. The harness remains
    ready to run in the orchestrator's headless environment.
- Orchestrator verification (2026-10-18, before banking):
  - `node shots/pack/pack-verify.mjs` rerun in the orchestrator environment:
    PASS 46/46, including the layout checks at 390x844 and 390x664.
  - Syntax checks on every touched file, `node --test test/*.test.mjs`
    (32 tests), the pack-store tests (10/10) and the account regression
    suite all PASS independently. Diff reviewed against the spec: pool
    805 + 332 via the existing functions, no timer in pack rounds, no
    pack-level share, Endless module untouched apart from a null guard,
    no per-mode share format changes.

## Implementation notes

- The current Landmarks mode also admits nine extent-aware area entries. The
  pack store deliberately selects only `kind === 'landmark'` from that mode's
  pool to preserve Sean's approved 332-landmark / 1,137-total decision.
- Pack 2, entitlement wiring and upsell copy were not built.
