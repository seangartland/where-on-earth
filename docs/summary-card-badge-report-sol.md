# Postcard summary card badge removal

Updated `postcardSummaryCard` in `src/main.js` so the earned/upgraded receipt no longer overlays a Bullseye or Pinpoint badge on its photo.

The summary metadata now reads:

- `New • {distance}` for newly earned postcards.
- `Upgraded • {distance}` for upgraded postcards.

The existing `postcardDistance(result, outcome)` call remains in use, preserving Pinpoint decimal precision. No other postcard surfaces, tier logic, share text, headers, or card behavior were changed.

Verification:

- `node --check --input-type=module < src/main.js`
- Confirmed no `setProxBadge` call or `↑` tier-tag construction remains inside `postcardSummaryCard`.
- Confirmed the source diff is limited to `postcardSummaryCard`.
