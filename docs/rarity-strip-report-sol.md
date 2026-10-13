# Postcard rarity visual removal

## Result

Postcards no longer receive difficulty-based `rarity-*` classes, display a rarity pill, or use a rarity-colored border in the generated passport share image. Difficulty data and the Passport rarity filter remain intact. Earned-tier classes (`prox-postcard`, `prox-bullseye`, and `prox-pinpoint`) are still applied by `applyCardTier()`.

## Surfaces changed

- Reveal postcard thumbnails (`#place-thumb` and `#peek-thumb`), through `applyThumbState()` / `applyCardTier()`.
- Postgame postcard summary cards, through `postcardSummaryCard()` / `applyCardTier()`.
- Passport Places grid cards, through `passportSlot()` / `applyCardTier()`.
- Country-detail postcard cards, which reuse `passportSlot()`.
- Passport share-screen closest-guess cards, through `fillPassportShareCard()` / `applyCardTier()`.
- Generated passport share-image thumbnails, by removing the difficulty-derived colored canvas stroke.
- Collection detail cards, through `renderCollectionDetail()` / `applyCardTier()`.
- Postcard detail/modal, by removing its explicit `rarity-*` class and the Common/Uncommon/Rare/Legendary pill.

Country overview cards already used neutral/progress styling and did not receive a rarity class, so they required no change.

## Preserved behavior

- `DIFFICULTY_BANDS`, `difficultyBand()`, location difficulty values, and the per-entry `band` value remain unchanged.
- The Passport Filters rarity select remains populated from `DIFFICULTY_BANDS` and continues filtering on `entry.band`.
- `applyCardTier()` still removes stale earned-tier classes and applies the appropriate `PROX_CLASSES` value.
- Scores, earning tiers, postcard metadata, share text, and headers were not changed.

The now-unused `.rarity-common`, `.rarity-uncommon`, `.rarity-rare`, `.rarity-legendary`, and `.ppd-rarity` rules were deliberately left in `src/style.css`; the requested CSS file was not modified. Existing `var(--rarity, <neutral fallback>)` declarations now resolve to their neutral fallback because no live rendering path assigns a rarity class.

`rarityFor()`, `RARITY_CLASSES`, and `RARITY_HEX` were removed because their only remaining consumers were the removed visual class/frame paths; non-visual difficulty grouping continues through `difficultyBand()` and `DIFFICULTY_BANDS`.

## Verification

- `node --check --input-type=module < src/main.js` passes.
- `git diff --check` passes.
- `rg -n "rarity-" src/main.js` returns no matches, so no live card-rendering path adds a rarity class.
- `rg -n "ppd-rarity|data-ppd=\"rarity\"|rarityFor|RARITY_HEX|RARITY_CLASSES" src/main.js` returns no matches, confirming the postcard rarity pill and direct share-thumbnail color logic are gone.
- `rg -n "Filter by rarity|All rarities|DIFFICULTY_BANDS.map|entry.band === band" src/main.js` finds the intact filter control, option population, and filtering predicates.
- `rg -n "PROX_CLASSES|classList.add\(PROX_CLASSES\[earned\]\)" src/main.js` finds all three earned-tier classes and their application inside `applyCardTier()`.
