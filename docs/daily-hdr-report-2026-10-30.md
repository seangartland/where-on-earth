# Daily header compaction: report (2026-10-30)

## Phase 1 (Daily header)

Executed on top of the completed phase-2 changes, which are preserved
exactly (phase 2's hub subtitles and its Trivia entry in the `showRound`
guess-hint condition are untouched by this phase).

Sean's ask: in the Daily, put the date on the same line as "Round x of y",
to its right, to save vertical space; lose the standalone tap-to-place
line; fold the place instruction into the bottom gesture-hint line,
concise enough to fit on one line.

### Inventory (before)

Round screen header (`.round-header`, index.html), top to bottom:

| Element | Exact content / behaviour (before) |
|---|---|
| `.round-meta` (flex row) | `#round-number` `Round 1 of 5`, then `#round-weight` `1×` (hidden in Daily); a JS-inserted `.mute-toggle` button sits at the row's right end via `margin-left: auto` |
| `#daily-date` | Its own row under the meta line: `Friday, October 30` (`formatDailyDate`, src/core/format.js), 11px, weight 650, color rgba(193,224,250,.5); set and unhidden only by the Daily branch of `showRound` (src/game/round.js) |
| `#clue` | `Luoyang, China 🇨🇳` |
| `#guess-hint` | `Tap the globe to place your pin`, set by `showRound` for every mode not in its blank list (Daily included) |
| `#hud` (bottom gesture line, index.html) | `Drag to spin · Pinch to zoom`, static text; no JS ever rewrote it (only class toggles) |

Measured before (390x844): header height **102.8px**; the date's centre
sat **21.5px below** the meta row's centre (its own line); `#guess-hint`
showed the tap line; `#hud` one line.

### Exactly what changed

- `index.html`: `#daily-date` moved from its own row into `.round-meta`,
  after `#round-weight`. Same element, id, class and `hidden` attribute;
  the separate date row no longer exists.
- `src/styles/game.css`:
  - `.daily-date`: `margin: 1px 0 0` → `margin: 0 0 0 auto`, so the date
    is pushed to the right end of the meta row; `text-transform: none`
    added so the date keeps the exact typography it had on its own row
    (the meta row itself is uppercase; the date's font, size, weight and
    color are unchanged: 11px, 650, rgba(193,224,250,.5)).
  - New scoped rule `body.daily .round-meta .mute-toggle { margin-left: 0; }`:
    the mute toggle also claims an auto left margin; with two auto margins
    the free space would split and the date would land mid-row. In Daily
    rounds only, the toggle gives its up and the date takes the row's
    right side, ending just left of the toggle.
  - Shared-rule fix: `.round-meta span:last-child { color: #ffc76a; }` →
    `.round-meta #round-weight { color: #ffc76a; }`. The `:last-child`
    form only ever colored the weight span, but with the date element now
    the row's last child it would have matched nothing and un-golded the
    weight in every mode. The new selector names the element the rule was
    always about; measured weight color is identical before and after
    (rgb(255, 199, 106)) in both Daily and Survival.
- `src/game/round.js` (`showRound`): the Daily branch adds a `daily` body
  class (the mode-class pattern Survival/Endless already use;
  `hideScreens` clears body classes on every `showRound`, so it cannot
  leak into another mode). After the branch chain, a `dailyRound` flag
  (no mode active, i.e. the fall-through Daily branch) drives two things:
  the shared guess-hint condition gains `|| dailyRound`, so Daily rounds
  render `#guess-hint` empty like Survival/Tap the Country/Trivia; and
  `#hud` is set to `Tap to place · Drag to spin · Pinch to zoom` for the
  Daily and restored to `Drag to spin · Pinch to zoom` for every other
  mode's rounds, so no other screen keeps the Daily wording.

Deliberately unchanged, as in phase 2: after a pin is placed,
`src/globe/pin.js` still writes `Tap elsewhere to move it, or lock it in`
into `#guess-hint`, in Daily as in every mode; that is a post-placement
nudge, not the standing directions. Expeditions, Packs, PvP and the
quarantined Endless keep the standalone tap line and the stock `#hud`
text (verified for Survival by capture; the others share the same
`showRound` path and non-Daily flag state).

### Verification (harness: shots/daily-hdr/capture-p1.mjs)

Fake-origin Chromium pattern (meta-chromium, hatch WebGL domain flags,
CDP screenshots, 390x844), Daily started via `#play-button`, plus a
Survival round in both runs as the shared-rule regression check. Captures
and measurement JSON in `shots/daily-hdr/`:

- `p1-before-daily-round.png` / `p1-after-daily-round.png`: Daily round
  1. Before: date on its own row, tap line under the clue. After: `ROUND 1
  OF 5` left, `Friday, October 30` on the same line at the right, clue
  directly under the meta row, no tap line.
- `p1-before.json` / `p1-after.json`: measured values.
  - Header height **102.8px before, 69.8px after** (33px reclaimed: the
    date row plus the removed hint line).
  - Date: parent `.round-header` → `.round-meta`; centre offset from the
    meta row's centre **21.5px → 0** (same line); right side of the row
    (left edge 175.33px of a 302px content box, ending at 279px, just
    left of the mute toggle). Text, color, size, weight and case
    identical to before.
  - `#guess-hint`: `Tap the globe to place your pin` → `''`.
  - `#hud` one-line proof: text `Tap to place · Drag to spin · Pinch to
    zoom`, **scrollWidth 390 = clientWidth 390** (no overflow, no
    truncation), rendered height 17px against a 14.4px line-height =
    **1 line**.
  - Survival after: every measured value identical to its before run
    (header 69.8px, `#round-weight` gold rgb(255, 199, 106), date hidden,
    hint `''`, `#hud` stock text, one line), and its body class carries
    no `daily`.
- Full suite: `node --test test/*.test.mjs` — **83/83 pass** (with both
  phases in the tree).
- Syntax: `node --check` and `node --check --input-type=module` clean on
  src/game/round.js.

Not committed, pushed or deployed.

## Phase 2: practice-mode directions move to the hub subtitles

Sean's follow-up: in the Practice modes, the directions text inside the
location clue container (the round header) comes out; the Practice hub's
game description subtitles carry the information instead.

### Inventory: directions inside the clue container, per practice mode

The clue container is `.round-header` (index.html). Its text elements are
`.round-meta` (#round-number / #round-weight), `#daily-date`,
`#survival-streak`, `#clue`, `#guess-hint`, `#reveal-name`. Directions
appeared in two of them:

| Mode | Element | Exact directions text (before) | When shown |
|---|---|---|---|
| Survival | `#survival-streak` | `One miss over 150 km ends the run · Tap the globe to place your pin` | Round 1 only (set by `survivalRoundHeader`, src/modes/survival.js) |
| Tap the Country | `#survival-streak` | `One miss ends the run · Tap the globe to place your pin` | Round 1 only (set by `bordersRoundHeader`, src/modes/tap-country.js) |
| Country Blackout | `#survival-streak` | Same string as Tap the Country | Round 1 only (Blackout runs through `bordersRoundHeader` with `borders.scope` set) |
| Trivia clues | `#guess-hint` | `Tap the globe to place your pin` | Every round (set by the shared `showRound` in src/game/round.js; Trivia was not in its blank list) |

Survival and Tap the Country already had `#guess-hint` blanked in
`showRound`; their directions lived only in the streak line. The streak
element itself stays: it carries the reveal text (`N survived`,
`Run ended · N survived`) written by `survivalRevealCard` /
`revealBorders`. Only its round-1 directions content was removed.

### Subtitles before, and the premise check

Practice hub entries (index.html, `#survival-hub`):

| Mode | Subtitle before | Covers the directions? |
|---|---|---|
| Survival | `Cities and places. One miss over 150 km ends the run.` | PARTLY: the miss rule yes, how to place a pin NO |
| Tap the Country | `Tap each named country.` | PARTLY: the tap action yes (and every clue repeats `Tap <Country> <flag>`), the miss rule NO |
| Country Blackout | `Find every country in a region.` | PARTLY: the goal yes, the miss rule NO |
| Trivia clues | `Five clues, find each place.` | NO: pin placement not mentioned |

### Decisions (subtitle gaps filled, flagged per the brief)

No subtitle fully covered its mode's directions, so each subtitle gained
the missing concise piece and the in-container directions were removed.
New players keep every instruction; it now sits on the hub entry they tap
to start the mode.

- **Survival** subtitle is now `Cities and places. One miss over 150 km ends the run. Tap the globe to place your pin.` (place line ADDED; it was the uncovered half)
- **Tap the Country** subtitle is now `Tap each named country. One miss ends the run.` (miss rule ADDED. The in-container string's "place your pin" half was dropped rather than copied: this mode has no pin, the player taps the country itself, and that action was already covered by the subtitle and by every clue)
- **Country Blackout** subtitle is now `Find every country in a region. One miss ends the run.` (miss rule ADDED; a miss does end a Blackout run: `borders.missed` drives its game over, and `blackoutComplete` requires `!borders.missed`)
- **Trivia clues** subtitle is now `Five clues, find each place. Tap the globe to place your pin.` (place line ADDED)

### Exactly what changed

- `index.html`: the four hub `<small>` subtitles above. Nothing else.
- `src/modes/survival.js` (`survivalRoundHeader`): round-1 directions assignment replaced with `gameEls.survivalStreak.textContent = '';` plus a comment pointing at the hub subtitle.
- `src/modes/tap-country.js` (`bordersRoundHeader`): same replacement (covers Tap the Country and Country Blackout).
- `src/game/round.js` (`showRound`): the shared guess-hint condition is now `borders.active || survival.active || trivia.active ? '' : 'Tap the globe to place your pin'`, so Trivia rounds no longer render the standalone tap line. Daily's branch of `showRound` is untouched, as are Expeditions, Packs and PvP.

One behaviour deliberately left as-is, in every mode including these:
after a player places a pin, `src/globe/pin.js` sets the guess hint to
`Tap elsewhere to move it, or lock it in`. That is a post-placement nudge
shown to a player who has already placed a pin, not the standing
directions; Survival and Tap the Country already behaved this way.

### Same pattern found outside Practice (reported, NOT changed)

- **Expeditions** and **Postcard Packs**: rounds show the same standalone
  `#guess-hint` line, `Tap the globe to place your pin` (neither mode's
  round header blanks it). Scored/progression modes, left alone.
- **PvP**: `showRound` also seeds the same hint text before PvP's own
  messages overwrite it. Competitive, left alone.
- **Endless**: would show the same hint line, but the mode is quarantined
  (no `#endless-button` exists in index.html, so it cannot be started).

### Verification (harness: shots/daily-hdr/capture-p2.mjs)

Fake-origin Chromium pattern (meta-chromium, hatch WebGL domain flags,
CDP screenshots, 390x844). Captures and measurement JSON in
`shots/daily-hdr/`:

- `p2-before-hub.png`, `p2-after-hub.png`: Practice hub; after shows all
  four extended subtitles rendering inside their entries.
- `p2-before-survival-round.png`, `p2-after-survival-round.png`:
  Survival round 1. Before: the two-line directions block sits between
  `Streak 0` and the clue. After: gone.
- `p2-before-borders-round.png`, `p2-after-borders-round.png`: Tap the
  Country round 1, same result.
- `p2-before.json`, `p2-after.json`: measured values. Round header height
  in both Survival and Tap the Country: **111.8px before, 69.8px after**
  (42px reclaimed); `#survival-streak` text `''` and height 0 after;
  `#guess-hint` `''`; `#hud` unchanged (`Drag to spin · Pinch to zoom`,
  scrollWidth 390 = clientWidth 390, one line) in both modes, before and
  after.
- Full suite: `node --test test/*.test.mjs` — **83/83 pass**.
- Syntax: `node --check --input-type=module` clean on all three edited
  JS files.

Not committed, pushed or deployed.
