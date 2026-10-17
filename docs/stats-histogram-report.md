# Stats histogram report

## Built

The Stats screen now shows a Score distribution section after the headline stat cards when at least one Daily game is stored. It uses ten vertical 1,000 point buckets with labels from 0 through 9k. Scores of 10,000 are placed in the final bucket. Filled bars scale to the largest bucket with an eight percent minimum, show their count above the bar, and empty buckets retain a baseline tick.

No storage behavior, share text, or other Stats sections were changed.

## Verification

- `node --check --input-type=module < src/meta/stats.js` passed.
- `git diff --check` passed.
- A Playwright harness based on `shots/passport/pp-shot.mjs` was run with a fake `game.local` origin and 24 seeded history entries. The seed includes a 10,000 total, several records in shared buckets, and an empty 4k bucket. It is set to assert ten bars, the 0 to 9k labels, and the expected counts before capture.
- The Chromium launch failed in this sandbox before page creation with `SIGTRAP` and a Crashpad `setsockopt: Operation not permitted` error, so those browser assertions could not run. No screenshot was faked.

Requested screenshot path: `/home/hatch/workspace/map-game/shots/stats-hist/stats-hist.png` (not produced because Chromium failed).

Commit status: not created. This managed session mounts `.git` read-only, so Git could not create `.git/index.lock`. The requested commit hash and push require a session with writable Git metadata.

## Orchestrator verification and banking (2026-10-16 night)

The builder's sandbox blocked Chromium (SIGTRAP) and git (read-only), the same wall as the accounts run, so the orchestrator finished verification: Terra's harness (24 seeded history entries incl. a 10,000 and an empty 4k bucket) was re-run from the orchestrator environment. Assertions passed: 10 bars, labels 0, 1k, 2k ... 9k, counts 3, 3, 3, 3, 0, 2, 2, 2, 2, 4. Screenshot at ~/workspace/map-game/shots/stats-hist/stats-hist.png, visually checked: clean, native to the Stats page. One behaviour note: the histogram replaces the previous horizontal band list, whose "today" band highlight does not carry over; the bucket containing today's score is not highlighted in this version. Committed and pushed by the orchestrator.

## Fix round (Sean's review, 2026-10-17 night)

Sean flagged two things on the first screenshot: double-digit counts (a player
can realistically have 20+ games in the 9k bucket) overflowed their column at
11px, and the scale read wrong. Pixel measurement showed the seeded heights
were proportional, but the code carried an 8 percent minimum bar height that
would overstate small counts on real data. Fixes: count font 11px to 10px at
weight 700, counts now sit directly on each bar's top edge (positioned from
the same percentage as the fill), the minimum-height fudge is removed (zero
keeps its baseline tick), and the bar glow is gone. Verified with a realistic
81-game seed (buckets 1, 2, 5, 9, 14, 11, 6, 3, 8, 22): counts exact, the 22
fits its column, heights proportional (screenshot
~/workspace/map-game/shots/stats-hist/stats-hist-v2.png). Banked by the
orchestrator.
