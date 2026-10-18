# Gate G1 independent visual review

This review is based on direct inspection of every labeled ours/EOX pair in the refreshed Gate G1 set and both base-globe files.

## Per-site verdicts

### Fiji

- **z4 — EOX better.** Ours is brighter and makes the bathymetry more legible, but the ocean is much too electric blue and visibly patchy. Large soft-edged tonal regions read as compositing windows rather than continuous seafloor. EOX is darker, but its ocean is substantially more coherent. Land in ours is darker than EOX on New Guinea and the small islands do not compensate for the ocean mismatch.
- **z6 — EOX better.** Ours has broad blue/cyan patches around Fiji, dark pinholes where small islands should be, and hard, pixel-sized black edging around several islands. EOX keeps a continuous ocean tone and cleaner island silhouettes.
- **z8 — EOX better.** The failure is severe: ours has large rectangular/soft rectangular ocean patches, blue-green halos, black stair-stepped coast edges, and missing or malformed reef/island detail. EOX preserves reefs and shallow-water structure and has much more plausible feathering.
- **z9 — EOX better.** Ours has sharper land texture, but it is defeated by a blocky mask, black coastal outlines, isolated black squares, and a conspicuous pale green/cyan fringe around the southern islet and other shores. EOX is softer but geographically and tonally coherent.

### Sydney

- **z4 — EOX better.** Ours has punchier land and clearer relief, but Australia is over-saturated orange and the ocean changes abruptly among bright shelf blue and near-black basins. EOX is calmer and globally consistent, with cleaner shorelines.
- **z6 — EOX better.** Ours retains good land detail, but the sea has a hard rectangular change south-east of the coast and an implausibly bright cyan shelf. The coast also carries a dark/pale edge. EOX has a continuous ocean and more natural land tone.
- **z8 — EOX better.** Ours shows more local land texture, but the ocean is blurred into large blue/black regions and the shore is visibly stair-stepped, with a bright pale strip near the north-east beach. EOX is less sharp but clean and believable.
- **z9 — EOX better.** Ours has obvious block pixels along the full coastline, small square bites into land and water, and a nearly featureless blue-to-black ocean gradient. EOX is soft at this zoom, but its coastline and ocean remain continuous.

### Bay Area

- **z4 — EOX better.** Ours contains an unmistakable horizontal ocean seam across the eastern Pacific plus multiple large dark rectangular windows. Land is brighter but harsh and over-contrasted. EOX has the same underlying long ocean line faintly, but without the large tonal discontinuities.
- **z6 — EOX better.** A hard horizontal seam runs from the left edge into the California coast in ours, dividing bright and dark ocean. The land lift clips pale terrain and pushes orange saturation. EOX is balanced and seamless by comparison.
- **z8 — EOX better.** Ours has a coarse blue ocean with broad blobs, a jagged mask edge, and dark protrusions at Point Reyes and offshore features. Land detail is strong but too orange and contrasty. EOX preserves the bay/coast geometry and natural shallow-water transition.
- **z9 — EOX better.** Ours is sharper on land, but the shoreline is a staircase of large black pixels; offshore points become square artifacts, and bay water is muddy green against an unrelated bright-blue ocean. EOX is lower-resolution-looking but far cleaner and more faithful.

### Iceland

- **z4 — EOX better.** Ours increases relief and brightness, but the North Atlantic is a collage of bright-blue regions, dark swaths, and a strong horizontal seam south-west of Europe. EOX is darker yet cohesive.
- **z6 — EOX better.** Ours has more vivid Iceland detail, but the surrounding ocean is unnaturally bright and mottled, and the shore has dark specks and a blue/cyan fringe. EOX has cleaner fjords and a uniform sea.
- **z8 — EOX better.** Ours is sharper on land, but snow is clipped, fjord water is pale gray-blue, and coast edges are thick, black, and stair-stepped. EOX is softer but preserves more plausible coast/water separation without the mask artifacts.

### Antarctic Peninsula

- **z4 — EOX better.** Ours exposes more seafloor relief, but it also exposes large dark and bright ocean windows, a hard boundary east of South America, and excessive cyan. Antarctica is clipped white with an abrupt composite boundary. EOX is much more coherent despite flatter ice detail.
- **z6 — EOX better.** Ours has cloudy rectangular patches across both water and ice, bright-blue ocean, and rough dark edging around islands and the peninsula. EOX is cleaner and geographically legible, though its ice is also heavily clipped.
- **z8 — EOX better.** Ours breaks down into large blurred squares and cross-shaped window transitions in water and ice; coast edges are blocky and cyan/gray fringes are obvious. EOX has its own blown highlights and dark speckling on ice, but it is materially less broken.

### Base globe

- **EOX better.** Ours is brighter and initially more dramatic, but it is not production-quality: huge rectangular ocean windows and seams are visible in the Pacific, Atlantic, and Southern Ocean; shelf water is aggressively cyan; land is over-saturated and highlights are clipped; and Antarctica has an especially bad white band with a black strip along the bottom. EOX is darker and less showy, but it reads as one continuous global image and handles the pole much better.

## Overall G1 call

**One more tuning round. Do not ship ours as the served imagery.** EOX wins every reviewed pair. The land source sometimes carries more apparent detail, especially at z8 and z9, but the ocean composite and land mask create defects large enough to dominate normal viewing. This refresh does not clear Gate G1.

Tune in this order:

1. **Eliminate composite window seams and low-frequency ocean patchwork before any color work.** The clearest proofs are Bay Area z4/z6, the base globe, Iceland z4, and Antarctic Peninsula z4/z8. Build the ocean as one spatially continuous source per zoom (or normalize and feather overlaps over much wider regions); do not expose independently toned windows.
2. **Replace or substantially improve the land mask at high zoom.** The current mask produces stair-step black outlines, square bites/protrusions, lost small islands, and pale/cyan fringes. Fiji z8/z9, Sydney z8/z9, Bay Area z8/z9, and Iceland z8 are the decisive examples. Use a higher-resolution shoreline, preserve holes and small islands, and feather in geographic rather than coarse raster-pixel space.
3. **Bring ocean tone back toward EOX.** After continuity is fixed, reduce cyan and brightness on shelves and remove the blue-to-black extremes. Sydney z6–z9, Fiji at all zooms, and Iceland z6 show the mismatch most clearly.
4. **Back off the land lift.** Reduce saturation and highlight clipping, especially orange/red terrain and snow/ice. Bay Area z4–z9, Sydney z4/z6, Iceland z8, Antarctica, and the base globe show that gain 3.2 is too aggressive.
5. **Repair the polar/base-globe assembly separately.** Remove the Antarctic bottom black strip and white band, and verify continuous Southern Ocean coverage. The base globe is sufficient proof; Antarctic Peninsula z6/z8 shows the same family of boundary and clipping defects locally.

## Phase 2 full-render risks to watch

- Window or tile normalization differences becoming continent-scale rectangles or horizontal/vertical seams.
- Mask resolution collapsing at z8–z9: stair-stepped shores, black outlines, square water/land intrusions, filled holes, and loss of small islands or reefs.
- Pale cyan/green coastal fringes, especially around tropical islands, beaches, fjords, snow, and ice.
- Shelf/deep-ocean color discontinuities and an ocean that is much brighter or more saturated than adjacent zoom levels.
- Land lift clipping deserts, salt flats, snow, glaciers, and urban highlights while pushing dry terrain unnaturally orange.
- Polar edge handling, including missing coverage, black terminal bands, blown ice, and ocean/ice window seams.
- Zoom-transition instability: the current ocean texture, coast geometry, and color change enough between z6, z8, and z9 to cause visible popping even where a single frame looks tolerable.
