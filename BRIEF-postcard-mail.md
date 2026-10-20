# Brief: Postcards as mail, restyle of grid, peek and modal

Sean approved the mail restyle on all three mocked surfaces on
2026-10-19. The visual spec is ~/workspace/map-game/shots/postcard-mail-mock.html
(screenshot postcard-mail-mock.png beside it): the same cream stock,
airmail stripe, ink navy and stamp/postmark language as the Airmail pack
wrapper that just shipped to the tree (see .pack-sealed in
src/styles/game.css and docs/pack-airmail-report.md for the built
precedent and its exact tones). Translate the mock faithfully. Styling
and minimal markup only: no data, no copy, no storage, no behavior
changes anywhere.

## Surface 1: the grid (Passport shelf cards, .pp-slot)

Component: src/meta/postcard-card.js, the styles injected by
ensurePostcardCardStyles() and the compact variant of
buildPostcardCard. Restyle the compact slot to the mock:

- Card becomes cream paper (#faf3e1 to #f0e4c6) with the airmail stripe
  along the top edge and a soft paper shadow.
- Photo gets a white matte (3px #fffdf6) with a hairline and soft inner
  shadow, same aspect and crop as today.
- The dark km pill (.pp-slot-score) becomes a small circular ink
  postmark overlapping the photo's bottom-right corner: cream disc,
  ink ring, "12 km" stacked; ink color follows the card's tier (gold
  tier = gold ink #b27c20; visited greyscale = gray ink). Keep the
  pill's data and visibility rules identical (only on cards that show
  it today).
- Name (.pp-slot-name) in ink navy #22355c, same size and truncation.
- Visited cards keep the greyscale photo (existing rule). Unvisited
  cards keep the flag (.pps-flag), now centered inside a dashed
  stamp-box outline on the paper, as mocked.
- The full .pp-post variant is OUT of scope: leave it exactly as is
  (Daily summary and the in-game popup keep today's dark card).

## Surface 2: the peek (reveal sheet thumb)

Styles: the .peek-bar block in src/styles/game.css (thumb rules around
the #peek-thumb / .peek-slot rules). The bar itself stays dark glass;
only the 52px thumb changes, to a tiny mailed photo:

- Cream matte frame (3px #fffdf6, small radius), hairline ring.
- Airmail stripe along the thumb's top edge (pseudo-element is fine).
- A small postmark dot at the thumb's bottom-right corner: cream disc
  with an ink ring, carrying the tier glyph the mock shows (the target
  for bullseye tier). Drive it from the existing proximity classes
  (.prox-bullseye / .prox-postcard / .prox-pinpoint on the slot): show
  the dot when the slot carries a proximity class, glyph per the
  current tier semantics (target under 25 km, pin under 150 km). If a
  class-to-glyph mapping is ambiguous, mirror the .prox-badge content
  rules and note your choice in the report.
- The .prox-badge, name, score line, grip, the mystery dashed slot and
  the seen-no-postcard greyscale rule are all untouched.

## Surface 3: the modal (Passport postcard detail, .ppd)

Styles in src/styles/game.css (.ppd* rules); markup/data in
src/meta/passport.js (the detail screen build + fillPostcard). The
detail card becomes the mailed postcard from the mock:

- Outer card: airmail stripe frame (the repeating gradient border
  treatment from the mock) around a cream inner panel.
- "Postcard from <continent>" header stays, in warm brown tracked
  caps, with the PAR AVION chip at its right (chip text: "PAR AVION ·
  BY AIR MAIL", PAR AVION in red).
- Photo: white matte frame like the grid. The circular .pp-stamp is
  replaced by a rectangular perforated postage stamp at the photo's
  top-right: white stock, dashed perforation edge, the location's flag
  large, and under it the tier and closest distance in ink ("GOLD ·
  12 KM"), populated in fillPostcard from the same entry fields the
  current stamp uses; hidden under the same conditions the current
  stamp hides.
- A postmark circle overlaps the photo's top-left: slate ink ring,
  rotated -11deg, text "POSTCARD" over the first-earned (or
  first-visited) date over the year, from the same historyDate
  fillPostcard already computes; shown whenever that date exists.
- Name in ink navy; clue/meta line in slate; the fact in Georgia serif
  italic, warm dark brown (the mock's one typeface departure).
- Footer fix (called out in review of the mock): the history row and
  the Best score / Closest guess stats must not crowd at 390px. Stack
  them: history line on the ruled top border, stats on their own line
  below, as space allows; both fully readable, nothing overlapping.
- The FLIP open/close animation, the share button, the seen-only hint
  text and every id/class other code hooks stay working and unchanged
  in behavior. The seen-only card keeps its greyscale photo.

## Hard constraints

- No copy changes (the PAR AVION chip and the postmark's "POSTCARD"
  word are design elements from the approved mock, not copy changes).
- Tier meaning is preserved everywhere through the existing rarity
  variables/classes; only the presentation of the tier changes.
- Nothing outside these three surfaces changes. In particular the
  Daily summary card, the in-game popup figure (.pp-post), the pack,
  and the reveal sheet beyond the thumb are untouched.
- No new localStorage keys, no data file changes.

## Verify before you finish (no browser runs; the orchestrator does those)

- node --check --input-type=module on every JS file you touch.
- git diff --check clean; diff touches only src/meta/postcard-card.js,
  src/meta/passport.js, src/styles/game.css, this brief and your report.
- Do NOT attempt Chromium or the harnesses: this sandbox blocks them
  (crashpad), and the orchestrator runs the visual verification.
- Write docs/postcard-mail-report.md: per-surface summary of what
  changed, the peek glyph mapping choice, and anything in the mock you
  could not translate literally and why.
- Leave everything uncommitted.
