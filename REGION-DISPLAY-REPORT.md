# Region display report

## Files changed

- `src/meta/region-strength.mjs`
- `test/region-strength.test.mjs`
- `src/meta/passport.js`
- `src/styles/game.css`
- `REGION-DISPLAY-REPORT.md`

## Data and display

The Passport Regions block reads each stored visit from `host.passport.visits`, resolves it through the same `host.findLocation()` lookup used by `passportSummary()`, and gets its continent through the existing `host.continentOf()` attribution path. Its score is the stored best metadata score (`meta.b`) when available, with the existing visit score as the legacy fallback.

The pure region module receives those `{ continent, best }` entries and the existing `CONTINENT_ORDER` supplied by the Passport host. It calculates rounded average best scores, enforces the five-place qualification threshold, and makes deterministic strongest and weakest picks. The Passport rebuilds the block on page open and refreshes it during Passport sync when the page is visible. The section starts collapsed on every page open.

## Verification

Ran from the clone root:

`node --test "test/*.mjs"`

Result: 21 test files passed, 0 failed, 0 skipped. This includes the new region-strength coverage for rounding, guardrail, tie breaks, one qualifier, no qualifiers, and empty input. `git diff --check` also passed.

No browser screenshot was attempted, per the brief's sandbox note.

## Decisions

The current Passport surface has a collection-progress summary rather than a separate found/total card. The Regions block is directly below that existing summary and above the Passport postcard sections. The collapsed strongest and weakest lines use middot separators throughout, including between the label and continent, to comply with the no em dash copy rule.
