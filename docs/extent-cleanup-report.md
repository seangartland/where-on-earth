# Extent geometry cleanup report

## How this completed

The dispatched lane (codex-run, gpt-5.6-terra) stopped per the brief's stop rule: its sandbox had no network access to PyPI, so Shapely could not be installed, and it left assets/extents.json unchanged. The orchestrator then ran the pass directly on the VM, where Shapely 2.2.0 was already installed for the fleet audit, using the same brief and guards. Method note: the first orchestrator run was discarded before banking. Its drop rule (fewer than 4 distinct ring points) would have removed real triangle outlines, including Loch Ness's stored triangle, and its area metric mixed per-polygon centroid latitudes, which tripped a false guard failure on the Baltic Sea. The banked run uses the corrected rules below.

## Rules applied

- Per polygon extent: repair each stored polygon with make_valid, drop only true junk (empty after repair, exactly zero area, or fewer than 3 distinct ring points), then union all remaining parts. Disjoint parts stay separate.
- Guards per extent: union area at least 90% of the largest part and at most 100.1% of the summed parts, with all areas measured at one fixed reference latitude per extent. A guard failure leaves the extent completely unchanged and flags it.
- Lines extents untouched. Extents with no junk, no merges, and no invalid-ring splits were not rewritten; 118 of 153 extents are parsed-identical to before.

## Results: 35 extents changed

The three tiling cases Sean's report generalizes from:

| Extent | Before | After | Area km2 |
| --- | --- | --- | --- |
| sahara | 6 polygons (3 real tiling parts, 3 zero-area slivers) | 1 | 5,148,839 to 5,148,341 |
| mediterranean-sea | 9 tiling parts | 1 | 2,350,378 to 2,350,154 |
| baltic-sea | 4 tiling parts | 1 | 368,924 to 368,924 |
| strait-of-hormuz | 205 stored (16 valid, 189 junk specks) | 6 | 19,432 to 19,294 (overlaps removed) |

The area deltas on sahara and mediterranean-sea are the thin seam lenses between tiling parts, now counted once.

Other changed extents fall into two classes:

- Junk specks removed, real geometry untouched in area: falkland-islands (671 specks dropped, 41 polygons out, 11,490 km2 unchanged), shetland (388 dropped), azores (187), canary-islands (137), hawaiian-islands (113), bora-bora (98), daintree-rainforest (66), corfu (48), rub-al-khali (32), java (27), kalahari (3), great-britain (3), santorini-caldera (2), saint-helena (2), svalbard (5), bonaire (5), new-guinea (4), socotra (1), sardinia (1), crete (1), okinawa-island (1), ascension-island (1). These specks are rings collapsed to one or two distinct coordinates at storage precision; they carry no measurable area and no usable outline.
- Invalid stored rings repaired by make_valid into their true pieces, area identical: lake-superior (1 to 4), lake-huron (1 to 3), lake-titicaca (1 to 4), okavango-delta (1 to 14), danube-delta (1 to 4), bering-strait (1 to 2), chocolate-hills (1 to 3), borneo (1 to 3), bass-strait (1 to 2). The stored single rings were self-intersecting; point-in-polygon scoring against them was unreliable, and the split preserves the same ground coverage.

## Flagged, unchanged

- drake-passage: all 7 stored polygons are zero-area lines. There is no passage area to union. The entry is left exactly as stored; it needs a sourced polygon from the location pipeline before it can behave as an area extent.

## Verification

- Suite in the build clone: 154/154 pass.
- Diff touches only assets/extents.json.
- Parsed comparison against production: exactly 35 extents changed, 118 identical, drake-passage byte-identical.
- Visual spot-render of the Sahara reveal was not run in this pass; the geometry checks above stand in its place, and the extent test mode (?extents=1) will show the single-outline Sahara on the next deploy.
