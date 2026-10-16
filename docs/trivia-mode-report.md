# Trivia clues mode: build report

Date: 2026-10-16. Design: docs/expeditions-rethink-opus.md, Proposal 2
follow-on (Trivia clues as the second More modes hub mode; Sean approved
the sequence 2026-10-15). Built by Claude Opus 5.5 in one session, directly
(no delegation). The audit at the start found no banked trivia work in git
log or the working tree. Not deployed; the orchestrator verifies and deploys.

## Read this first: the bank's photos are widely wrong (deploy decision)

The mode is built to spec and its harness passes, but the reveal photo
comes from the bank's `image` field, and many of those photos show a
different place. The bank is off-limits to this build, so nothing was
changed or worked around. Measured:

- 1,282 entries carry an image, but only 713 distinct photos. 204 photos are
  shared by 2 or more entries, covering 773 entries. One Shanghai photo
  (Huangpu Park) stands in for 23 different cities, a Hong Kong skyline for
  22 (including Hamamatsu, Japan), a Luoyang photo for 21.
- A deterministic 40-entry sample (seeded, listed in the appendix),
  judged by me (Opus) from each image's filename against the
  entry's place: 19 match, 21 show somewhere else. Examples: Khartoum shows
  the Valley of the Queens (Egypt), Phalodi shows Dunnottar Castle
  (Scotland), Gwangju shows Fort Sumter, Pantheon (Rome coordinates) shows
  the Pantheon of Paris, Niigata shows the Thomas Edison tower. Landmarks
  and events mostly match; most cities do not.
- These came in with commit c7ac8fd "Backfill trivia bank" (2026-10-06).
- This is a filename judgment on a sample, not a full audit; treat the
  rate (about half) as an estimate.

Recommendation: do not ship until Sean decides. Options: an image pass on
the bank (a data task, outside this build's limits), or restricting the
draw to entries with verified photos. Either is a small change to the
playable rule in src/modes/trivia.js once the data exists.

Also from the bank, smaller: 4 playable clues contain their own answer
(Anshan, Daqing, Titanic, Battle of Waterloo). The harness allows a name
inside the clue itself and checks it appears nowhere else.

## Bank fields found

`assets/trivia-bank.json`: an array of 1,303 entries, ids unique.

| Field | Entries | Notes |
|---|---|---|
| id, clue, lat, lng, fact, short | 1,303 | every entry |
| difficulty | 1,282 | integers 1 to 10 |
| image | 1,282 | the same 1,282 entries as difficulty |
| category | 46 | moment 42, city 4; too sparse to use |
| continent | 16 | too sparse to use |

So the bank does carry a usable difficulty field; it carries no usable
category field. The 21 entries without difficulty also have no image.

Fields used: `id` (round identity, harness), `clue` (the round prompt),
`lat`, `lng` (target and scoring), `difficulty` (draw bands), `image` (the
reveal photo), `short` (the reveal name, results lines, share lines),
`fact` (the reveal card fact). Not used: category, continent.

Playable rule: an integer difficulty 1 to 10 and an image, giving 1,282
entries. The 21 excluded entries have neither, and the reveal needs a
photo. The hub row shows this playable count (1,282 clues), computed from
the bank at load, not the raw 1,303. Flagging it as a judgment call.

Targets resolve only from the bank: main.js fetches
`assets/trivia-bank.json` and hands it to `triviaBankLoaded`; the module
never touches the cities file, the landmarks file or findLocation. The
code check from the harness (quoted from shots/trivia/harness-result.json):

```
triviaImports:
  import { setRunResultsCopy, setRunResultsMode } from './survival.js';
  import { formatKm } from '../core/format.js';
triviaRefs (findLocation, landmarks, locations, getJSON, fetch( in trivia.js): []
bankLoad (main.js):
  getJSON('assets/trivia-bank.json').then(triviaBankLoaded).catch((err) => {
```

686 bank ids exist in neither game file; these play like any other.

## Draw scheme

Five rounds, one draw per difficulty band, easiest first: [1,2], [3,4],
[5,6], [7,8], [9,10] (band sizes 256, 346, 266, 245, 169). Uniform random
within a band. The bands are disjoint, so a game can never repeat a target.
No daily lock; Play again draws a fresh game.

## The mode

- Hub: the Trivia clues row is live (Landmarks row pattern): "Trivia clues",
  "Five clues, find each place.", and a sub line "1,282 clues", becoming
  "1,282 clues · Best 2,898" once a best exists. The row now sits above
  Photo mode, which stays a disabled Coming soon row, so live rows come
  first.
- Rounds: the standard round engine. Header "Round N of 5"; the clue
  replaces the place name; no photo before the guess. At the reveal the
  header and card name the place (`short`), the card shows the bank photo
  and fact, and the pill and score show the round's distance score (0 to
  1,000, no weight). No country outline: bank entries carry no country.
- Recording: score-only, the PvP precedent. `revealGuess` skips
  `recordVisit` while Trivia is active, and Trivia counts as a one-off (no
  Daily state is written). No postcards, no visits, no run haul.
- Storage: one new key, `where-on-earth-best-trivia` (best game total, an
  integer string). No existing key or saved shape changed.
- Results: the run-over screen (the Survival, Borders, Blackout pattern):
  eyebrow "Trivia", title "2,898 / 5,000", Score and Best tiles, then a
  round-by-round list (place, points, distance) using the shared breakdown
  styles, then Share result, Play again and the close button for Home.
- Share: a new builder on `host.formatGameShare` with title "Trivia" and the
  " · " separator (Landmarks precedent): score out of 5,000, Best, the three
  closest guesses. No "places visited" line, since Trivia records none.
  The Daily share and every other mode's share text are untouched.

## Files changed

- `src/modes/trivia.js` (new): bank load and playable rule, draw, round
  header, results, share text, hub sub line.
- `src/game/round.js`: Trivia branches in showRound, revealGuess (no
  recording, one-off, the reveal name is `short`, pill and Next copy),
  nextRound and currentItem; three new element refs; hideScreens hides the
  round-by-round list.
- `src/modes/survival.js`: the run-over screen's Play again and Share route
  to Trivia when it owns the screen; `setRunResultsCopy` takes an optional
  best label that defaults to "Best streak", so existing callers are
  unchanged.
- `src/modes/landmarks.js`: the hub fills the Trivia sub line.
- `src/main.js`: wiring, the bank fetch, goHome clears Trivia, and leaving
  a Trivia game mid-way warns that progress will be lost.
- `index.html`: the live Trivia row (moved above Photo mode), an id on the
  best label, the hidden round-by-round section on the run-over card.
- `src/styles/game.css`: the new list joins the existing breakdown
  selectors; one rule for its spacing; the breakdown heading rule gains a
  `.survival-results-card` selector so the card's 36px h2 rule does not
  override it. No new classes.

Untouched: every assets/*.json, daily-pins.json, Daily selection, the frozen
difficulty scorer, PvP code, other modes' keys and share text.

## Verification

### Syntax

`node --check` and `node --check --input-type=module` pass on all five
edited JS files: src/main.js, src/game/round.js, src/modes/survival.js,
src/modes/landmarks.js, src/modes/trivia.js.

### Full regression (scripts/regression.sh)

Run once after the code commit (7b1f4a2), against the working tree:
**ALL SUITES PASSED, 12 of 12, on the first run** (no reruns; the known
H2H 3b and 4 flakes did not fire): Passport/Daily, Survival hub
tap-through, PvP H2H 1, 2, 3a, 3b, 4, 5, 7, Open Challenge vs live worker,
PvP layout measurements, Baseline screenshots. Logs in
~/workspace/map-game/shots/regression-logs/. The baseline suite rewrites
demo/shots/baseline/*.png; those files were already modified in the working
tree before this build and are not part of these commits.

### 390px harness (shots/trivia/trivia-shot.mjs)

Playwright with /opt/meta-chromium, 390x844 touch viewport, game.local
routed to the demo files, Wikimedia images stubbed with assets/og.png (so
photos in the shots are that placeholder). The hub, the Trivia row, Lock in,
Next, Share, Play again, Home and the Passport are reached with real taps,
each gated on a hit test at its centre (visible, enabled, on top), never
forced. Round 1 is placed with a real globe tap plus Lock in; rounds 2 to 5
drop pins via window.__game.guess at chosen offsets.

Result: **27 of 27 checks pass**, zero page errors (full output in
shots/trivia/harness-result.json). One earlier run crashed the headless
browser ("Target page, context or browser has been closed", the known flake
class, with the VM at about 1.5 GB available); the rerun passed. An even
earlier run reported one failure that was a harness bug (a reveal field
overwrote the pre-guess name field); fixed in the harness, not the game.

Checks:
- Hub: Trivia row live, hit-testable, sub "1,282 clues" (the playable count
  from the bank); Photo mode disabled with Coming soon; order Landmarks,
  Trivia clues, Photo mode.
- Five rounds, headers "Round 1 of 5" to "Round 5 of 5"; every round's
  prompt equals that entry's bank clue; before every guess the reveal card
  and reveal name are hidden, the place name appears nowhere on the round
  screen outside the clue, and no bank photo is visible; at every reveal the
  photo (card and peek) is the entry's image and the name is its `short`.
- Played: na-pali-coast-state-park (2), haikou (3), trolltunga (5),
  humberstone-saltpeter-works (8), yeola (9). All five ids exist in
  assets/trivia-bank.json; no two match; each difficulty is in its band.
- Results: "2,898 / 5,000"; five lines whose points equal the round pills
  and whose distances equal the reveals; Score and Best 2,898; label "Best";
  `where-on-earth-best-trivia` holds "2898". A second, deliberately poor
  game kept the best at 2,898.
- Share: "Where on Earth? · Trivia / 2,898 / 5,000 / Best: 2,898 / three
  closest / link", no em dash, no "places visited".
- Passport: places header 0 / 805 with 0 open slots, Landmarks shelf "0 of
  332 landmark postcards · 0 visited", identical before and after, and the
  stored passport is byte-identical (never written). Three of the five
  targets exist in a dex (Haikou in the cities file; Trolltunga and
  Humberstone in the landmarks file), so a recorded visit would have shown.
- Storage: the only new where-on-earth key is where-on-earth-best-trivia.
- Hub after the game: "1,282 clues · Best 2,898".
- Play again starts a fresh game at Round 1 with a bank clue.
- Home mid-game asks first ("Your current game progress will be lost.").
- Landmarks after Trivia: the shared run-over screen reads "Landmark
  Survival run over", "Best streak", round-by-round list hidden.
- Code-level bank-only check (quoted above); no horizontal scroll at 390px.

### Screenshot review (viewed by me, Opus, at 390px)

- `shots/trivia/01-hub.png`: hub with Landmarks, the live Trivia clues row
  (desc, "1,282 clues", chevron) and the dimmed Photo mode Coming soon row.
  Matches the Landmarks row exactly.
- `shots/trivia/02-clue-round.png`: Round 1 of 5, the Na Pali clue as the
  header prompt over 4 lines, "Tap the globe to place your pin", globe, no
  name, no photo. A 160-character clue (the longest) would run to about six
  lines; still clear of the globe's centre, so no clue-specific CSS added.
- `shots/trivia/03-clue-reveal.png`: header and card read "Na Pali Coast
  State Park", +5, 15,481 km, 5/1000, the photo slot filled (placeholder
  image in the harness), Next.
- `shots/trivia/04-results.png`: Trivia, 2,898 / 5,000, Score and Best
  tiles, round-by-round list, Share result, Play again, close. The first
  capture showed the list heading at 36px (the card's h2 rule won); fixed
  in CSS and re-shot.
- `shots/trivia/05-hub-best.png`: the Trivia sub line with "Best 2,898".

## Commits

- `7b1f4a2` Trivia mode (1/2): Trivia clues hub row, 5-round clue game,
  results and harness (code, CSS, markup, harness, screenshots).
- Trivia mode (2/2): this report, report-only, committed last.

## Appendix: the 40-entry photo sample

Drawn with a seeded generator (Park-Miller, seed 7) over the 1,282 entries
with an image, sorted by id. Verdict is mine, from the image filename.
M = shows the place, X = shows somewhere else.

| # | Entry | Image file | |
|---|---|---|---|
| 1 | Aba, Nigeria | Mount_Cameroon_view_from_Buea | X |
| 2 | Shenyang | The_Arch_of_Triumph | X |
| 3 | Santo Domingo Oeste | Citadelle_Laferrière (Haiti) | X |
| 4 | Matterhorn Summit | Matterhorn_from_Domhütte | M |
| 5 | Dubrovnik Walls | Dubrovnik_s_24 | M |
| 6 | Beira | Crowne_Plaza,_Harare | X |
| 7 | Gwangju | FortSumter2009 | X |
| 8 | Pantheon (Rome) | Pantheon_of_Paris_007 | X |
| 9 | Bering Strait | Bering_Strait | M |
| 10 | Östersund | Vlkolinecslovakia001 | X |
| 11 | Trujillo | Chan_chan_view1 | M |
| 12 | Cixi | Hangzhou Qianjiang New Town | X |
| 13 | Mount Ararat | Mount_Ararat_and_the_Yerevan_skyline | M |
| 14 | Cliffs of Moher | Cliffs-Of-Moher-OBriens-From-South | M |
| 15 | Playa del Carmen | Marokko0112 | X |
| 16 | Ness of Brodgar | Ness_of_Brodgar_19 | M |
| 17 | Puławy | Desierto_de_la_Tatacoa | X |
| 18 | Château Frontenac | Château_Frontenac_02 | M |
| 19 | Lo Manthang | Lomangthang | M |
| 20 | Bazhong | City_wall_of_Xi'an | X |
| 21 | Wuhan | tianzishan_wulingyuan_zhangjiajie | X |
| 22 | Mount Etna | Mt_Etna_and_Catania1 | M |
| 23 | Hamamatsu | Victoria_Harbour_skyline,_Hong_Kong | X |
| 24 | Connollystraße 31 | Connollystraße_GO-2 | M |
| 25 | Malingao | Kolkata_maidan | X |
| 26 | Shuri Castle | Naha_Okinawa_Japan_Shuri-Castle-01 | M |
| 27 | Predjama Castle | Predjama_Castle,_Slovenia | M |
| 28 | Leshan Giant Buddha | 36275-Leshan | M |
| 29 | Pamukkale | Pamukkale,_Denizli_2026_68 | M |
| 30 | Easter Island | Easter_Island_5 | M |
| 31 | Xiangyang | 27427-Luoyang | X |
| 32 | Wittenberg | Schlosskirche_Wittenberg_I | M |
| 33 | São José do Rio Preto | Paraty_05 | X |
| 34 | Maracay | CIUDAD_PERDIDA_2 | X |
| 35 | Quanzhou | Taipei_Skyline_2022 | X |
| 36 | Bhātpāra | Union_Carbide_pesticide_factory,_Bhopal | X |
| 37 | Dunkirk | Dunkirk_26-29_May_1940 | M |
| 38 | Khulna | Kolkata_maidan | X |
| 39 | Huế | Old_Town_Hoi_An_003 | X |
| 40 | Persian Gulf | PersianGulf_vue_satellite | M |

19 M, 21 X.
