# Card km pill: closest recorded distance

## Result

Every top-right per-location km pill now uses the passport's stored closest distance, `passport.meta[id].d`. The shared Passport card renderer no longer substitutes the best score for Seen or ordinary earned cards. If an old passport entry has no stored distance, the card has no pill; a score is not presented as though it were a distance.

No scoring, earning/tier logic, locations data, headers, share text, or postgame receipt distance changed.

## Surface inventory before the change

| Surface | What appeared in the top-right pill before | Source before | Result after |
| --- | --- | --- | --- |
| Passport Places dex card | Bullseye/Pinpoint: closest km. Seen/Near: best score with no unit. | Conditional `entry.earned >= EARN_BULLSEYE ? entry.km : entry.best` in `passportSlot()`; `entry.km` is `meta.d`, while `entry.best` is `meta.b` or the legacy visit score. | Closest km from `entry.km` for every card with a stored distance. |
| Passport Country-detail card | Same as Places because it uses the same `passportSlot()` renderer. | Same conditional shared renderer. | Same closest-km behavior. |
| Passport share-preview “Closest guesses” cards | Closest km. | `formatShareKm(entry.km)` passed to `passportSlotFace()`. | Unchanged; already correct. |
| Generated Passport share-image cards | Closest km. | `formatShareKm(entry.km)` drawn on the canvas. | Unchanged; already correct. |
| Collections overview thumbnails | No km pill. | `collectionThumb()` renders only the image or mystery placeholder. | Unchanged. |
| Collection detail cards | No km pill. | `renderCollectionDetail()` renders photo, name, and collection number/status. | Unchanged. Opening the card passes `meta.d` to the modal. |
| Postcard detail/modal | No top-right km pill. It has a separate “Closest guess” stat. | `entry.km`, sourced from `meta.d`. | Unchanged; the stat was already closest km. |
| Earned/upgraded postcard summary card | No top-right km pill. Its metadata line is a receipt such as `New • 96 km`. | The just-played `result.distanceExact`/`result.distance` via `postcardDistance()`. | Unchanged as explicitly required. |

The only reusable top-right DOM pill is `.pp-slot-score`, created by `passportSlotFace()`. Its callers are the Passport grid/Country-detail shared path and the Passport share-preview path. The generated share image independently paints the same closest-distance value.

## Stored-data truth and legacy gap

`recordVisit()` stores `meta.d` as:

```js
Math.round(Math.min(currentVisitKm, previousClosestKm))
```

That is enough to retain the true minimum across every visit recorded after distance metadata became available, without retaining the full visit history. It also records `meta.b` as the maximum score and `meta.t` as the latest visit time; neither is used for the km pill.

Legacy entries created before `passport.meta` shipped can contain only `visits[id]`, a score out of 1000. They have no historical distances, so a true minimum cannot be reconstructed. The honest supported behavior is to omit the km pill until a new visit records `meta.d`. This gap affects only those legacy entries; the change does not invent a distance from a score.

## Worked example

For a location first visited at **412 km** with its best score, then visited at **96 km** with a lower score, `recordVisit()` evaluates `Math.min(96, 412)` and stores `meta.d = 96`. Every surface that renders a top-right km pill reads that same `entry.km` value and shows **96 km**, regardless of which visit supplied `meta.b`, the earned tier, or the latest timestamp. The modal's separate “Closest guess” stat also shows 96 km. The postgame summary receipt still shows the just-finished round's distance by design.

## Grep evidence

Before (`git show HEAD:src/main.js`):

```text
7496:  const hasDistance = entry.earned >= EARN_BULLSEYE && Number.isFinite(entry.km);
7497:  const pillText = hasDistance ? formatShareKm(entry.km) : entry.best;
7318:      li.append(...passportSlotFace(entry, formatShareKm(entry.km), { flagForPlaceholder: true }));
7408:    ... fillText(formatShareKm(entry.km), ...);
```

After (`rg` on the working tree):

```text
7496:  const hasDistance = Number.isFinite(entry.km);
7497:  const pillText = hasDistance ? formatShareKm(entry.km) : null;
7318:      li.append(...passportSlotFace(entry, formatShareKm(entry.km), { flagForPlaceholder: true }));
7408:    ... fillText(formatShareKm(entry.km), ...);
```

The remaining renderer evidence is `.pp-slot-score` plus the two `passportSlotFace()` call sites; no Collection, modal, or earned-summary renderer creates that pill.

## Verification

- `node --check --input-type=module < src/main.js` passed.
- Inspected the complete `.pp-slot-score` renderer/caller set and every `entry.km`, `meta.d`, and postcard-distance use in `src/main.js`.
- Confirmed the source diff changes only the shared Passport card pill selection and its accessible label.
- Confirmed the summary receipt continues to call `postcardDistance(result, outcome)` and was not changed.
