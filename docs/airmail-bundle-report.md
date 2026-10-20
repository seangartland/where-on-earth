# Airmail bundle report

## Phase 1 — Home Passport card and rarity display

- Restyled `.passport` in `src/meta/passport.js` as the cream travel document with an airmail edge and a client-clock postmark; its existing count, tap target, and stamp content are unchanged.
- Removed rarity-colour frame consumers in `src/meta/passport.js`, `src/meta/postcard-card.js`, and `src/styles/game.css`, replacing them with neutral frames. The `rarity-*` CSS variables and unused `.ppd-rarity` presentation rule were deleted; rarity data and class assignment paths remain.
- The Passport filter markup has no `data-pp="band"` control and no rarity grouping/sort option, so no filter code was changed.
- Approximation: the existing home count wording is retained exactly rather than adopting the mock's alternate wording.

## Phase 2 — Daily results postcard back

- Restyled `.pp-post` in `src/meta/postcard-card.js` into a cream, striped postcard back with a divider, fact message, address-side name and stats, tier stamp, and a separate lower-left postmark.
- The postmark is deliberately confined to the message side, clear of the stat text. The existing card interactions and summary/share strings are unchanged.
- Daily-result cards use their existing distance value in the tier stamp; other postcard contexts without a separate distance value retain the tier-only stamp.

## Phase 3 — Countries stamp album

- Restyled Country tiles in `src/meta/passport.js` as perforated cream stamps, retaining their existing flags, names, earned counts, progress, and navigation.
- Found, seen, and unvisited state information remains intact; completed stamps use the existing gold earn colour.
- Approximation: the dark Passport screen remains unchanged outside the stamp tiles rather than adding a separate full-page album panel.

## Phase 4 — Expedition route letters

- Added existing-data stop marks to classic expedition cards in `src/modes/expeditions.js`; played marks show their stop number and unplayed marks remain faint.
- Restyled route cards and weekly stop dots in `src/styles/game.css` as cream route letters and postmarks. Weekly played marks display their stored play date; other weekly marks retain their existing day marker.
- Approximation: classic expedition progress only stores a completed count, so its filled postmarks use stop numbers rather than dates.

## Phase 5 — Challenges as mail

- Marked incoming direct and Open Challenge rows in `src/pvp/home.js` with a visual-only envelope class and initials stamp. Outgoing creator/challenger rows retain their dark presentation.
- Added the sealed cream envelope, airmail stripe, flap, and stamp treatment in `src/styles/pvp.css`; row labels, event targets, controls, and join flow are unchanged.
- Approximation: Open Challenge data has no creator display name on this list row, so its stamp uses the existing “Open” initial rather than a sender initial.

## Verification

- Ran `node --check --input-type=module` with each touched JavaScript module supplied on standard input: `src/meta/passport.js`, `src/meta/postcard-card.js`, `src/modes/daily-game.js`, `src/modes/expeditions.js`, and `src/pvp/home.js`.
- Ran `git diff --check`; it completed without whitespace errors.

## Final guardrail audit

- Removed the Home postmark's added visible wording from `src/meta/passport.js`; it now displays only the required client-clock date, preserving the existing player-facing text.
- Kept the postcard's seen state on the cream paper face in `src/meta/postcard-card.js`; its existing grayscale image state is otherwise unchanged.
- Corrected the Daily postcard stamp to a circular tier-and-distance mark using its existing `distanceText`; other postcard contexts without a separate distance value retain their current tier-only stamp.

## Orchestrator addendum (2026-10-19)

Phase 2 as built above was REJECTED in verification: it hid the full card's
photo (breaking the in-game popup) and did not match approved mock section 3.
Sean ruled to rebuild it as the mock's single results panel; the correction is
BRIEF-airmail-phase2-fix.md. The commit carrying this report ships Phases 1, 3,
4 and 5 only; src/meta/postcard-card.js and src/modes/daily-game.js stay at
their pre-bundle state until the Phase 2 fix lands.
