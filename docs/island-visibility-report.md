# Island visibility over satellite: report

Date: 2026-10-16. Built by Muse Wonder in session, at Sean's direction.
Status: Sean reviewed the close and wide captures, chose the softer rim
(0.30), and approved shipping on 2026-10-16, bundled with the deploy that
carries this commit.

## The complaint

Player feedback, relayed by Sean: some islands are hard to see, almost
blending into the ocean. Sean's example: Tuvalu (it renders, but the land and
water look similar). Also named: the island of New Guinea and small Pacific
islands.

## Diagnosis (verified in code and in data)

The classic blue style draws land from the game's own land data with fill
contrast, a coastal glow, and a shelf fringe. The satellite view crossfades
over that treatment wholesale (the `satMix` mix in the globe fragment shader
in `src/globe/surface.js`), so in satellite view an island's legibility
depended entirely on the photo pixels under it. A vector coastline outline
already exists above the surface; the missing piece was fill separation:
land whose photo is dark water-coloured reads as water.

Measured in the baked land mask (4096x2048, R channel): Funafuti peaks at
255 (solid land) but averages 2.8 over its neighbourhood, so at gameplay
zoom mip averaging dilutes small islands to a few percent per screen pixel.
One data gap found, out of scope here: Nanumea (Tuvalu's northernmost
atoll) is absent from the land data entirely (mask value 0). No shader can
show what the data does not contain; it belongs with a future data pass.

## The change (src/globe/surface.js only)

After the satellite crossfade, and scaled by the local satellite mix (so
the classic style and blacked-out countries are mathematically untouched),
the shader rebuilds land and water separation from the land texture's
existing channels (R land, G coastal glow, B shelf haze):

1. Shelf fringe: the shelf haze channel lightens the water just off coasts
   (classic tint, 0.60 strength).
2. Coastal glow: the baked glow channel reintroduced at 0.30 strength.
3. Coastline rim: the land-mask gradient from four neighbour taps (1.6
   texels), brightened on the land side (pale cyan, 0.30 strength; the
   first cut at 0.55 read too outlined on the Japan control shot, and Sean
   picked the softer value from the captures).
4. Minimum land tint: where the mask says land but the photo reads as dark
   water, the fill lifts toward a pale land tone (0.50 strength). Presence
   responds to a few percent of mask land (`smoothstep(0.008, 0.10)`),
   because that is all a mip-diluted atoll offers. The tint is suppressed
   in land interiors (neighbours all land at a 6-texel radius), so dark
   continents keep their photo.

A new uniform `uMapTexel` carries the land texture's texel size, set when
the texture loads. No new data, no new fetches, no geometry, scoring, or
camera changes; the extra cost is eight texture taps in one shader branch
that only runs in satellite view.

Tuning constants a reviewer can change, all in the one block: shelf 0.60,
glow 0.30, rim 0.30, rim offset 1.6 texels, tint 0.50, presence
smoothstep(0.008, 0.10), interior radius 6 texels.

## Proof

Screenshots: `~/workspace/map-game/shots/island-visibility/before|after/`,
390x844 phone viewport, real Daily round running, framed with the shipped
`window.__view` hook using the closed-form yaw and pitch for each target;
the centred coordinate was read back and matched the target exactly for
every view (an earlier projection-iteration version converged to the
far-side antipode and was discarded).

- `tuvalu-wide` (dist 2.80): before, Fiji is a faint smudge and the
  Solomons and Tuvalu are not findable. After, Fiji, the Solomons chain,
  New Caledonia, Vanuatu and New Zealand carry a clear pale edge, and
  small islands show as findable specks across the frame.
- `tuvalu` (dist 1.55): before, uniform dark ocean. After, Funafuti shows
  as a small glowing dot at centre with neighbouring atolls as dots.
  At this zoom an atoll is a few pixels; a findable dot is the honest win.
- `png` (dist 1.90): New Guinea's coast, New Britain, and the Bismarck Sea
  specks all read clearly after; before, the northern chains were mush.
- `japan` (control, dist 1.90): already legible before. After, every coast
  carries the same pale rim: consistent with the game's existing outline
  colour, and the most visible change of the set. If any constant is
  dialled back after review, it is the rim and glow strengths, and this is
  the shot that will show it.
- `tuvalu-classic`: classic style before and after are visually identical
  (measured: zero pixels differ by more than 8 of 255; mean absolute
  difference 0.034), as designed.
- Softer rim (0.30) set, in `after-soft/`: the four views above plus wide
  views of Indonesia and the Philippines, the Caribbean, Europe and the
  Mediterranean, and Canada. At wide zoom the rim stays restrained on
  continents while archipelagos stay legible; Canada's Arctic islands and
  Hudson Bay read clearly. Sean approved this set.

Regression: `scripts/regression.sh sh baseline` passes both suites.
Module syntax check on the edited file passes. The baseline suite
refreshed its baseline PNGs in the working tree, as it always does; those
were left unstaged with the tree's other pre-existing dirt.

Caveat: headless Chromium renders the satellite base at lower detail than
a phone, which loads sharper detail tiles around the focus. Before and
after were captured through the identical pipeline, so the comparison is
fair; the effects key off the land mask, not the imagery resolution.
