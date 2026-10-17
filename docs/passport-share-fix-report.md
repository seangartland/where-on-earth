# Passport share card fix: report

## The bug
`fillPassportShareCard` in `src/meta/passport.js` built each top-3 item with `passportSlotFace(...)`, which was removed in afc6a83 (postcard centralization). Whenever any visit had a km distance, tapping Share threw `passportSlotFace is not defined` and the share card never opened.

## The change
`src/meta/passport.js`, `fillPassportShareCard`: the dead call is replaced with the shared builder from `src/meta/postcard-card.js`:

```js
const li = document.createElement('li');
return buildPostcardCard(entry.item, {
  earned: entry.earned,
  earnName: host.EARN_NAMES[entry.earned] || 'seen',
  entry,
  photo: hasRealPhoto(entry.item) ? 'image' : 'flag',
  scoreText: formatShareKm(entry.km),
}, {
  variant: 'slot',
  element: li,
  flagForLocation: host.flagForLocation,
  applyCardTier: host.applyCardTier,
  addAuditFlagButton: host.addAuditFlagButton,
});
```

The manual `li.className = 'pp-slot'`, `li.dataset.earn = ...` and `host.applyCardTier(...)` lines are removed, because `buildPostcardCard` sets the class, `data-earn` and tier itself (no double application).

The old `flagForPlaceholder: true` behaviour (real photo when the item has one, flag placeholder otherwise) is reproduced by `photo: hasRealPhoto(entry.item) ? 'image' : 'flag'`. No score tier is passed, matching the old share call. `passportShareText`, the canvas image renderer and everything else are unchanged.

## Invocation mirrored
`passportSlot(entry)` in the same file: same passportState shape (`earned`, `earnName`, `entry`, `photo`, `scoreText`) and same options (`variant: 'slot'`, `flagForLocation`, `applyCardTier`, `addAuditFlagButton`), plus `element: li` as the brief asks. It omits `scoreTier` and the slot's tap/aria bindings, which the share card never had.

## Verification
Script: `/home/hatch/workspace/map-game/shots/passport/pc-share-fix.mjs`, which is `pc-share-baseline.mjs` (same seeded passport, 390px, Chromium via Playwright) with a top-3 dump added after Share is tapped.

After the fix:
```
share card open true
top3 [{"cls":"pp-slot prox-pinpoint","earn":"pinpoint","km":"<1 km","name":"Aberdeen 🏴󠁧󠁢󠁳󠁣󠁴󠁿","img":true,"flag":false},{"cls":"pp-slot prox-postcard","earn":"near","km":"37 km","name":"Agadez 🇳🇪","img":true,"flag":false},{"cls":"pp-slot prox-pinpoint","earn":"pinpoint","km":"74 km","name":"Aleppo 🇸🇾","img":true,"flag":false}]
errs ["Failed to load resource: the server responded with a status of 404 (Not Found)","Failed to load resource: the server responded with a status of 404 (Not Found)"]
```

Before the fix (same script, change stashed):
```
share card open false
top3 []
errs ["Failed to load resource: ... 404 (Not Found)","Failed to load resource: ... 404 (Not Found)","passportSlotFace is not defined"]
```

The two 404s show up both before and after the fix. They come from the local harness serving files that are missing from the working tree, not from this change. I did not investigate them further.

Syntax: `node --check --input-type=module < src/meta/passport.js` passes.
