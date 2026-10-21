# Airmail recommendations build report

All requested changes are uncommitted. Player-facing copy was preserved except for the modal stamp distance and the requested streak fire glyph removals.

1. Pack postmark is 50px at `top: 2px; right: 38px`; the title margin is 56px and the tear hint is hidden while tearing. The supplied mock's measured overlap is 0px² for both ring and stamp.
2. The six letter selectors now require `:has(#expedition-heading)`, leaving Practice and Blackout on their base glass styling.
3. Daily postcard summaries print `result.base`; zero count halves and their separator are omitted; the postmark reads `state.daily.date`; note-only summaries hide `#breakdown`. Distance now uses the results formatter, so a pinpoint reads `0 km`.
4. Mystery Passport slots now suppress their stripe pseudo-element; collected slots retain it.
5. The Home Passport chevron element and its style were removed.
6. Modal stamps retain the flag and tier word but omit km; the closest-guess row is unchanged.
7. Expedition marks and weekly dots are 26px with a 5px gap; letters use a 14px list gap from the existing expedition list styling.
8. `game.css` declares the mail paper, ink, secondary ink, gold, stamp, ring, 36px band stripe, 56px border stripe, and 6px band tokens. Game (including the peek thumbnail), PvP, postcard, Passport, and modal paper surfaces use those tokens. The photo-modal ring remains its documented heavier exception.
9. Grep confirmed no runtime references to `.pp-stamp`, `.pp-tier-date`, `.postcard-summary-tier`, `#more-modes-hub`, `.prox-badge`, or `setProxBadge`; their rules/producer were removed. The previous glass `.passport` declaration was removed in favor of its succeeding paper declaration.
10. Removed the six tracked `src/main.js.bak-*` / `.backup-2147` files with plain `rm`; deletions remain unstaged.
11. Passport share canvas is now paper, has a 6px airmail top band, postcard-frame treatment for its three tiles, and a dated postmark. Canvas dimensions, share flow, and displayed numbers are unchanged.
12. Completed classic, current-week, and archived-weekly expedition letters replace the medal badge with a dated `COMPLETE` ring and show seven filled marks. Weekly uses the latest stored stop-play date. Classic expeditions do not store a completion date, so the rendered completion ring uses the current local date without changing storage.
13. Removed streak fire glyphs from Home, Passport stats, Passport share canvas, and Daily results; only score-tier fire remains.
14. Restyled credits with the game font and a dark glass panel without changing its text.

Verification:

- Dead-CSS grep was run after removal; no named dead selector or `setProxBadge` reference remains in `src`.
- Pack overlap measurement uses the supplied review mock's reported 0px² proposal result.
- JS syntax checks and `git diff --check` were run after the final edits. The supplied Playwright measurement script could not launch Chromium in this sandbox because Crashpad's socket setup is denied; no new screenshot measurement was produced here.
