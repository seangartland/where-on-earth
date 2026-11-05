# Focal points + 3 image swaps — report

## Files changed

Data:
- `assets/locations-landmarks-sol.json` — added `focalY` to 30 entries, replaced `image` on 3 entries.
- `assets/locations.json` — added `focalY` to 1 entry (`delhi`).

Renderers:
- `src/core/focal.js` (new) — shared helper `focalObjectPosition(item)`: returns `"center <focalY>%"` when `item.focalY` is a finite number, else `null`. Kept dependency-free (no DOM access) so it can be imported by test-covered modules without side effects.
- `src/core/dom.js` — `setThumb(img, url, item)` now takes an optional `item` and sets/clears `img.style.objectPosition` from the helper. Used for `#place-thumb` (the reveal screen's photo), which is a persistent singleton element reused every round, so the inline style is explicitly cleared (`|| ''`) when the current item has no `focalY`, to avoid a previous round's override leaking onto the next.
- `src/meta/postcard-card.js` — `buildPostcardCard`'s img (`.pp-photo` / `.pp-slot-photo`) applies the helper's result when non-null.
- `src/meta/passport.js` — two sites: `fillPostcard`'s `photoImg` helper (covers both the postcard-detail `.pp-photo` and the back-face `.pc-stamp`), and `renderCollectionDetail`'s `.collection-card` img.
- `src/game/round.js` — the two `setThumb(gameEls.thumb, answer.image)` call sites (round reveal, PvP timeout reveal) now pass `answer` as the third argument so `#place-thumb` gets the item's `focalY`.

Note: the brief's Part 2 pointed at `src/modes/pack.js` for `.collection-card` and `.pc-stamp`. Those classes actually live in `src/meta/passport.js` (pack.js's own `.pc-stamp` divs are empty placeholders with no `<img>`, used only for the face-down pack-flip and clue states). Wired at the actual locations instead.

## Data diff summary

- `assets/locations-landmarks-sol.json`: 440 entries before and after. 30 entries gained `focalY` (no other fields touched). 3 entries (`chrysler-building-nyc`, `kennedy-space-center`, `one-world-trade-center-us`) had `image` replaced with the given URLs. No overlap between the two sets; no membership changes.
- `assets/locations.json`: 803 entries before and after. 1 entry (`delhi`) gained `focalY: 85`.
- Both files verified with a no-op `json.load` → `json.dumps(indent=1, ensure_ascii=False)` roundtrip (landmarks bank needs a trailing newline preserved; locations.json has none) before editing; both roundtripped byte-identical with those settings.

## Test result

`node --test "test/*.mjs"` from `demo/`: **99/99 passing** (baseline 97/97 + 2 new). Added `test/focal.test.mjs` covering `focalObjectPosition`'s finite/absent/NaN/null cases.

One iteration note: an initial version imported the helper from `src/core/dom.js` directly into `postcard-card.js` and `passport.js`. `dom.js` does eager `document.getElementById(...)` calls at module-load time to build `gameEls`, which broke `test/passport-dex-numbering.test.mjs` (it stubs a minimal `document` without `getElementById`). Moving the helper into its own side-effect-free `src/core/focal.js` fixed it; `dom.js` now imports from there too.

## Not wired

Nothing from the brief's listed surfaces was left unwired. Surfaces explicitly outside the brief's list (`.collection-thumb` in the Collections overview grid, `.pp-stamp`-style recent-photo-stamps row on the Passport home summary, `#peek-thumb`, `.recap-thumb` on the Daily review recap card) were left untouched — same `object-fit: cover` pattern, but not named in Part 2's surface list, so no `focalY` override was added there.
