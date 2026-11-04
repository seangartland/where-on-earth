# Dangling references audit (2026-11-03, read-only)

Method: cross-checked every id referenced by assets/expeditions.json and
assets/trivia-bank.json against the bank (441), the cities file (803), and
the quarantine file (236). No data was changed.

## Expeditions: 3 of 4 run short today

Expedition stops resolve with findLocation + isPlayableLocation, so a
quarantined stop drops out silently. No crash; the expedition just plays
with fewer stops than designed (7 each).

- Volcano Week: 3 of 7 stops remain. Quarantined out: krakatoa-1883-eruption,
  halemaumau-crater, mt-yasur, cotopaxi-refuge.
- Island Hopping: 4 of 7 remain. Out: easter-island, galapagos-islands,
  lord-howe-island.
- Ancient Wonders: 6 of 7 remain. Out: badaling-great-wall (the Great Wall
  entry, already parked for Sean's revisit).
- Capital Cities: clean, 7 of 7.

Fixing this is a content call, not a code fix: substitute replacement stops,
accept the shorter runs, or retire a gutted expedition (Volcano Week is the
candidate). Sean's call.

## Trivia bank: nothing dangles, one policy question

The trivia bank (1,303 items) is self-contained: every item carries its own
coordinates, fact, and image, and resolves nothing against the bank, so
quarantine breaks nothing mechanically. 110 trivia items share an id with
the quarantine list. Some are places quarantined from packs on fame or
near-dupe grounds that work fine as trivia (easter-island, galapagos-islands,
suez-canal, mutianyu). Two are the arguable event sites Sean quarantined on
2026-11-01: krakatoa-1883-eruption and hunga-tonga-2022-eruption. Trivia is
the "where did this happen" mode, so event sites may be exactly right there.
Open question for Sean: does the quarantine ruling extend to the trivia
bank, or is it a packs-only ruling? No action taken either way.
