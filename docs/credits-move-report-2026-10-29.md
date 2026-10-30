# Credits move report (2026-10-29)

Brief: `.build-tmp/credits-brief.md`, worktree at 5303077. Sean's decision:
imagery attribution lives on credits.html only, not as a footer line over
the globe.

## Where the link went

The home screen has no footer link row, so I used the brief's fallback with
the least new structure: a small text link at the foot of the start-screen
stack, under the streak line.

- `index.html`: `<p class="home-credits"><a href="./credits.html">Credits</a></p>`
  as the last child of `#start-screen`, under the mode buttons.
- `src/styles/game.css`: `.home-credits` rule beside `.streak`, using the
  same text-link treatment as the existing `.settings-credits` (13px,
  link color rgba(220,239,255,.75)).

Because the link lives inside `#start-screen`, it is visible on the first
screen (zero taps to see, one tap to follow) and can never appear during
gameplay rounds (the section is hidden then). It renders in both home
variants, since they share the section: in the default home it sits at the
bottom of the stack; in the recs variant it sits under the mode buttons,
above the appended passport strip. The Settings screen already carried an
"Imagery credits" link (`.settings-credits`, `src/main.js`), so the
settings path to the same page already existed and was left untouched.

## What was removed

- `src/globe/surface.js`: the `.sat-credit` element creation/insertion in
  `initSatellite()` (the `document.createElement('p')` block), the
  `export let satCreditEl` declaration, and the `.show` class toggle in
  `updateSatellite()`.
- `src/styles/game.css`: the `.sat-credit` and `.sat-credit.show` rules,
  and the section comment updated (it claimed attribution is "required
  while imagery shows"; it now says attribution lives on credits.html).

Kept, per the brief: both providers' `credit` strings stay in the
`SAT_PROVIDERS` data as the record of what each source requires, and
`window.__sat.provider` still returns `satProvider.credit` (verified live
in the capture run). Deliberately left: the `.sat-on .map-credit` rule,
which lifts the classic map's own credit while satellite is on. It is not
`.sat-credit` CSS and still functions; removing it would shift the classic
credit's position, which is outside this change.

Grep evidence: `grep -rn "sat-credit\|satCreditEl" src/ index.html`
returns no matches.

## credits.html verification (line by line)

Read in full; every required piece was already present, so nothing was
added and the page was not touched:

- "EOxCloudless" name: present.
- https://cloudless.eox.at as a working link: present.
- "EOX IT Services GmbH": present.
- "Contains modified Copernicus Sentinel data 2025": present verbatim.
- License name "CC BY-NC-SA 4.0": present, linked to
  creativecommons.org/licenses/by-nc-sa/4.0/.
- Great Barrier Reef Marine Park Authority: present ("boundary data
  courtesy of the Great Barrier Reef Marine Park Authority, used under
  CC BY 4.0").
- Natural Earth: present ("Grand Canyon river-course geometry from
  public-domain Natural Earth data").
- OpenStreetMap: present ("Great Wall geometry © OpenStreetMap
  contributors, available under the ODbL", both linked).
- Own-mosaic Copernicus line: also present (Sentinel-2 quarterly mosaics
  via the Copernicus Data Space Ecosystem).

## Verification run

- `node --check src/globe/surface.js`: pass.
- `node --input-type=module --check < src/globe/surface.js`: pass.
- `node --test test/*.test.mjs`: 79 pass, 0 fail.
- Capture harness `shots/credits-move/capture.mjs` (fake origin
  https://game.local, WebGL domains args, CDP screenshots at 390x844),
  run here; results in `shots/credits-move/capture.json`:
  - Home: link text "Credits", href "./credits.html", visible in the
    viewport with the boot overlay gone; `.sat-credit` count 0.
  - Round (Daily, mode "guess", satellite mix 1.0): `.sat-credit`
    count 0, no EOX line in the page text, no page errors.

## Captures (viewed)

- `shots/credits-move/01-home.png`: LOCAL BUILD. Start screen over the
  satellite globe (title, how-to, Daily / Postcard Packs / Expeditions /
  Practice, settings gear) with the underlined "Credits" link centered
  under the buttons. Nothing else at the bottom edge.
- `shots/credits-move/02-round.png`: LOCAL BUILD. Round 1 of 5 in
  progress over full satellite imagery; the bottom of the screen is
  clean dark space where the footer credit line used to sit.

Blind spot, named: desktop Chromium at 390x844 cannot prove iOS Safari's
rendering of the start-screen stack, but the change is one static link in
normal flow plus deleted code, so the risk surface is the layout itself,
which the capture shows.
