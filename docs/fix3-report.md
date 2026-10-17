# Fix 3 verification report

## 1. Blackout fill

Changed [src/modes/blackout.js](../src/modes/blackout.js#L156) lines 167-168.
The mask stroke is now `min(ISLAND_BLOB_TEXELS, geom.diagKm / 1000) *
(canvasWidth / 4096)` texels. `geom.diagKm` is the existing geometry diagonal
in kilometers. At 4096 pixels, a Vermont-scale 250 km diagonal produces a
0.25-texel stroke, with about 1.2 km of outward edge at the equator, while
geometries at or above 1,500 km retain the prior 1.5-texel stroke.

The fill still paints every ring before the stroke, so country and island
fills remain continuous. The edge case is an extremely small geometry: its
stroke can become subpixel, intentionally preferring the true border over a
visible outward blob.

`rg` finds one caller, from the successful Blackout branch in
`revealBorders`; no other caller relies on the old fixed stroke.

## 2. Tolerance-hit reveal pin

Changed [src/modes/tap-country.js](../src/modes/tap-country.js#L120) lines
144, 148, and 167-169. A tolerance hit is exactly
`res.hit && res.near && res.km > 0`. For that case, the card uses
`formatKm(Math.round(res.km))` and the placed pin uses `res.near`. Inside hits
continue to have no distance and use the original tap. Misses retain their
existing distance and original-tap pin behavior.

The raw-tap vector remains `a` and is still used by the miss route, framing,
and reveal animation. The edge case is a hit with a zero distance or no nearest
point: it remains an inside hit and is unchanged.

`rg` finds only two entry points for `revealBorders` (the globe tap and the
pin event) and one pin placement inside it, so the changed placement applies
to both Blackout and classic Tap the Country without changing other reveal
modes.

## 3. Passport greeting state

Changed [src/meta/passport.js](../src/meta/passport.js#L1889) lines 1890-1893.
After parsing the persisted array, initialization imports it only when it does
not include every `host.CONTINENT_ORDER` entry. An all-collapsed saved set now
leaves `ppCollapsedContinents` empty, allowing the existing accordion fallback
to choose the first continent with earned postcards, or the first continent.

The storage key and saved array shape are unchanged. `ppAccordionOpen` and the
toggle path are untouched, so closing every continent remains possible during
the session. A malformed stored value continues to use the existing read-error
path.

`rg` finds this is the sole localStorage read for `PP_COLLAPSED_KEY`; the other
uses save or consume the same set.

## Correction: zero general tap grace

Both Tap the Country and Country Blackout now call `bordersHit` with a zero
general tolerance. A tap outside the target and outside every other unit is a
miss at every distance. The 50 km allowance remains only for sub-30 km targets
when the tap falls inside another unit, covering enclave geometry such as the
Vatican inside Italy. For that enclave rescue, the existing snap to `res.near`
and displayed distance are retained.

## Checks

Ran `node --check --input-type=module` on all three edited JavaScript files;
all passed. Ran `git diff --check`; it passed. A headless browser run is not
available in this sandbox, so the static path checks above provide the
requested verification evidence.
