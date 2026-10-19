# Brief: source lakes and national parks as extent locations, integrate, confirm modes

Work in this clone (lake-work), based on current main. Sean's
order (2026-10-18): source new extent-shaped locations (lakes and
national parks first), then add them all together into the
appropriate game modes, with your written confirmation of where
each one lands. Leave all work uncommitted; the orchestrator
verifies and banks. Extent-aware scoring is already banked on
main (the `scoringDistanceKm` helper and the area pool gate), so
`kind: "area"` entries with a valid `extentKm` become playable
through the existing gate.

## Phase 1: audit before sourcing

Check both banks (`assets/locations.json`,
`assets/locations-landmarks-sol.json`) for each candidate by id,
name, and coordinate proximity: the same feature under another
name (a falls entry for the same lake, a point landmark for the
same park) is a duplicate risk to report, not silently duplicate.
If a point landmark already covers a candidate park, say so in
the report and skip it unless the area entry is clearly the
better representation; flag those cases for Sean.

## Phase 2: source (cap about 28 new entries, fame first)

Candidates, verify absence and fame, substitute stronger misses
you find: **Lakes:** Baikal, Superior, Victoria, Titicaca, Loch
Ness, Bled, Crater Lake, Toba, Great Salt Lake, Moraine, Plitvice,
Como, Malawi, Balkhash. **Parks:** Yellowstone, Serengeti, Banff,
Kruger, Fiordland, Denali, Etosha, Masai Mara, Sagarmatha, Grand
Teton, Snowdonia, Torres del Paine (see the audit rule above).

Every new entry passes the standing landmark gates:

- `kind: "area"`, correct country and continent (check the stored
  country against reality; three known stored errors elsewhere in
  the bank came from skipping this).
- Pin anchored to the feature's Wikidata coordinates (the
  locations skill's coordinate anchor rule; 3 km gate). The pin
  and the fact must describe the same feature.
- A clue that fits this place and no other (the uniqueness
  standard) and a fact checked against Wikipedia.
- One real photograph of the feature itself, no collage. Source
  priority: public domain or CC0 first; Wikimedia Commons CC BY
  or BY-SA only as fallback, with license and author recorded in
  the report. Verify the photo actually shows the feature.
- Difficulty treatment consistent with the nine banked area
  entries (mirror their field shape exactly).
- **`extentKm` measured, not guessed:** pin at the feature's
  representative center; extentKm is the distance from the pin to
  the farthest edge of the commonly recognized feature (farthest
  shore for a lake, farthest boundary for a park), from documented
  dimensions (Wikipedia infobox or park authority figures). The
  report states the dimensions used for every entry.

Entries that fail any gate are held out and listed in the report
with the reason, not forced in.

## Phase 3: integrate and confirm

Append the passing entries to
`assets/locations-landmarks-sol.json` in this clone. Then:

- Run `scripts/validate-landmarks.mjs`: the only acceptable
  failure is the pre-existing isla-foca baseline.
- Assert the Landmark Survival pool delta is exactly the new IDs
  (script it against `isPoolLandmark` semantics; no other entry
  changes pool status).
- Write `docs/lakes-parks-integration.md`: the sourcing report
  (per entry: dimensions behind the extent, photo source and
  license, Wikidata anchor distance, any duplicate judgment) AND
  your per-mode confirmation, read from the code, of where the
  new entries land: Landmark Survival pool, the Daily postcard
  pack pool (via landmarkPool; state the new pool total),
  Passport shelves and totals, Weekly Expeditions eligibility,
  and confirmation that Daily, PvP, and Trivia never see them.
  Flag anything ambiguous for Sean instead of deciding silently.
