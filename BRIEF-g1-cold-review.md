# Brief: cold review of the G1 blind A/B (ours vs EOX base imagery)

You are the cold reviewer. You have not seen any prior verdict on
this round, and none is provided: judge only what is in front of
you. Work in this clone (eox1-work). Leave your review
uncommitted.

## Materials

- Blind A/B page: `scripts/sat/work/ab-local/ab.html` and the
  standalone build `ab-standalone.html`. Panels are labelled A/B
  per site and zoom; the key in `scripts/sat/work/ab-local/ab-key.json`
  says which side is ours. Read the panels blind FIRST, form your
  judgment, then unblind.
- Our finished tiles: `scripts/sat/work/s2gm2025/finished/acceptance/`
  with `qa.json` (per-window tone and nodata stats from the finish
  config: land gain 2.9, gamma 0.9, saturation 1.05, highlight knee
  0.72; ocean luminance curve `0.07 + 0.68 * L^0.92`, chroma x0.72).
- Sites: Bay Area, Iceland, Sydney, Fiji, Antarctic Peninsula at
  z4, z6, z8, z9 (20 windows; the world base window is not in this
  round).

## What to judge, per site and zoom, then overall

1. Land brightness and color against the EOX side: where is ours
   darker, lighter, or well matched? Name the specific panels.
2. Ocean tone and any visible seams, lines, or panel edges.
3. Coast edges and land/ocean separation, including Antarctic
   ice versus ocean.
4. Cloud, snow, or seasonal artifacts that read as defects.
5. Anything in qa.json that corroborates or contradicts the
   visual read (measured, not vibes, where the data allows).

## Deliverable: `docs/eox-g1-cold-review-sol.md`

- A per-site scorecard (pass / weak / fail per zoom with the
  evidence panel by panel).
- An overall ship-or-tune verdict for the base layer.
- If tuning is needed: a numbered tune list, each item tied to
  the panels that motivate it and the finish-config lever that
  would move it (gain, gamma, knee, saturation, ocean curve),
  with the direction and a suggested magnitude. Distinguish
  global problems from per-biome or per-window ones.

Do not soften a fail into a pass. Round 0 of this comparison
failed all 19 pairs; this review exists to be the check that
round did not get.
