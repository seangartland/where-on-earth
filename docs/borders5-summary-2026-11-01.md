# Borders five polygon conversions

Sean's ruling (2026-11-01): always use a polygon if one is available. Of
the five held judgment calls, four converted from radius to polygon. Gobi
stays a radius point (340 km) and was not changed: published extents
disagree by hundreds of km and the outline adds nothing at that scale.

| Entry | Polygon source | Shipped vertices | Max deviation | Existing anchor check |
| --- | --- | ---: | ---: | --- |
| Cappadocia | Göreme National Park boundary, OpenStreetMap relation 252585 | 7 | 1.347 km | Contained. The anchor at 38.6706, 34.8392 sits inside the shipped polygon. |
| Xochimilco | Xochimilco borough boundary, OpenStreetMap relation 5606640 | 9 | 1.523 km | Contained. The anchor at 19.25465, -99.10356 sits inside the shipped polygon. The borough was chosen because the clue and fact describe Xochimilco as a place, its canals and chinampa tradition broadly, rather than only the World Heritage property. |
| Kalahari | RESOLVE Ecoregions 2017, Kalahari xeric savanna, ECO_ID 97 (7 polygons) | 910 | 1.659 km | Contained. The anchor at -23, 22 sits inside the shipped ecoregion polygon. |
| Rub' al Khali | RESOLVE Ecoregions 2017, Arabian sand desert, ECO_ID 810 (138 polygons) | 4,902 | 2.293 km | Contained. The anchor at 20, 50 sits inside the shipped ecoregion polygon. |

## Baseline and gates

- Before converting, the baseline gate caught one upstream change: the
  Lake Como shoreline (OpenStreetMap relation 541757) was edited after
  the 2026-10-30 fetch. Sean approved accepting the refresh; it landed
  as its own commit (sourceVertices 10067 to 10090, maxDeviationKm
  1.287 to 1.288, 3 of 24 shipped vertices moved slightly). After it,
  the no-change build regenerates all 74 pre-existing records
  byte-identical, and it still does after the conversions.
- Only the four new records were added: extents go 74 to 78 records,
  and the bank flips match (kind extent, extentType polygon, extentKm
  removed for the four; the validator's bank-to-extents invariant holds
  at 78 = 78).
- Full suite: 86 of 86 tests pass. The landmark validator's problem
  list went from 13 to 11: the Kalahari and Rub' al Khali "unexpected
  admitted area" lines cleared with their conversions, Xochimilco and
  Cappadocia were removed from its approved-areas map as part of
  theirs, and the remaining 11 (10 difficultyWhy spike notes and the
  Gobi area line) are pre-existing.

## Two pipeline notes

- The Rub' al Khali at the standard 0.015 degree tolerance measures
  2.663 km deviation, over the 2.5 km gate, because a few of its 138
  ecoregion fragments have narrow necks; a uniformly finer tolerance
  breaks the 100 KB per-record cap (114 KB at 0.01). The desert path in
  build/make-extents.mjs now refines per ring: a ring still over the
  gate is re-simplified at halved tolerances until it passes (floor
  0.002). The gate itself is unchanged, rings that pass at the standard
  tolerance are untouched, and Mojave, Namib, Atacama and the Kalahari
  ship exactly what plain processing produces (verified byte-identical).
  The Rub' al Khali record lands at 98,415 bytes, under the cap.
- The sidecar grows from 943,067 to 1,339,730 bytes (168,771 bytes
  gzipped, which is what players download). The build's size cap moved
  from 1 MB to 1.5 MB following its own precedent: the cap is a blowup
  guard, not a budget, and the two desert records alone account for
  most of the growth.
