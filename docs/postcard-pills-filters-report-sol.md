# Postcard pills and Passport filters report

## Changes

- Removed Bullseye/Pinpoint accuracy badges from the live reveal's collapsed Peek thumbnail and expanded-sheet thumbnail through their shared `applyThumbState` path.
- Removed the accuracy badge from the Passport postcard detail modal.
- Removed the same badge from Passport thumbnail renderers: Places/Country detail slots and Passport share-preview slots use the shared `passportSlotFace` without badge rendering; Collection detail postcard thumbnails also no longer add it. The main Places thumbnails had already explicitly disabled the badge before this change. The Passport share-image canvas also no longer paints the badge over its three postcard thumbnails.
- Kept the earned-postcard summary badge because that results surface is neither the requested live Modal/Peek presentation nor a Passport thumbnail.
- Left earning thresholds, stored tier metadata, scores, history labels, reveal animation tiers, and Passport statistics unchanged.

## km pill diagnosis and fix

The shared Passport thumbnail pill (`.pp-slot-score`) was an ordinary inline `span` with a forced `18px` border-box height, `1px` vertical padding, and no explicit line-height. Its browser-derived line box therefore had to fit inside a fixed content area whose available height also changed when the Bullseye border was applied. That combination caused inconsistent apparent height and vertical alignment.

The pill is now `inline-flex` with `align-items: center` and `justify-content: center`, an explicit `line-height: 1`, content-driven height, symmetric `3px 6px` padding, and a transparent base border so the tier border does not change its geometry. This shared class covers earned and seen Passport thumbnails wherever `passportSlotFace` is used. This is code-inspected; Chromium was unavailable, so it is not screenshot-verified.

## Filter state trace

The Status chip group is now backed by `ppStatuses`, a `Set` persisted as a JSON array. Tapping Earned, Seen, or Unvisited adds that value when absent and deletes it when present. Tapping All clears the set; All is shown pressed exactly when the set is empty.

For each card, `applyPassportFilters` accepts the status when the set is empty or when the card's status occurs in the set. This gives union semantics inside Status. The result is then intersected with the selected rarity and (when available for the current sort) continent. With every status chip off, status imposes no restriction. The Filters badge is the number of selected statuses plus one for each active rarity or continent select.

Status was the only chip group found and changed. Rarity and continent are select controls, not chip groups; their existing single-value behavior and across-group intersection were retained. Filter-panel placement and scroll auto-close handlers were untouched.

## Verification

- `node --check --input-type=module < src/main.js` passes.
- Badge-render call inspection shows no `setProxBadge` call in `applyThumbState`, `fillPostcard`, `passportSlotFace`, or `renderCollectionDetail`, and no Bullseye/Pinpoint badge drawing in the Passport share canvas. The remaining call is the intentionally retained earned-postcard results summary.
- Tier logic remains in `flyoverTier`, `earnForKm`, `recordVisit`, the `EARN_BULLSEYE`/`EARN_PINPOINT` constants, Passport stats, and history rendering.
- Visual conclusions above are code-inspected, not screenshot-verified.
