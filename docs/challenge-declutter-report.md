# Challenge page declutter: build report

Date: 2026-10-16. Design: docs/challenge-page-review-opus.md, Option 1
(Sean approved 2026-10-16). Code by Claude Opus 5.5 (commit 92625fd);
the builder's session ended after the code commit, so the orchestrator
ran the remaining verification and this report.

## What shipped (review items 1 to 12)

- The two format cards are gone. One full-width primary "Challenge a
  friend" (direct) and "Start an Open Challenge for a group" as a text
  button under it.
- No name gate on entry: a create tapped without identity shows the
  existing name block (submit label "Create") in the button slot, then
  runs the create that was tapped. Rename keeps the editingName path.
- One merged "Your games" list above the create button, ordered your
  turn, then waiting, then finished, newest first within a group. No
  header and no empty-state lines when the list is empty.
- Code join sits behind a "Have a code?" text button revealing the
  existing field and Join in place. Identity is a footer line:
  "Playing as Sean · Change name".
- An unaccepted direct match reads "Waiting for a friend" (was "Open
  challenge", clashing with the group format). Group rows read
  "Open Challenge · N players" with rank or score in the small line;
  the left column is blank for group rows, so it means one thing
  (rounds played) everywhere it appears.
- Cap pre-check: the client counts the slots the Worker holds
  (unjoined direct matches you created, and your OPEN Open Challenges
  with nobody else in them yet, matching the approved slot-release
  rule). At 3, the create controls are replaced by the note line; a
  server OPEN_CHALLENGE_CAP shows the same note in the button slot.
- Mechanics unchanged: 5 places, 20-second rounds, 5,000 total,
  link-first join with code fallback, the shared 3-open cap and its
  release rules, rename, device-only identity. No Worker change.

Files: src/pvp/home.js, src/styles/pvp.css only.

## Verification (orchestrator)

- Syntax: node --check and node --check --input-type=module pass on
  src/pvp/home.js.
- Measured states (shots/pvp/review-measure.mjs against the new code,
  390x664 and 390x844): new player shows 1 primary button, 0 visible
  inputs, 0 empty lines; returning player shows 1 primary and 5 merged
  list rows; at the cap, 0 primary buttons and the note text present.
  All three meet the review's targets.
- Screenshot review: review-returning-664.png shows the merged list in
  the review's order (your turn first), group rows carrying type in
  the title and score or rank in the small line, the primary under the
  list, and the footer identity line.
- Regression (scripts/regression.sh): all PvP suites pass (H2H 1, 2,
  3a, 3b, 4, 5, 7, Open Challenge vs live worker, layout measurements)
  plus Passport/Daily and the Survival hub. The Baseline screenshots
  suite failed once on the known headless-browser crash ("Target page,
  context or browser has been closed") and passed on rerun with zero
  page errors.

## Commits

- 92625fd Challenge page declutter: one primary create, merged games
  list, name on first create (Claude Opus 5.5)
- This report, committed last by the orchestrator.
