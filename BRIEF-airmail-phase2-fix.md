# Brief: Airmail Phase 2 correction (Sean picked the mock, 2026-10-19)

Workdir: ~/workspace/map-game/pacing-work. The tree holds the uncommitted Airmail
bundle (docs/airmail-bundle-report.md). Phases 1, 3, 4, 5 are verified and must not
be touched. Phase 2 was built to a mis-scoped brief: it restyled the shared full
postcard card (.pp-post) into a per-card postcard back and hid its photo. Sean has
ruled: build what the approved mock actually shows. Design source:
~/workspace/map-game/shots/airmail-site-mock.html section 3 ("Daily results: the
postcard back"): the results screen is ONE postcard back panel: the five rounds
as ruled message lines, the total stamped at the bottom, the date in a postmark.

## Step 1: revert the Phase 2 card changes

In src/meta/postcard-card.js, undo everything the bundle's Phase 2 did to the
FULL (non-compact) card:
- Remove the added pp-fact element, the added pp-stamp / pp-postmark elements and
  their construction in buildPostcardCard, and the back-of-postcard grid styles.
- Restore .pp-photo to its pre-bundle rule (position relative, aspect-ratio 4/3,
  the photo visible). The in-game popup flies this card and its photo resolving
  after the guess is the payoff moment; the photo must render exactly as before.
- The restored .pp-post keeps Phase 1's rarity removal: a neutral 2px frame
  (the pre-bundle border used var(--rarity); use the same neutral tone the other
  Phase 1 frames use), NOT the rarity variable. Dark face as before.
In src/modes/daily-game.js, remove the one added line (stampText: distanceText in
postcardSummaryCard). After this step the full card and the popup behave and look
as they did at commit 05c91a9, apart from the neutral frame.

## Step 2: build the results panel as the mock's postcard back

Find the Daily postcard summary screen assembly (postcardSummaryCard and the
screen that lays the cards out, in src/modes/daily-game.js and any summary DOM it
builds). Restyle that screen's composition:
- The five round entries sit inside ONE cream paper panel (the shipped mail
  palette: linear-gradient(165deg, #faf3e1, #f0e4c6), airmail stripe across the
  top, ink navy text), replacing the stack of separate dark cards as the visual
  unit. The panel is a container treatment: the round entries become ruled
  lines inside it (a hairline rule under each entry, like handwriting lines).
- Each line keeps the entry's existing content and data: place name with flag,
  distance, score, and its earned/new/upgrade note, in the summary's current
  wording. Entries stay tappable and keep opening the same postcard detail as
  they do today.
- The existing total line becomes a stamped element at the panel's bottom
  right: circular or boxed stamp treatment in the gold ink (#b27c20), same text
  as the current total.
- A postmark ring with the current date (client clock, short month + day +
  year) sits on the panel, positioned so it overlaps NO text: not a round line,
  not the total, not any score. This placement rule is the point of the fix.
- All player-facing strings stay byte-identical to the current summary. The
  Daily share text is frozen and untouched. No image-share feature is built;
  the mock's "share card" note refers to this panel's look only.

## Guardrails

- Touch only src/meta/postcard-card.js, src/modes/daily-game.js, and (only if the
  summary layout needs it) src/styles/game.css. Nothing from Phases 1, 3, 4, 5
  changes: if a shared style must move, say so in the report instead of doing it.
- No mechanic, flow, storage, or string changes. Syntax-check touched JS with
  node --check --input-type=module. Leave changes uncommitted.
- Write docs/airmail-phase2-fix-report.md: what was reverted, what was built,
  where the postmark sits and why it cannot overlap text, and any approximation
  versus the mock, named plainly.
