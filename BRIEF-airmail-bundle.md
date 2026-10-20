# Brief: Airmail bundle (all remaining surfaces, one build)

Workdir: ~/workspace/map-game/pacing-work. Design source approved by Sean:
~/workspace/map-game/shots/airmail-site-mock.html (five numbered sections) plus the
already-shipped mail language in src/meta/passport.js / src/meta/postcard-card.js /
src/styles/game.css (cream paper #faf3e1 to #f0e4c6, ink navy #22355c, muted blue
#34486a, airmail stripe repeating-linear-gradient(45deg, #c8433c / #f7efdc / #2c4a7c),
serif italic facts, gold #b27c20 for earn marks). Build with Codex gpt-5.6-terra.

Sean's design line: paper is what you keep and what arrives; dark glass is what you
play on. Everything below is restyle only.

## Hard guardrails (all phases)

- NO player-facing string changes, except removing the rarity UI named in Phase 1.
  Share text formats are frozen byte-for-byte.
- NO mechanic, geometry-system, storage-key, or flow changes. The challenge
  envelope (Phase 5) is a visual treatment of the existing challenge cards; the
  tap target and join flow stay exactly as they are (no tear gesture in this build).
- Reuse the shipped mail CSS vocabulary (paper, stripe, postmark, stamp) instead of
  inventing parallel classes where the existing ones fit.
- Syntax-check every touched JS file: node --check --input-type=module.
- After EACH phase, append a short section to docs/airmail-bundle-report.md saying
  what changed, in which files, and any place the mock could not be matched exactly
  (name the approximation). The report is the deliverable; if you are killed and
  relaunched, read the report first and continue at the first unfinished phase.

## Phase 1: Home Passport card + rarity display removals

Home card: restyle the Home screen Passport card built by initPassportHome
(src/meta/passport.js, the .passport element) per mock section 1: a paper travel
document: cream stock, airmail stripe edge, the existing found-count content
unchanged, plus a postmark ring showing the CURRENT date (day + month, e.g. OCT 19)
drawn from the client clock at render time. The rest of Home stays dark glass.
Only the card's face changes; its tap behaviour and contents (counts, labels) do not.

Rarity display removals (Sean's ruling: the rarity taxonomy stays as internal data
but is never shown to players, because assignments may be rebalanced):
- Remove the Passport rarity filter (the band filter control, data-pp="band") and
  any grouping or sorting option based on rarity. Other filters, groups and sorts
  (including sort by closest distance) stay.
- Remove rarity-coloured borders everywhere they reach a card: the --rarity custom
  property consumers (.pp-post, .collection-card, .pp-slot-photo fallback rule,
  #place-thumb, the peek thumb already restyled) get a single neutral frame colour
  instead. Do NOT delete the underlying data or the rarity-* class assignment code
  paths that other logic might read; display only. The .rarity-* variable
  definitions and the .ppd-rarity pill style may be deleted if nothing renders
  them after your change; say which you did in the report.
- The player's own results are NOT rarity and stay: colour vs black-and-white,
  closest km, best score, earn-tier words (GOLD etc.).

## Phase 2: Daily results postcard back

Restyle the full postcard card (.pp-post, built by buildPostcardCard in
src/meta/postcard-card.js, used by the Daily summary and the in-game post-guess
popup) per mock section 3: the BACK of a postcard: cream paper, a vertical divider,
the fact as the handwritten-side message in serif italic, name/clue and the stats
as the address side, the circular stamp (tier + distance) in the top-right of the
card, postmark over its corner. The Daily summary screen itself and the share
text stay as they are; only the card face changes. Known mock flaw to avoid: do
not let the postmark overlap any score or stat text.

## Phase 3: Countries tab as a stamp album

Restyle the Passport Countries view (src/meta/passport.js country index and its
cards) per mock section 2: each country becomes a postage stamp on a cream album
page feel within the existing dark screen: perforated-edge stamp frame (dashed or
radial-cut border treatment consistent with the shipped stamp), flag large in the
stamp, country name and its collected count as the stamp's denomination line.
Found vs unvisited states keep their current information (counts, completion);
only the presentation changes. The Cities and Places shelves do not change in
this phase.

## Phase 4: Expeditions as route letters

Restyle the Expeditions screens (src/modes/expeditions.js and src/modes/weekly.js
surfaces) per mock section 4: a route presents as a letter: cream envelope/paper
panel for the route card, the route name as the addressee line, and one postmark
per stop along the route: earned stops get a filled ink postmark with the stop's
date if the existing data carries one (else the stop number), locked or upcoming
stops get a faint empty ring. Unlock pacing, route data and navigation unchanged.

## Phase 5: Challenges arrive as mail

Restyle the challenge surfaces on the PvP home (src/pvp/home.js: incoming
challenges and open-challenge cards) per mock section 5: an incoming challenge
presents as a sealed envelope: cream envelope face, airmail stripe, a stamp with
the challenger's initial or avatar letter, the challenger's name as the sender
line, and a visible sealed-flap treatment (a triangular flap via CSS clip-path or
border trick). Accept/decline/join controls keep their current labels, positions
within the card's flow, and behaviour; only the card's face becomes the envelope.
Outgoing and in-progress match rows keep the current dark style.

## Out of scope

Night paper, the pack chip variants, any new gesture, accounts surfaces, the
.pp-post changes beyond Phase 2, EOX or tile work, deploys (the orchestrator
verifies, banks and deploys the bundle).
